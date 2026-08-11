// Bus de eventos minimalista para notificar cuando la sesión expira (401).
// Equivalente al window.dispatchEvent("cubagest-session-expired") de la web,
// pero sin recargar nada: el AuthContext se suscribe y limpia el usuario.

type SessionExpiredCallback = () => void;

const listeners = new Set<SessionExpiredCallback>();

export function onSessionExpired(cb: SessionExpiredCallback): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emitSessionExpired(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}
