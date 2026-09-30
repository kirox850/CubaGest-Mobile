// ─── TEMA CUBAGEST (dual: claro/oscuro) ──────────────────────────────────────
// Paleta oficial del Brand Kit: #048afb. Todos los colores "estáticos" que
// había antes (#3B82F6, #EFF6FF, etc.) ahora viven aquí como tokens, y las
// superficies/textos cambian según el tema activo (ThemeContext). Igual que
// las variables CSS de la web.
//
// REGLA de uso en las screens:
//  - Fondos/textos/bordes SIEMPRE via colors.* (nunca hex suelto).
//  - Blanco sobre color de marca (botones, badges) sí puede ser '#fff'
//    literal: es texto sobre un fondo siempre saturado.

// Canales RGB para derivar transparencias: colors.primary + '18' etc.
const BRAND = '#048afb';
const BRAND_DARK = '#026ace';
const BRAND_LIGHT = '#47a9ff';

// Navy de marca (fondo del login, header de la app) — fijo en ambos temas,
// igual que en la web.
export const NAVY = '#0B1220';

const light = {
  // Marca
  primary: BRAND,
  primaryDark: BRAND_DARK,
  primaryLight: BRAND_LIGHT,
  primaryTint: '#EAF4FE',      // fondo suave azul (equiv. --brand-tint web)
  primaryTintB: '#B5DBFD',     // borde suave azul (equiv. --brand-tint-b web)

  // Superficies
  bg: '#F8FAFC',
  bgCard: '#ffffff',
  bgSecondary: '#F1F5F9',

  // Bordes (—line web)
  border: '#E8E0D8',
  borderLight: '#F1F5F9',

  // Inputs (—input-bg / —input-border web)
  inputBg: '#F1F5F9',
  inputBorder: '#D8CFC4',

  // Textos
  text: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#64748B',

  // Acento — Verde (acciones clave: Cobrar, confirmaciones)
  success: '#10B981',
  successBg: '#ECFDF5',
  successLight: '#D1FAE5',

  // Alerta — Naranja
  warning: '#F97316',
  warningBg: '#FFF7ED',
  warningBorder: '#FED7AA',
  warningTextDark: '#9A3412',

  // Peligro
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerLight: '#FECACA',


  // ── Tonos de TEXTO sobre fondo claro ───────────────────────────────────────
  // El acento (`success`, `warning`, `danger`) está elegido para ser un RELLENO:
  // blanco encima, o un badge. Puesto como TEXTO sobre `#ffffff` baja de
  // contraste —el naranja de aviso mide 2.8:1—, así que para escribir hace
  // falta el tono ocho. Estos cuatro no son inventados: son los mismos que usa
  // la web en su Toast (primitives.tsx:27) y en sus banners de suscripción.
  successText: '#047857',
  warningText: '#C2410C',
  dangerText:  '#B91C1C',
  primaryText: '#1E40AF',
  // Estados de la banda de sincronización. El verde del WhatsApp no entra aquí:
  // es el color de otra marca, no del producto, y por eso se queda donde está.
  syncOk:     '#1A7A3C',
  syncBusy:   '#1A5C8B',
  syncWarn:   '#C17A00',
  syncError:  '#8B1A1A',
  infoText:   '#1E40AF',

  // Borde y fondo de la caja de aviso de faltantes. El plan (U3.3) los pedía
  // como tokens y estaban duplicados inline en CierreCajaScreen; aquí queda una
  // sola definición, y la del tema oscuro translúcida como los demás fondos.
  warnBg: '#FFF7ED',
  warnBorder: '#FED7AA',
  warnTitle: '#C2410C',
  warnText: '#7C2D12',
  // Tinta de las etiquetas de categoría (gastos, inventario, auditoría). El web
  // la tenía escrita a mano en tres pantallas; aquí es un token desde el
  // principio, que es la razón por la que la paridad de este color no depende
  // de que alguien se acuerde de actualizar los tres sitios.
  category: '#5A3A1A',

  // Info
  info: BRAND,
  infoBg: '#EAF4FE',
};

// ─── EXCEPCIÓN CONOCIDA Y DELIBERADA: los acentos en oscuro ───────────────────
//
// La web NO re-declara `--brand`, `--color-ok`, `--color-warn` ni `--color-bad`
// en `.dark` (index.css:32-43), así que ahí valen los mismos valores que en
// claro. Este móvil usa otros cuatro. NO es un descuido, y NO se debe "igualar"
// para cerrar la paridad. El motivo está abajo, y está medido.
//
// El problema: los cuatro acentos claros están elegidos contra una superficie
// BLANCA (#ffffff). Puestos sobre la card oscura (#101A2C) se hunden:
//
//   #10b981 sobre #101a2c → 6.7:1   (el oscuro #34d399 → 9.4:1)
//   #f97316 sobre #101a2c → 6.1:1   (el oscuro #fb923c → 8.5:1)
//   #dc2626 sobre #101a2c → 3.0:1   (el oscuro #f87171 → 6.3:1)
//
// El último es elinteresting: el rojo de la web NO llega al 4.5:1 que WCAG pide
// para texto normal. Igualar este móvil al valor de la web significa dejar el
// botón de borrar y el texto de error como lo menos legible de la app, en el
// tema que el dueño eligió para trabajar de noche.
//
// La paridad que importa aquí no es "el mismo número", es "la misma decisión de
// diseño tomada por el mismo motivo". Las dos apps eligen que el rojo de error
// tenga contraste suficiente sobre la superficie donde se usa; una lo consigue
// aclarando el tono y la otra no. Este archivo es la que lo consigue.
//
// ESTO ES UNA EXCEPCIÓN, no una regla nueva. Si algún día la web aclara sus
// acentos en oscuro, estas cuatro líneas deben volverse a sus valores y este
// comentario borrarse. Lo que no debe pasar es lo contrario: cambiar estos
// valores para parecerse a una web que tiene el problema sin resolver.
const dark = {
  // Marca — aclarada para contraste sobre superficie oscura (ver arriba)
  primary: '#2E97FC',
  primaryDark: BRAND,
  primaryLight: BRAND_LIGHT,
  primaryTint: 'rgba(4,138,251,0.14)',
  primaryTintB: 'rgba(4,138,251,0.38)',

  // Superficies (equiv. .dark de la web)
  bg: '#0B1220',
  bgCard: '#101A2C',
  bgSecondary: '#1E293B',

  // Bordes (—line web dark)
  border: '#26334A',
  borderLight: '#1B2537',

  // Inputs (—input-bg / —input-border web dark)
  inputBg: '#1E293B',
  inputBorder: '#334155',

  // Textos
  text: '#E2E8F0',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',

  // Acentos — mismos huevos, fondos translúcidos para no deslumbrar
  success: '#34D399',
  successBg: 'rgba(16,185,129,0.14)',
  successLight: 'rgba(16,185,129,0.30)',

  warning: '#FB923C',
  warningBg: 'rgba(249,115,22,0.12)',
  warningBorder: 'rgba(249,115,22,0.35)',
  warningTextDark: '#FDBA74',

  danger: '#F87171',
  dangerBg: 'rgba(220,38,38,0.14)',
  dangerLight: 'rgba(220,38,38,0.35)',


  // Los mismos ocho tonos, aclarados para fondo oscuro. Mismo motivo y mismo
  // criterio que los acentos: sobre `#101A2C` el tono de texto de claro se
  // hunde, así que aquí va el equivalente claro.
  successText: '#6EE7B7',
  warningText: '#FDBA74',
  dangerText:  '#FCA5A5',
  primaryText: '#93C5FD',
  syncOk:     '#4ADE80',
  syncBusy:   '#7DD3FC',
  syncWarn:   '#FCD34D',
  syncError:  '#F87171',
  infoText:   '#93C5FD',

  warnBg: 'rgba(249,115,22,0.12)',
  warnBorder: 'rgba(249,115,22,0.35)',
  warnTitle: '#FDBA74',
  warnText: '#FED7AA',
  category: '#D9A066',

  info: '#2E97FC',
  infoBg: 'rgba(4,138,251,0.14)',
};

export type Palette = typeof light;

export const palettes = { light, dark };

// `colors` apunta al tema ACTIVO: ThemeContext reasigna estas propiedades al
// cambiar de tema (Object.assign sobre el objeto exportado), así cualquier
// StyleSheet.create creado al importar el módulo queda vivo — los estilos
// estáticos de RN NO se re-evalúan solos, y así no hay que suscribir cada
// screen al contexto para tener dark mode.
const colors: Palette = { ...light };

export const applyTheme = (mode: 'light' | 'dark') => {
  Object.assign(colors, mode === 'dark' ? dark : light);
};

export const getThemeMode = (): 'light' | 'dark' => currentMode;
let currentMode: 'light' | 'dark' = 'light';
// Referencia global de versión de tema: los estilos de las screens se
// reconstruyen cuando cambia (los StyleSheet.create a nivel de módulo
// "hornean" los valores, así que sin esto el modo oscuro no se aplicaría).
export const themeRef = { version: 0 };
export const setThemeMode = (mode: 'light' | 'dark') => {
  if (mode !== currentMode) { currentMode = mode; themeRef.version++; }
};

export { colors };

// ─── ESPACIADO ───────────────────────────────────────────────────────────────
//
// El plan propone renombrarlo `space` con claves NUMÉRICAS (`space.1` …
// `space.6`). En JavaScript eso no compila: una clave que empieza por un dígito
// solo se lee con corchetes, así que cada uno de los veinte usos quedaría como
// `space['3']`. Un token que se escribe con corchetes en todas partes es peor
// que uno con palabra, así que `space` queda como alias de `spacing`.
//
// Los VALORES no se tocan en ninguna de las dos escalas. Cambiarlos reestiliza
// veinte sitios sin poder ver la app, que es exactamente el número a partir del
// cual un ajuste deja de ser revisable.
//
// Que `space.md` y `type.md` se llamen igual no es una colisión: son escalas
// distintas del mismo eje, y es lo que hacen Tailwind, Material y el propio
// `primitives.tsx` de la web.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
export const space = spacing;

// ─── ESCALA TIPOGRÁFICA ──────────────────────────────────────────────────────
//
// Antes había QUINCE tamaños distintos, once de ellos con decimales (11.5,
// 12.5, 13.5, 14.5) y cuatro enteros que nadie sabía si eran una decisión o un
// descuido. Medio punto no se ve: no se nota un texto medio píxel más grande,
// pero sí se nota que dos pantallas se ven distintas. Y sobre una lista sin
// escala nadie puede decir "el texto de las etiquetas va en `xs`", porque `xs`
// no existía: se escribía el número que se tenía delante.
//
// Catorce pasos suenan muchos, y lo son, pero cada uno nombra un PAPEL y no un
// tamaño, que es lo que permite decidir. La lista corta (10, 11, 12, 13) es la
// del texto corrido; a partir de ahí ya no hay "un tamaño de texto" sino un
// papel concreto, y por eso los últimos llevan nombre y no número.
//
// `md` (14) es el tamaño de las primitivas de la web, y por eso los inputs y los
// botones están aquí: es el punto donde la paridad se puede medir en vez de
// suponer. Los nueve tamaños de 10 a 18 cubren el 93% de los usos de la app.
export const type = {
  '2xs': 10,      // contador, marca de agua: se nota su ausencia, no se lee
  xs: 11,         // leyenda y metadatos
  sm: 12,         // texto secundario y denso
  base: 13,       // cuerpo de pantalla
  md: 14,         // input, botón y texto de sistema — el de la web
  lg: 15,         // cuerpo destacado, importes
  xl: 16,
  title: 17,      // título de tarjeta y de sección menor
  section: 18,    // encabezado de bloque
  '2xl': 20,      // cifra grande
  display: 22,    // título de pantalla
  '3xl': 24,      // métrica de dashboard
  hero: 28,       // título de acceso
} as const;

/** El mismo objeto, con el nombre que se escribe en el JSX. */
export const fontSize = type;

// ─── RADIOS ──────────────────────────────────────────────────────────────────
//
// El plan propone `sm:8, md:10, lg:12, xl:16`. NO se aplica, y el motivo no es
// de gusto sino de medición: la escalera que la app usa es de DOS en dos —
// 8, 10, 12, 14, 16, 18, 20 — y 49 de sus radios estaban escritos a mano porque
// el token no tenía nombre para tres de los siete escalones. Bajarlos a la
// escala del plan cambiaría 122 sitios de un golpe, sin poder ver la app, y
// pondría 10 y 18 en un sitio donde antes no estaban.
//
//   Los radios que quedan FUERA de esta escalera no son descuidos: son círculos.
//   Un punto de 22×22 lleva radio 11, y un avatar de 36×36 lleva 18, porque el
//   radio de un círculo es la mitad de su lado. Bajarlo a 8 o 10 no lo deja "en
//   escala": lo convierte en un cuadrado redondeado, y un punto de estado
//   cuadrado se lee como otra cosa. Por eso `escalas.test.ts` comprueba la
//   RELACIÓN (radio = lado ÷ 2) en vez del valor.
//
// Lo que sí se añade es `pill`, que es lo que de verdad se repite: barras de
// uso, píldoras de estado y botones de icono.
export const radius = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  '2xl': 18,
  '3xl': 20,
  /** Todo lo que es redondo por dentro. */
  pill: 9999,
  /** Alias, por compatibilidad con quien ya lo leía así. */
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
};

// Sombra de la tarjeta 3D del login (equivalente a las capas del panel
// blanco de la web). Fija — la tarjeta es blanca en ambos temas.
export const card3d = {
  shadowColor: '#0B1220',
  shadowOffset: { width: 0, height: 18 },
  shadowOpacity: 0.30,
  shadowRadius: 36,
  elevation: 12,
};
