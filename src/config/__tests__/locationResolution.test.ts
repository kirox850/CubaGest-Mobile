// ─── tests de resolveOwn ─────────────────────────────────────────────────────
// Ocho casos, uno por regla del orden. Este módulo decide DE QUÉ CAJA se
// descuenta el stock de cada venta, así que un orden equivocado aquí no es un
// detalle de UI: es mercancía que se descuenta de una caja mientras se vende en
// otra, y un cierre que nunca cuadra.
//
// El orden que se congela (POS web:186-192, backend lib/locations.ts):
//   turno > almacén > única caja asignada > recordada > primera disponible.

import { describe, it, expect } from '@jest/globals';
import { resolveOwn, cajasParaVender } from '../locationResolution';
import type { Location } from '../../types';

const caja = (id: string, over: Partial<Location> = {}): Location => ({
  id,
  companyId: 'co-1',
  name: `Caja ${id}`,
  type: 'caja',
  active: true,
  ...over,
});

const almacen = (id = 'alm-1'): Location => ({
  id,
  companyId: 'co-1',
  name: 'Almacén Central',
  type: 'almacen',
  active: true,
});

const CAJA_A = caja('caja-a');
const CAJA_B = caja('caja-b');
const CAJA_C = caja('caja-c');
const ALMACEN = almacen();

describe('resolveOwn', () => {
  it('1. el turno abierto manda por encima de todo', () => {
    // El admin recuerda la caja A, pero tiene el turno abierto en la B: la B.
    const own = resolveOwn({
      locations: [CAJA_A, CAJA_B],
      shift: { locationId: 'caja-b' },
      role: 'admin',
      recordada: 'caja-a',
    });
    expect(own?.id).toBe('caja-b');
  });

  it('2. el turno gana también al almacén del almacenista', () => {
    const own = resolveOwn({
      locations: [ALMACEN, CAJA_A],
      shift: { locationId: 'caja-a' },
      role: 'almacenista',
    });
    expect(own?.id).toBe('caja-a');
  });

  it('3. el almacenista sin turno trabaja en el almacén', () => {
    const own = resolveOwn({
      locations: [CAJA_A, ALMACEN],
      shift: null,
      role: 'almacenista',
    });
    expect(own?.id).toBe('alm-1');
  });

  it('4. el cajero con una sola caja asignada usa esa, sin preguntar', () => {
    const own = resolveOwn({
      locations: [CAJA_A, CAJA_B],
      shift: null,
      role: 'cajero',
      unicaAsignada: 'caja-b',
    });
    expect(own?.id).toBe('caja-b');
  });

  it('5. el cajero con DOS cajas y sin turno NO decide: null (la respuesta del servidor)', () => {
    // No es un fallo: es exactamente lo que devuelve resolveOwnLocation en el
    // backend (locations.ts:161). Devolver la primera caja aquí es lo que hizo
    // que cliente y servidor vendieran en lugares distintos.
    const own = resolveOwn({
      locations: [CAJA_A, CAJA_B],
      shift: null,
      role: 'cajero',
      unicaAsignada: undefined,
    });
    expect(own).toBeNull();
  });

  it('6. el admin sin memoria usa la primera caja disponible', () => {
    // Sin este caso el POS del admin se quedaba siempre vacío: no abre turno,
    // no es almacenista y nunca tiene cajas asignadas.
    const own = resolveOwn({
      locations: [ALMACEN, CAJA_C, CAJA_A],
      shift: null,
      role: 'admin',
      recordada: '',
    });
    expect(own?.id).toBe('caja-c');
  });

  it('7. el admin con memoria usa la caja recordada', () => {
    const own = resolveOwn({
      locations: [CAJA_A, CAJA_B],
      shift: null,
      role: 'admin',
      recordada: 'caja-b',
    });
    expect(own?.id).toBe('caja-b');
  });

  it('8. una caja recordada que ya no existe cae a la primera disponible, nunca a la muerta', () => {
    // La caja recordada se desactivó o se borró desde la última vez que la
    // app pasó por aquí. Devolverla dejaría el POS apuntando a un id que ya no
    // está en /locations.
    const own = resolveOwn({
      locations: [CAJA_A, CAJA_B],
      shift: null,
      role: 'admin',
      recordada: 'caja-borrada',
    });
    expect(own?.id).toBe('caja-a');
  });
});

describe('cajasParaVender', () => {
  it('descarta el almacén y las cajas desactivadas', () => {
    const lista = cajasParaVender([ALMACEN, CAJA_A, caja('caja-off', { active: false })]);
    expect(lista.map((l) => l.id)).toEqual(['caja-a']);
  });
});
