// ─── DÓNDE ESTOY TRABAJANDO, CON O SIN CONEXIÓN ──────────────────────────────
//
// Este hook existe por un motivo concreto: TODO lo demás depende de él. El
// catálogo cacheado vive en un namespace que INCLUYE la ubicación, así que sin
// resolver la ubicación el POS y el inventario no tienen nada que mostrar. Y la
// ubicación venía de `/locations`, que sin red no existe. Por eso el modo sin
// conexión se veía roto entero: no era el POS ni el inventario, era que no se
// sabía a qué caja pertenecía el catálogo.
//
// Reglas, y las tres importan:
//
//  - con red: se pide al servidor y se cachea de paso;
//  - sin red: se lee de la caché local;
//  - sin red y sin caché: se DICE, no se finge.
//
// La caja de trabajo la dicta el TURNO, no el orden de la lista. Sin esto, un
// cajero con tres cajas asignadas empezaba en la que salía primera por
// orden, que casi nunca es la suya — y vendía de la caja de otro.
//
// Y una elección del usuario NUNCA se pisa: todo el que fija la caja parte de
// `prev => prev || algo`, para que recargar la pantalla no le arrebate al cajero
// la caja que ya estaba usando.

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocationsAPI, ClosingAPI } from '../api/endpoints';
import {
  cacheLocations, getOfflineLocations, getLastLocationId, setLastLocationId,
  cacheReadings, getOfflineReadings,
} from '../offline/offlineStore';
import { ubicacionInicial } from '../config/locationResolution';
import type { User, Location, InventoryReading } from '../types';

export interface UseLocationsValue {
  locations: Location[];
  locationId: string;
  /** Cambia la ubicación de trabajo. Acepta un id o un actualizador. */
  elegir: (id: string | ((prev: string) => string)) => void;
  cargando: boolean;
  /** Sin red y sin copia local: hay que decirlo, no fingir. */
  sinCache: boolean;
  refresh: () => Promise<void>;
}

export function useLocations(
  user: User | null,
  opts: { shiftLocationId?: string | null } = {},
): UseLocationsValue {
  const shiftLocationId = opts.shiftLocationId ?? null;
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [sinCache, setSinCache] = useState(false);
  // Para no reventar el almacenamiento: si el usuario mueve el selector, se
  // guarda UNA vez, no en cada render.
  const guardadoRef = useRef(false);

  const cargar = useCallback(async () => {
    if (!user?.id) {
      setLocations([]);
      setLocationId('');
      setCargando(false);
      return;
    }
    // Se intenta el servidor primero SIEMPRE. Puede fallar por permisos o por
    // un 5xx sin que eso sea "sin conexión", y la caché puede tener la última
    // versión buena: entrar a leerla antes solo añadiría latencia.
    try {
      const locs = await LocationsAPI.list();
      setLocations(locs || []);
      await cacheLocations(locs || []);
      setSinCache(false);
      if (!guardadoRef.current && locs?.length) {
        // La regla de arranque vive en locationResolution.ts, no aquí: es la
        // misma familia de reglas que decide dónde se vende, y partido en dos
        // archivos es exactamente cómo se desincronizan.
        const recordada = await getLastLocationId().catch(() => null);
        setLocationId((prev) => ubicacionInicial({
          locations: locs,
          shiftLocationId,
          recordada,
          actual: prev,
        }));
      }
      return;
    } catch {
      // Se cae a la caché de la cuenta.
    }

    try {
      const cached = await getOfflineLocations();
      if (cached.length > 0) {
        setLocations(cached);
        setSinCache(false);
        if (!guardadoRef.current) {
          const ultima = await getLastLocationId().catch(() => null);
          setLocationId((prev) => ubicacionInicial({
            locations: cached,
            recordada: ultima,
            actual: prev,
          }));
        }
      } else {
        setSinCache(true);
        setLocations([]);
        setLocationId('');
      }
    } catch {
      setSinCache(true);
    }
  }, [user?.id, shiftLocationId]);

  useEffect(() => { setCargando(true); void cargar().finally(() => setCargando(false)); }, [cargar]);

  // Guardar la última ubicación usada, para el próximo arranque sin red.
  useEffect(() => {
    if (!user?.id || !locationId) return;
    if (guardadoRef.current) return;
    setLastLocationId(locationId).catch(() => {});
    guardadoRef.current = true;
  }, [user?.id, locationId]);

  const elegir = useCallback((id: string | ((prev: string) => string)) => {
    setLocationId((prev) => {
      const next = typeof id === 'function' ? id(prev) : id;
      if (next) setLastLocationId(next).catch(() => {});
      return next;
    });
  }, []);

  return { locations, locationId, elegir, cargando, sinCache, refresh: cargar };
}

/**
 * Lecturas de apertura pendientes, con o sin conexión.
 *
 * Son la BASE del conteo del cierre. Sin copia local no se puede empezar a
 * cerrar sin red, que es justo lo que pasaba.
 */
export function useReadings(user: User | null): {
  readings: InventoryReading[];
  cargando: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [readings, setReadings] = useState<InventoryReading[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!user?.id) {
      setCargando(false);
      return;
    }
    setError(null);
    try {
      const list = await ClosingAPI.readings();
      setReadings(list || []);
      await cacheReadings(list || []);
      setCargando(false);
      return;
    } catch {
      // Se cae al caché: puede haberse usado sin red justo antes.
    }
    try {
      setReadings(await getOfflineReadings());
    } catch {
      setError('No se pudieron cargar las lecturas.');
    }
    setCargando(false);
  }, [user?.id]);

  useEffect(() => { setCargando(true); void cargar().finally(() => setCargando(false)); }, [cargar]);

  return { readings, cargando, error, refresh: cargar };
}
