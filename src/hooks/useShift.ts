// ─── TURNO ───────────────────────────────────────────────────────────────────
//
// Un turno es "esta persona, en esta caja, desde esta hora". De ahí sale la caja
// en la que se vende: el POS, el inventario y el cierre cuelgan de esto, no de
// "la caja cuyo dueño soy". Con las cajas compartidas, la caja es del negocio y
// la pueden llevar varios cajeros en distintos momentos, así que "cuál es la
// mía" solo tiene una respuesta: la del turno que está abierto ahora mismo.
//
// Sin esto, un cajero con dos cajas asignadas vendía desde la primera que salía
// en la lista y el cierre de esa caja no cuadtaba nunca.
//
// SIN CONEXIÓN. El turno abierto se recuerda en el dispositivo. Sin ese
// respaldo, el cajero pierde su caja justo cuando más la necesita — que es
// exactamente cuando se cae la red, en un negocio con mala conectividad.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShiftAPI } from '../api/endpoints';
import { isOfflineError } from '../api/client';
import { enqueueOfflineOperation } from '../offline/offlineStore';
import { generateUuid } from '../utils/uuid';
import type { Shift, AssignedCaja, ShiftCurrentResponse } from '../types';

const SHIFT_KEY = 'cubagest_shift';

interface Recordado {
  shift: Shift | null;
  cajas: AssignedCaja[];
}

/**
 * El turno de ESTA cuenta, no el de cualquiera. La clave incluye el id de
 * usuario a propósito: dos personas pueden usar el mismo teléfono (el de un
 * mostrador compartido, el de un device en rotación) y ver el turno de otra en
 * su propio POS sería gravar el stock de la caja equivocada.
 *
 * Exportado para que el test ejercite ESTA clave y no una copia suya en el
 * test: una copia pasa verde mientras la función real cambia.
 */
export function shiftStorageKey(userId: string): string {
  return `${SHIFT_KEY}:${userId}`;
}

export async function readPersistedShift(userId: string): Promise<Recordado> {
  try {
    const raw = await AsyncStorage.getItem(shiftStorageKey(userId));
    if (!raw) return { shift: null, cajas: [] };
    const parsed = JSON.parse(raw) as Recordado;
    return { shift: parsed?.shift ?? null, cajas: Array.isArray(parsed?.cajas) ? parsed.cajas : [] };
  } catch {
    // Almacenamiento lleno o corrupto: es motivo para seguir sin turno, no para
    // romper la pantalla.
    return { shift: null, cajas: [] };
  }
}

/**
 * Guarda el turno Y las cajas asignadas, SIEMPRE juntos.
 *
 * Antes esto borraba el registro entero cuando `shift` era null, y eso se
 * llevaba por delante las cajas: un cajero recién logueado (que es
 * justamente cuando no tiene turno abierto) se quedaba sin lista de cajas
 * para siempre, porque el único momento en que el servidor le manda esa lista
 * es en el preciso instante en que se descartaba. Sin red, `cajas` llegaba
 * vacío, `unicaAsignada` era undefined, `resolveOwn` devolvía null
 * (locationResolution.ts:86-88) y el POS decía "no tienes una caja asignada"
 * de una caja que sí tenía.
 *
 * `shift: null` es un valor legítimo — significa que el servidor confirmó que
 * no hay turno abierto — así que se guarda ese null, no se borra el registro.
 * La lista de cajas es POR CUENTA: dice dónde puede abrir turno esta persona,
 * no dónde está, así que sobrevive a que cierre su turno.
 */
export async function persistShift(userId: string, shift: Shift | null, cajas: AssignedCaja[]): Promise<void> {
  try {
    await AsyncStorage.setItem(shiftStorageKey(userId), JSON.stringify({ shift: shift ?? null, cajas }));
  } catch {
    // sin respaldo no se rompe nada: con red se vuelve a pedir
  }
}

export interface UseShiftValue {
  shift: Shift | null;
  /** Cajas que este usuario puede abrir turno en (las asignadas). */
  cajas: AssignedCaja[];
  cargando: boolean;
  /** Se leyó del respaldo local, no del servidor. */
  offline: boolean;
  /** Aviso del servidor. NUNCA se trata como "no hay turno". */
  aviso: string | null;
  abrirTurno: (locationId: string, baseCash?: Record<string, number>, items?: { productId: string; contado: number }[]) => Promise<Shift | null>;
  cerrarTurno: (payload?: { items?: any[]; countedCash?: Record<string, number>; notes?: string; countedAt?: string }) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useShift(userId: string | undefined): UseShiftValue {
  const [shift, setShift] = useState<Shift | null>(null);
  const [cajas, setCajas] = useState<AssignedCaja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [offline, setOffline] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // El respaldo es POR USUARIO, así que se relee al cambiar de cuenta: si no,
  // el cajero B vería el turno que el cajero A dejó abierto.
  const usuarioRef = useRef<string | undefined>(userId);
  usuarioRef.current = userId;

  const cargar = useCallback(async () => {
    const uid = usuarioRef.current;
    if (!uid) {
      setShift(null);
      setCajas([]);
      setCargando(false);
      return;
    }
    try {
      const r = (await ShiftAPI.current()) as ShiftCurrentResponse;
      // OJO: el campo se llama `assignedCajas`, NO `cajas`. Leer el nombre
      // equivocado deja la lista vacía SIN ningún error visible, el prompt de
      // abrir turno no se dispara jamás, y el cajero con dos cajas vuelve a
      // vender desde la primera. Es un fallo silencioso, y por eso tiene test.
      setShift(r?.shift ?? null);
      setCajas(Array.isArray(r?.assignedCajas) ? r.assignedCajas : []);
      setAviso(r?.aviso ?? null);
      setOffline(false);
      await persistShift(uid, r?.shift ?? null, Array.isArray(r?.assignedCajas) ? r.assignedCajas : []);
    } catch (e) {
      // Sin conexión: el turno abierto se recuerda en el dispositivo. Sin esto
      // el cajero perdería la caja justo cuando más la necesita.
      //
      // El respaldo se aplica SIEMPRE que la llamada falle, no solo sin red: un
      // 403 o un 5xx tampoco invalida un turno que ya estaba abierto, y tirar
      // la caja del cajero por un error del servidor sería peor que el error.
      // Lo que SÍ se distingue es la causa, para no mostrarle "sin conexión" a
      // quien lo que tiene es un problema de permisos.
      const guardado = await readPersistedShift(uid);
      setShift(guardado.shift);
      setCajas(guardado.cajas);
      setAviso(null);
      setOffline(isOfflineError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar, userId]);

  const abrirTurno = useCallback(async (locationId: string, baseCash?: Record<string, number>, items?: { productId: string; contado: number }[]) => {
    const uid = usuarioRef.current;
    if (!uid) throw new Error('Inicia sesión para abrir turno');
    const businessAt = new Date().toISOString();
    const clientShiftId = generateUuid();
    const clientReadingId = generateUuid();
    let nuevo: Shift | null;
    try {
      const r = await ShiftAPI.start(locationId, baseCash, items, { clientShiftId, clientReadingId, businessAt });
      nuevo = r?.shift ?? null;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      await enqueueOfflineOperation('shift_open', {
        locationId, baseCash: baseCash || {}, items: items || [], clientShiftId, clientReadingId, businessAt,
      }, Date.parse(businessAt), clientShiftId);
      nuevo = {
        id: `offline-${clientShiftId}`,
        locationId,
        locationName: cajas.find((c) => c.id === locationId)?.name || 'Caja sin conexión',
        startedAt: businessAt,
        openingReadingId: clientReadingId,
        baseCash: baseCash || {},
      };
    }
    setShift(nuevo);
    setAviso(null);
    // El turno se guarda en cuanto se abre. Si la respuesta se pierde después,
    // el respaldo es lo que impide que el cajero quede sin caja.
    await persistShift(uid, nuevo, cajas);
    return nuevo;
  }, [cajas]);

  const cerrarTurno = useCallback(async (payload?: {
    items?: any[];
    countedCash?: Record<string, number>;
    notes?: string;
    countedAt?: string;
  }) => {
    const uid = usuarioRef.current;
    const businessAt = payload?.countedAt || new Date().toISOString();
    const clientClosingId = generateUuid();
    const clientReadingId = generateUuid();
    try {
      await ShiftAPI.end({ ...payload, countedAt: businessAt, clientClosingId, clientReadingId });
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      await enqueueOfflineOperation('shift_close', {
        ...payload,
        initialReadingId: shift?.openingReadingId,
        clientClosingId,
        clientReadingId,
        countedAt: businessAt,
      }, Date.parse(businessAt), clientClosingId);
    }
    setShift(null);
    // Las cajas NO se borran al cerrar el turno: siguen siendo las del cajero.
    // Pasarlas como [] vaciaba la lista y dejaba la app sin saber dónde puede
    // abrir el siguiente turno, que es justo lo que hace falta al cerrar uno.
    if (uid) await persistShift(uid, null, cajas);
  }, [cajas, shift]);

  return { shift, cajas, cargando, offline, aviso, abrirTurno, cerrarTurno, refresh: cargar };
}
