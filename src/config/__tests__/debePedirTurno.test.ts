// ─── tests de debePedirTurno ──────────────────────────────────────────────────
// La condición que decide si se interrumpe al cajero para que abra turno.
// Solo se interrumpe cuando hay una decisión REAL que tomar: varias cajas
// asignadas y ningún turno abierto. En cualquier otro caso preguntar es ruido
// — y en el caso del `aviso` es directamente engañoso: la respuesta ya está
// dada.

import { describe, it, expect } from '@jest/globals';
import { debePedirTurno } from '../locationResolution';

const base = {
  role: 'cajero',
  cargando: false,
  shift: null,
  aviso: null,
  cajas: [{ id: 'caja-a' }, { id: 'caja-b' }],
};

describe('debePedirTurno', () => {
  it('pide turno: cajero con varias cajas y sin turno', () => {
    expect(debePedirTurno(base)).toBe(true);
  });

  it('NO pide turno con una sola caja: la respuesta ya está decidida', () => {
    // El paso extra solo estorbaría a alguien a quien no hay nada que preguntarle.
    expect(debePedirTurno({ ...base, cajas: [{ id: 'caja-a' }] })).toBe(false);
  });

  it('NO pide turno al admin: elige caja a mano en el POS', () => {
    expect(debePedirTurno({ ...base, role: 'admin' })).toBe(false);
  });

  it('NO pide turno si ya hay turno abierto', () => {
    expect(
      debePedirTurno({ ...base, shift: { id: 'sh-1', locationId: 'caja-b' } }),
    ).toBe(false);
  });

  it('NO pide turno con un aviso del servidor: la respuesta ya está dada', () => {
    // El aviso es del tipo "falta la migración 0012". Abrir un turno no lo
    // arregla, y mandar a un cajero a abrir un turno que no puede existir es
    // peor que no mostrarle nada.
    const aviso = 'La base de datos todavía no tiene las tablas de turnos.';
    expect(debePedirTurno({ ...base, aviso })).toBe(false);
  });

  it('NO pide turno mientras se está cargando: todavía no se sabe', () => {
    expect(debePedirTurno({ ...base, cargando: true })).toBe(false);
  });
});
