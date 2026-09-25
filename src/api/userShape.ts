import type { User } from '../types';

/**
 * Normaliza la respuesta de usuario que puede venir como objeto plano
 * (`{ ok, user: {...} }` envuelto, o el usuario directo) para que la app
 * nunca quede con `role === undefined` y cero pestañas.
 */
export function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  if (!u.role && u.user && typeof u.user === 'object') {
    return u.user as User;
  }
  if (typeof u.id !== 'string' || typeof u.email !== 'string') return null;
  return u as unknown as User;
}

/**
 * ID de la empresa de un usuario. El backend anida la empresa en
 * `user.company.id`; algunas respuestas viejas traían `businessId` plano.
 */
export function companyIdOf(user: User | null | undefined): string {
  if (!user) return '';
  return user.company?.id || user.businessId || '';
}
