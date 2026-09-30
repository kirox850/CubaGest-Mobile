// ─── tests de las reglas de movimientos de dinero ─────────────────────────────
// El caso que más se ha de repetir: una SALIDA de un cajero sin turno. El
// backend responde 403, pero si la pantalla lo deja intentarlo lo que ve el
// cajero es un error del servidor en vez de un motivo accionable — y en un mostrador
// eso se lee como "la app está rota".

import { describe, it, expect } from '@jest/globals';
import {
  MOTIVO_MINIMO, MAX_MOVIMIENTO, validarMovimiento, puedeAprobar, sePuedeDecidir,
} from '../movimientoDinero';

const base = { tipo: 'salida' as const, monto: '500', motivo: 'Retiro del dueño', hayTurno: true, role: 'cajero' };

describe('validarMovimiento', () => {
  it('una salida de cajero CON turno y con motivo es válida', () => {
    expect(validarMovimiento(base)).toEqual({ ok: true });
  });

  it('una salida de cajero SIN turno se rechaza aquí, no en el servidor', () => {
    // El mensaje es el mismo que devuelve el backend, para que no se note que
    // se paró antes.
    const r = validarMovimiento({ ...base, hayTurno: false });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe('Abre tu turno antes de registrar una salida de dinero.');
  });

  it('una ENTRADA de cajero no exige turno (devolver un cambio no es un retiro)', () => {
    expect(validarMovimiento({ ...base, tipo: 'entrada', motivo: '', hayTurno: false })).toEqual({ ok: true });
  });

  it('el admin puede registrar una salida sin turno: es quien autoriza los retiros', () => {
    expect(validarMovimiento({ ...base, role: 'admin', hayTurno: false })).toEqual({ ok: true });
  });

  it('una salida SIN motivo se rechaza siempre', () => {
    const r = validarMovimiento({ ...base, motivo: '   ' });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('Sin motivo');
  });

  it('un motivo demasiado corto se rechaza AQUÍ (el servidor exige 3 caracteres)', () => {
    // Si no se comprueba, se envía, el servidor responde 400 y el cajero ve un
    // error del servidor en vez de un aviso en el sitio donde escribió.
    const r = validarMovimiento({ ...base, motivo: 'x'.repeat(MOTIVO_MINIMO - 1) });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('demasiado corto');
  });

  it('el importe tiene que ser un número mayor que cero', () => {
    expect(validarMovimiento({ ...base, monto: '' }).ok).toBe(false);
    expect(validarMovimiento({ ...base, monto: 'mil' }).ok).toBe(false);
    expect(validarMovimiento({ ...base, monto: '0' }).ok).toBe(false);
    expect(validarMovimiento({ ...base, monto: '-5' }).ok).toBe(false);
  });

  it('acepta coma decimal, que es como se teclea en un teléfono', () => {
    expect(validarMovimiento({ ...base, monto: '12,50' })).toEqual({ ok: true });
  });

  it('una cantidad imposible de teclear se rechaza antes de enviar', () => {
    const r = validarMovimiento({ ...base, monto: String(MAX_MOVIMIENTO + 1) });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain('demasiado grande');
  });
});

describe('puedeAprobar', () => {
  it('el admin y el contador pueden aprobar', () => {
    expect(puedeAprobar('admin', 'otro-usuario', 'yo')).toBe(true);
    expect(puedeAprobar('contador', 'otro-usuario', 'yo')).toBe(true);
  });

  it('el cajero no, aunque registre el movimiento', () => {
    expect(puedeAprobar('cajero', 'otro-usuario', 'yo')).toBe(false);
    expect(puedeAprobar('almacenista', 'otro-usuario', 'yo')).toBe(false);
  });

  it('nadie aprueba lo que él mismo registró (el servidor lo rechaza con 403)', () => {
    // Ocultarlo es más honesto que ofrecer un botón que va a fallar siempre.
    expect(puedeAprobar('admin', 'yo', 'yo')).toBe(false);
    expect(puedeAprobar('contador', 'yo', 'yo')).toBe(false);
  });
});

describe('sePuedeDecidir', () => {
  it('solo lo pendiente se puede aprobar o rechazar', () => {
    expect(sePuedeDecidir('pendiente')).toBe(true);
    expect(sePuedeDecidir('aprobada')).toBe(false);
    expect(sePuedeDecidir('rechazada')).toBe(false);
    expect(sePuedeDecidir(undefined)).toBe(false);
  });
});
