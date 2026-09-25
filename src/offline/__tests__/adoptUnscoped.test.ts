// ─── Ventas guardadas sin ubicación conocida ─────────────────────────────────
// Si el usuario cobra antes de que la app haya podido resolver su caja, la
// venta cae en el namespace 'sin-ubicacion'. Cuando la ubicación real se conoce
// esas ventas se adoptan: si no, quedarían invisibles para Facturación y para el
// sync (existen, pero nadie las ve ni las envía).

import { describe, it, test, expect, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  adoptUnscopedSales,
  cacheProducts,
  getAllOfflineSales,
  getOfflineProducts,
  getPendingSales,
  saveSaleOffline,
} from '../offlineStore';
import {
  UNKNOWN_LOCATION,
  __resetNamespaceForTests,
  activateNamespace,
  getActiveNamespace,
} from '../namespace';
import type { User } from '../../types';

const USER: User = {
  id: 'user-1',
  name: 'Cajero',
  email: 'cajero@x.cu',
  role: 'cajero',
  company: { id: 'co-1', name: 'Empresa', plan: 'empresarial' },
};
const OTHER_USER: User = { ...USER, id: 'user-2', email: 'otro@x.cu' };
const LOCATION = 'caja-1';

const catalog = [
  { id: 'p1', code: 'A1', name: 'Arroz', price: 50, cost: 30, stock: 10, unit: 'ud', category: 'Alimentos', active: true },
];

function saleItem(qty = 1) {
  return {
    clientName: 'Consumidor Final',
    clientNit: '00000000000',
    payMethod: 'efectivo',
    currency: 'CUP',
    items: [{ productId: 'p1', name: 'Arroz', qty, price: 50, total: 50 * qty }],
    subtotal: 50 * qty,
    total: 50 * qty,
  };
}

beforeEach(async () => {
  __resetNamespaceForTests();
  await AsyncStorage.clear();
});

describe('adoptUnscopedSales', () => {
  it('no hace nada si la ubicación aún no se conoce', async () => {
    await activateNamespace(USER, UNKNOWN_LOCATION);
    expect(getActiveNamespace()?.locationId).toBe(UNKNOWN_LOCATION);
    await saveSaleOffline(saleItem());
    expect(await adoptUnscopedSales()).toBe(0);
    expect(await getAllOfflineSales()).toHaveLength(1);
  });

  it('mueve la venta sin ubicación a la caja real cuando se conoce', async () => {
    await activateNamespace(USER, UNKNOWN_LOCATION);
    const orphan = await saveSaleOffline(saleItem(2));

    await activateNamespace(USER, LOCATION);
    await cacheProducts(catalog, LOCATION);

    expect(await adoptUnscopedSales()).toBe(1);

    const sales = await getAllOfflineSales();
    expect(sales).toHaveLength(1);
    expect(sales[0].clientSaleId).toBe(orphan.clientSaleId); // idempotencia intacta
    expect(sales[0].locationId).toBe(LOCATION);
    expect(sales[0].status).toBe('pending');
    // Queda visible para Facturación y entra en el próximo sync.
    expect((await getPendingSales()).map((s) => s.clientSaleId)).toEqual([orphan.clientSaleId]);
  });

  it('no toca el stock del namespace real al adoptar (no lo descuenta dos veces)', async () => {
    await activateNamespace(USER, UNKNOWN_LOCATION);
    await saveSaleOffline(saleItem(2));

    await activateNamespace(USER, LOCATION);
    await cacheProducts(catalog, LOCATION);
    await adoptUnscopedSales();

    const stock = (await getAllOfflineSales()).length;
    expect(stock).toBe(1);
    const product = (await getOfflineProducts()).find((p) => p.id === 'p1');
    expect(product?.localStock).toBe(10); // el catálogo real manda, sin doble descuento
  });

  test('no adopta ventas de OTRA cuenta', async () => {
    // Otra cuenta vendió sin ubicación en su propio namespace huérfano.
    await activateNamespace(OTHER_USER, UNKNOWN_LOCATION);
    const otherSale = await saveSaleOffline(saleItem(1));

    await activateNamespace(USER, LOCATION);
    await cacheProducts(catalog, LOCATION);
    expect(await adoptUnscopedSales()).toBe(0);
    expect(await getAllOfflineSales()).toHaveLength(0);

    await activateNamespace(OTHER_USER, LOCATION);
    expect(await adoptUnscopedSales()).toBe(1);
    expect((await getAllOfflineSales())[0].clientSaleId).toBe(otherSale.clientSaleId);
  });

  it('da un localId nuevo si choca con una venta ya existente en la caja', async () => {
    await activateNamespace(USER, LOCATION);
    const real = await saveSaleOffline(saleItem(1));

    await activateNamespace(USER, UNKNOWN_LOCATION);
    const orphan = await saveSaleOffline(saleItem(1));
    expect(orphan.localId).toBe(real.localId); // el contador namespace-local se reinició

    await activateNamespace(USER, LOCATION);
    expect(await adoptUnscopedSales()).toBe(1);

    const sales = await getAllOfflineSales();
    expect(sales).toHaveLength(2);
    expect(new Set(sales.map((s) => s.localId)).size).toBe(2);
    expect(new Set(sales.map((s) => s.clientSaleId)).size).toBe(2);
  });
});
