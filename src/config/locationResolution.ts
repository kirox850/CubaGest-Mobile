// ─── RESOLUCIÓN DE LA CAJA DE TRABAJO ────────────────────────────────────────
//
// POR QUÉ ESTO ES UN MÓDULO APARTE Y NO UN TERNARIO DENTRO DE UN COMPONENTE.
//
// La caja de la que se vende se ha resuelto de tres maneras distintas a lo
// largo del proyecto y cada una rompió algo:
//
//  1. "la caja cuyo dueño soy" (POSScreen v1) — con cajas compartidas un
//     cajero puede tener varias, y además la caja es del negocio. El cliente
//     cogía la primera y el servidor cogía otra: cada uno pensaba que estaba
//     en la suya, y el stock se descontaba de una caja mientras se vendía otra.
//  2. "la primera caja de la lista" — un cajero con tres cajas empezaba en la
//     que salía primera por orden, que casi nunca es la suya.
//  3. El turno abierto manda — el backend ya lo hace así en
//     `resolveOwnLocation` (src/lib/locations.ts).
//
// La regla vigente es la del SERVIDOR, y este módulo es su copia para que el
// teléfono y el backend no puedan discrepar. Si alguien cambia el orden aquí,
// se rompe la paridad: por eso vive solo, con sus tests, y no se permite
// "inlinearlo una vez" en una pantalla.
//
// El orden, copiado de `CubaGest-Web/src/screens/POS.tsx:186-192`:
//
//   1. el TURNO abierto, que siempre manda por encima de todo;
//   2. el ALMACÉN, para quien trabaja en él;
//   3. la única caja ASIGNADA, para el cajero que solo tiene una;
//   4. la RECORDADA o la primera disponible, para el admin (que no abre turno
//      y no tiene cajas asignadas, y se queda siempre vacío sin este caso).
//
// Y con UNA diferencia deliberada respecto a la web, en el paso 3: un cajero
// con varias cajas y sin turno devuelve `null` en vez de caer en el paso 4. No
// es un fallo, es la respuesta del propio servidor — y es la que hace que la
// pantalla pregunte en vez de vender a ciegas.

import type { Location } from '../types';

export interface ShiftLike {
  locationId: string;
}

export interface ResolveOwnOpts {
  /** Todas las ubicaciones de la empresa, tal cual las devuelve /locations. */
  locations: Location[];
  /** El turno abierto de este usuario, o null. */
  shift: ShiftLike | null;
  role: string;
  /** Id de la ÚNICA caja asignada, si solo tiene una. */
  unicaAsignada?: string;
  /** Id de la caja que ya estaba usando (elegida a mano o recordada). */
  recordada?: string;
}

/** Las cajas con las que se puede vender: activas y de tipo caja. */
export function cajasParaVender(locations: Location[]): Location[] {
  return (locations || []).filter((l) => l.type === 'caja' && l.active !== false);
}

export function resolveOwn(opts: ResolveOwnOpts): Location | null {
  const { locations, shift, role, unicaAsignada, recordada } = opts;
  const locs = locations || [];

  // 1. El turno manda por encima de todo. Se busca sobre TODAS las
  //    ubicaciones, no solo las activas: si el turno dice caja 2, la caja 2 es
  //    la caja 2, y la pregunta de si sigue activa la responde el backend al
  //    entregar ese turno (getOpenShiftForUser devuelve null si la caja se
  //    desactivó con el turno abierto).
  if (shift?.locationId) {
    return locs.find((l) => l.id === shift.locationId) || null;
  }

  // 2. El almacén, para quien trabaja en él.
  if (role === 'almacenista') {
    return locs.find((l) => l.type === 'almacen') || null;
  }

  // 3. Un cajero sin turno abierto solo puede usar su única caja asignada.
  //
  //    Con varias cajas y sin turno se devuelve `null` A PROPÓSITO, y es la
  //    única diferencia con la web (que ahí cae en "la primera disponible").
  //    Aquí la manda el servidor: `resolveOwnLocation` devuelve `null` para un
  //    cajero al que no le corresponde exactamente una caja, y un POST /sales
  //    sale de ahí. Si el móvil eligiera una por su cuenta, el cajero vería un
  //    catálogo con stock de una caja, cobraría contra ella, y el servidor
  //    rechazaría la venta — o peor, la aceptaría en otra. Devolver `null` es
  //    la respuesta del servidor, y obliga a la pantalla a preguntar.
  if (role === 'cajero') {
    if (!unicaAsignada) return null;
    return locs.find((l) => l.id === unicaAsignada) || null;
  }

  // 4. El admin (y cualquier otro rol sin caso propio): la recordada, y si no
  //    existe, la primera disponible. NUNCA una caja borrada o desactivada: una
  //    caja que ya no está en la lista no es una opción, es un id muerto que
  //    dejaría la pantalla apuntando al vacío.
  const cajas = cajasParaVender(locs);
  return cajas.find((l) => l.id === recordada) || cajas[0] || null;
}

export interface DebePedirTurnoOpts {
  role: string;
  cargando: boolean;
  shift: unknown;
  /** Aviso del servidor, p. ej. que falta una migración. */
  aviso: string | null;
  cajas: unknown[];
}

/**
 * ¿Hay que interrumpir al cajero para que abra turno?
 *
 * Solo cuando hay una decisión real que tomar: más de una caja asignada y
 * ningún turno abierto. Con una caja no se pregunta nada; con un `aviso` del
 * servidor tampoco, porque la respuesta ya está dada (falta una migración) y
 * abrir un turno no lo arregla; y mientras se está cargando, todavía no se
 * sabe.
 *
 * El caso 3 de `resolveOwn` (cajero con varias cajas, sin turno) devuelve
 * `null` a propósito: esta función es la que hace que la pantalla pregunte en
 * ese caso. Las dos piezas van juntas y por eso viven en el mismo archivo.
 */
export function debePedirTurno(opts: DebePedirTurnoOpts): boolean {
  const { role, cargando, shift, aviso, cajas } = opts;
  return (
    !cargando &&
    role === 'cajero' &&
    !shift &&
    !aviso &&
    Array.isArray(cajas) &&
    cajas.length > 1
  );
}

// ── La caja con la que ARRANCA la app ────────────────────────────────────────
//
// Es una regla distinta de `resolveOwn` y por eso vive aparte, aunque las dos
// hablar de la misma caja. `resolveOwn` decide dónde se VENDE; esto decide qué
// se recuerda para el próximo arranque. La diferencia que importa:
//
//   - una elección del usuario NO se pisa nunca (vuelve a la app, a otra
//     pantalla, o la lista se recarga: sigue siendo la suya);
//   - el TURNO manda sobre el orden de la lista, porque un cajero con tres
//     cajas empezaba en la que salía primera por orden, que casi nunca es la
//     suya — y vendía de la caja de otro;
//   - una caja recordada que ya no está en la lista NO se usa. Es un id muerto:
//     apuntar a él deja el catálogo sin dirección y la pantalla en blanco.

export interface UbicacionInicialOpts {
  locations: Location[];
  /** La caja del turno abierto, si lo hay. */
  shiftLocationId?: string | null;
  /** La última caja usada por esta cuenta. */
  recordada?: string | null;
  /** Lo que ya había: una elección del usuario. */
  actual?: string;
}

export function ubicacionInicial(opts: UbicacionInicialOpts): string {
  const { locations, shiftLocationId, recordada, actual } = opts;
  const locs = locations || [];

  if (actual) return actual;
  if (shiftLocationId) return shiftLocationId;
  if (recordada && locs.some((l) => l.id === recordada)) return recordada;

  const primera = locs.find((l) => l.type === 'caja' || l.type === 'almacen') || locs[0];
  return primera?.id || '';
}
