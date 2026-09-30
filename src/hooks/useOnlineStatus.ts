// ─── CONECTIVIDAD REAL (NetInfo + sonda al servidor) ─────────────────────────
//
// Ver src/config/conectividad.ts para POR QUÉ son dos señales y por qué la
// sonda no puede derivarse de apiFetch. Aquí solo está el cableado.
//
// La sonda es `fetch` CRUDO a propósito, y no por descuido:
//
//  - `apiFetch` exige token cuando `auth` no es false, y un token caducado
//    dispara la renovación y, si falla, lanza OFFLINE_MESSAGE. Usarlo para
//    medir la red sería medir dos cosas a la vez.
//  - `apiFetch` traduce CUALQUIER fallo de red a OFFLINE_MESSAGE, y un 403 de
//    permisos también acaba ahí. La conectividad se decidiría con un dato que
//    no la describe.
//
// Y NUNCA corre por temporizador: cada ejecución es un turno de radio. Se lanza
// al arrancar, al recuperar conexión, al volver a primer plano y a mano, que es
// donde ya hay peticiones de verdad y un turno más no se nota.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { API_BASE_URL } from '../api/config';
import { esOnline, clasificarSonda, conSonda, type EstadoRed } from '../config/conectividad';

const SONDA_TIMEOUT_MS = 4000;

export function useOnlineStatus(): { online: boolean; probe: () => Promise<boolean> } {
  const [estado, setEstado] = useState<EstadoRed>({ sistema: true, servidor: null });
  // La sonda se pisa a sí misma: dos a la vez solo gastan batería. Para poder
  // devolver la respuesta correcta sin volver a sondar hace falta el último
  // estado conocido, y por eso se guarda también en un ref.
  const sonando = useRef(false);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;

  const probe = useCallback(async (): Promise<boolean> => {
    if (sonando.current) return esOnline(estadoRef.current);
    sonando.current = true;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), SONDA_TIMEOUT_MS);
      try {
        // Cualquier respuesta cuenta, se mire su código. Lo que se necesita es
        // saber que hay camino, no que el servidor esté sano.
        const res = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
        });
        const resultado = clasificarSonda({ ok: !!res });
        setEstado((prev) => conSonda(prev, resultado));
        return resultado === 'online';
      } finally {
        clearTimeout(t);
      }
    } catch {
      // Fallo de transporte: eso sí es "sin conexión".
      setEstado((prev) => conSonda(prev, 'offline'));
      return false;
    } finally {
      sonando.current = false;
    }
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      setEstado((prev) => ({ ...prev, sistema: !!s.isConnected && s.isInternetReachable !== false }));
    });
    return unsub;
  }, []);

  // Al arrancar y al volver a primer plano: es cuando el usuario ya está
  // mirando la pantalla y un dato caducado es desconcertante.
  useEffect(() => {
    void probe();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void probe();
    });
    return () => sub.remove();
  }, [probe]);

  // Solo cuando el sistema ACABA de recuperar la señal: es el único momento en
  // que la sonda puede cambiar algo, y evita gastar un turno en cada parpadeo.
  const ibaOffline = useRef(false);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const conectado = !!s.isConnected && s.isInternetReachable !== false;
      const recovering = conectado && ibaOffline.current;
      ibaOffline.current = !conectado;
      if (recovering) void probe();
    });
    return unsub;
  }, [probe]);

  return { online: esOnline(estado), probe };
}
