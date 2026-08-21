import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitSessionExpired } from './sessionEvents';
import { API_BASE_URL } from './config';
import type { ApiFetchOptions } from '../types';

const TOKEN_KEY = 'cubagest_token';
const REFRESH_TOKEN_KEY = 'cubagest_refresh_token';
const USER_KEY = 'cubagest_user';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(refreshToken: string | null): Promise<void> {
  if (refreshToken) {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export async function getCachedUser(): Promise<unknown | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedUser(user: unknown | null): Promise<void> {
  if (user) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(USER_KEY);
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (auth) {
    const token = await getToken();
    if (!token) throw new Error('No autenticado');
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 204) return null as T;

    // Token expirado o inválido — limpiar sesión y avisar a la app.
    if (res.status === 401) {
      await setToken(null);
      emitSessionExpired();
      throw new Error('Sesión expirada');
    }

    const raw = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((raw?.error as string) || `Error ${res.status}`);
    }

    // El backend siempre envuelve la respuesta con { ok, ... }. Algunos
    // endpoints ponen el contenido bajo "data" (ej: { ok, data }), otros lo
    // ponen como hermanos de "ok" (ej: { ok, accessToken, refreshToken,
    // user }). Desenvolvemos en ambos casos para que cada pantalla reciba
    // directamente lo que espera, en vez del sobre completo.
    if ('data' in raw) return raw.data as T;
    const { ok: _ok, ...rest } = raw;
    return rest as T;
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Sin conexión');
    }
    throw e;
  }
}
