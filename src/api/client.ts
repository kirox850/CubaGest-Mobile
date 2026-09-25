// ─── Cliente HTTP ───────────────────────────────────────────────────────────
// Un único camino de salida a la API. Lo único que hace "inteligente" al
// cliente es el 401: intenta UNA renovación silenciosa del token y reintenta.
// Reglas (ver src/api/session.ts para el detalle):
//  - 401 + refresh rechazado por el SERVIDOR → sesión cerrada (revocación real).
//  - 401 + refresh imposible por RED → NO se cierra la sesión: se lanza un
//    error de red para que la pantalla caiga a sus datos locales/cache.
//  - Nunca se consulta la base de datos del servidor en cada request: la
//    revalidación ocurre al arrancar / primer plano / refresh.

import { emitSessionExpired } from './sessionEvents';
import { API_BASE_URL } from './config';
import {
  getAccessToken,
  clearSession,
  refreshAccessToken,
} from './session';
import type { ApiFetchOptions } from '../types';

const REQUEST_TIMEOUT_MS = 8000;

export const OFFLINE_MESSAGE =
  'Sin conexión con el servidor — revisa tu internet e inténtalo de nuevo';

export function isOfflineError(e: unknown): boolean {
  return e instanceof Error && e.message === OFFLINE_MESSAGE;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getAccessToken();
    if (!token) throw new Error('No autenticado');
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 204) return null as T;

    // El mensaje REAL del servidor ("Correo o contraseña incorrectos",
    // "Demasiados intentos"...) debe llegar siempre a la UI — antes el 401
    // del login caía en el bloque de "sesión expirada" y el usuario veía
    // un error genérico/confuso.
    const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const serverError = (raw?.error || raw?.message) as string | undefined;

    // Token expirado o inválido SOLO en peticiones autenticadas — el 401 de
    // login (auth:false) es simplemente "credenciales incorrectas".
    if (res.status === 401 && auth) {
      if (!opts.__isRetry) {
        const outcome = await refreshAccessToken();
        if (outcome.status === 'ok') {
          // Reintenta la petición original UNA vez con el token nuevo.
          return apiFetch<T>(path, { ...opts, __isRetry: true });
        }
        if (outcome.status === 'unavailable' || outcome.status === 'none') {
          // Sin red (o sin refresh token) la sesión sigue ABIERTA: el usuario
          // no pierde su turno de caja ni su cola offline por un corte de luz.
          // La pantalla que recibe este error cae a su cache local, que es
          // justo lo que debe pasar en modo offline.
          throw new Error(OFFLINE_MESSAGE);
        }
        // 'rejected' → el servidor revocó la sesión de verdad.
        await clearSession();
        emitSessionExpired();
        throw new Error(outcome.message || 'Tu sesión expiró. Inicia sesión de nuevo.');
      }

      await clearSession();
      emitSessionExpired();
      throw new Error(serverError || 'Tu sesión expiró. Inicia sesión de nuevo.');
    }

    if (!res.ok) {
      throw new Error(serverError || `Error ${res.status}`);
    }

    // El backend siempre envuelve la respuesta con { ok, ... }. Algunos
    // endpoints ponen el contenido bajo "data" (ej: { ok, data }), otros lo
    // ponen como hermanos de "ok" (ej: { ok, accessToken, refreshToken,
    // user }). Desenvolvemos en ambos casos para que cada pantalla reciba
    // directamente lo que espera, en vez del sobre completo.
    if (!raw) throw new Error('Respuesta inválida del servidor');
    if ('data' in raw) return raw.data as T;
    const { ok: _ok, ...rest } = raw;
    return rest as T;
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(OFFLINE_MESSAGE);
    }
    throw e;
  }
}
