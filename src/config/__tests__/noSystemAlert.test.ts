// ─── por qué esta app no usa Alert.alert ─────────────────────────────────────
//
// Cuando se empezó esto había 83 llamadas. No eran 83 problemas: eran un
// problema, repetido. Un `Alert.alert` es la superficie más obviamente-no-tuya
// que se puede poner en un móvil: otra tipografía, otros botones, colores que
// siguen al sistema operativo en vez de al tema, y una pantalla de fondo que
// tapa la app. En un mostrador, con una fila esperando, eso se descarta.
//
// La migración no fue "cambiar Alert por un diálogo bonito". Fue clasificar
// qué hace cada uno, porque NO son lo mismo:
//
//   · un botón y sin decidir nada  → `showError`: un toast. Se va solo. Nadie
//     decide nada, así que un diálogo que hay que cerrar solo estorba.
//   · un botón y hay que LEERLO   → `showAlert`: un diálogo propio, con el
//     cuerpo SELECCIONABLE. El caso es el link de activación: un toast no
//     deja copiar una URL de tres segundos.
//   · dos botones y una decisión  → `showConfirm`, que devuelve un booleano.
//     Esto no es cosmético: con `Alert` la decisión viajaba en un callback, y
//     por eso casi todos los "confirmar antes de borrar" estaban mal hechos —
//     confirmaban dos veces, o no confirmaban.
//
// Y un detalle que salió de la propia migración, no del plan: `showConfirm`
// devuelve una promesa, así que toda función que la espera pasó a ser `async`.
// Lo que empezó como un cambio de imports acabó tocando nueve firmas. Es el
// motivo de que el criterio sea "no queda ningún Alert.alert" y no "quedan
// pocos".

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

function tsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...tsx(p));
    else if (e.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const ARCHIVOS = tsx(RAIZ);

/**
 * Sin comentarios. Aquí SÍ se quitan, a diferencia de `noEmoji.test.ts`, y la
 * diferencia es el qué: un emoji en un comentario se ve al copiar el código,
 * mientras que un comentario que nombra `Alert.alert` está EXPLICANDO esta
 * migración. Prohibirlo sería prohibir explicar la regla. Lo que no puede hacer
 * un comentario es llamar a nada, y esto va de llamadas.
 */
function codigo(f: string): string {
  const s = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

const conAlert = ARCHIVOS.filter((f) => codigo(f).includes('Alert.alert'));

describe('ningún Alert.alert del sistema', () => {
  it('no queda ninguno', () => {
    expect(conAlert.map((f) => f.slice(RAIZ.length + 1))).toEqual([]);
  });

  it('tampoco queda importado sin usarse', () => {
    // Un `Alert` importado y no usado no rompe nada hoy, y por eso sobrevive
    // meses. Luego alguien lo usa para el siguiente error y la fase vuelve a
    // empezar sin que nadie lo note.
    const muertos = ARCHIVOS.filter((f) => {
      const s = readFileSync(f, 'utf8');
      if (!/^import \{[^}]*\bAlert\b[^}]*\} from 'react-native';$/m.test(s)) return false;
      return !/\bAlert\b/.test(codigo(f));
    });
    expect(muertos.map((f) => f.slice(RAIZ.length + 1))).toEqual([]);
  });

  it('cada "confirmar" pasa por showConfirm y espera su resultado', () => {
    // La forma que importa: `if (!(await showConfirm(...))) return;`.
    // Un `showConfirm(...)` sin `await` ni `if` abre el diálogo y continúa,
    // que es peor que no preguntar: la acción ocurre igual.
    const sueltos: string[] = [];
    // `dialogs.tsx` queda fuera: ahí está la DEFINICIÓN, que por definición no
    // se espera a sí misma.
    for (const f of ARCHIVOS.filter((x) => !x.endsWith('dialogs.tsx'))) {
      const s = codigo(f);
      for (const m of s.matchAll(/showConfirm\(/g)) {
        const linea = s.slice(0, m.index).split('\n').length;
        const antes = s.slice(Math.max(0, m.index - 30), m.index);
        if (!/await\s*$/.test(antes) && !/\(\s*$/.test(antes)) {
          sueltos.push(`${f.slice(RAIZ.length + 1)}:${linea}`);
        }
      }
    }
    expect(sueltos).toEqual([]);
  });

  it('el host de diálogos está montado, o los showConfirm se pierden', () => {
    // `showConfirm` encola si no hay host. Sin `<DialogHost/>` en el árbol, el
    // diálogo aparece nunca y el `await` no se resuelve: la acción queda
    // colgada para siempre y sin ningún error visible.
    const nav = readFileSync(join(RAIZ, 'navigation', 'AppNavigator.tsx'), 'utf8');
    expect(nav).toContain('<DialogHost />');
    expect(nav).toContain('<ToastHost />');
  });
});
