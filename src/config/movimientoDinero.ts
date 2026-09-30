// ─── ENTRADAS Y SALIDAS DE DINERO (reglas puras) ─────────────────────────────
//
// El problema que esto resuelve: cuando alguien saca plata de la caja, el cierre
// la ve como faltante y avisa de un robo que no ocurrió. No hay forma de
// distinguir "me faltó" de "el dueño retiró y no lo dijo".
//
// La regla acordada en el backend, y aquí la misma:
//
//  - un CAJERO solo puede registrar una SALIDA con su turno abierto. Sin turno
//    no hay caja de la que sacó el dinero, así que no tiene sentido. El backend
//    responde 403 con "Abre tu turno antes de registrar una salida de dinero." y
//    esta pantalla avisa ANTES de gastar el viaje, con el mismo criterio.
//  - un ADMIN puede siempre: es quien autoriza los retiros.
//  - una SALIDA necesita motivo SIEMPRE. El backend lo exige (400). Un retiro
//    sin explicación es exactamente el caso que el cierre no puede distinguir
//    de un robo.
//  - una ENTRADA no necesita motivo: devolver un cambio o reponer un faltante
//    son cosas que no se anotan cada vez.
//
// OJO con la última regla y su trampa: "sin motivo" NO significa "cualquier
// texto vale". El backend exige 3 caracteres (src/routes/cashMovements.ts). Un
// texto de 2 letras se envía, el servidor lo rechaza, y el cajero ve un error
// del servidor en vez de un aviso en el sitio. Se comprueba aquí.

export type TipoMovimiento = 'entrada' | 'salida';

export const MOTIVO_MINIMO = 3;

export interface ValidarMovimientoOpts {
  tipo: TipoMovimiento;
  /** Lo que el cajero escribió en el importe. */
  monto: string;
  /** Lo que escribió en el motivo. */
  motivo: string;
  /** Hay turno abierto. Solo importa para una salida de un cajero. */
  hayTurno: boolean;
  role: string;
}

export type ValidarMovimiento = { ok: true } | { ok: false; error: string };

/**
 * El backend admite hasta 1e9 (`MAX_MOVEMENT`). Por encima de eso es un error
 * de tecleo, no un retiro real, y dejarlo pasar convertiría un 0 de más en un
 * movimiento que hay que anular.
 */
export const MAX_MOVIMIENTO = 1_000_000_000;

export function validarMovimiento(opts: ValidarMovimientoOpts): ValidarMovimiento {
  const { tipo, monto, motivo, hayTurno, role } = opts;

  // El cajero necesita turno para SACAR. Registrar una entrada es otra cosa:
  // devolver un cambio o reponer un sobre no exige estar en turno.
  if (tipo === 'salida' && role === 'cajero' && !hayTurno) {
    return { ok: false, error: 'Abre tu turno antes de registrar una salida de dinero.' };
  }

  const n = Number(String(monto).replace(',', '.'));
  if (!monto.trim() || !Number.isFinite(n)) {
    return { ok: false, error: 'Escribe cuánto es.' };
  }
  if (n <= 0) {
    return { ok: false, error: 'La cantidad tiene que ser mayor que cero.' };
  }
  if (n > MAX_MOVIMIENTO) {
    return { ok: false, error: 'Esa cantidad es demasiado grande. Revisa el número.' };
  }

  const motivoLimpio = (motivo || '').trim();
  if (tipo === 'salida') {
    if (!motivoLimpio) {
      return { ok: false, error: 'Escribe para qué es la salida. Sin motivo no se puede registrar.' };
    }
    if (motivoLimpio.length < MOTIVO_MINIMO) {
      return { ok: false, error: 'El motivo es demasiado corto para saber qué pasó.' };
    }
  }

  return { ok: true };
}

/**
 * ¿Quién puede aprobar o rechazar un movimiento?
 *
 * El backend es `requireRole("admin", "contador")` (cashMovements.ts:169) Y
 * además rechaza que alguien apruebe lo que él mismo registró (403). La primera
 * mitad se filtra aquí para no enseñar un botón que va a fallar; la segunda la
 * decide el servidor y se muestra el error que llega, porque depende de datos
 * que el cliente no tiene.
 */
export function puedeAprobar(role: string | undefined, registradoPor: string | undefined, userId: string | undefined): boolean {
  if (role !== 'admin' && role !== 'contador') return false;
  // El servidor rechaza el auto-aprobación con 403. Ocultarlo es más honesto
  // que ofrecer un botón que va a fallar siempre.
  if (registradoPor && userId && registradoPor === userId) return false;
  return true;
}

/** El botón de "aprobar" solo aparece en lo pendiente. */
export function sePuedeDecidir(status: string | undefined): boolean {
  return status === 'pendiente';
}
