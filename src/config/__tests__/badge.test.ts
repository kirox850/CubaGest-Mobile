// ─── tests de las reglas de la primitiva Badge ───────────────────────────────
//
// Estas dos reglas son la diferencia entre un badge legible y uno que
// desaparece. Ninguna de las dos se ve leyendo el componente: una depende del
// tema y la otra de qué color le pasen.
//
//  · El `danger` de `Btn` tenía los colores del modo CLARO congelados dentro
//    del variant. Sobre `bgCard` oscuro (`#101A2C`), `#DC2626` da 3.0:1 y
//    WCAG pide 4.5:1 para texto. El botón de borrar era, en tema oscuro, el
//    peor elemento de contraste de toda la app — y no se nota en las pruebas
//    porque el test no sabe de temas.
//  · `c + '20'` solo funciona con un hex de 6. Con `rgba(...)` —el token del
//    tema oscuro— produce `rgba(...)20`, que no es un color, y React Native lo
//    descarta en silencio: fondo invisible, sin error, sin aviso.

import { describe, it, expect } from '@jest/globals';
import { palettes } from '../theme';

/** Copia exacta de la regla que usa `Badge` en UI.tsx. */
const esHexDe6 = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);
const fondoDeBadge = (c: string, bg?: string) => bg ?? (esHexDe6(c) ? c + '20' : 'transparent');

describe('Badge — fondo derivado del color', () => {
  it('con un hex de 6 deriva el alfa (12%)', () => {
    // '#DC2626' + '20' = '#DC262620': hex de 8 con canal alfa, que RN sí entiende.
    expect(fondoDeBadge('#DC2626')).toBe('#DC262620');
    expect(fondoDeBadge('#10B981')).toBe('#10B98120');
  });

  it('con un rgba del tema oscuro NO intenta concatenar', () => {
    // Esto es lo que rompía: 'rgba(220,38,38,0.14)' + '20' no es ningún color.
    expect(() => 'rgba(220,38,38,0.14)' + '20').not.toThrow();
    expect('rgba(220,38,38,0.14)' + '20').toContain('rgba('); // sigue siendo basura
    // Lo correcto: fondo explícito, y si no lo hay, ninguno.
    expect(fondoDeBadge('rgba(220,38,38,0.14)')).toBe('transparent');
    expect(fondoDeBadge('rgba(220,38,38,0.14)', 'rgba(220,38,38,0.14)')).toBe('rgba(220,38,38,0.14)');
  });

  it('con un hex de 8 tampoco intenta concatenar', () => {
    expect(fondoDeBadge('#DC262680')).toBe('transparent');
    expect(fondoDeBadge('#DC262680', '#DC262680')).toBe('#DC262680');
  });

  it('un bg explícito manda siempre', () => {
    expect(fondoDeBadge('#DC2626', '#123456')).toBe('#123456');
  });
});

describe('Badge — por qué la regla existe: los dos paletas no se parecen', () => {
  // El fondo de un acento es un HEX en el tema claro y un RGBA en el oscuro.
  // El mismo concatenador funciona en uno y produce basura en el otro, así que
  // el bug solo se reproduce con el tema oscuro activo — que es exactamente el
  // modo en el que nadie prueba antes de Teach, y el modo en el que un fondo
  // invisible se nota menos.
  it('el tema CLARO usa hex de 6 para los fondos de acento', () => {
    for (const k of ['dangerBg', 'warningBg', 'successBg'] as const) {
      expect(esHexDe6(palettes.light[k])).toBe(true);
    }
  });

  it('el tema OSCURO usa rgba para los mismos fondos', () => {
    for (const k of ['dangerBg', 'warningBg', 'successBg'] as const) {
      expect(palettes.dark[k].startsWith('rgba')).toBe(true);
    }
  });

  it('en oscuro el concatenador produce algo que no es un color', () => {
    const roto = palettes.dark.dangerBg + '20';
    // Ni hex, ni rgba, ni nombre: React Native lo descarta en silencio.
    expect(esHexDe6(roto)).toBe(false);
    expect(roto.startsWith('rgba(')).toBe(true);
  });

  it('en claro el mismo concatenador SÍ produce un color válido', () => {
    const bueno = palettes.light.danger + '20';
    expect(bueno).toMatch(/^#[0-9a-fA-F]{8}$/);
  });
});

describe('Btn danger — legible en tema oscuro', () => {
  // El contrasto de `#DC2626` sobre la superficie oscura `#101A2C`. WCAG pide
  // 4.5:1 para texto normal; la cifra real sale de la fórmula de luminancia
  // relativa, no de un ojo.
  const luminancia = (hex: string) => {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contraste = (a: string, b: string) => {
    const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };

  it('el rojo del tema CLARO no alcanzaba 4.5:1 sobre la card oscura', () => {
    // Este es el bug: el valor estaba congelado del variant del tema claro.
    expect(contraste('#DC2626', palettes.dark.bgCard)).toBeLessThan(4.5);
  });

  it('el rojo del tema OSCURO sí lo alcanza', () => {
    expect(contraste(palettes.dark.danger, palettes.dark.bgCard)).toBeGreaterThanOrEqual(4.5);
  });

  it('y el oscuro también funciona sobre la superficie de fondo', () => {
    expect(contraste(palettes.dark.danger, palettes.dark.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
