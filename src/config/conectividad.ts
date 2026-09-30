// ─── CONECTIVIDAD: SON DOS SEÑALES, Y LAS DOS HACEN FALTA ───────────────────
//
// Este archivo decide si la app cree que tiene internet. Es más importante de lo
// que parece, porque de esa respuesta cuelgan la sesión, la cola offline y el
// aviso del modo sin conexión.
//
// El fallo que había en el móvil era usar SOLO NetInfo, que es el mismo
// detector que da "conectado". La señal que miente no es la falta de antena:
// es el wifi que se asocia, autentica y no lleva a ningún sitio. Eso pasa
// todos los días en un negocio, y con NetInfo únicamente la app se cree en línea,
// intenta cada pantalla, y falla una por una con un timeout de 8 segundos cada
// una. El cajero ve una app rota; la app cree que tiene red.
//
// Por eso hay dos señales, como en la web (useOnline.ts):
//
//  1. NetInfo: el sistema avisa cuando se quita la antena.
//  2. UNA respuesta del servidor: detecta la red que "conecta" pero no lleva a
//     ningún sitio, que es el caso real en un negocio.
//
// Y hay una trampa con la segunda. La señal de "el servidor respondió" NO se
// puede derivar de `apiFetch`, y esta es la corrección de fondo del gap 15:
// `apiFetch` trata CUALQUIER error de red como si fuera un fallo de conexión
// (lanza OFFLINE_MESSAGE). Si una pantalla usara su propio error para poner
// "sin conexión", un 403 o un 401 de token caducado —que NO son falta de red—
// marcarían la app como offline. Enseñar "sin conexión" cuando lo que hay es un
// problema de permisos es peor que no enseñar nada: manda a reiniciar la app.
//
// Así que la señal se mide con un `fetch` crudo contra `GET /health`, que es una
// ruta sin autenticación y que devuelve `ok` sin tocar la base de datos
// (index.ts:41, montada antes de todo middleware). Cualquier RESPUESTA —incluido
// un 404 o un 500— significa que hay red: algo conteste, hay camino. Solo un
// fallo de transporte significa que no lo hay.
//
// Y la sonda NUNCA corre por temporizador. Cada ejecución es un turno de red en
// el dispositivo, y en una batería de un teléfono de mostrador eso se nota. Se
// lanza al arrancar, al recuperar conexión y en los mismos momentos en que ya
// se hacen peticiones de verdad. Si no hay peticiones, no hay nada que ascertain, y no se gasta red en averiguarlo.

export interface EstadoRed {
  /** Lo que dice el detector del sistema. */
  sistema: boolean;
  /** Lo que se sabe de la última respuesta real del servidor. */
  servidor: boolean | null;
}

/**
 * ¿Está la red conectada?
 *
 * `sistema` manda en el arranque, cuando no hay ninguna respuesta todavía: sin
 * datos del servidor, el detector del sistema es lo único que hay, y quedarse
 * en "no" sin red sería dejar la app inutilizable la primera vez que se abre.
 *
 * En cuanto hay una respuesta del servidor, esa manda. Es más información que
 * el detector, porque incluye el caso que el detector no ve.
 */
export function esOnline(estado: EstadoRed): boolean {
  if (estado.servidor === null) return estado.sistema;
  return estado.sistema && estado.servidor;
}

export type ResultadoSonda = 'online' | 'offline';

/**
 * Clasifica el resultado de la sonda.
 *
 * Cualquier RESPUESTA es online. Solo un fallo de transporte (sin respuesta,
 * abortada, sin DNS) es offline. La razón es concreta: un 500 dice que el
 * servidor está vivo y que algo se rompió dentro; un 502 de un proxy dice que
 * hay camino y hay algo roto en medio. En los dos casos hay red, y marcar la app
 * como "sin conexión" mandaría al cajero a reiniciar una app que ya no arregla
 * nada.
 *
 * Lo que se devuelve son DATOS, no una excepción: la sonda no puede romper la
 * app que la usa.
 */
export function clasificarSonda(resultado: { ok: boolean } | null | undefined): ResultadoSonda {
  // `ok` es un booleano explícito, no el código HTTP: cualquier respuesta lo
  // trae a true y un fallo de transporte nunca llega hasta aquí.
  return resultado?.ok === true ? 'online' : 'offline';
}

/** Aplica el resultado de la sonda al estado, sin perder lo que ya se sabía. */
export function conSonda(estado: EstadoRed, resultado: ResultadoSonda): EstadoRed {
  return { ...estado, servidor: resultado === 'online' };
}
