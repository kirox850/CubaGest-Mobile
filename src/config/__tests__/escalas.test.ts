// ─── tres escalas, y la prueba de que una app no se puede pasar sin ellas ────
//
// La fase U6 NO consisted en reestilizar. Consistió en convertir tres listas de
// números que estaban escritas a mano en tres escalas con nombre, y en este
// test que dice qué las sostiene.
//
// El plan pedía además cambiar los valores de `radius` (a 8/10/12/16) y renombrar
// el espaciado a claves numéricas. Las dos cosas se rechazaron, y este archivo
// es donde queda escrito por qué, porque un rechazo sin explicación es un
// rechazo que el siguiente deshace:
//
//   · `radius` a 8/10/12/16 convertiría los CÍRCULOS en cuadrados. Un avatar de
//     36×36 con radio 18 es correcto; bajarlo a 16 es un cuadrado. Una escala
//     que obliga a romper algo para estar "en escala" no es una escala.
//
//   · `space` con claves `1`..`6` no compila en JavaScript con notación de
//     punto: hay que escribir `space['3']` en cada uso. Peor que `space.md`.
//
// LO QUE ESTÁ REALMENTE PROBADO:
//
//   1. Que las tres escalas existen, están ordenadas y no se solapan de forma
//      absurda.
//   2. Que NINGÚN `fontSize` escrito a mano en la app está fuera de la escala.
//      Esta es la que importa: mientras haya tamaños sueltos, la escala es
//      decorativa, y la siguiente pantalla vuelve a inventar el 13.5.

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { type, radius, spacing, space } from '../theme';

const RAIZ = join(__dirname, '..', '..');

function tsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...tsx(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const TAMANOS = Object.values(type) as number[];

/**
 * Los estilos que son CÍRCULOS y por eso llevan un radio que no está en la
 * escala. Un radio de círculo es la mitad del lado, y la mitad de 22 es 11.
 */
const CIRCULOS = /avatar|punto|signo|dot|usageBar/i;
// Cero es válido para una superficie que ocupa toda la pantalla: no es un
// radio de marca, sino la ausencia intencional de borde redondeado.
const SIN_RADIO = /Full|fullBleed/i;
const FUERA: { archivo: string; linea: number; valor: string }[] = [];

for (const abs of tsx(RAIZ)) {
  const s = readFileSync(abs, 'utf8');
  s.split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
      const v = Number(m[1]);
      if (!TAMANOS.includes(v)) {
        FUERA.push({ archivo: abs.slice(RAIZ.length + 1), linea: i + 1, valor: m[1] });
      }
    }
  });
}

describe('la escala tipográfica', () => {
  it('está en orden ascendente y no repite', () => {
    for (let i = 1; i < TAMANOS.length; i++) {
      expect(TAMANOS[i]).toBeGreaterThan(TAMANOS[i - 1]);
    }
  });

  it('empieza en 10, no en 8: un teléfono no tiene 4 píxeles legibles', () => {
    // Un tamaño que hay que ampliar con los dedos no es un tamaño.
    expect(Math.min(...TAMANOS)).toBeGreaterThanOrEqual(10);
  });

  it('`md` es 14, el tamaño de las primitivas de la web', () => {
    // Es el único punto de la escala donde la paridad se puede MEDIR en lugar
    // de suponer, porque `primitives.tsx` fija 14 en inputs y botones.
    expect(type.md).toBe(14);
  });

  it('cubre los tamaños que la app usa de verdad', () => {
    // Los cinco que aparecen en casi todas las pantallas tienen que estar.
    for (const v of [11, 12, 13, 14, 15]) expect(TAMANOS).toContain(v);
  });

  it('ningún fontSize de la app está fuera de la escala', () => {
    expect(
      FUERA.map((f) => `${f.archivo}:${f.linea} → ${f.valor}`),
    ).toEqual([]);
  });

  it('el cuerpo de pantalla y el de un input NO son el mismo tamaño', () => {
    // Si fueran lo mismo, la escala sería un solo número con muchos nombres, y
    // el nombre `base` no estaría indicando nada.
    expect(type.base).not.toBe(type.md);
  });
});

describe('la escala de radios', () => {
  it('es la escalera de 2 en 2 que la app usaba de verdad', () => {
    // El plan pedía sm:8, md:10, lg:12, xl:16. NO se aplica: bajarla
    // reestiliza 122 sitios de un golpe y pone radios donde antes no los había.
    // Lo que se hace es completar la escalera que ya existía, de modo que
    // 10/14/18 tengan nombre y dejen de escribirse a mano en 49 sitios.
    const escalera = Object.values(radius).filter((v) => v < 999);
    expect(escalera).toEqual([8, 10, 12, 14, 16, 18, 20]);
  });

  it('`pill` sirve para lo redondo por dentro', () => {
    expect(radius.pill).toBeGreaterThan(999);
    expect(radius.full).toBe(radius.pill);
  });

  it('todo radio fuera de escala es un círculo, y los círculos son correctos', () => {
    // Un círculo se escribe `borderRadius: mitadDelLado`, y la mitad de 22 es 11,
    // que no está en la escala. Bajarlo a 8 no lo deja "en escala": lo convierte
    // en un cuadrado redondeado, y un punto de estado cuadrado se lee como otro
    // elemento. Por eso la lista de "excepciones" es por NOMBRE de estilo, y
    // cada nombre tiene que seguir siendo un círculo.
    const escala = Object.values(radius).filter((v) => v < 999);
    const problemas: string[] = [];

    for (const f of tsx(RAIZ)) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/([a-zA-Z_]\w*):\s*\{[^}]*?borderRadius:\s*(\d+)/g)) {
        const [, nombre, vTxt] = m;
        const v = Number(vTxt);
        if (v === 0 && SIN_RADIO.test(nombre)) continue;
        if (escala.includes(v)) continue;
        if (!CIRCULOS.test(nombre)) problemas.push(`${f.slice(RAIZ.length + 1)}: ${nombre}=${v}`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it('los círculos siguen siendo círculos, no le falta la mitad', () => {
    // Se comprueba la RELACIÓN, no el valor: un radio correcto es la mitad del
    // lado. Si alguien baja `avatar` de 36×36 a radio 12, el valor entra en la
    // escala y el test anterior deja de verlo — este es el que lo pilla.
    const fallos: string[] = [];
    for (const f of tsx(RAIZ)) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(
        /([a-zA-Z_]\w*):\s*\{[^}]*?\bwidth:\s*(\d+(?:\.\d+)?)[^}]*?\bheight:\s*(\d+(?:\.\d+)?)[^}]*?\bborderRadius:\s*(\d+(?:\.\d+)?)/g,
      )) {
        const [, nombre, w, h, r] = m;
        if (!CIRCULOS.test(nombre)) continue;
        // Tolerancia de medio píxel: el punto de la barra inferior mide 3.5 y
        // su radio es 2, porque un radio fractional no existe en Android.
        const esCirculo = Number(w) === Number(h) && Math.abs(Number(r) - Number(w) / 2) <= 0.5;
        if (!esCirculo) {
          fallos.push(`${f.slice(RAIZ.length + 1)}: ${nombre} ${w}×${h} r=${r}`);
        }
      }
    }
    expect(fallos).toEqual([]);
  });
});

describe('el espaciado', () => {
  it('`space` es `spacing`, no una escala paralela que se pueda desincronizar', () => {
    expect(space).toBe(spacing);
  });

  it('está en orden y sin huecos raros', () => {
    const v = Object.values(spacing);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
  });

  it('no hay paddings ni margins con decimales', () => {
    const sueltos: string[] = [];
    for (const f of tsx(RAIZ)) {
      const s = readFileSync(f, 'utf8');
      s.split('\n').forEach((l, i) => {
        for (const m of l.matchAll(/(?:padding|margin|gap)\w*:\s*(\d+\.\d+)/g)) {
          sueltos.push(`${f.slice(RAIZ.length + 1)}:${i + 1} → ${m[1]}`);
        }
      });
    }
    expect(sueltos).toEqual([]);
  });
});
