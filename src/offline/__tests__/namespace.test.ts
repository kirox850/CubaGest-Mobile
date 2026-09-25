// ─── Namespace de datos offline ─────────────────────────────────────────────
// P0 item 5: dos cuentas en el mismo teléfono NUNCA comparten catálogo,
// stock ni cola de ventas.

import { describe, it, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UNKNOWN_LOCATION,
  __resetNamespaceForTests,
  accountScopedKey,
  activateNamespace,
  clearActiveNamespaceData,
  deactivateNamespace,
  getActiveNamespace,
  namespaceKey,
  recallLocation,
} from '../namespace';
import type { User } from '../../types';

const userA: User = { id: 'user-a', name: 'A', email: 'a@x.cu', role: 'cajero', company: { id: 'co-1', name: 'Empresa 1', plan: 'empresarial' } };
const userB: User = { id: 'user-b', name: 'B', email: 'b@x.cu', role: 'cajero', company: { id: 'co-1', name: 'Empresa 1', plan: 'empresarial' } };
const userC: User = { id: 'user-c', name: 'C', email: 'c@y.cu', role: 'cajero', company: { id: 'co-2', name: 'Empresa 2', plan: 'empresarial' } };

const LOC_A = 'caja-user-a';
const LOC_A2 = 'caja-user-a-2';

beforeEach(async () => {
  __resetNamespaceForTests();
  await AsyncStorage.clear();
});

describe('namespaceKey', () => {
  it('separa cuentas distintas, empresas distintas y ubicaciones distintas', () => {
    const k1 = namespaceKey({ companyId: 'co-1', userId: 'user-a', locationId: LOC_A });
    const k2 = namespaceKey({ companyId: 'co-1', userId: 'user-b', locationId: LOC_A });
    const k3 = namespaceKey({ companyId: 'co-2', userId: 'user-a', locationId: LOC_A });
    const k4 = namespaceKey({ companyId: 'co-1', userId: 'user-a', locationId: LOC_A2 });
    expect(new Set([k1, k2, k3, k4]).size).toBe(4);
  });

  it('genera la misma clave para la misma cuenta+ubicación', () => {
    const a = namespaceKey({ companyId: 'co-1', userId: 'user-a', locationId: LOC_A });
    const b = namespaceKey({ companyId: 'co-1', userId: 'user-a', locationId: LOC_A });
    expect(a).toBe(b);
  });

  it('usa la empresa anidada del usuario (el backend no manda businessId plano)', async () => {
    await activateNamespace(userA, LOC_A);
    expect(getActiveNamespace()).toEqual({
      companyId: 'co-1',
      userId: 'user-a',
      locationId: LOC_A,
    });
  });

  it('el namespace de cuenta (dashboard) no incluye ubicación', () => {
    const k1 = accountScopedKey('dashboard', 'co-1', 'user-a');
    const k2 = accountScopedKey('dashboard', 'co-1', 'user-b');
    expect(k1).not.toBe(k2);
  });
});

describe('activateNamespace', () => {
  it('reutiliza la última ubicación conocida al arrancar sin conexión', async () => {
    await activateNamespace(userA, LOC_A);
    deactivateNamespace();
    // Sin locationId explícito y sin red: la app debe abrir el namespace
    // correcto (donde quedó la cola de ventas de esa caja).
    const reopened = await activateNamespace(userA);
    expect(reopened?.locationId).toBe(LOC_A);
    expect(await recallLocation('user-a')).toBe(LOC_A);
  });

  it('la pista de ubicación es por usuario: B no hereda la caja de A', async () => {
    await activateNamespace(userA, LOC_A);
    deactivateNamespace();
    const b = await activateNamespace(userB);
    expect(b?.locationId).toBe(UNKNOWN_LOCATION);
    expect(b?.userId).toBe('user-b');
  });

  it('no activa namespace sin usuario (nada se escribe fuera de una cuenta)', async () => {
    expect(await activateNamespace(null, LOC_A)).toBeNull();
    expect(getActiveNamespace()).toBeNull();
  });

  it('descarta los datos legacy sin namespace en vez de importarlos', async () => {
    await AsyncStorage.setItem('cubagest_offline_sales_queue', '{"LOCAL-0001":{"total":99}}');
    await AsyncStorage.setItem('cubagest_offline_products', '{"p1":{"localStock":5}}');
    await activateNamespace(userA, LOC_A);
    expect(await AsyncStorage.getItem('cubagest_offline_sales_queue')).toBeNull();
    expect(await AsyncStorage.getItem('cubagest_offline_products')).toBeNull();
  });

  it('clearActiveNamespaceData borra solo el namespace activo', async () => {
    const nsKey = namespaceKey({ companyId: 'co-1', userId: 'user-a', locationId: LOC_A });
    await AsyncStorage.setItem(`${nsKey}|sales`, '{"x":1}');
    await AsyncStorage.setItem(`${namespaceKey({ companyId: 'co-1', userId: 'user-b', locationId: LOC_A })}|sales`, '{"y":2}');

    await activateNamespace(userA, LOC_A);
    await clearActiveNamespaceData();

    expect(await AsyncStorage.getItem(`${nsKey}|sales`)).toBeNull();
    expect(
      await AsyncStorage.getItem(`${namespaceKey({ companyId: 'co-1', userId: 'user-b', locationId: LOC_A })}|sales`),
    ).not.toBeNull();
  });
});
