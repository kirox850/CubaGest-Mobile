// ─── tests de la sincronización periódica ────────────────────────────────────
//
// La pasada cada 5 minutos es lo que hace que la app deje de depender de que el
// cajero visite pantallas. Lo que se prueba aquí no es el temporizador de React
// (eso no se monta sin testing-library), sino la DECISIÓN de si una pasada debe
// correr o no. Esa decisión es la que importa: una pasada que se salta la red,
// o que se solapa con otra, es un fallo de comportamiento, no de render.
//
// Se importa `debeCorrerCiclo` del módulo real, no una copia: una copia pasa en
// verde mientras la función que decide cambia, que es el mismo fallo que ya
// corrigió una vez el contrato de `assignedCajas`.

import { describe, it, expect } from '@jest/globals';
import { debeCorrerCiclo, SYNC_CYCLE_MS, AUTO_SYNC_COOLDOWN_MS } from '../syncCycle';

const AHORA = 1_000_000;

describe('la pasada periódica de sincronización', () => {
  it('el intervalo es de 5 minutos', () => {
    expect(SYNC_CYCLE_MS).toBe(5 * 60 * 1000);
  });

  it('corre con sesión, red, primer plano y enfriamiento cumplido', () => {
    expect(debeCorrerCiclo({
      haySesion: true, hayRed: true, primerPlano: true,
      sincronizando: false, ultimoSync: AHORA - AUTO_SYNC_COOLDOWN_MS - 1000, ahora: AHORA,
    })).toBe(true);
  });

  it('NO corre sin sesión: sin cuenta no hay nada que subir ni bajar', () => {
    expect(debeCorrerCiclo({
      haySesion: false, hayRed: true, primerPlano: true,
      sincronizando: false, ultimoSync: 0, ahora: AHORA,
    })).toBe(false);
  });

  it('NO corre sin red: serían peticiones que van a fallar', () => {
    expect(debeCorrerCiclo({
      haySesion: true, hayRed: false, primerPlano: true,
      sincronizando: false, ultimoSync: 0, ahora: AHORA,
    })).toBe(false);
  });

  it('NO corre en segundo plano: la radio no se despierta cada 5 minutos sola', () => {
    expect(debeCorrerCiclo({
      haySesion: true, hayRed: true, primerPlano: false,
      sincronizando: false, ultimoSync: 0, ahora: AHORA,
    })).toBe(false);
  });

  it('NO corre mientras hay otra sincronización en curso', () => {
    // Solaparse sería marcar ventas como syncing dos veces y perder el
    // seguimiento de cuál intento terminó.
    expect(debeCorrerCiclo({
      haySesion: true, hayRed: true, primerPlano: true,
      sincronizando: true, ultimoSync: 0, ahora: AHORA,
    })).toBe(false);
  });

  it('respeta el enfriamiento mínimo, para que un tick no se pise con la reconexión', () => {
    expect(debeCorrerCiclo({
      haySesion: true, hayRed: true, primerPlano: true,
      sincronizando: false, ultimoSync: AHORA - 1000, ahora: AHORA,
    })).toBe(false);
  });

  it('el enfriamiento es más corto que el intervalo (45 s contra 5 min)', () => {
    // Si fueran al revés, el intervalo nunca llegaría a dispararse solo.
    expect(AUTO_SYNC_COOLDOWN_MS).toBeLessThan(SYNC_CYCLE_MS);
  });
});
