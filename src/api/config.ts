// URL del backend en Cloudflare Workers, servida a través del proxy del
// frontend en Cloudflare Pages (cubagest.dpdns.org/api/...) — igual que la
// web. Nunca apuntar directo a *.workers.dev: ETECSA bloquea ese dominio
// en Cuba, y la app quedaría inutilizable para los usuarios reales.
export const API_BASE_URL = 'https://cubagest.dpdns.org/api';
