// ─── SESIÓN (abstracción única de tokens + usuario cacheado) ────────────────
// Reglas de la app (dispositivos personales en Cuba, conectividad intermitente):
//
//  1. La sesión visible NO se cierra sola. Solo "Cerrar sesión" la termina.
//  2. Un accessToken vencido NO expulsa al usuario: se renueva en silencio al
//     arrancar, al volver a primer plano, al reconectar y ante un 401.
//  3. Si la renovación falla POR RED, se conserva todo (tokens, usuario
//     cacheado, colas offline) y la app sigue operando con datos locales.
//  4. Si el SERVIDOR rechaza la sesión (401/403 en /auth/refresh, p.ej. porque
//     se cambió la contraseña o se revocó el refresh token) ahí sí se limpia
//     el estado de autenticación: la revocación en el servidor sigue sirviendo.
//  5. Logout = revocar en el servidor (best-effort) + borrar SOLO el estado de
//     autenticación. Los datos offline de la cuenta se conservan.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { secretStorage } from './secureStore';
import { API_BASE_URL } from './config';
import { emitSessionRevoked } from './sessionEvents';
import { normalizeUser } from './userShape';
import type { User } from '../types';

const TOKEN_KEY = 'cubagest_token';
const REFRESH_TOKEN_KEY = 'cubagest_refresh_token';
const USER_KEY = 'cubagest_user';

const REQUEST_TIMEOUT_MS = 8000;

export interface StoredSession {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return secretStorage.get(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return secretStorage.get(REFRESH_TOKEN_KEY);
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (token) await secretStorage.set(TOKEN_KEY, token);
  else await secretStorage.remove(TOKEN_KEY);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) await secretStorage.set(REFRESH_TOKEN_KEY, token);
  else await secretStorage.remove(REFRESH_TOKEN_KEY);
}

// ── Usuario cacheado (sirve para arrancar sin conexión) ──────────────────────

export async function getCachedUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? normalizeUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function setCachedUser(user: User | null): Promise<void> {
  if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  else await AsyncStorage.removeItem(USER_KEY);
}

// ── Ciclo de vida ───────────────────────────────────────────────────────────

export async function loadSession(): Promise<StoredSession> {
  const [accessToken, refreshToken, user] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getCachedUser(),
  ]);
  return { accessToken, refreshToken, user };
}

export async function saveSession(session: {
  accessToken: string;
  refreshToken?: string | null;
  user: User;
}): Promise<void> {
  await setAccessToken(session.accessToken);
  // El registro actual del backend devuelve un único `token` y ningún
  // refreshToken: en ese caso conservamos el que hubiera para no perder la
  // capacidad de renovar en silencio.
  if (session.refreshToken) await setRefreshToken(session.refreshToken);
  await setCachedUser(session.user);
}

/** Borra SOLO el estado de autenticación. Los datos offline quedan intactos. */
export async function clearSession(): Promise<void> {
  await Promise.all([
    secretStorage.remove(TOKEN_KEY),
    secretStorage.remove(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}

// ── Red baja nivel (sin apiFetch: evitar recursión en el refresh) ───────────

interface RawResult {
  ok: boolean;
  status: number;
  data: any;
  /** true si no hubo respuesta del servidor (red/caída/timeout) */
  offline: boolean;
}

async function rawRequest(
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; token?: string | null } = {},
): Promise<RawResult> {
  const { method = 'GET', body, token } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, offline: false };
  } catch {
    return { ok: false, status: 0, data: null, offline: true };
  } finally {
    clearTimeout(timeout);
  }
}

export type RefreshOutcome =
  /** Token renovado y guardado. */
  | { status: 'ok' }
  /** No hay refresh token (p.ej. alta recién registrada sin refresh). */
  | { status: 'none' }
  /** No se pudo contactar al servidor: NO se toca la sesión local. */
  | { status: 'unavailable' }
  /** El servidor rechazó/revocó la sesión: hay que cerrar la sesión local. */
  | { status: 'rejected'; message: string };

// Un solo refresh en vuelo: varias pantallas pueden recibir 401 a la vez
// (o el foreground + un 401 simultáneos) y no queremos una avalancha de
// renovaciones al servidor.
let inflightRefresh: Promise<RefreshOutcome> | null = null;

export function refreshAccessToken(): Promise<RefreshOutcome> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = doRefresh().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

async function doRefresh(): Promise<RefreshOutcome> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return { status: 'none' };

  const res = await rawRequest('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });

  if (res.offline) return { status: 'unavailable' };

  const newToken: string | undefined =
    res.data?.accessToken || res.data?.data?.accessToken || undefined;

  if (res.ok && newToken) {
    await setAccessToken(newToken);
    // El backend rota el refresh token en algunas versiones: si viene uno
    // nuevo lo guardamos, si no conservamos el actual.
    const rotated: string | undefined = res.data?.refreshToken || res.data?.data?.refreshToken;
    if (rotated) await setRefreshToken(rotated);
    return { status: 'ok' };
  }

  if (res.status === 401 || res.status === 403) {
    const message =
      (res.data?.error as string) ||
      (res.data?.message as string) ||
      'Tu sesión ya no es válida en el servidor.';
    return { status: 'rejected', message };
  }

  // 5xx u otra respuesta rara: el servidor no pudo responder. No cerramos la
  // sesión por un error transitorio del servidor — se reintenta después.
  return { status: 'unavailable' };
}

export type RevalidateOutcome =
  | { status: 'ok'; user: User }
  | { status: 'unavailable' }
  | { status: 'rejected'; message: string }
  | { status: 'unauthenticated' };

/**
 * Chequeo de sesión en el servidor. Se llama SOLO al arrancar y al volver a
 * primer plano (y desde el botón de refresh) — nunca en cada request.
 *
 * Con el token aún vivo hace UNA llamada (GET /auth/me); si está vencido
 * renueva primero y luego consulta. Si no hay red devuelve 'unavailable' y la
 * app sigue con el usuario cacheado.
 */
export async function revalidateSession(): Promise<RevalidateOutcome> {
  const token = await getAccessToken();
  if (!token) return { status: 'unauthenticated' };

  let accessToken = token;
  if (isTokenExpired(token)) {
    const outcome = await refreshAccessToken();
    if (outcome.status === 'rejected') return outcome;
    if (outcome.status === 'unavailable') return { status: 'unavailable' };
    accessToken = (await getAccessToken()) || token;
  }

  const me = await rawRequest('/auth/me', { token: accessToken });
  if (me.offline) return { status: 'unavailable' };

  if (me.status === 401 || me.status === 403) {
    // Puede ser que el token venció justo entre la renovación y ahora.
    const retry = await refreshAccessToken();
    if (retry.status === 'rejected') return retry;
    if (retry.status === 'unavailable') return { status: 'unavailable' };
    const fresh = (await getAccessToken()) || accessToken;
    const retryMe = await rawRequest('/auth/me', { token: fresh });
    if (retryMe.offline) return { status: 'unavailable' };
    if (!retryMe.ok) {
      return retryMe.status === 401 || retryMe.status === 403
        ? { status: 'rejected', message: 'Tu sesión ya no es válida en el servidor.' }
        : { status: 'unavailable' };
    }
    const retriedUser = normalizeUser(retryMe.data?.user ?? retryMe.data);
    if (!retriedUser) return { status: 'unavailable' };
    await setCachedUser(retriedUser);
    return { status: 'ok', user: retriedUser };
  }

  if (!me.ok) return { status: 'unavailable' };

  const user = normalizeUser(me.data?.user ?? me.data);
  if (!user) return { status: 'unavailable' };
  await setCachedUser(user);
  return { status: 'ok', user };
}

/** ¿El JWT ya expiró? Solo mira `exp`: no verifica firma (eso es del server). */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    // atob lo aporta el runtime de React Native; no está en las typings de
    // este tsconfig (lib ES2020, sin DOM).
    const decode = (globalThis as unknown as { atob?: (s: string) => string }).atob;
    if (!decode) return false;
    const json = JSON.parse(
      decode(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    if (!json?.exp) return false;
    return json.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

/**
 * Revoca la sesión en el servidor. SIEMPRE best-effort: si no hay red, el
 * usuario igual sale de la app y el refresh token caduca solo. Nunca lanza.
 */
export async function revokeSessionOnServer(
  accessToken?: string | null,
  refreshToken?: string | null,
): Promise<boolean> {
  const [token, refresh] = accessToken !== undefined
    ? [accessToken, refreshToken ?? null]
    : await Promise.all([getAccessToken(), getRefreshToken()]);
  if (!token) return false;
  const res = await rawRequest('/auth/logout', {
    method: 'POST',
    token,
    body: refresh ? { refreshToken: refresh } : {},
  });
  return res.ok;
}

/**
 * Cierre de sesión completo.
 *
 * El estado local se borra PRIMERO: el botón "Cerrar sesión" nunca puede
 * quedarse colgado esperando a un servidor inalcanzable (pasa muchísimo en
 * Cuba). La revocación se dispara después, en segundo plano y sin bloquear —
 * si falla, el refresh token caduca solo y el usuario ya está fuera.
 *
 * Los datos offline de la cuenta NO se tocan: siguen en su namespace para la
 * próxima entrada.
 */
export async function endSession(): Promise<void> {
  const [accessToken, refreshToken] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
  ]);
  await clearSession();
  emitSessionRevoked();
  if (accessToken) {
    void revokeSessionOnServer(accessToken, refreshToken).catch(() => false);
  }
}
