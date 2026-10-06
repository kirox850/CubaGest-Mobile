// ─── tests de la derivación de stock local ────────────────────────────────────
// El caso que motivó el módulo: un producto que entra por primera vez en el
// caché del móvil con ventas offline PENDIENTES. La regla vieja
// (`old ? old.localStock : stock`) lo guardaba con el stock entero del
// servidor, así que la app ofrecía más mercancía de la que existía.

import { describe, it, expect, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  derivarLocalStock,
  pendingQtyDe,
  pendingQtyPorProducto,
} from '../localStock';
import { cacheProducts, getOfflineProducts, saveSaleOffline, updateSaleStatus } from '../offlineStore';
import { __resetNamespaceForTests, activateNamespace } from '../namespace';
import type { User } from '../../types';

const USER: User = {
  id: 'user-1',
  name: 'Cajero',
  email: 'cajero@x.cu',
  role: 'cajero',
  company: { id: 'co-1', name: 'Empresa', plan: 'empresarial' },
};

const LOCATION = 'caja-1';

const catalog = (stock: number) => [
  { id: 'p1', code: 'A1', name: 'Arroz', price: 50, cost: 30, stock, unit: 'ud', category: 'Alimentos', active: true },
];

function saleItem(qty: number) {
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

describe('derivarLocalStock', () => {
  it('resta lo pendiente del stock del servidor', () => {
    expect(derivarLocalStock(10, 3)).toBe(7);
  });

  it('conserva stock negativo de una venta o recepción aún no sincronizada', () => {
    expect(derivarLocalStock(2, 5)).toBe(-3);
  });

  it('sin ventas pendientes es el stock del servidor', () => {
    expect(derivarLocalStock(10, 0)).toBe(10);
  });

  it('un stock o una cantidad no numérica no rompe nada', () => {
    expect(derivarLocalStock(NaN, 0)).toBe(0);
    expect(derivarLocalStock(10, NaN)).toBe(10);
  });
});

describe('pendingQtyDe', () => {
  it('cuenta pending y syncing, y solo esas', () => {
    const ventas = [
      { status: 'pending', items: [{ productId: 'p1', qty: 2 }] },
      { status: 'syncing', items: [{ productId: 'p1', qty: 3 }] },
      { status: 'synced', items: [{ productId: 'p1', qty: 100 }] },
      { status: 'conflict', items: [{ productId: 'p1', qty: 100 }] },
    ];
    expect(pendingQtyDe(ventas, 'p1')).toBe(5);
  });

  it('ignora los productos de otra venta', () => {
    const ventas = [{ status: 'pending', items: [{ productId: 'p2', qty: 4 }] }];
    expect(pendingQtyDe(ventas, 'p1')).toBe(0);
  });

  it('pendingQtyPorProducto agrupa por producto', () => {
    const ventas = [
      { status: 'pending', items: [{ productId: 'p1', qty: 2 }, { productId: 'p2', qty: 1 }] },
      { status: 'pending', items: [{ productId: 'p1', qty: 3 }] },
    ];
    expect(pendingQtyPorProducto(ventas)).toEqual({ p1: 5, p2: 1 });
  });
});

describe('cacheProducts con ventas pendientes', () => {
  it('stock 10 del servidor con una venta pendiente de 3 → localStock 7', async () => {
    await activateNamespace(USER, LOCATION);
    await saveSaleOffline(saleItem(3));
    // El producto entra por PRIMERA vez en el caché con ventas ya en cola:
    // exactamente el caso en que la regla vieja ofrecía 10 de stock real.
    await cacheProducts(catalog(10), LOCATION);

    const p = (await getOfflineProducts()).find((x) => x.id === 'p1');
    expect(p?.stock).toBe(10);
    expect(p?.localStock).toBe(7);
  });

  it('el mismo producto ya cacheado RECALCULA en vez de quedarse pegado', async () => {
    await activateNamespace(USER, LOCATION);
    await cacheProducts(catalog(10), LOCATION);
    expect((await getOfflineProducts())[0].localStock).toBe(10);

    await saveSaleOffline(saleItem(4));
    await cacheProducts(catalog(10), LOCATION);
    expect((await getOfflineProducts())[0].localStock).toBe(6);
  });

  it('una venta ya sincronizada NO vuelve a descontar (el servidor ya lo hizo)', async () => {
    await activateNamespace(USER, LOCATION);
    const venta = await saveSaleOffline(saleItem(3));
    // El caché se escribe una vez más con la venta aún viva…
    await cacheProducts(catalog(10), LOCATION);
    expect((await getOfflineProducts())[0].localStock).toBe(7);

    // …y una vez más ya subida. El stock del servidor (10) ya viene con la
    // venta descontada en la realidad; aquí el servidor hipotético devuelve 7 y
    // la app debe ofrecer 7, no 4.
    await updateSaleStatus(venta.localId, 'synced');
    await cacheProducts(catalog(7), LOCATION);
    expect((await getOfflineProducts())[0].localStock).toBe(7);
  });
});
