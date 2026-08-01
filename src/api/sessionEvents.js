// Bus de eventos minimalista para notificar cuando la sesión expira (401).
// Equivalente al window.dispatchEvent("cubagest-session-expired") de la web,
// pero sin recargar nada: el AuthContext se suscribe y limpia el usuario.
const listeners = new Set();

export function onSessionExpired(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emitSessionExpired() {
  listeners.forEach(cb => {
    try { cb(); } catch {}
  });
}
