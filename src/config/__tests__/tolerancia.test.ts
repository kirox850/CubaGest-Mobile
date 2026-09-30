// ─── tests de la tolerancia de descuadre ─────────────────────────────────────
// Un porcentaje de 200% no es una tolerancia: es desactivar la detección de
// faltantes. Y un importe de 12 dígitos no es un descuadre, es un tecleo. Los
// dos tienen que ser imposibles de escribir, no algo que el servidor rechace
// después de un viaje.

import { describe, it, expect } from '@jest/globals';
import {
  ABSOLUTO_MAXIMO, PORCENTAJE_MAXIMO,
  enRango, errorDeRango, valorDeTolerancia, avisoTolerancia,
} from '../tolerancia';

describe('enRango — porcentaje', () => {
  it('acepta de 0 a 100', () => {
    expect(enRango('0', 'porcentaje')).toBe(true);
    expect(enRango('5', 'porcentaje')).toBe(true);
    expect(enRango('100', 'porcentaje')).toBe(true);
  });

  it('NO acepta más de 100: sería no detectar los faltantes', () => {
    expect(enRango('101', 'porcentaje')).toBe(false);
    expect(enRango('200', 'porcentaje')).toBe(false);
  });

  it('no acepta negativos ni basura', () => {
    expect(enRango('-1', 'porcentaje')).toBe(false);
    expect(enRango('mucho', 'porcentaje')).toBe(false);
  });
});

describe('enRango — absoluto', () => {
  it('acepta importes normales y el máximo del backend', () => {
    expect(enRango('50', 'absoluto')).toBe(true);
    expect(enRango(String(ABSOLUTO_MAXIMO), 'absoluto')).toBe(true);
  });

  it('rechaza por encima de 9 dígitos: no es un descuadre, es un tecleo', () => {
    expect(enRango(String(ABSOLUTO_MAXIMO + 1), 'absoluto')).toBe(false);
    expect(enRango('1234567890', 'absoluto')).toBe(false);
  });
});

describe('campo en uso', () => {
  it('un campo vacío NO es un error todavía', () => {
    // Está escribiendo; avisarle de "fuera de rango" con el campo vacío es ruido.
    expect(enRango('', 'porcentaje')).toBe(true);
    expect(enRango('   ', 'absoluto')).toBe(true);
    expect(errorDeRango('', 'porcentaje')).toBeNull();
  });
});

describe('errorDeRango', () => {
  it('explica el límite de cada modo', () => {
    expect(errorDeRango('200', 'porcentaje')).toContain('100%');
    expect(errorDeRango('200', 'porcentaje')).toContain('faltantes');
    expect(errorDeRango('9999999999', 'absoluto')).toContain('demasiado grande');
  });

  it('null cuando sí se puede', () => {
    expect(errorDeRango('5', 'porcentaje')).toBeNull();
  });
});

describe('valorDeTolerancia', () => {
  it('convierte y acepta coma decimal (es como se teclea en un teléfono)', () => {
    expect(valorDeTolerancia('12,5', 'porcentaje')).toBe(12.5);
    expect(valorDeTolerancia(' 50 ', 'absoluto')).toBe(50);
  });

  it('null si está fuera de rango, para no mandar un valor que el servidor va a rechazar', () => {
    expect(valorDeTolerancia('200', 'porcentaje')).toBeNull();
    expect(valorDeTolerancia('abc', 'absoluto')).toBeNull();
  });
});

describe('avisoTolerancia', () => {
  it('avisa de que un margen absoluto no se compara con cada moneda', () => {
    // Consecuencia real del backend (cierreDinero.ts: compar.margin applies to
    // the BASE currency). Sin este aviso, el dueño cree que 100 CUP cubren
    // también 5 USD, y no los cubren.
    expect(avisoTolerancia('absoluto', 100, true)).toContain('moneda base');
  });

  it('no avisa si solo hay una moneda, o el margen es porcentaje, o es cero', () => {
    expect(avisoTolerancia('absoluto', 100, false)).toBeNull();
    expect(avisoTolerancia('porcentaje', 5, true)).toBeNull();
    expect(avisoTolerancia('absoluto', 0, true)).toBeNull();
  });
});
