// ─── 860 y 1024, y no otros números ──────────────────────────────────────────
//
// La web tiene siete cortes (640, 720, 760, 860, 900, 980, 1024) porque es una
// rejilla de escritorio. Si aquí se eligieran otros números "más adecuados para
// móvil", la paridad deja de ser una decisión y pasa a depender de que alguien
// se acuerde. Estos dos valores NO son preferencias:
//
//   860  viene de `Configuracion.tsx` de la web (`@media (min-width: 860px)`),
//        y decide si las pestañas de Configuración van arriba o a la izquierda.
//   1024 es el punto en que una barra inferior se convierte en barra lateral, y
//        no sale de una media query de contenido: es el ancho a partir del cual
//        un dedo llega a la columna izquierda sin estirar el brazo.
//
// Lo que este test fija, entonces, no es "el número es 860" sino "el número es
// el de la web". Si alguien lo mueve por gusto, falla; y si algún día la web
// cambia el suyo, este archivo obliga a decidir las dos cosas a la vez.

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { layoutModeFor, columnas, porFila, esEscritorio, type LayoutMode } from '../useLayoutMode';

describe('los cortes de ancho', () => {
  it('tablet empieza en 860, el mismo número que usa la web', () => {
    expect(layoutModeFor(859, ['phone', 'tablet'])).toBe('phone');
    expect(layoutModeFor(860, ['phone', 'tablet'])).toBe('tablet');
    expect(layoutModeFor(1023, ['phone', 'tablet'])).toBe('tablet');
    expect(layoutModeFor(1024, ['phone', 'tablet', 'desktop'])).toBe('desktop');
  });

  it('el 860 está escrito en el archivo, no solo en el test', () => {
    // Un número que solo existe en el test es un número que el siguiente
    // cambio no va a encontrar.
    const src = readFileSync(join(__dirname, '..', 'useLayoutMode.ts'), 'utf8');
    expect(src).toMatch(/const TABLET = 860/);
    expect(src).toMatch(/const DESKTOP = 1024/);
  });

  it('una pantalla que solo sabe hacer "phone" no se estira', () => {
    // Es lo que evita que "desktop" se convierta en un valor que significa
    // "cualquier cosa grande" y cada pantalla lo interprete a su manera.
    expect(layoutModeFor(1400, ['phone'])).toBe('phone');
    expect(layoutModeFor(1400, ['phone', 'tablet'])).toBe('tablet');
  });

  it('el modo por defecto ofrece los tres, y el más ancho gana', () => {
    expect(layoutModeFor(360)).toBe('phone');
    expect(layoutModeFor(900)).toBe('tablet');
    expect(layoutModeFor(1400)).toBe('desktop');
  });
});

describe('columnas y rejillas', () => {
  it('una columna por debajo de 1024, dos por encima', () => {
    expect(columnas(360)).toEqual({ izq: '100%', der: '100%', partido: false });
    expect(columnas(860)).toEqual({ izq: '100%', der: '100%', partido: false });
    expect(columnas(1024)).toEqual({ izq: '58%', der: '42%', partido: true });
  });

  it('apiladas miden 100% cada una; partida, suman 100', () => {
    // La invariante NO es "suman 100" en los dos casos, que es lo que parece a
    // primera vista. Apiladas, cada columna ocupa el ancho entero y van una
    // debajo de otra: sumar sus anchos daría 200 y no significaría nada. Lo que
    // hay que garantizar es que NINGUNA de las dos supere el 100, que es lo que
    // haría desbordar la tabla horizontalmente.
    for (const ancho of [320, 600, 860, 1024, 1400]) {
      const c = columnas(ancho);
      const izq = Number(c.izq.slice(0, -1));
      const der = Number(c.der.slice(0, -1));
      expect(izq).toBeLessThanOrEqual(100);
      expect(der).toBeLessThanOrEqual(100);
      if (c.partido) expect(izq + der).toBe(100);
      else expect(izq).toBe(100);
    }
  });

  it('porFila no devuelve nunca 0 filas ni desborda el ancho', () => {
    expect(porFila(320)).toBeGreaterThan(0);
    expect(porFila(320, 400)).toBe(1);          // tarjeta más ancha que la fila
    expect(porFila(360, 160, 10)).toBe(2);
    // 6 caben: 6×160 + 5×10 = 1010 ≤ 1024. La cuenta del hueco final es lo que
    // evita el error clásico de pedir una fila más de la que entra.
    expect(porFila(1024, 160, 10)).toBe(6);
    // La última columna no puede empezar más allá del borde derecho.
    for (const ancho of [320, 400, 768, 1024]) {
      const n = porFila(ancho, 160, 10);
      expect(n * 160 + (n - 1) * 10).toBeLessThanOrEqual(ancho);
    }
  });

  it('esEscritorio y layoutModeFor no se contradicen', () => {
    for (const ancho of [320, 700, 860, 1000, 1024, 1600]) {
      expect(esEscritorio(ancho)).toBe(ancho >= 1024);
      const modo: LayoutMode = layoutModeFor(ancho);
      expect(modo === 'desktop').toBe(esEscritorio(ancho));
    }
  });
});
