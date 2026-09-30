// ─── LA VENTANA PARA EXPLICAR UN DESCUADRE ───────────────────────────────────
//
// Un cierre con descuadre no se resuelve solo: queda `provisional` con una fecha
// (`provisionalUntil`) y alguien tiene un plazo para explicar de dónde salió la
// diferencia. Pasado ese plazo el backend lo da por cerrado y avisa al dueño.
//
// Esta es la cuenta del tiempo que queda. Y hay una asimetría deliberada:
//
//  - `null` cuando YA NO queda ventana. NO es 0. "Cero horas" leería como "se
//    acabó justo ahora", y quien lo viera intentaría explicar un cierre que el
//    servidor ya rechazó con 409. `null` es la señal de "no hay nada que hacer".
//  - `false` cuando el plazo ya pasó. No se traduce a un número negativo: no
//    hay horas restantes negativas, hay que dejar de intentarlo.
//  - El borde de 0 se devuelve como 0, no como `false`. Exactamente en el
//    límite todavía se puede, y redondear la frontera fuera es la forma fácil de
//    cerrarle la puerta a alguien justo antes de tiempo.

export type HorasRestantes = number | false | null;

const MS_POR_HORA = 3_600_000;

export function horasRestantes(provisionalUntil: string | null | undefined, ahora: number): HorasRestantes {
  if (!provisionalUntil) return null;
  const limite = new Date(provisionalUntil).getTime();
  // Una fecha ilegible no es "sin límite": es un dato que no se puede usar para
  // decidir, y asumir que hay tiempo es asumir que se puede explicar cuando
  // quizá no.
  if (!Number.isFinite(limite)) return null;

  const queda = limite - ahora;
  if (queda < 0) return false;
  return Math.floor(queda / MS_POR_HORA);
}

/** ¿Tiene sentido todavía mostrar la acción de explicar? */
export function sePuedeExplicar(provisionalUntil: string | null | undefined, ahora: number): boolean {
  return horasRestantes(provisionalUntil, ahora) !== false && !!provisionalUntil;
}

/** Texto para la banda de aviso. Sin él no hay nada que decir. */
export function textoVentana(provisionalUntil: string | null | undefined, ahora: number): string {
  const h = horasRestantes(provisionalUntil, ahora);
  if (h === null) return 'Este cierre ya no está esperando explicaciones.';
  if (h === false) return 'La ventana para explicar este cierre ya venció.';
  if (h === 0) {
    const mins = Math.max(0, Math.floor((new Date(provisionalUntil as string).getTime() - ahora) / 60_000));
    return mins > 0
      ? `Quedan ${mins} minuto${mins !== 1 ? 's' : ''} para explicar este descuadre.`
      : 'Últimos minutos para explicar este descuadre.';
  }
  if (h === 1) return 'Queda 1 hora para explicar este descuadre.';
  return `Quedan ${h} horas para explicar este descuadre.`;
}
