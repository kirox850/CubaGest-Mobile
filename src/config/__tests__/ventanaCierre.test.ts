// ─── tests de la ventana para explicar un descuadre ──────────────────────────
// La asimetría del `null` es lo que importa aquí. Un cierre ya cerrado que
// devuelve "0 horas" invita a alguien a intentar explicar un descuadre que el
// servidor va a rechazar con 409, y un plazo vencido que devuelve un número
// negativo hace que la UI ofrezca una acción imposible.

import { describe, it, expect } from '@jest/globals';
import { horasRestantes, sePuedeExplicar, textoVentana } from '../ventanaCierre';

const AHORA = new Date('2026-09-27T12:00:00.000Z').getTime();
const en = (horas: number) => new Date(AHORA + horas * 3_600_000).toISOString();

describe('horasRestantes', () => {
  it('sin plazo devuelve null, NO 0', () => {
    // 0 significaría "queda justo hasta este instante" y llevaría a intentar
    // explicar un cierre que ya está cerrado.
    expect(horasRestantes(null, AHORA)).toBeNull();
    expect(horasRestantes(undefined, AHORA)).toBeNull();
    expect(horasRestantes('', AHORA)).toBeNull();
  });

  it('un plazo ya vencido devuelve false, no un número negativo', () => {
    expect(horasRestantes(en(-1), AHORA)).toBe(false);
    expect(horasRestantes(en(-48), AHORA)).toBe(false);
  });

  it('quedan horas, redondeadas hacia abajo', () => {
    expect(horasRestantes(en(5), AHORA)).toBe(5);
    expect(horasRestantes(en(1.9), AHORA)).toBe(1);
  });

  it('exactamente en el límite devuelve 0, no false', () => {
    // En el borde todavía se puede. Redondear la frontera fuera le cierra la
    // puerta a alguien justo antes de tiempo.
    expect(horasRestantes(en(0), AHORA)).toBe(0);
  });

  it('una fecha ilegible no se interpreta como "sin límite"', () => {
    // Asumir que hay tiempo es asumir que se puede explicar cuando quizá no.
    expect(horasRestantes('no-es-fecha', AHORA)).toBeNull();
  });
});

describe('sePuedeExplicar', () => {
  it('sí con plazo por delante y en el límite', () => {
    expect(sePuedeExplicar(en(3), AHORA)).toBe(true);
    expect(sePuedeExplicar(en(0), AHORA)).toBe(true);
  });

  it('no con plazo vencido, y no sin plazo', () => {
    expect(sePuedeExplicar(en(-1), AHORA)).toBe(false);
    expect(sePuedeExplicar(null, AHORA)).toBe(false);
  });
});

describe('textoVentana', () => {
  it('sin plazo: dice que ya no está esperando, no que queda tiempo', () => {
    expect(textoVentana(null, AHORA)).toContain('ya no está esperando');
  });

  it('vencido: lo dice en claro', () => {
    expect(textoVentana(en(-1), AHORA)).toContain('venció');
  });

  it('una hora en singular, más de una en plural', () => {
    expect(textoVentana(en(1), AHORA)).toContain('1 hora');
    expect(textoVentana(en(5), AHORA)).toContain('5 horas');
  });

  it('en el último tramo dice minutos, no "0 horas"', () => {
    expect(textoVentana(en(0.5), AHORA)).toContain('30 minutos');
    expect(textoVentana(en(0.5), AHORA)).not.toContain('0 horas');
  });
});
