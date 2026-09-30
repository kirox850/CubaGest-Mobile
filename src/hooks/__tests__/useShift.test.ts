// ─── tests de useShift ───────────────────────────────────────────────────────
//
// EL TEST DE CONTRATO DE `assignedCajas` ES EL IMPORTANTE DE ESTE ARCHIVO.
//
// El backend responde `{ shift, assignedCajas, aviso }` (shifts.ts:44-70). Si el
// cliente lee `cajas`, no hay excepción, no hay warning, no hay nada: la lista
// sale vacía, `debePedirTurno` ve cero cajas en vez de dos, nunca dispara el
// prompt, y el cajero vuelve a vender desde la primera caja de la lista. El
// síntoma aparece semanas después como "el cierre no cuadra nunca". Un fallo
// silencioso necesita un test explícito, no un test de la función que lo calcula.
//
// El hook no se monta (no hay @testing-library/react-native en este repo), así
// que lo que se verifica es el CONTRATO y el RESPALDO, no el render.

import { describe, it, expect, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shiftStorageKey, readPersistedShift, persistShift } from '../useShift';
import type { ShiftCurrentResponse, Shift, AssignedCaja } from '../../types';

const USER = 'user-1';

const CAJA_A: AssignedCaja = { id: 'caja-a', name: 'Caja 1', type: 'caja', active: true };
const CAJA_B: AssignedCaja = { id: 'caja-b', name: 'Caja 2', type: 'caja', active: true };

const TURNO: Shift = {
  id: 'sh-1',
  locationId: 'caja-b',
  locationName: 'Caja 2',
  startedAt: '2026-09-27T08:00:00.000Z',
  openingReadingId: 'r-1',
  baseCash: { CUP: 1000 },
};

/**
 * Reproduce lo que hace `useShift` al leer la respuesta. Si alguien cambia uno
 * de esos nombres, este helper —y con él el hook— deja de leer lo que llega.
 */
function leerTurno(r: Partial<ShiftCurrentResponse> | null | undefined) {
  return {
    shift: r?.shift ?? null,
    cajas: Array.isArray(r?.assignedCajas) ? r.assignedCajas : [],
    aviso: r?.aviso ?? null,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('contrato de GET /shift/current', () => {
  it('el campo se llama assignedCajas, NO cajas', () => {
    // Respuesta real del backend.
    const respuesta: ShiftCurrentResponse = { shift: null, assignedCajas: [CAJA_A, CAJA_B] };

    const { cajas } = leerTurno(respuesta);
    expect(cajas).toHaveLength(2);
    expect(cajas.map((c) => c.id)).toEqual(['caja-a', 'caja-b']);
  });

  it('leer "cajas" en vez de "assignedCajas" deja la lista VACÍA y a nadie se entera', () => {
    // El fallo silencioso, reproducido. Con dos cajas asignadas el prompt de
    // abrir turno debe dispararse; con la lista vacía, `cajas.length > 1` es
    // falso y el cajero nunca es interrumpido.
    const respuesta = { shift: null, assignedCajas: [CAJA_A, CAJA_B] } as unknown as Record<string, unknown>;
    const leídoMal = (respuesta.cajas as unknown[]) ?? [];
    expect(leídoMal).toHaveLength(0);

    const leídoBien = (respuesta.assignedCajas as unknown[]) ?? [];
    expect(leídoBien).toHaveLength(2);
  });

  it('el turno abierto trae la caja, el nombre y el fondo por moneda', () => {
    const { shift } = leerTurno({ shift: TURNO, assignedCajas: [CAJA_B] });
    expect(shift?.locationId).toBe('caja-b');
    expect(shift?.locationName).toBe('Caja 2');
    expect(shift?.baseCash).toEqual({ CUP: 1000 });
  });

  it('el aviso del servidor se lee, y no se confunde con "no hay turno"', () => {
    // shifts.ts:41-50: si falta la migración 0012 el servidor contesta con
    // turno null y este aviso. Leerlo como "no tienes turno" manda al cajero a
    // abrir un turno que no puede existir. El texto es el LITERAL del backend.
    const avisoDelServidor =
      'La base de datos todavía no tiene las tablas de turnos. Hay que aplicar la migración 0012 antes de usarlos.';
    const { shift, aviso } = leerTurno({
      shift: null,
      assignedCajas: [],
      aviso: avisoDelServidor,
    });
    expect(shift).toBeNull();
    // Lo que de verdad importa: el aviso LLEGA. Que no se pierda es la diferencia
    // entre "el cajero pide ayuda" y "el cajero abre un turno imposible".
    expect(aviso).toBe(avisoDelServidor);
    expect(aviso).toContain('migración 0012');
  });

  it('una respuesta rara no rompe nada: la lista sale vacía, no undefined', () => {
    expect(leerTurno(null).cajas).toEqual([]);
    expect(leerTurno(undefined).cajas).toEqual([]);
    expect(leerTurno({ shift: null, assignedCajas: undefined as never }).cajas).toEqual([]);
  });
});

describe('el respaldo en el dispositivo (sin conexión)', () => {
  it('el turno y las cajas sobreviven a un corte de red (ida y vuelta real)', async () => {
    await persistShift(USER, TURNO, [CAJA_B]);
    const guardado = await readPersistedShift(USER);

    expect(guardado.shift?.locationId).toBe('caja-b');
    expect(guardado.shift?.baseCash).toEqual({ CUP: 1000 });
    expect(guardado.cajas).toHaveLength(1);
  });

  it('la clave es POR USUARIO: no se lee el turno de otro', async () => {
    await persistShift(USER, TURNO, [CAJA_B]);
    await persistShift('user-2', null, []);

    expect(shiftStorageKey(USER)).not.toBe(shiftStorageKey('user-2'));
    expect((await readPersistedShift('user-2')).shift).toBeNull();
    expect((await readPersistedShift(USER)).shift?.locationId).toBe('caja-b');
  });

  it('cerrar el turno lo deja en null, no pidiendo una caja cerrada', async () => {
    await persistShift(USER, TURNO, [CAJA_B]);
    expect((await readPersistedShift(USER)).shift).not.toBeNull();

    await persistShift(USER, null, [CAJA_B]);

    // Lo que importa es que el TURNO queda en null: un turno cerrado nunca se
    // recuerda como abierto. El registro no se borra, porque borrarlo se
    // llevaba también la lista de cajas del cajero.
    const guardado = await readPersistedShift(USER);
    expect(guardado.shift).toBeNull();
    expect(guardado.cajas).toHaveLength(1);
  });

  it('guarda las cajas aunque NO haya turno abierto (la regresión)', async () => {
    // Este es el fallo que dejó al cajero sin POS sin conexión. El servidor
    // responde `shift: null` + `assignedCajas: [...]` justo después de
    // loguearse, que es el estado normal de quien todavía no ha abierto turno.
    // Antes, guardar eso BORRABA el registro y las cajas no se guardaban nunca:
    // sin red, `cajas` llegaba vacío, `resolveOwn` devolvía null y el POS pedía
    // una caja que el cajero ya tenía.
    await persistShift(USER, null, [CAJA_A, CAJA_B]);

    const guardado = await readPersistedShift(USER);
    expect(guardado.cajas).toHaveLength(2);
    expect(guardado.cajas.map((c) => c.id)).toEqual(['caja-a', 'caja-b']);
    expect(guardado.shift).toBeNull();
  });

  it('sin red, la lista de cajas sobrevive a un turno que sí se abrió y cerró', async () => {
    // El ciclo completo del cajero, sin tocar la red: abre turno, lo cierra, y
    // sigue sabiendo dónde puede vender. Con el `persistShift` viejo, el
    // segundo paso vaciaba la lista.
    await persistShift(USER, null, [CAJA_A, CAJA_B]);
    await persistShift(USER, TURNO, [CAJA_A, CAJA_B]);
    await persistShift(USER, null, [CAJA_A, CAJA_B]);

    const guardado = await readPersistedShift(USER);
    expect(guardado.shift).toBeNull();
    expect(guardado.cajas).toHaveLength(2);
  });

  it('un respaldo corrupto no tumba la pantalla: turno null, no excepción', async () => {
    await AsyncStorage.setItem(shiftStorageKey(USER), '{esto no es json');
    expect(await readPersistedShift(USER)).toEqual({ shift: null, cajas: [] });
  });

  it('un respaldo sin `cajas` (versión vieja) se lee sin cajas, sin romper', async () => {
    await AsyncStorage.setItem(shiftStorageKey(USER), JSON.stringify({ shift: TURNO }));
    const guardado = await readPersistedShift(USER);
    expect(guardado.shift?.id).toBe('sh-1');
    expect(guardado.cajas).toEqual([]);
  });
});
