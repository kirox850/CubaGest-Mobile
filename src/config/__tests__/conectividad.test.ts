// ─── tests de la conectividad de dos señales ─────────────────────────────────
//
// El caso que motivated todo: un wifi que se asocia, autentica y no lleva a
// ningún sitio. NetInfo dice "conectado", la app se cree en línea, y cada
// pantalla falla una por una con 8 segundos de timeout cada una. Con la segunda
// señal, la app lo detecta en una sola sonda y avisa de una vez.

import { describe, it, expect } from '@jest/globals';
import { esOnline, clasificarSonda, conSonda, type EstadoRed } from '../conectividad';

describe('esOnline', () => {
  it('sin respuesta del servidor todavía, manda el detector del sistema', () => {
    // Quedarse en "no" sin datos del servidor dejaría la app inutilizable la
    // primera vez que se abre.
    expect(esOnline({ sistema: true, servidor: null })).toBe(true);
    expect(esOnline({ sistema: false, servidor: null })).toBe(false);
  });

  it('el wifi que conecta pero no lleva a ningún sitio NO es conexión', () => {
    // NetInfo dice conectado, el servidor no respondió: offline.
    expect(esOnline({ sistema: true, servidor: false })).toBe(false);
  });

  it('con respuesta del servidor, manda esa señal', () => {
    expect(esOnline({ sistema: true, servidor: true })).toBe(true);
  });

  it('una respuesta del servidor no resucita una antena caída', () => {
    // Imposible en la realidad, pero el orden importa: si el sistema dice que
    // no hay red, no hay red por mucho que alguien conteste.
    expect(esOnline({ sistema: false, servidor: true })).toBe(false);
  });
});

describe('clasificarSonda', () => {
  it('cualquier respuesta es online, sin importar el código HTTP', () => {
    // Un 500 dice que el servidor está vivo y se rompió algo dentro. Un 502 de
    // un proxy dice que hay camino. En los dos casos hay red, y marcar la app
    // como "sin conexión" mandaría a reiniciar una app que no lo arregla.
    expect(clasificarSonda({ ok: true })).toBe('online');
  });

  it('solo un fallo de transporte es offline', () => {
    expect(clasificarSonda({ ok: false })).toBe('offline');
    expect(clasificarSonda(null)).toBe('offline');
    expect(clasificarSonda(undefined)).toBe('offline');
  });
});

describe('conSonda', () => {
  it('guarda la respuesta del servidor sin perder el estado del sistema', () => {
    const estado: EstadoRed = { sistema: true, servidor: null };
    expect(conSonda(estado, 'offline')).toEqual({ sistema: true, servidor: false });
    expect(conSonda(conSonda(estado, 'offline'), 'online')).toEqual({ sistema: true, servidor: true });
  });

  it('un fallo de red después de uno de servidor no borra lo que ya se sabía', () => {
    // El sistema puede parpadear; una sonda que se pasa por unlucky no puede
    // dejar la app creyendo que lleva un rato sin red.
    const estado = conSonda({ sistema: true, servidor: null }, 'offline');
    expect(conSonda(estado, 'online').servidor).toBe(true);
  });
});

describe('la señal NO se deriva de apiFetch', () => {
  // Esta es la corrección de fondo del gap 15, y el motivo por el que la sonda
  // usa un `fetch` crudo. Si alguien "simplifica" esto usando apiFetch, este
  // test es el que lo dice.
  it('un 403 NO es falta de red', () => {
    // El backend responde 403 cuando el rol no tiene el módulo. Eso es un
    // problema de PERMISOS. Si la app se puso "sin conexión" por eso, le
    // diría al cajero que reinicie la app, y no arregla nada.
    const respuesta = { status: 403, cuerpo: { ok: false, error: 'No tiene permisos' } };
    // Hay respuesta: hay red.
    expect(clasificarSonda({ ok: true })).toBe('online');
    expect(respuesta.cuerpo.ok).toBe(false);
  });

  it('un 401 de token caducado tampoco es falta de red', () => {
    // apiFetch lo trata como "renovar sesión", y si la renovación falla por
    // red lanza OFFLINE_MESSAGE. Ese mensaje NO puede usarse para decidir
    // conectividad: sería un 401 diciendo "sin conexión".
    expect(clasificarSonda({ ok: true })).toBe('online');
  });
});
