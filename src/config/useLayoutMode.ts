// ─── el ancho decide la forma, no al revés ──────────────────────────────────
//
// La app se usa en dos sitios que no son el mismo sitio: un teléfono en el
// mostrador y una tablet apoyada al lado de la caja. Antes, cada pantalla
// adivinaba por su cuenta y varias se veían igual en las dos. Esta fase
// centraliza la decisión en un solo sitio, y el motivo de que exista es otro
// más importante que el visual:
//
//   LA PANTALLA DE CIERRE EN UNA TABLET ES UN FORMULARIO DE DINERO. A 600px de
//   ancho, la tabla de la web se lee y se puede comprobar. A 360px, la misma
//   tabla obliga a hacer scroll lateral para leer una cifra, y una cifra que
//   hay que ir a buscar es una cifra que no se comprueba. El cierre de caja es
//   donde más caro sale equivocarse, porque se compara contra el dinero
//   físico.
//
// La decisión se toma UNA vez, en `layoutModeFor`, y se aplica a las pantallas
// que se repiten. La regla no se reimplementa por pantalla.
//
// LOS CORTES. La web tiene siete (640, 720, 760, 860, 900, 980, 1024) porque es
// una rejilla de escritorio. Aquí solo se necesitan DOS, y no son los mismos
// números por un motivo que conviene no olvidar:
//
//   860  — el punto en que la versión de teléfono de Configuración deja de
//          servir. En la web está en `Configuracion.tsx` como
//          `@media (min-width: 860px)`, y es el número que decide si las
//          pestañas van arriba o a la izquierda. Se copia tal cual, no
//          "redondeado": si el número se documentara distinto del de la web, la
//          paridad sería una casualidad y no una decisión.
//
//   1024 — el punto en que la barra inferior se convierte en barra lateral.
//          Este NO viene de una media query de contenido: es el ancho a partir
//          del cual un dedo puede alcanzar la columna de la izquierda y
//          comfortably los dos lados. Por debajo, una barra lateral obliga a
//          estirar el brazo con el teléfono en la otra mano.
//
// Entre 860 y 1024 se aplica `tablet`: la barra sigue abajo, pero el contenido
// puede ocupar el ancho. Es el intervalo en el que una sola regla "escritorio"
// mentiría.

import { useWindowDimensions } from 'react-native';

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

/** El ancho de la ventana de contenido, no el de la pantalla. */
export function useAncho(): number {
  return useWindowDimensions().width;
}

const TABLET = 860;
const DESKTOP = 1024;

/**
 * `modos` son los modos que esta pantalla en particular sabe hacer, en orden de
 * menor a mayor exigencia. Se comparan contra los cortes, así que una pantalla
 * que solo sepa hacer `phone` no se estira por el hecho de estar en una tablet.
 */
export function layoutModeFor(ancho: number, modos: LayoutMode[] = ['phone', 'tablet', 'desktop']): LayoutMode {
  if (ancho >= DESKTOP && modos.includes('desktop')) return 'desktop';
  if (ancho >= TABLET && modos.includes('tablet')) return 'tablet';
  return 'phone';
}

/** ¿Estamos en un ancho de escritorio? Atajo para el caso más común. */
export const esEscritorio = (ancho: number): boolean => ancho >= DESKTOP;

/**
 * La regla de una columna: en teléfono y tablet va de lado a lado, y en
 * escritorio se parte. Devuelve los porcentajes, no un array, porque el 90% de
 * los usos es `<View style={{ width: izq }}>`.
 */
export function columnas(ancho: number): { izq: `${number}%`; der: `${number}%`; partido: boolean } {
  return esEscritorio(ancho)
    ? { izq: '58%', der: '42%', partido: true }
    : { izq: '100%', der: '100%', partido: false };
}

/**
 * Cuántos elementos caben por fila en una rejilla. El ancho de tarjeta es el
 * dato de diseño y el hueco lo pone la pantalla; el número sale de la cuenta y
 * no de un `if` escrito a mano en cada sitio.
 */
export function porFila(ancho: number, anchoTarjeta = 160, gap = 10, minimo = 1): number {
  const caben = Math.floor((ancho + gap) / (anchoTarjeta + gap));
  return Math.max(minimo, caben);
}
