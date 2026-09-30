// ─── por qué `Sel` no es un Modal ────────────────────────────────────────────
//
// Este bug era invisible salvo en un teléfono real, y por eso merece un test
// en vez de un comentario.
//
// Un `<Modal>` de react-native no es una caja dentro de la pantalla: es una
// VENTANA DEL SISTEMA. En Android cada una es una tarea en el botón atrás, y el
// botón atrás cierra la de ARRIBA sin propagarse a la de abajo. Abrir un
// formulario y luego un desplegable dentro significaba que elegir una opción
// cerraba el formulario entero, sin aviso. En Contabilidad había DOS `Sel` en la
// misma pantalla, y el segundo abría una tercera ventana en iOS.
//
// Sacarlo del `Modal` lo arregla, pero abre el problema opuesto: la lista se
// dibuja con `position: absolute`, y si un ancestro tiene `overflow: 'hidden'`
// se recorta. Ese error se ve en el POS, que tiene los cuatro desplegables del
// ticket dentro de una tarjeta con `overflow: 'hidden'`, y produce una franja de
// opciones sin cerrar — de las que hacen perder el-confidence en la app entera.
//
// Las dos comprobaciones de abajo son las dos caras del mismo cambio. Sin la
// primera vuelve el cierre accidental; sin la segunda, el recorte.

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

function ts(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...ts(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const UI = readFileSync(join(RAIZ, 'components', 'UI.tsx'), 'utf8');
const bloqueSel = UI.slice(UI.indexOf('export const Sel'), UI.indexOf('// ─── BUTTON'));

/** Los estilos de un archivo que tienen `overflow: 'hidden'`. */
function recortan(s: string): string[] {
  return [...s.matchAll(/(\w+):\s*\{[^}]*overflow:\s*'hidden'/g)].map((m) => m[1]);
}

/** Los `<View>`/`<ScrollView>` abiertos en el punto donde está cada `<Sel`. */
function ancestrosDe(s: string, idx: number): string[] {
  const pila: (string | null)[] = [];
  for (const m of s.matchAll(/<(View|ScrollView|FlatList)\b([^>]*?)(?:\/>|>(?![\s\S]*?<\/\1>))/g)) {
    if (m.index! > idx) break;
    if (m[0].endsWith('/>')) continue;
    const est = /style=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/.exec(m[2]);
    pila.push(est ? est[1].trim() : null);
  }
  return pila.filter((e): e is string => Boolean(e));
}

describe('el desplegable no es una ventana del sistema', () => {
  it('`Sel` no usa `<Modal>`', () => {
    expect(bloqueSel).not.toContain('<Modal');
    expect(bloqueSel).toContain("position: 'absolute'");
  });

  it('la capa de cierre se monta solo cuando está abierta', () => {
    // Con `visible={open}` el `Pressable` del fondo estaría SIEMPRE montado y
    // se comería los toques de la pantalla entera con el desplegable cerrado.
    expect(bloqueSel).toContain('{open && (');
  });

  it('el botón atrás no depende de `onRequestClose` para cerrarse', () => {
    // `onRequestClose` es la vía por la que Android cierra un Modal. Al no ser
    // un Modal, cerrar es desenmascarar, y el botón atrás lo hace solo por
    // jerarquía.
    expect(bloqueSel).not.toContain('onRequestClose');
    expect(bloqueSel).toContain('setOpen(false)');
  });

  it('ningún `Sel` queda dentro de un contenedor que lo recorte', () => {
    const problemas: string[] = [];
    for (const f of ts(RAIZ)) {
      const s = readFileSync(f, 'utf8');
      const ocultos = recortan(s);
      if (ocultos.length === 0) continue;
      for (const m of s.matchAll(/<Sel\b/g)) {
        const linea = s.slice(0, m.index!).split('\n').length;
        for (const est of ancestrosDe(s, m.index!)) {
          const ref = /styles\.(\w+)/.exec(est);
          if (ref && ocultos.includes(ref[1])) {
            problemas.push(`${f.slice(RAIZ.length + 1)}:${linea} dentro de styles.${ref[1]}`);
          }
        }
      }
    }
    expect(problemas).toEqual([]);
  });

  it('la tarjeta de productos del POS declara por qué no recorta', () => {
    // El `overflow: 'hidden'` de esa tarjeta era lo que escondía el problema.
    // Si alguien lo vuelve a poner, este comentario deja de ser cierto y el
    // recorte regresa sin que nada más lo note.
    const pos = readFileSync(join(RAIZ, 'screens', 'POSScreen.tsx'), 'utf8');
    const i = pos.indexOf('listCard:');
    const linea = pos.slice(i, pos.indexOf('\n', i));
    expect(linea).not.toContain("overflow: 'hidden'");
  });
});
