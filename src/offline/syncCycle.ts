// ─── La decisión de si la pasada periódica debe correr ──────────────────────
//
// Está fuera del componente a propósito. El temporizador de React no se puede
// probar sin `@testing-library/react-native`, que este repo no tiene, pero la
// CONDICIÓN que decide si la pasada ocurre sí: y es la que importa. Una pasada
// que se dispara sin red, en segundo plano o encima de otra sincronización es un
// fallo de comportamiento que se vería en producción como "la app a veces se
// queda cargando" y que desde un test de render sería invisible.

/** Cada cuánto refresca la app por su cuenta, con la app abierta y con red. */
export const SYNC_CYCLE_MS = 5 * 60 * 1000;

/**
 * Mínimo entre sincronizaciones automáticas. Vive aquí y no en el componente
 * porque el test de arriba tiene que compararlo con el intervalo, y compararlos
 * a través de un import del componente obligaría a montar React para leer dos
 * números.
 */
export const AUTO_SYNC_COOLDOWN_MS = 45 * 1000;

export interface CycleOpts {
  haySesion: boolean;
  hayRed: boolean;
  /** La app está visible, no en segundo plano. */
  primerPlano: boolean;
  /** Ya hay una sincronización en vuelo. */
  sincronizando: boolean;
  /** Marca de tiempo de la última pasada automática. 0 = nunca. */
  ultimoSync: number;
  ahora: number;
}

/**
 * Todas las condiciones hacen falta. Quitar cualquiera cambia el comportamiento:
 * sin `hayRed` se gastan peticiones en llamadas que van a fallar; sin
 * `primerPlano` la radio se despierta sola cada 5 minutos; sin `sincronizando` se
 * solapan dos pasadas y las ventas se marcan como syncing dos veces; y el
 * enfriamiento evita que un tick del intervalo se apile encima de la sincronización
 * que dispara la reconexión de red.
 */
export function debeCorrerCiclo(o: CycleOpts): boolean {
  if (!o.haySesion) return false;
  if (!o.hayRed) return false;
  if (!o.primerPlano) return false;
  if (o.sincronizando) return false;
  if (o.ultimoSync && o.ahora - o.ultimoSync < AUTO_SYNC_COOLDOWN_MS) return false;
  return true;
}
