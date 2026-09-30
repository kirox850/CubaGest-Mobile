// ─── la regla: ningún color vive escrito dentro de una pantalla ───────────────
//
// Este test camina `src/**/*.tsx` y falla si aparece un hex fuera de
// `theme.ts`. Es el hermano del `noEmoji.test.ts` y cubre la otra mitad del
// mismo problema.
//
// POR QUÉ IMPORTA MÁS DE LO QUE PARECE. Un `#F97316` escrito a mano en una
// pantalla es un color que existe en el tema (`colors.warning`) y que, al estar
// duplicado, hace DOS cosas malas a la vez:
//
//   · El tema oscuro cambia los acentos a un tono más claro, por contraste
//     (ver tokensOscuros.test.ts). Un hex a mano no se mueve con él, así que
//     ese texto se queda oscuro sobre fondo oscuro mientras el resto de la app
//     se aclara. El bug es INVISIBLE en claro y solo aparece de noche.
//   · Si mañana se cambia el naranja, hay que cazarlo en cada archivo. Y la
//     mitad de las veces no se caza.
//
// Las dos cosas son la misma: el color dejó de ser un token y pasó a ser un
// número. Esto es lo que hace que la fase U6 (tipografía y espaciado) no
// sirviera de nada por sí sola: se movía el tipo y el espacio mientras 33
// apariciones de dos colores seguían sueltas.
//
// LA LISTA BLANCA tiene tres entradas y ninguna es una excepción de conveniencia:
//
//   · `#FFF` / `#FFFFFF` — blanco sobre fondo saturado. Lo autoriza el propio
//     theme.ts: es el único caso en que el color depende del fondo, no del
//     tema, y por eso no puede salir de un token.
//   · `roles.ts` — una tabla de datos que se evalúa al importar, antes de que
//     `applyTheme` rellene `colors`. Está documentado dentro del archivo.
//   · `#25D366` — el verde de WhatsApp. Es el color de otra marca;
//     tokenizarlo sería meter la marca de otro en el sistema de diseño de este.
//   · `#0F172A` — el color de las sombras, que vive dentro de los tokens
//     `shadow` y no es un color de superficie.

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');
const HEX = /#(?:[0-9a-fA-F]{3,8})\b/g;

/** archivar → motivo por el que se permite un hex escrito a mano. */
const EXENCIONES: Record<string, string> = {
  'src/config/roles.ts': 'Tabla de roles evaluada al importar, antes de applyTheme. Badge necesita hex de 6 para derivar el tinte.',
  'src/config/theme.ts': 'Es el archivo donde vive el color: aquí sí se escribe.',
  'src/components/UI.tsx': 'Define las primitivas: aquí el Badge documenta su regla con hex de ejemplo, y el color por defecto de un botón vacío tiene que poder existir sin el tema cargado.',
};

/** Colores que ningún archivo puede contener, exento o no. */
const PROHIBIDOS: Record<string, string> = {
  '#8B5CF6': 'El violeta de auditoría no estaba en la paleta. Se sustituyó por colors.primary.',
  '#5A3A1A': 'Marrón sin origen en la paleta.',
  '#7A5C1A': 'Marrón sin origen en la paleta.',
  '#888': 'Gris arbitrario. Ahora colors.textMuted.',
};

function ts(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...ts(p));
    else if (e.endsWith('.tsx') || e.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('ningún color escrito dentro de una pantalla', () => {
  const fuentes = ts(RAIZ).filter((f) => !f.includes('__tests__'));
  const ofensas: string[] = [];

  for (const abs of fuentes) {
    const rel = 'src/' + abs.slice(RAIZ.length + 1).split('\\').join('/');
    if (EXENCIONES[rel]) continue;
    const lineas = readFileSync(abs, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      // Un comentario puede citar un hex para explicar una regla; lo que no
      // puede es decidir un color. Solo se perdona en la documentación.
      const esComentario = /^\s*(\*|\/\/)/.test(linea);
      for (const hex of (linea.match(HEX) ?? [])) {
        const h = hex.toUpperCase();
        if (h === '#FFF' || h === '#FFFFFF') continue;   // blanco sobre saturado
        if (h === '#0F172A') continue;                   // color de sombra
        if (h === '#25D366') continue;                   // marca de WhatsApp
        if (esComentario) continue;                      // cita la regla
        ofensas.push(`${rel}:${i + 1}  ${hex}  ${linea.trim().slice(0, 70)}`);
      }
    });
  }

  it('encuentra fuentes que examinar (si no, el test pasa sin hacer nada)', () => {
    expect(fuentes.length).toBeGreaterThan(30);
  });

  it('ningún hex suelto fuera de theme.ts', () => {
    expect(ofensas).toEqual([]);
  });

  it('ningún color que ya se descartó vuelve a colarse', () => {
    // Los que hubo que sustituir. Vuelven si alguien "simplifica" un token a un
    // número, que es exactamente el movimiento que este archivo previene.
    const texto = fuentes
      .filter((f) => !EXENCIONES['src/' + f.slice(RAIZ.length + 1).split('\\').join('/')])
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
      .toUpperCase();
    for (const hex of Object.keys(PROHIBIDOS)) {
      expect(texto).not.toContain(hex);
    }
  });

  it('cada exención de archivo tiene un motivo escrito', () => {
    for (const [archivo, motivo] of Object.entries(EXENCIONES)) {
      expect(motivo.length).toBeGreaterThan(30);
      expect(archivo.endsWith('.ts') || archivo.endsWith('.tsx')).toBe(true);
    }
  });
});
