// ─── tests de la fusión de facturas ──────────────────────────────────────────
// El caso que da nombre al módulo: una venta cobrada sin conexión es real, y si
// no aparece en Facturas la primera señal de que "no se guardó" es un cliente
// que vuelve con el papel en la mano.

import { describe, it, expect } from '@jest/globals';
import { mergeSales } from '../mergeSales';
import type { Sale } from '../../types';
import type { OfflineSale } from '../../offline/offlineStore';

const serverSale = (over: Partial<Sale> = {}): Sale => ({
  id: 'srv-1',
  businessId: 'co-1',
  invoiceNumber: 'F-0001',
  date: '2026-09-27T10:00:00.000Z',
  clientName: 'Cliente',
  clientNit: '00000000000',
  subtotal: 100,
  total: 100,
  currency: 'CUP',
  payMethod: 'efectivo',
  status: 'emitida',
  ...over,
});

const offlineSale = (over: Partial<OfflineSale> = {}): OfflineSale => ({
  localId: 'LOCAL-0001',
  clientSaleId: 'uuid-local-1',
  locationId: 'caja-1',
  timestamp: 1_789_000_000_000,
  status: 'pending',
  attempts: 0,
  clientName: 'Consumidor Final',
  clientNit: '00000000000',
  payMethod: 'efectivo',
  items: [{ productId: 'p1', name: 'Arroz', qty: 2, price: 50, total: 100 }],
  subtotal: 100,
  total: 100,
  ...over,
});

describe('mergeSales', () => {
  it('solo servidor: la lista sale tal cual', () => {
    const out = mergeSales([serverSale()], []);
    expect(out).toHaveLength(1);
    expect(out[0].invoiceNumber).toBe('F-0001');
    expect(out[0].esOffline).toBeUndefined();
  });

  it('solo cola local: la venta sin sincronizar se ve igual', () => {
    const out = mergeSales([], [offlineSale()]);
    expect(out).toHaveLength(1);
    expect(out[0].esOffline).toBe(true);
    expect(out[0].localId).toBe('LOCAL-0001');
    expect(out[0].total).toBe(100);
  });

  it('ambos sin solapamiento: se ven las dos', () => {
    const out = mergeSales(
      [serverSale({ id: 'srv-1', clientSaleId: 'uuid-web-9' })],
      [offlineSale({ clientSaleId: 'uuid-local-1' })],
    );
    expect(out).toHaveLength(2);
    expect(out.filter((r) => r.esOffline)).toHaveLength(1);
  });

  it('colisión de clientSaleId: GANA la local (es la verdad sin subir)', () => {
    const local = offlineSale({ clientSaleId: 'uuid-x', invoiceNumber: 'F-0099' });
    const delServidor = serverSale({ id: 'srv-1', clientSaleId: 'uuid-x', invoiceNumber: 'F-0001' });
    const out = mergeSales([delServidor], [local]);
    expect(out).toHaveLength(1);
    expect(out[0].esOffline).toBe(true);
    // Y no se pierde el número de factura que devolvió el sync.
    expect(out[0].invoiceNumber).toBe('F-0099');
  });

  it('una venta del servidor sin clientSaleId (creada en la web) nunca se descarta', () => {
    const out = mergeSales(
      [serverSale({ id: 'srv-web', clientSaleId: undefined })],
      [offlineSale({ clientSaleId: 'uuid-local-1' })],
    );
    expect(out).toHaveLength(2);
  });

  it('una venta YA sincronizada no se duplica: la del servidor manda con su número', () => {
    const local = offlineSale({ status: 'synced', invoiceNumber: 'F-0099' });
    const delServidor = serverSale({ clientSaleId: local.clientSaleId, invoiceNumber: 'F-0001' });
    const out = mergeSales([delServidor], [local]);
    expect(out).toHaveLength(1);
    expect(out[0].esOffline).toBeUndefined();
    expect(out[0].invoiceNumber).toBe('F-0001');
  });

  it('lectura local fallida: con la lista vacía se ven igual las del servidor', () => {
    // Esto es EXACTAMENTE el estado en que queda la pantalla si getAllOfflineSales()
    // lanza: la cola es [] y el servidor manda. Un fallo de almacenamiento no
    // puede dejar la lista de facturas en blanco.
    const out = mergeSales([serverSale()], undefined);
    expect(out).toHaveLength(1);
    expect(out[0].invoiceNumber).toBe('F-0001');
  });

  it('un servidor que devuelve algo que no es lista no rompe nada', () => {
    expect(mergeSales(null as unknown as Sale[], null)).toEqual([]);
  });

  it('ordena de la más reciente a la más antigua, sin NaN al final', () => {
    const antigua = serverSale({ id: 'a', date: '2026-09-01T00:00:00.000Z' });
    const sinFecha = serverSale({ id: 'b', date: undefined, createdAt: undefined });
    const nueva = serverSale({ id: 'c', date: '2026-09-27T00:00:00.000Z' });
    const out = mergeSales([antigua, sinFecha, nueva], []);
    expect(out.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('un conflicto se ve con su motivo, sin perderlo en la fusión', () => {
    const local = offlineSale({ status: 'conflict', conflictReason: 'Stock insuficiente en el servidor' });
    const out = mergeSales([], [local]);
    expect(out[0].estadoOffline).toBe('conflict');
    expect(out[0].offlineHint).toBe('Stock insuficiente en el servidor');
  });
});
