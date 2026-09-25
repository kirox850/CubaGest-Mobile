// ─── Sesión persistente (P0 item 6) ─────────────────────────────────────────
// Lo que NO puede pasar: que un corte de luz eche al usuario de la app.
// Lo que SÍ puede pasar: que el servidor revoque la sesión.

import { describe, it, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, isOfflineError } from '../client';
import {
  clearSession,
  endSession,
  getAccessToken,
  getCachedUser,
  isTokenExpired,
  loadSession,
  refreshAccessToken,
  revalidateSession,
  saveSession,
} from '../session';
import { onSessionExpired } from '../sessionEvents';
import { activateNamespace, __resetNamespaceForTests, getActiveNamespace } from '../../offline/namespace';
import { saveSaleOffline, getAllOfflineSales, cacheProducts } from '../../offline/offlineStore';
import type { User } from '../../types';

const fetchMock = global.fetch as unknown as jest.Mock;

const USER: User = {
  id: 'user-1',
  name: 'Cajero',
  email: 'cajero@x.cu',
  role: 'cajero',
  company: { id: 'co-1', name: 'Empresa', plan: 'empresarial' },
};

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as any);

const networkError = () => Promise.reject(new TypeError('Network request failed'));

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetNamespaceForTests();
  fetchMock.mockReset();
  fetchMock.mockImplementation(networkError);
});

describe('almacenamiento de la sesión', () => {
  it('guarda y recupera token + usuario', async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
    const s = await loadSession();
    expect(s.accessToken).toBe('a1');
    expect(s.refreshToken).toBe('r1');
    expect(s.user?.id).toBe('user-1');
  });

  it('un registro sin refreshToken no borra el que ya había', async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
    await saveSession({ accessToken: 'a2', user: USER });
    expect((await loadSession()).refreshToken).toBe('r1');
  });

  it('clearSession borra SOLO el estado de autenticación', async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
    await AsyncStorage.setItem('cubagest_offline_products_v2', '{"p1":1}');
    await clearSession();
    expect(await getAccessToken()).toBeNull();
    expect(await getCachedUser()).toBeNull();
    expect(await AsyncStorage.getItem('cubagest_offline_products_v2')).not.toBeNull();
  });

  it('isTokenExpired lee el exp del JWT sin verificar firma', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const past = `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) - 60 })}.sig`;
    const future = `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
    expect(isTokenExpired(past)).toBe(true);
    expect(isTokenExpired(future)).toBe(false);
    expect(isTokenExpired('no-es-un-jwt')).toBe(false);
  });
});

describe('renovación silenciosa', () => {
  beforeEach(async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
  });

  it('renueva y guarda el access token nuevo', async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(200, { ok: true, accessToken: 'a2' }));
    expect(await refreshAccessToken()).toEqual({ status: 'ok' });
    expect(await getAccessToken()).toBe('a2');
  });

  it('sin red NO borra la sesión (el usuario sigue dentro)', async () => {
    fetchMock.mockImplementation(networkError);
    expect(await refreshAccessToken()).toEqual({ status: 'unavailable' });
    const s = await loadSession();
    expect(s.accessToken).toBe('a1');
    expect(s.refreshToken).toBe('r1');
    expect(s.user?.id).toBe('user-1');
  });

  it('sin refreshToken no intenta nada', async () => {
    await clearSession();
    await saveSession({ accessToken: 'a1', user: USER });
    expect(await refreshAccessToken()).toEqual({ status: 'none' });
  });

  it('si el SERVIDOR rechaza la sesión, se reporta "rejected"', async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'Refresh token no encontrado' }));
    const outcome = await refreshAccessToken();
    expect(outcome.status).toBe('rejected');
    // La revocación la aplica quien llama (endSession): aquí no se borra nada.
    expect(await getAccessToken()).toBe('a1');
  });

  it('un 500 del servidor no cierra la sesión', async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(500, { ok: false, error: 'boom' }));
    expect(await refreshAccessToken()).toEqual({ status: 'unavailable' });
    expect(await getAccessToken()).toBe('a1');
  });
});

describe('apiFetch ante un 401', () => {
  beforeEach(async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
  });

  it('renueva y reintenta UNA vez, devolviendo la respuesta buena', async () => {
    fetchMock
      .mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'token expirado' }))
      .mockReturnValueOnce(jsonResponse(200, { ok: true, accessToken: 'a2' }))
      .mockReturnValueOnce(jsonResponse(200, { ok: true, data: { hello: 'mundo' } }));

    await expect(apiFetch('/dashboard/summary')).resolves.toEqual({ hello: 'mundo' });
    expect(await getAccessToken()).toBe('a2');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sin red NO cierra la sesión: lanza error de red y conserva el token', async () => {
    const expired = jest.fn();
    const off = onSessionExpired(expired);

    fetchMock
      .mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'token expirado' }))
      .mockImplementation(networkError);

    const err = await apiFetch('/dashboard/summary').catch((e) => e);
    off();

    expect(isOfflineError(err)).toBe(true);
    expect(expired).not.toHaveBeenCalled();
    expect(await getAccessToken()).toBe('a1');
    expect((await getCachedUser())?.id).toBe('user-1');
  });

  it('si el servidor revoca la sesión, se emite session-expired y se limpian tokens', async () => {
    const expired = jest.fn();
    const off = onSessionExpired(expired);

    fetchMock
      .mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'token expirado' }))
      .mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'Refresh token no encontrado' }));

    await expect(apiFetch('/dashboard/summary')).rejects.toThrow('Refresh token no encontrado');
    off();

    expect(expired).toHaveBeenCalled();
    expect(await getAccessToken()).toBeNull();
  });

  it('no intenta refrescar en peticiones públicas (login)', async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'Correo o contraseña incorrectos' }));
    await expect(
      apiFetch('/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toThrow('Correo o contraseña incorrectos');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('logout', () => {
  it('revoca en el servidor y borra solo el estado de autenticación', async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
    await activateNamespace(USER, 'caja-1');
    await cacheProducts(
      [{ id: 'p1', name: 'Arroz', price: 50, stock: 10, active: true }],
      'caja-1',
    );
    await saveSaleOffline({
      clientName: 'X',
      clientNit: '0',
      payMethod: 'efectivo',
      items: [{ productId: 'p1', name: 'Arroz', qty: 1, price: 50, total: 50 }],
      subtotal: 50,
      total: 50,
      locationId: 'caja-1',
    });

    fetchMock.mockReturnValueOnce(jsonResponse(200, { ok: true }));
    await endSession();

    expect(await getAccessToken()).toBeNull();
    expect((await getCachedUser())).toBeNull();

    // La cola de la cuenta SIGUE ahí: es el comportamiento pedido.
    expect(getActiveNamespace()).not.toBeNull();
    await activateNamespace(USER, 'caja-1');
    expect(await getAllOfflineSales()).toHaveLength(1);
  });

  it('si la revocación falla por red, el logout local también se completa', async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
    fetchMock.mockImplementation(networkError);
    await expect(endSession()).resolves.toBeUndefined();
    expect(await getAccessToken()).toBeNull();
  });

  it('el logout NO espera al servidor: con la red caída, sale igual', async () => {
    await saveSession({ accessToken: 'a1', refreshToken: 'r1', user: USER });
    // El servidor tarda muchísimo: el botón "Cerrar sesión" no puede colgarse
    // esperando a la revocación.
    let release!: () => void;
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: async () => ({}) }); }),
    );

    const started = Date.now();
    await endSession();
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1000);
    expect(await getAccessToken()).toBeNull();
    expect(await getCachedUser()).toBeNull();

    // Dejamos terminar la revocación en segundo plano para no dejar timers
    // abiertos al final del test.
    release();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('revalidateSession', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const liveToken = () =>
    `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

  it('con el token vivo hace UNA llamada a /auth/me y actualiza el usuario', async () => {
    await saveSession({ accessToken: liveToken(), refreshToken: 'r1', user: USER });
    const nuevo = { ...USER, name: 'Cajero Actualizado' };
    fetchMock.mockReturnValueOnce(jsonResponse(200, { ok: true, user: nuevo }));

    const outcome = await revalidateSession();

    expect(outcome).toEqual({ status: 'ok', user: nuevo });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await getCachedUser())?.name).toBe('Cajero Actualizado');
  });

  it('sin red devuelve "unavailable" y conserva la sesión cacheada', async () => {
    await saveSession({ accessToken: liveToken(), refreshToken: 'r1', user: USER });
    const outcome = await revalidateSession();
    expect(outcome.status).toBe('unavailable');
    expect(await getAccessToken()).toBeTruthy();
    expect((await getCachedUser())?.id).toBe('user-1');
  });

  it('si el servidor revoca la sesión, se reporta "rejected"', async () => {
    await saveSession({ accessToken: liveToken(), refreshToken: 'r1', user: USER });
    fetchMock
      .mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'no autorizado' }))
      .mockReturnValueOnce(jsonResponse(401, { ok: false, error: 'Refresh token no encontrado' }));
    const outcome = await revalidateSession();
    expect(outcome.status).toBe('rejected');
  });

  it('sin token no hay sesión', async () => {
    expect(await revalidateSession()).toEqual({ status: 'unauthenticated' });
  });
});
