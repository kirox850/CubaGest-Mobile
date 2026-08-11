import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitSessionExpired } from './sessionEvents';
import { API_BASE_URL } from './config';
import type { ApiFetchOptions } from '../types';

const TOKEN_KEY = 'cubagest_token';
const USER_KEY = 'cubagest_user';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
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

    const data = (await res.json()) as T;
    if (!res.ok) {
      const errData = data as { error?: string };
      throw new Error(errData?.error || `Error ${res.status}`);
    }
    return data;
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Sin conexión');
    }
    throw e;
  }
}
