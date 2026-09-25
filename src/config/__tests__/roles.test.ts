// ─── Contrato de la API (P0 item 7) ─────────────────────────────────────────
// Estos tests fijan lo que la app ENVÍA y lo que ESPERA del backend. Si el
// backend cambia uno de estos contratos, el test avisa en vez de fallar en
// producción con un 400/403 en la caja.

import { describe, it, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ROLES, canAccess } from '../roles';
import { TransfersAPI, UsersAPI } from '../../api/endpoints';
import { apiFetch } from '../../api/client';

jest.mock('../../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('matriz de roles', () => {
  it('admin tiene todos los módulos', () => {
    for (const m of [
      'dashboard', 'inventario', 'pos', 'facturacion', 'contabilidad', 'cierre',
      'usuarios', 'config', 'transferencias', 'auditoria',
    ]) {
      expect(canAccess('admin', m)).toBe(true);
    }
  });

  it('cajero: dashboard, pos, facturación, cierre y transferencias', () => {
    expect(ROLES.cajero.perms.sort()).toEqual(
      ['dashboard', 'pos', 'facturacion', 'cierre', 'transferencias'].sort(),
    );
  });

  it('contador: dashboard y contabilidad (sin caja ni almacén)', () => {
    expect(ROLES.contador.perms.sort()).toEqual(['dashboard', 'contabilidad'].sort());
    expect(canAccess('contador', 'pos')).toBe(false);
    expect(canAccess('contador', 'cierre')).toBe(false);
    expect(canAccess('contador', 'inventario')).toBe(false);
  });

  it('almacenista: dashboard, inventario, pos, cierre y transferencias', () => {
    expect(ROLES.almacenista.perms.sort()).toEqual(
      ['dashboard', 'inventario', 'pos', 'cierre', 'transferencias'].sort(),
    );
  });

  it('los cajeros no gestionan inventario ni usuarios', () => {
    expect(canAccess('cajero', 'inventario')).toBe(false);
    expect(canAccess('cajero', 'usuarios')).toBe(false);
    expect(canAccess('cajero', 'contabilidad')).toBe(false);
  });

  it('un rol desconocido no accede a nada', () => {
    expect(canAccess(undefined, 'dashboard')).toBe(false);
    expect(canAccess('inventado', 'dashboard')).toBe(false);
  });
});

describe('activación de usuarios', () => {
  it('crear usuario NO envía contraseña', async () => {
    mockedFetch.mockResolvedValue({ id: 'u1', setPasswordUrl: 'https://x/set?t=1', emailSent: true });
    await UsersAPI.create({ name: 'Ana', email: 'a@x.cu', role: 'cajero' });

    const [path, opts] = mockedFetch.mock.calls[0]!;
    const body = opts!.body as Record<string, unknown>;
    expect(path).toBe('/users');
    expect(opts!.method).toBe('POST');
    expect(body).toEqual({ name: 'Ana', email: 'a@x.cu', role: 'cajero' });
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it('el alta devuelve el link de activación y si se envió el correo', async () => {
    mockedFetch.mockResolvedValue({ id: 'u1', setPasswordUrl: 'https://x/set?t=1', emailSent: false });
    const created = await UsersAPI.create({ name: 'Ana', email: 'a@x.cu', role: 'cajero' });
    expect(created.setPasswordUrl).toBe('https://x/set?t=1');
    expect(created.emailSent).toBe(false);
  });

  it('reenviar link también usa setPasswordUrl', async () => {
    mockedFetch.mockResolvedValue({ setPasswordUrl: 'https://x/set?t=2', emailSent: true });
    const res = await UsersAPI.resendSetPassword('u1');
    expect(res.setPasswordUrl).toBe('https://x/set?t=2');
    expect(mockedFetch.mock.calls[0][0]).toBe('/users/u1/resend-set-password');
  });
});

describe('envíos entre ubicaciones', () => {
  it('el admin envía fromLocationId (el backend no puede inferirlo)', async () => {
    mockedFetch.mockResolvedValue({ id: 't1' });
    await TransfersAPI.create({
      fromLocationId: 'almacen-1',
      toLocationId: 'caja-9',
      items: [{ productId: 'p1', qty: 2 }],
    });

    const [path, opts] = mockedFetch.mock.calls[0]!;
    const body = opts!.body as Record<string, unknown>;
    expect(path).toBe('/transfers');
    expect(body.fromLocationId).toBe('almacen-1');
    expect(body.toLocationId).toBe('caja-9');
  });

  it('un cajero no manda fromLocationId (usa su propia caja)', async () => {
    mockedFetch.mockResolvedValue({ id: 't1' });
    await TransfersAPI.create({ toLocationId: 'almacen-1', items: [{ productId: 'p1', qty: 1 }] });
    const body = mockedFetch.mock.calls[0]![1]!.body as Record<string, unknown>;
    expect(body.fromLocationId).toBeUndefined();
  });
});
