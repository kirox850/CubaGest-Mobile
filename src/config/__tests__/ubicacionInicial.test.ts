// ─── tests de ubicacionInicial ───────────────────────────────────────────────
// Con qué caja ARRANCA la app. Dos propiedades importan más que el resto:
//
//  1. Una elección del usuario no se pisa. Si se pisara, recargar la pantalla
//     devolvería al cajero a otra caja y empezaría a descontar stock de donde
//     no es.
//  2. Una caja recordada que ya no existe NO se usa: es un id muerto, y
//     apuntar a él deja el catálogo sin dirección.

import { describe, it, expect } from '@jest/globals';
import { ubicacionInicial } from '../locationResolution';
import type { Location } from '../../types';

const caja = (id: string): Location => ({
  id, companyId: 'co-1', name: `Caja ${id}`, type: 'caja', active: true,
});
const almacen: Location = {
  id: 'alm-1', companyId: 'co-1', name: 'Almacén', type: 'almacen', active: true,
};

const A = caja('caja-a');
const B = caja('caja-b');
const C = caja('caja-c');

describe('ubicacionInicial', () => {
  it('el TURNO manda sobre el orden de la lista', () => {
    // Un cajero con tres cajas que empieza en "caja-c" porque es la tercera
    // de la lista está vendiendo de la caja de otro.
    expect(ubicacionInicial({ locations: [A, B, C], shiftLocationId: 'caja-b' })).toBe('caja-b');
  });

  it('una caja recordada que ya no existe cae a la primera disponible', () => {
    expect(ubicacionInicial({ locations: [A, B], recordada: 'caja-borrada' })).toBe('caja-a');
  });

  it('una caja recordada que sí existe se respeta', () => {
    expect(ubicacionInicial({ locations: [A, B], recordada: 'caja-b' })).toBe('caja-b');
  });

  it('una elección del usuario NUNCA se pisa, ni por el turno ni por la memoria', () => {
    expect(ubicacionInicial({ locations: [A, B], shiftLocationId: 'caja-b', recordada: 'caja-c', actual: 'caja-a' }))
      .toBe('caja-a');
  });

  it('sin nada: la primera caja o almacén de la lista', () => {
    expect(ubicacionInicial({ locations: [almacen, A, B] })).toBe('alm-1');
    expect(ubicacionInicial({ locations: [A, B] })).toBe('caja-a');
  });

  it('una lista vacía devuelve vacío (no un id inventado)', () => {
    expect(ubicacionInicial({ locations: [] })).toBe('');
    expect(ubicacionInicial({ locations: [], recordada: 'caja-a' })).toBe('');
  });
});
