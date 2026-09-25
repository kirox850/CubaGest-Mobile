// Bus de eventos minimalista para el ciclo de vida de la sesión.
// Equivalente al window.dispatchEvent("cubagest-session-expired") de la web,
// pero sin recargar nada: el AuthContext se suscribe y decide qué hacer.
//
// IMPORTANTE (app offline-first): "expiró" solo se emite cuando el SERVIDOR
// rechaza la sesión. Un fallo de red o un 401 seguido de un refresh imposible
// por conectividad NO emite este evento — la sesión sigue abierta.

type SessionCallback = () => void;

const listeners = new Set<SessionCallback>();

function emit(): void {
  for (const cb of Array.from(listeners)) {
    try {
      cb();
    } catch {
      // un suscriptor roto no puede tumbar al resto
    }
  }
}

export function onSessionExpired(cb: SessionCallback): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** El servidor rechazó la sesión (revocación): la app vuelve al login. */
export function emitSessionExpired(): void {
  emit();
}

/** El usuario cerró sesión explícitamente (logout). */
export function emitSessionRevoked(): void {
  emit();
}
