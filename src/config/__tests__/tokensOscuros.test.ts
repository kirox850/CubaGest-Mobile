// ─── la excepción de los acentos en oscuro, protegida contratest ─────────────
//
// Este archivo existe para que la fase U6 no la deshaga. El plan de paridad de
// UI dice, con razón, "los tokens ya coinciden"; alguien que lea esa tabla
// puede ver que `danger` es `#dc2626` en la web y concluir que aquí sobra un
// `#F87171`, e "igualarlo". Eso sería una regresión medible: el rojo de la web
// NO llega al contraste mínimo sobre la card oscura.
//
// Estos test no comprueban que el móvil se parezca a la web. Comprueban lo
// contrario, y por eso el comentario del `theme.ts` lo dice: es una excepción
// deliberada, y una excepción sin test es una excepción que se "arregla" sola.

import { describe, it, expect } from '@jest/globals';
import { palettes } from '../theme';

/** Luminancia relativa WCAG. */
const luminancia = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const contraste = (a: string, b: string) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const MINIMO = 4.5;

describe('los acentos en oscuro son una excepción, no un descuido', () => {
  it('los cuatro acentos del móvil oscuro SÍ llegan al mínimo de WCAG', () => {
    for (const k of ['primary', 'success', 'warning', 'danger'] as const) {
      expect(contraste(palettes.dark[k], palettes.dark.bgCard)).toBeGreaterThanOrEqual(MINIMO);
    }
  });

  it('el rojo de la web NO lo llega, y por eso no se copia', () => {
    // El valor exacto de la web (`--color-bad`, que `.dark` no re-declara).
    expect(contraste('#dc2626', palettes.dark.bgCard)).toBeLessThan(MINIMO);
  });

  it('copiar el valor de la web rompería el test anterior', () => {
    // La forma del bug, escrita como test: si alguien "iguala" el token, esto
    // falla y el motivo queda en el mensaje.
    const siSeIguiera = { ...palettes.dark, danger: '#dc2626' };
    expect(contraste(siSeIguiera.danger, siSeIguiera.bgCard)).toBeLessThan(MINIMO);
    expect(contraste(palettes.dark.danger, siSeIguiera.bgCard)).toBeGreaterThanOrEqual(MINIMO);
  });

  it('el tema claro sí coincide con la web, porque ahí no hay superficie oscura', () => {
    // En claro, los dos usan los mismos cuatro. La divergencia es SOLO de
    // oscuro, y por eso no se tocan los tokens claros.
    // En minúsculas porque el hex NO distingue mayúsculas: `#B5DBFD` y
    // `#b5dbfd` son el mismo color. Comparar literales en crudo da falsos
    // positivos de "discrepancia" sobre tokens que sí coinciden, y un test que
    // miente entrena a desconfiar del test en vez de del código.
    const norm = (c: string) => c.toLowerCase();
    expect(norm(palettes.light.primary)).toBe('#048afb');
    expect(norm(palettes.light.success)).toBe('#10b981');
    expect(norm(palettes.light.warning)).toBe('#f97316');
    expect(norm(palettes.light.danger)).toBe('#dc2626');
  });

  it('en claro hay una carencia real de contraste — y es la MISMA que en la web', () => {
    // Esto desmiente la versión fácil del plan y conviene dejarlo escrito.
    //
    // Sobre la card BLANCA, con los mismos valores que usa la web:
    //   success  2.54:1     warning  2.80:1     primary  3.48:1     danger  4.83:1
    //
    // `success` y `warning` no llegan ni al 3:1 que WCAG pide para un
    // componente de interfaz, y los cuatro menos `danger` no llegan al 4.5:1
    // del cuerpo de texto. Es un defecto real de accesibilidad, y la web lo
    // tiene igual: mismas seis cifras, misma superficie.
    //
    // POR QUÉ NO SE TOCA AQUÍ. El color de marca es una decisión de marca, no
    // un valor arbitrario: aclararlo hasta pasar 4.5:1 lo haría irreconocible
    // y lo separaría de la web justo en la parte que este plan SÍ quiere
    // igualar. Y cambiar solo este móvil crearía una divergencia visual
    // deliberada en la marca, que es lo que este documento acaba de decidir no
    // hacer con los acentos de oscuro.
    //
    // Lo que sí se hace es FIJAR las cifras. Si alguien cambia un token de
    // claro, este test cambia de opinión explícitamente en vez de que la
    // regresión se descubra mirando.
    const medido = {
      success: contraste(palettes.light.success, palettes.light.bgCard),
      warning: contraste(palettes.light.warning, palettes.light.bgCard),
      primary: contraste(palettes.light.primary, palettes.light.bgCard),
      danger: contraste(palettes.light.danger, palettes.light.bgCard),
    };
    expect(medido.success).toBeCloseTo(2.54, 1);
    expect(medido.warning).toBeCloseTo(2.80, 1);
    expect(medido.primary).toBeCloseTo(3.48, 1);
    expect(medido.danger).toBeCloseTo(4.83, 1);
  });

  it('el texto blanco sobre el botón de marca queda en 3.5:1 en los dos temas', () => {
    // Otra carencia, también compartida con la web: la etiqueta blanca del
    // botón primario. WCAG la pediría a 4.5:1 para texto de 14px. Se anota;
    // arreglarla es cambiar la marca, no un ajuste de contraste.
    expect(contraste('#ffffff', palettes.light.primary)).toBeCloseTo(3.48, 1);
  });
});

describe('las superficies no se tocan', () => {
  // La parte que SÍ es paridad exacta, y que un "ajuste de dark mode" iba a
  // romper por el camino. Estos cuatro sí coinciden con la web, en los dos temas.
  it('bg, card, ink y muted coinciden con la web en claro y en oscuro', () => {
    expect(palettes.light.bg).toBe('#F8FAFC');
    expect(palettes.light.bgCard).toBe('#ffffff');
    expect(palettes.light.text).toBe('#1E293B');
    expect(palettes.light.textMuted).toBe('#64748B');
    expect(palettes.light.border).toBe('#E8E0D8');
    expect(palettes.light.inputBg).toBe('#F1F5F9');
    expect(palettes.light.inputBorder).toBe('#D8CFC4');

    expect(palettes.dark.bg).toBe('#0B1220');
    expect(palettes.dark.bgCard).toBe('#101A2C');
    expect(palettes.dark.text).toBe('#E2E8F0');
    expect(palettes.dark.textMuted).toBe('#94A3B8');
    expect(palettes.dark.border).toBe('#26334A');
    expect(palettes.dark.inputBg).toBe('#1E293B');
    expect(palettes.dark.inputBorder).toBe('#334155');
  });
});
