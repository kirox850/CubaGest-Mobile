// ─── tests de las reglas de dinero del cierre ────────────────────────────────
// La regla que más daño haría si se invirtiera: solo se envía al backend el
// dinero REALMENTE contado. Mandar ceros por defecto crearía un descuadre
// inventado del 100% en cada moneda con saldo, y convertiría este arreglo en
// un generador de falsas alarmas para quien viene contando solo mercancía.

import { describe, it, expect } from '@jest/globals';
import {
  TOLERANCIA_CENTAVOS,
  baseCashDe,
  countedCashDe,
  diffDe,
  esCero,
  hayConteo,
  monedasAContar,
  sinContar,
} from '../cierreDinero';

describe('countedCashDe', () => {
  it('no cuenta nada: manda un objeto vacío', () => {
    expect(countedCashDe({})).toEqual({});
    expect(hayConteo({})).toBe(false);
  });

  it('convierte el texto escrito en número por moneda', () => {
    expect(countedCashDe({ CUP: '1200', USD: '20.50' })).toEqual({ CUP: 1200, USD: 20.5 });
    expect(hayConteo({ CUP: '1200' })).toBe(true);
  });

  it('un 0 escrito a propósito es un 0 CONTADO, no una ausencia', () => {
    // Distinguir "no miré la caja" de "miré y no había nada" es justo lo que
    // separa un cierre honesto de uno que esconde un faltante.
    expect(countedCashDe({ CUP: '0' })).toEqual({ CUP: 0 });
  });

  it('un campo con texto que no es número no borra la moneda', () => {
    expect(countedCashDe({ CUP: 'abc' })).toEqual({ CUP: 0 });
  });

  it('undefined no revienta (conteo aún sin tocar)', () => {
    expect(countedCashDe(undefined as never)).toEqual({});
    expect(hayConteo(undefined as never)).toBe(false);
  });
});

describe('diffDe', () => {
  it('resta lo contado de lo esperado', () => {
    expect(diffDe(1000, '970')).toBe(-30);
    expect(diffDe(1000, '1030')).toBe(30);
  });

  it('un campo vacío es un cero contado', () => {
    expect(diffDe(1000, '')).toBe(-1000);
  });

  it('redondea a centavo, no acumula error de flotante', () => {
    expect(diffDe(0.1, 0.3)).toBe(0.2);
  });
});

describe('esCero', () => {
  it('medio céntimo no es un descuadre', () => {
    expect(TOLERANCIA_CENTAVOS).toBe(0.005);
    expect(esCero(0)).toBe(true);
    expect(esCero(0.005)).toBe(true);
    expect(esCero(0.01)).toBe(false);
  });
});

describe('monedasAContar', () => {
  it('las del esperado más las que el cajero escribió', () => {
    expect(monedasAContar({ CUP: 100 }, { USD: '5' }).sort()).toEqual(['CUP', 'USD']);
  });

  it('una moneda que el cajero inventó se conserva: puede estar contándola', () => {
    expect(monedasAContar({ CUP: 100 }, { CUP: '100', EUR: '3' }).sort()).toEqual(['CUP', 'EUR']);
  });

  it('sin esperado ni conteo no hay nada que pedir', () => {
    expect(monedasAContar(undefined, {})).toEqual([]);
  });
});

describe('sinContar', () => {
  it('avisa de lo esperado que nadie escribió (aviso, no error)', () => {
    expect(sinContar({ CUP: 100, USD: 20 }, { CUP: '100' })).toEqual(['USD']);
  });

  it('contarlo todo no deja nada pendiente', () => {
    expect(sinContar({ CUP: 100, USD: 20 }, { CUP: '100', USD: '20' })).toEqual([]);
  });
});

describe('baseCashDe', () => {
  // El fondo del turno es el dato del que depende toda la conciliación: sin él,
  // un faltante de 200 al cerrar es indistinguible de "ya faltaban 200 al
  // abrir". Y un 0 explícito no cuenta: el backend lo descarta al normalizar.
  it('manda solo las monedas con importe', () => {
    expect(baseCashDe([{ cur: 'CUP', valor: '1000' }])).toEqual({ CUP: 1000 });
  });

  it('un campo vacío NO cuenta como fondo de cero', () => {
    expect(baseCashDe([{ cur: 'CUP', valor: '' }])).toEqual({});
  });

  it('un 0 explícito ni un negativo se mandan', () => {
    expect(baseCashDe([{ cur: 'CUP', valor: '0' }])).toEqual({});
    expect(baseCashDe([{ cur: 'CUP', valor: '-50' }])).toEqual({});
  });

  it('varias monedas a la vez, cada una por separado', () => {
    // Nunca se suman: 100 CUP y 2 USD no son "102" de nada.
    expect(baseCashDe([{ cur: 'CUP', valor: '100' }, { cur: 'USD', valor: '2' }]))
      .toEqual({ CUP: 100, USD: 2 });
  });

  it('normaliza el nombre de la moneda y lo recorta', () => {
    expect(baseCashDe([{ cur: ' cup ', valor: '10' }])).toEqual({ CUP: 10 });
    expect(baseCashDe([{ cur: 'UNABUELNOMBRELARGUISIMISIMO', valor: '10' }]))
      .toHaveProperty('UNABUELN');
  });

  it('una moneda sin nombre se ignora en vez de mandar una clave vacía', () => {
    expect(baseCashDe([{ cur: '', valor: '10' }])).toEqual({});
  });

  it('texto que no es número no produce NaN en el cuerpo', () => {
    expect(baseCashDe([{ cur: 'CUP', valor: 'mil' }])).toEqual({});
  });

  it('sin monedas no hay fondo, y el turno abre igual', () => {
    expect(baseCashDe([])).toEqual({});
    expect(baseCashDe(undefined)).toEqual({});
  });
});
