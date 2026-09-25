// ─── Sincronización offline (P0 item 4) ─────────────────────────────────────
// Los tres invariantes que antes fallaban:
//  1. la venta viaja con clientSaleId (UUID) + locationId inmutable;
//  2. un resultado AUSENTE o de estado desconocido es REINTENTABLE: la venta
//     vuelve a 'pending' y NO se restaura el stock local;
//  3. solo un conflicto EXPLÍCITO restaura el stock local.

import { describe, it, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { apiFetch } from '../../api/client';
import { runSync } from '../syncManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cacheProducts,
  getOfflineProducts,
  getAllOfflineSales,
  saveSaleOffline,
} from '../offlineStore';
import { __resetNamespaceForTests, activateNamespace } from '../namespace';
import type { User } from '../../types';

jest.mock('../../api/client', () => ({ apiFetch: jest.fn() }));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const USER: User = {
  id: 'user-1',
  name: 'Cajero',
  email: 'cajero@x.cu',
  role: 'cajero',
  company: { id: 'co-1', name: 'Empresa', plan: 'empresarial' },
};
const LOCATION = 'caja-1';

const catalog = [
  { id: 'p1', code: 'A1', name: 'Arroz', price: 50, cost: 30, stock: 10, unit: 'ud', category: 'Alimentos', active: true },
  { id: 'p2', code: 'A2', name: 'Aceite', price: 80, cost: 60, stock: 5, unit: 'ud', category: 'Alimentos', active: true },
];

async function setup() {
  __resetNamespaceForTests();
  await AsyncStorage.clear();
  await activateNamespace(USER, LOCATION);
  await cacheProducts(catalog, LOCATION);
}

function saleItem(productId = 'p1', qty = 2) {
  return {
    clientName: 'Consumidor Final',
    clientNit: '00000000000',
    payMethod: 'efectivo',
    currency: 'CUP',
    items: [{ productId, name: 'Arroz', qty, price: 50, total: 50 * qty }],
    subtotal: 50 * qty,
    total: 50 * qty,
  };
}

const localStockOf = async (id: string) =>
  (await getOfflineProducts()).find((p) => p.id === id)?.localStock;

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('guardar venta offline', () => {
  beforeEach(setup);

  it('genera clientSaleId (UUID) y fija la locationId', async () => {
    const sale = await saveSaleOffline(saleItem());
    expect(sale.clientSaleId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(sale.locationId).toBe(LOCATION);
    expect(sale.status).toBe('pending');
  });

  it('mantiene el mismo clientSaleId al reintentar (idempotencia)', async () => {
    const first = await saveSaleOffline(saleItem());
    const again = await saveSaleOffline({ ...saleItem(), clientSaleId: first.clientSaleId });
    expect(again.clientSaleId).toBe(first.clientSaleId);
  });

  it('descuenta el stock local una sola vez por venta', async () => {
    expect(await localStockOf('p1')).toBe(10);
    await saveSaleOffline(saleItem('p1', 3));
    expect(await localStockOf('p1')).toBe(7);
  });

  it('dos ventas simultáneas no se pisan (escritor serializado)', async () => {
    await Promise.all([saveSaleOffline(saleItem('p1', 2)), saveSaleOffline(saleItem('p1', 2))]);
    expect(await localStockOf('p1')).toBe(6);
    const all = await getAllOfflineSales();
    expect(all).toHaveLength(2);
    expect(all.every((s) => s.clientSaleId)).toBe(true);
  });
});

describe('runSync', () => {
  beforeEach(setup);

  it('envía clientSaleId y locationId en cada venta del lote', async () => {
    const sale = await saveSaleOffline(saleItem());
    mockedFetch.mockResolvedValue([
      { localId: sale.localId, status: 'synced', serverId: 'srv-1', invoiceNumber: 'INV-1' },
    ]);

    const result = await runSync(false);

    const body = mockedFetch.mock.calls[0][1]?.body as any;
    expect(body.sales[0].clientSaleId).toBe(sale.clientSaleId);
    expect(body.sales[0].locationId).toBe(LOCATION);
    expect(result.synced).toBe(1);
  });

  it('un resultado AUSENTE deja la venta pendiente y NO restaura stock', async () => {
    const sale = await saveSaleOffline(saleItem('p1', 2));
    mockedFetch.mockResolvedValue([]); // el servidor no devolvió nada

    const result = await runSync(false);

    expect(result.synced).toBe(0);
    expect(result.unknown).toBe(1);
    const [stored] = await getAllOfflineSales();
    expect(stored.status).toBe('pending');
    expect(stored.serverId).toBeUndefined();
    expect(await localStockOf('p1')).toBe(8); // sigue descontado: la venta vive
  });

  it('un estado desconocido se reintenta sin restaurar stock', async () => {
    const sale = await saveSaleOffline(saleItem('p1', 2));
    mockedFetch.mockResolvedValue([{ localId: sale.localId, status: 'accepted' }]);

    const result = await runSync(false);

    expect(result.unknown).toBe(1);
    const [stored] = await getAllOfflineSales();
    expect(stored.status).toBe('pending');
    expect(await localStockOf('p1')).toBe(8);
  });

  it('un conflicto EXPLÍCITO sí restaura el stock local', async () => {
    const sale = await saveSaleOffline(saleItem('p1', 2));
    mockedFetch.mockResolvedValue([
      { localId: sale.localId, status: 'conflict', reason: 'Stock insuficiente' },
    ]);

    const result = await runSync(false);

    expect(result.conflicts).toBe(1);
    const [stored] = await getAllOfflineSales();
    expect(stored.status).toBe('conflict');
    expect(stored.conflictReason).toBe('Stock insuficiente');
    expect(await localStockOf('p1')).toBe(10);
  });

  it('reconoce el resultado por clientSaleId aunque cambie el localId', async () => {
    const sale = await saveSaleOffline(saleItem());
    mockedFetch.mockResolvedValue([
      { clientSaleId: sale.clientSaleId, status: 'synced', serverId: 'srv-9' },
    ]);

    const result = await runSync(false);

    expect(result.synced).toBe(1);
    const [stored] = await getAllOfflineSales();
    expect(stored.serverId).toBe('srv-9');
  });

  it('respuesta con forma inesperada: nada se pierde, todo queda pendiente', async () => {
    await saveSaleOffline(saleItem('p1', 1));
    mockedFetch.mockResolvedValue({ ok: true } as any);

    const result = await runSync(false);

    expect(result.error).toBeTruthy();
    const [stored] = await getAllOfflineSales();
    expect(stored.status).toBe('pending');
    expect(await localStockOf('p1')).toBe(9);
  });

  it('fallo de red: todas vuelven a pending y el stock NO se restaura', async () => {
    await saveSaleOffline(saleItem('p1', 1));
    mockedFetch.mockRejectedValue(new Error('Sin conexión con el servidor'));

    const result = await runSync(false);

    expect(result.error).toBe('Sin conexión con el servidor');
    const all = await getAllOfflineSales();
    expect(all[0].status).toBe('pending');
    expect(all[0].attempts).toBe(1);
    expect(await localStockOf('p1')).toBe(9);
  });

  it('procesa cada venta del lote de forma independiente', async () => {
    const a = await saveSaleOffline(saleItem('p1', 1));
    const b = await saveSaleOffline(saleItem('p2', 1));
    mockedFetch.mockResolvedValue([
      { localId: a.localId, status: 'synced', serverId: 'srv-a' },
      { localId: b.localId, status: 'conflict', reason: 'Stock insuficiente' },
    ]);

    const result = await runSync(false);

    expect(result).toMatchObject({ synced: 1, conflicts: 1, unknown: 0, attempted: 2 });
    const all = (await getAllOfflineSales()).sort((x, y) => x.timestamp - y.timestamp);
    expect(all[0].status).toBe('synced');
    expect(all[1].status).toBe('conflict');
  });
});
