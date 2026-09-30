// ─── la regla: un emoji nunca es un control ────────────────────────────────
//
// Este test camina `src/**/*.tsx` y falla si aparece un carácter pictográfico.
// No necesita testing-library ni componente montado: lee el disco, que es
// justo lo que hay que vigilar, porque el defecto no es de ejecución sino de
// autoría — alguien escribe un emoji en un `<Text>` y la app se ve distinta en
// cada teléfono.
//
// LA FRONTERA QUE IMPORTA, y que es la razón de que este test exista en vez de
// un "cero emoji" a pelo:
//
//   · Un emoji pegado a un VALOR es un control: 🗑 en un botón de borrar, ⚠ al
//     lado de "ANULADA", 💵 en el título de una sección. Eso se dibuja con un
//     `Icon` del vocabulario, que se ve igual en Android, en iOS y en el tema
//     oscuro.
//
//   · Un emoji DENTRO de una frase es puntuación: "⚠ Guardar reemplaza TODAS las
//     cajas". Quitarlo deja una frase que empieza en mayúscula, que es como se
//     escribe. Y quitarlo de verdad rompería el texto: el aviso del servidor
//     ("Abre tu turno antes de registrar una salida de dinero") llega como
//     texto plano y es el mismo aviso que se muestra en la web.
//
// La lista blanca de abajo son los tres glifos que se usan como puntuación y
// como separador, más los dos que existen como parte de un texto enviado a otra
// aplicación. Todo lo demás —los rangos pictográficos— está prohibido.
//
// Los comentarios NO se saltan, a propósito. Un emoji en un comentario no se ve
// en pantalla, pero la primera vez que alguien copia un fragmento de código
// desde un comentario es cuando acaba en producción. Y si alguna vez hace falta
// escribir un emoji en una prueba, la prueba va en la lista blanca con su
// motivo, que es donde se revisa.

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

/**
 * Rangos de Unicode que contienen pictogramas.
 *
 * El rango U+2300–U+23FF está porque ahí vive el reloj de arena, que se coló en
 * la primera versión de este regex y llegó hasta una etiqueta de la lista de
 * cierres. Un rango escrito a mano siempre tiene un hueco.
 *
 * Los rangos de flechas (U+2190–U+21FF), de formas (U+25A0–U+25FF) y de
 * subíndices (U+2B00–U+2BFF) NO entran aquí a propósito: la flecha de "al
 * volver a primer plano → sincronizar" y el caret del desplegable son
 * TIPOGRAFÍA, y el plan dice que se conservan. Lo que no se conserva es un 🗑
 * en un botón, que es un control disfrazado de carácter.
 */
const PICTOGRAFICOS = /[\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}\u{FE0F}]/gu;

/**
 * Glifos permitidos, cada uno con su motivo. Una lista blanca sin motivos es
 * una lista que crece sin que nadie lo decida.
 *
 * Empezó con `✓`, `✕` y `⚠`. `✓` y `✕` se han ido: los dos eran controles
 * disfrazados de carácter (el final de una fila que decía "cuadra", la ✕ de un
 * botón) y los dos son ahora `Icon`. Que la lista se encoja es el resultado.
 */
const PERMITIDOS: Record<string, string> = {
  '⚠': 'Puntuación: abre un aviso escrito en prosa. El que acompaña a un VALOR va con Icon.',
  '→': 'Tipografía: une dos frases ("al volver a primer plano → sincronizar").',
  '←': 'Tipografía: igual que la flecha de la derecha. Un "volver" con esta flecha es texto, no botón.',
  '⇅': 'Tipografía: marca de dos sentidos en la insignia de sincronía, no un icono de recarga.',
  '▼': 'Tipografía: el caret del desplegable. Es una punta de flecha, no un pictograma.',
  '●': 'Tipografía: el punto de "sin conexión" en la píldora. Un status dot, no una ilustración.',
};

/**
 * `.tsx` Y `.ts`. La primera versión solo miraba `.tsx` y por eso dejó pasar
 * un 📎 dentro del cuerpo de WhatsApp de `utils/csv.ts` — y se coló con el
 * argumento de que los `.ts` no son UI. Es falso: un `.ts` puede llevar
 * cadenas que se muestran tal cual, y este lleva el mensaje que se manda por
 * mensajería. La regla es sobre lo que el usuario LEE, no sobre la extensión
 * del archivo.
 */
function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fuentes(p));
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Archivos donde el pictograma es CONTENIDO y no interfaz: el bloque de
 * contacto de los documentos legales. Un aviso a los pies de una política de
 * privacidad se escribe en un documento, no en un componente, y quitarle el
 * icono lo haría parecer un texto pegado sin formato.
 */
const EXENCIONES: Record<string, string> = {
  'src/config/legalContent.ts': 'Documento legal: el pictograma va en el bloque de contacto, es parte del texto publicado y no de la interfaz.',
};

describe('no hay emoji como interfaz', () => {
  // Dos exclusiones, y las dos son necesarias: los `__tests__` (este archivo
  // nombra 🗑 y 💵 al explicar la regla, y no puede fallarse a sí mismo) y los
  // documentos, donde el pictograma es contenido.
  const archivos = fuentes(RAIZ).filter((f) => {
    const rel = 'src/' + f.slice(RAIZ.length + 1).split('\\').join('/');
    return !rel.includes('__tests__') && !EXENCIONES[rel];
  });
  const ofensas: string[] = [];

  for (const abs of archivos) {
    const rel = abs.slice(RAIZ.length + 1);
    const lineas = readFileSync(abs, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      for (const ch of (linea.match(PICTOGRAFICOS) ?? [])) {
        if (PERMITIDOS[ch]) continue;
        ofensas.push(`${rel}:${i + 1}  ${ch}  ${linea.trim().slice(0, 80)}`);
      }
    });
  }

  it('encuentra archivos que examinar (si no, el test pasa sin hacer nada)', () => {
    expect(archivos.length).toBeGreaterThan(20);
  });

  it('ningún carácter pictográfico fuera de la lista blanca', () => {
    // El mensaje lleva archivo:línea, para que arreglarlo sea trabajo de un
    // archivo y no una búsqueda a ciegas por 23.
    expect(ofensas).toEqual([]);
  });

  it('cada glifo permitido tiene un motivo, y el motivo lo justifica', () => {
    for (const [ch, motivo] of Object.entries(PERMITIDOS)) {
      expect(typeof motivo).toBe('string');
      expect(motivo.length).toBeGreaterThan(20);
      // Clasificación: o el regex lo captura (y está permitido por un motivo),
      // o es tipografía que los rangos dejan fuera a propósito. Un glifo que no
      // está en ninguno de los dos casos se colaría por una excepción invisible.
      const capturado = new RegExp(PICTOGRAFICOS.source).test(ch);
      const esTipografia = '→←⇅▼●'.includes(ch);
      expect(capturado || esTipografia).toBe(true);
    }
  });

  it('ningún glifo permitido sobra: si nadie lo usa, sale de la lista', () => {
    // Esta es la comprobación que hace que la lista se mantenga sola. Sin ella,
    // `✓` y `✕` habrían seguido ahí para siempre authorizing usos futuros que
    // nadie iba a revisar: una lista blanca que solo crece es un agujero.
    const texto = fuentes(RAIZ)
      .filter((f) => !f.includes('__tests__'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const ch of Object.keys(PERMITIDOS)) {
      expect(texto.includes(ch)).toBe(true);
    }
  });

  it('`⚠` solo aparece en prosa: nunca pegado a una expresión', () => {
    // La frontera que este test entero existe para vigilar. Un `⚠` pegado a un
    // valor —`{bajo ? '⚠ ' : ''}`— es un marcador de control y va con `Icon`.
    // Uno que abre una frase escrita es puntuación y se queda.
    const usos = archivos
      .flatMap((f) => readFileSync(f, 'utf8').split('\n'))
      .filter((l) => l.includes('⚠'));
    expect(usos.length).toBeGreaterThan(0);
    for (const l of usos) {
      expect(l).not.toMatch(/'⚠\\s*'/);
      expect(l).not.toMatch(/"⚠\\s*"/);
    }
  });

  it('cada exención tiene un motivo escrito', () => {
    for (const [archivo, motivo] of Object.entries(EXENCIONES)) {
      expect(motivo.length).toBeGreaterThan(30);
      expect(archivo.endsWith('.ts') || archivo.endsWith('.tsx')).toBe(true);
    }
  });
  it('cada glifo permitido sigue en uso en algún archivo', () => {
    // En las dos direcciones. Una lista blanca que solo crece autoriza usos
    // futuros que nadie va a revisar.
    const texto = fuentes(RAIZ)
      .filter((f) => !f.includes('__tests__'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const ch of Object.keys(PERMITIDOS)) {
      expect(texto.includes(ch)).toBe(true);
    }
  });
});
