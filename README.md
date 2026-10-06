# CubaGest — App móvil (Expo + React Native)

App de celular de **CubaGest**: POS, inventario, facturación, contabilidad y
**cierre de caja** para PYMEs cubanas. Es el tercer cliente de la misma API que
consumen los otros dos repos:

| Repo | Qué es | Stack |
|---|---|---|
| `CubaGest/` | Backend (API) | Hono + Drizzle + Cloudflare D1 |
| `CubaGest-Web/` | Frontend web | React + Vite |
| `CubaGest-Mobile/` | **Este repo** — app de celular | Expo SDK 57 + React Native 0.86 + Hermes |

La app **no tiene lógica de negocio propia**: calcula lo mínimo para no
duplicar la verdad (dinero del cierre, tolerancia, resolución de caja, stock
local) y todo lo demás lo decide el servidor. Los cálculos del servidor están
documentados en el backend, no aquí.

- Entry point: `index.js` → `registerRootComponent(App)` → `src/App.tsx`
- Estado de verificación de este README: typecheck limpio, **261 tests / 27
  suites en verde**.

---

## 1. Stack (versiones reales)

### 1.1 Declarado en `package.json`

| Dependencia | Versión declarada | Versión instalada |
|---|---|---|
| `expo` | `^57.0.0` | 57.0.24 |
| `react` | `19.2.3` (fija) | 19.2.3 |
| `react-native` | `0.86.3` (fija) | 0.86.3 |
| `@react-navigation/native` | `^7.1.19` | 7.4.1 |
| `@react-navigation/bottom-tabs` | `^7.4.7` | 7.19.2 |
| `@react-navigation/native-stack` | `^7.3.28` | 7.19.2 |
| `react-native-screens` | `~4.26.0` | 4.26.2 |
| `react-native-safe-area-context` | `~5.7.0` | 5.7.0 |
| `react-native-svg` | `15.15.4` | 15.15.4 |
| `@react-native-async-storage/async-storage` | `^2.2.0` | 2.2.0 |
| `@react-native-community/netinfo` | `12.0.1` | 12.0.1 |
| `expo-splash-screen` | `~57.0.9` | — |
| `expo-device` | `~57.0.2` | — |
| `expo-notifications` | `~57.0.21` | — |

Dev: `jest ^29.7.0`, `jest-expo ^57.0.0`, `typescript ~6.0.3`,
`eslint ^8.19.0` (instalado 8.57.1), `prettier ^2.8.8`,
`@react-native/metro-config 0.86.3`, `@react-native/babel-preset 0.86.3`,
`babel-preset-expo ^57.0.0`, `babel-plugin-module-resolver ^5.0.0`,
`@react-native-community/cli 20.2.0`.
`engines.node >= 20` (CI usa Node 24).

### 1.2 Lo que NO está (y es intencionado)

- **`react-native-bottom-tabs`**: la barra nativa de iOS se probó y **no
  funcionó**. Se desinstaló. Ver §12.
- **`expo-blur`**: el cristal de la barra también se probó y se revirtió.
- **`expo-secure-store`**: los tokens se guardan en AsyncStorage a propósito.
  Ver §16 (deuda técnica, punto 1): es una decisión de producto documentada,
  no un descuido.
- **`@testing-library/react-native`**: no está. Por eso los tests son de
  *lógica pura* y de *texto*, no de render. Ver §14.

### 1.3 Dos declaraciones de versión que no cuadran

- `package.json` y `app.json` dicen **1.3.0**, pero el commit `c1758f2` se
  titula *"v1.4.0: shifts + cash reconciliation + offline warm-cache + CI
  gates"*. La versión **no se bumpeó**. Si publicas, bumpea las tres cosas
  (`package.json`, `app.json` → `expo.version`, y `android.versionCode` /
  `ios.buildNumber`).
- El workflow de CI dice *"SDK 57 / RN 0.81"* en un comentario; la dependencia
  real es **RN 0.86.3**. Comentario obsoleto, no afecta al build.

---

## 2. Comandos

Scripts literales de `package.json`:

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "test": "jest",
  "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
  "typecheck": "tsc --noEmit"
}
```

| Qué | Cómo | Notas |
|---|---|---|
| Instalar dependencias | `npm install` (o `npm ci` en CI) | Solo para lo que ya está en `package.json` |
| **Añadir una dependencia** | `npx expo install <pkg>` | **Obligatorio.** Ver §2.1 |
| Correr | `npm start` (= `expo start`) | Levanta Metro, escaneas el QR con Expo Go |
| Correr en emulador | `npm run android` / `npm run ios` | Necesita emulador/simulador |
| Tests | `npm test` (= `jest`) | 27 suites / 261 tests |
| Tests en modo CI | `npx jest --ci` | Sin watch, un solo pase |
| Un test | `npx jest src/config/__tests__/configuracion.test.ts` | |
| Tipos | `npm run typecheck` | `tsc --noEmit`, limpio hoy |
| Lint | `npm run lint` | ⚠️ **FALLA**: no hay configuración de ESLint. Ver §15.2 |
| APK de release | `.github/workflows/build-android.yml` | Manual, ver §13 |

### 2.1 ⚠️ En Expo, `npm install` NO vale para añadir cosas

**Regla:** para meter cualquier paquete nuevo se usa
`npx expo install <paquete>`, **nunca `npm install <paquete>`**.

Por qué: las librerías nativas de React Native dependen de la versión exacta
del runtime, del código nativo del SDK y de veces de la versión de Expo Go del
teléfono. `npx expo install` consulta el mapa de versiones que corresponde al
SDK instalado y escribe la versión correcta en `package.json`;
`npm install` pone la última que exista en el registro y rompe la paridad.

En este repo el caso es real: `react-native-svg` está fijado en `15.15.4`
(pin exacto, sin `^`) y `react-native-screens` en `~4.26.0` porque son
**versiones que el SDK 57 ya trae compiladas**. `npm install` las movería a la
última y la app dejaría de funcionar con Expo Go.

Si añades algo con `npm install` y luego la app falla con errores raros de
`node_modules` o con *"Project is incompatible"*, la causa casi siempre es esta.

Para re-alinear todo con lo que espera el SDK (no con lo que espera *tu* app
Expo Go del teléfono — eso se resuelve actualizando la app Expo Go):

```bash
npx expo install --fix
npx expo start --clear
```

### 2.2 Correr en el teléfono

1. `npm start` → sale un QR.
2. **Expo Go** (Android: dentro de la app; iPhone: desde la Cámara).
3. La app **debe** hablar con el backend: el host está en `src/api/config.ts`
   (§3.3).
4. Con Metro corriendo, los cambios se recargan solos; no hay que reescanear.

> Expo Go solo ejecuta proyectos cuyo SDK coincide con el de tu app Expo Go.
> Si el teléfono tiene un SDK más nuevo que el proyecto, actualiza Expo Go
> (no el proyecto) o fija el SDK a mano:
> `npx expo install expo@<SDK-de-tu-Expo-Go>` y luego `npx expo install --fix`.

> **Credenciales de prueba:** el README anterior citaba
> `admin@cubagest.cu / Admin123`, `cajero@cubagest.cu / Cajero123` y
> `contadora@cubagest.cu / Conta123`. **No se han podido verificar**: no
> aparecen en ningún fichero de este workspace (ni en el backend, ni en la
> web, ni en los planes `.md` del directorio padre). Antes de publicarlas en
> otra documentación, confírmalas contra la semilla real de D1.

---

## 3. Configuración del proyecto

### 3.1 Ficheros de build

| Fichero | Para qué |
|---|---|
| `app.json` | Config de Expo. **No existe `app.config.js`** ni plugins JS: todo es estático |
| `index.js` | Entry point con `registerRootComponent` |
| `babel.config.js` | `babel-preset-expo` + alias `@` → `./src` (`babel-plugin-module-resolver`) |
| `metro.config.js` | `expo/metro-config` por defecto |
| `tsconfig.json` | `strict: true`, `jsx: react-native`, `noEmit`, alias `@/*` → `./src/*`, extiende `expo/tsconfig.base` |
| `jest.config.js` / `jest.setup.js` | Ver §14.2 |
| `react-native.config.js` | Declara `assets: ['./assets/fonts/']` ⚠️ **esa carpeta no existe** |
| `.gitignore` | Excluye `node_modules/`, `.expo/`, `android/`, `ios/`, `.env*` |

Valores de `app.json` que importan:

| Campo | Valor | Por qué |
|---|---|---|
| `name` / `slug` | `CubaGest` / `cubagest` | |
| `version` | `1.3.0` | Desalineado con el commit "v1.4.0" (§1.3) |
| `orientation` | `portrait` | La app es vertical |
| `userInterfaceStyle` | `automatic` | + `ios.infoPlist.UIUserInterfaceStyle` |
| `icon` / `splash` | `./assets/images/icon.png` | Fondo `#0B1220` (el navy de marca) |
| `ios.bundleIdentifier` | `com.cubagest.app` | `buildNumber: 1` |
| `android.package` | `com.cubagest.app` | `versionCode: 3`, `allowBackup: false` |
| `androidStatusBar` | `light-content` sobre `#0B1220`, `translucent: false` | Coherente con el header navy |
| `plugins` | `expo-splash-screen` con el icono a 200px | Único plugin |
| `extra.brandColor` | `#048afb` | **No lo lee nadie.** `theme.ts` tiene el valor en `BRAND` |

Assets: `assets/images/icon.png`, `favicon.png`, `login-splash.jpg`.

### 3.2 Variables de entorno

**No hay ninguna.** No existe `.env`, ni `process.env`, ni `EXPO_PUBLIC_*`, ni
lectura de `Constants.expoConfig`. El único sitio donde hay una variable en
todo `src/` es un `extra?.invoiceNumber` del parseo de cola offline
(`src/offline/offlineStore.ts:414`), que no es una variable de entorno.

Esto es coherente con el resto del producto (la web tampoco las usa) y con el
hecho de que `API_BASE_URL` está fijado en un único fichero. Si alguna vez
hacen falta, el sitio natural es leerlas en `app.json` → `extra` y
consumirlas desde `src/api/config.ts`, no leer `process.env` en 40 sitios.

### 3.3 A qué URL apunta la API

`src/api/config.ts` — el fichero entero son 5 líneas:

```ts
export const API_BASE_URL = 'https://cubagest.dpdns.org/api';
```

Y el porqué está en el propio comentario: es el backend en Cloudflare Workers
**servido a través del proxy de Cloudflare Pages** (`cubagest.dpdns.org/api/…`),
igual que la web. **Nunca apuntar a `*.workers.dev`**: ETECSA bloquea ese
dominio en Cuba y la app quedaría inutilizable para los usuarios reales.

Cómo se resuelve el host, de punta a punta:

1. `API_BASE_URL` (`src/api/config.ts`) → `https://cubagest.dpdns.org/api`
2. `apiFetch` (`src/api/client.ts:46`) concatena: `fetch(`${API_BASE_URL}${path}`)`
   con `path` ya con la barra inicial (`/sales`, `/closing/${id}/explain`…).
3. `session.ts` usa **la misma constante** en su `rawRequest` (línea 124) para
   los endpoints de sesión que no pueden pasar por `apiFetch` (el refresh, para
   no recursar).
4. No hay resolución dinámica, ni por entorno, ni por plataforma, ni por
   `Platform.OS`. **Cambiar de backend = editar esa línea.**

> ⚠️ Consecuencia práctica: **no hay modo local de API**. Apuntar a un backend
> de desarrollo exige editar esa línea y acordarse de volver atrás. La
> alternativa sería `__DEV__ ? dev : prod`, pero nadie la ha implementado; si se
> hace, `npx expo install` sigue siendo la vía para instalar lo que haga falta.

### 3.4 Timeout y errores de red

`REQUEST_TIMEOUT_MS = 8000` en `client.ts:20` y en `session.ts:26`. Un
`AbortError` se traduce a `OFFLINE_MESSAGE` ("Sin conexión con el servidor —
revisa tu internet e inténtalo de nuevo"), que las pantallas reconocen con
`isOfflineError()` para caer a su caché local en vez de enseñar un error.

---

## 4. Arquitectura

### 4.1 Árbol

```
src/
├── App.tsx                  Raíz: providers + login/navegador
├── api/
│   ├── config.ts            API_BASE_URL (el host)
│   ├── client.ts            apiFetch: único camino de salida, 401 → refresh
│   ├── endpoints.ts         Catálogo de clientes por dominio
│   ├── session.ts           Tokens, refresh silencioso, revalidación
│   ├── secureStore.ts       Adaptador de secretos (AsyncStorage hoy)
│   ├── sessionEvents.ts     Bus de eventos de sesión
│   ├── userShape.ts         normalizeUser / companyIdOf
│   └── __tests__/
├── components/              UI compartida (13 ficheros)
├── config/                  Tokens y REGLAS PURAS (sin React) (11 + 19 tests)
├── context/                 Auth, Sync, Theme
├── hooks/                   useShift, useLocations, useOnlineStatus
├── navigation/              AppNavigator.tsx (el navegador entero)
├── offline/                 Store, sync, namespace, warm cache (6 ficheros, 6 suites, 50 tests)
├── screens/                 16 pantallas
├── types/index.ts           32 interfaces del dominio
└── utils/                   csv.ts (export vía share sheet), uuid.ts
```

### 4.2 `src/App.tsx` (43 líneas)

Cuatro providers anidados y una bifurcación:

```
SafeAreaProvider → ThemeProvider → AuthProvider → SyncProvider → Root
```

- `ThemeProvider` va primero porque los colores se reasignan globalmente.
- `SyncProvider` va **dentro** de `AuthProvider` porque depende del usuario y
  del estado online para disparar la sincronización automática.
- `Root`: si `loading` → spinner sobre navy; si hay `user` → `AppNavigator`;
  si no → `LoginScreen`. No hay router: son dos, no tres.

`StatusBar` con `barStyle="light-content"` y fondo `NAVY`, porque el header
es navy en los dos temas.

### 4.3 `src/navigation/AppNavigator.tsx` (576 líneas) — léelo entero

Es el fichero con más "por qué" del repo. Estructura:

1. **Listas** — `NAV_ITEMS` (7 módulos, misma key/label/icono que la web),
   `MENU_SCREENS` (hoy solo `movimientos`), `PREFERIDAS_BARRA` (5 destinos),
   `MAX_TABS`.
2. **`HeaderRight`** — bandeja de notificaciones, píldoras de estado (offline, sync, conflictos), avatar,
   y el **menú de perfil** (modal con Configuración, módulos desbordados,
   Entradas y Salidas, tour, modo oscuro, legales y cerrar sesión).
3. **`TrialBanner`** — banner de prueba gratuita: azul
>   (`colors.primaryText`) y naranja (`colors.warningText`) a ≤7 días, y
>   pulsable: lleva a **Mi plan**.
4. **`AppNavigator`** — calcula permisos → tabs → desbordados → grupos de
   Configuración, y monta un único `NavigationContainer` con un
   `createBottomTabNavigator`.

Detalles que hay que conocer antes de tocarlo:

- **Todos los hooks van antes de cualquier `return` temprano**
  (`AppNavigator.tsx:220-224`): antes tres `useState` estaban *después* del
  `if (tabs.length === 0)`, así que un usuario sin módulos montaba el
  componente con otro número de hooks → crash de hooks justo al navegar tras
  un cambio de rol.
- **`NavigationContainer` con `key={version}`** (el `version` del tema): al
  cambiar claro/oscuro se re-monta el navegador con los estilos nuevos. El
  tema **extiende** `DefaultTheme`/`DarkTheme` porque la v7 exige el campo
  `fonts` (sin él crashea el `HeaderTitle`).
- **`navRef`**: `AppNavigator` está *fuera* del `NavigationContainer` que él
  mismo monta, así que no puede usar `useNavigation`. Se guarda la referencia
  que llega por `screenOptions` para poder saltar a un grupo concreto.
- **Estilos "vivos"** (`AppNavigator.tsx:565-576`): los `StyleSheet.create` a
  nivel de módulo "hornean" `colors` en el tema claro. Se sustituye por un
  `Proxy` que reconstruye el StyleSheet cuando `themeRef.version` cambia. Es
  un truco, pero es el que hace que el modo oscuro funcione sin suscribir 16
  pantallas a un contexto.
- **Los `toast`/`diálogos`/`tour`/`legales`** se montan **una sola vez** aquí,
  no en cada pantalla (comentario en `:485-487`: "los 83 `Alert.alert` que había
  eran 83 diálogos distintos").

### 4.4 `src/api/`

Ver §8 (API). `endpoints.ts` son 333 líneas puras de catálogo, sin lógica.

### 4.5 `src/config/` — tokens y reglas puras

Están dos cosas distintas en la misma carpeta, y la distinción es deliberada:

**a) Tokens de diseño** (`theme.ts`): colores, tipografía, espaciado, radios,
sombras. Ver §7.

**b) Reglas de negocio puras, sin React ni red** — todas con tests:

| Fichero | Qué resuelve |
|---|---|
| `roles.ts` | Matriz de roles, métodos de pago, monedas, categorías, unidades |
| `locationResolution.ts` | Cuál es "mi caja": turno abierto > almacén > única asignada > recordada/primera |
| `cierreDinero.ts` |esperado/descuadre por moneda, qué se envía, qué se considera cero |
| `tolerancia.ts` | Reglas de la tolerancia de descuadre (porcentaje vs absoluto) |
| `movimientoDinero.ts` | Validación de entradas/salidas de dinero y quién puede aprobar |
| `ventanaCierre.ts` | Horas que quedan para explicar un descuadre (`number \| false \| null`) |
| `mergeSales.ts` | Fusión servidor + cola local (gana la local) |
| `conectividad.ts` | Reglas de las dos señales de red |
| `useLayoutMode.ts` | Cortes de ancho y rejillas |
| `legalContent.ts` | Markdown de privacidad y términos |

> **Por qué son ficheros aparte y no ternarios dentro de componentes:** con los
> gates metidos en una función, un test lee el *resultado* y no la *regla* — que
> es exactamente como un gate de seguridad desaparece en silencio. Y con
> `resolveOwn` reimplementado dentro del POS, el teléfono y el backend
> discreparían. La regla está escrita una vez y tiene test.

### 4.6 `src/components/`

| Componente | Qué es |
|---|---|
| `UI.tsx` | Primitivas 1:1 con `web/src/components/shared/primitives`: `Inp`, `Sel`, `Btn`, `Field`, `Badge`, `AppModal`, `Toast`/`showToast`/`ToastHost`, `OfflineBanner`, `StatCard`, `SectionCard`, `PageHeader`, `ErrorBanner`, `EmptyState`, `Spinner`, `SectionHeader`, `Skeleton`, `SkeletonText`, `SkeletonRows` |
| `Icon.tsx` | 43 iconos SVG (paths portados de la web) con `react-native-svg`. Sin emoji |
| `dialogs.tsx` | `showAlert` / `showConfirm` / `showError` imperativos + `DialogHost`. Sustituyen a `Alert.alert` |
| `Recarga.tsx` | El patrón de recarga. Ver §6 |
| `DineroCierre.tsx` | Conteo de dinero del cierre, por moneda, con el esperado a la vista |
| `ClosingResolve.tsx` | Explicar un descuadre **de dinero** (resuelve) vs anotar una línea de mercancía (no resuelve) |
| `ShiftSheet.tsx` | Abrir turno: elegir caja + conteo de apertura |
| `CerrarTurnoSheet.tsx` | Cerrar turno: conteo de cierre, manda a `/shift/end` |
| `CajaSettings.tsx` | Tolerancia de descuadre de **esta** caja (sin filtro de admin) |
| `SalesAreaChart.tsx` | Gráfico de área SVG con degradado, clone del de la web |
| `PlanModal.tsx` | Plan actual, suscripción, Qvapay, cancelar |
| `LegalModal.tsx` | Render de markdown legal (parser propio, sin librerías) |
| `WelcomeTour.tsx` | Tour de bienvenida de 5 pasos, recuerda en AsyncStorage |

### 4.7 `src/context/`

- **`AuthContext.tsx`**: restaura la sesión del almacenamiento local *sin*
  esperar al servidor; revalida en segundo plano al arrancar y al volver a
  primer plano; solo cierra la sesión si el **servidor** la rechaza.
- **`SyncContext.tsx`**: pendientes/conflictos y disparo del sync en 5 momentos
  (arranque con red, primer plano, reconexión, manual, y cada 5 min en
  primer plano). Expone `syncNow(manual)`.
- **`ThemeContext.tsx`**: preferencia persistida; al cambiar reasigna los
  tokens de `colors` y bumpea `version`.

### 4.8 `src/offline/`

Equivalente RN del `offlineDB.ts` de la web (IndexedDB → AsyncStorage con
snapshot JSON por colección y **escritor serializado** por cola de promesas).

| Fichero | Qué hace |
|---|---|
| `offlineStore.ts` | Store completo (638 líneas): colecciones, cola de ventas, caché |
| `namespace.ts` | Todo lo offline vive bajo `companyId + userId + locationId` |
| `syncManager.ts` | `POST /sales/sync`, los 3 invariantes (§10) |
| `localStock.ts` | `localStock = stock − pendingQty`; puede ser negativo en ventas |
| `syncCycle.ts` | La condición de la pasada periódica (5 min) |
| `warmCache.ts` | Baja **todas** las colecciones al entrar, sin visitar pantallas |

---

## 5. Navegación — la barra, sus 5 destinos y el modo Configuración

### 5.1 La barra solo admite 5

```ts
const PREFERIDAS_BARRA = ['dashboard', 'pos', 'inventario', 'cierre', 'facturacion'];
const MAX_TABS = PREFERIDAS_BARRA.length;   // 5
```

El porqué está escrito en `AppNavigator.tsx:37-49`: un admin tiene 7 módulos y
7 iconos en una barra de 64px — se leen regular y, sobre todo, **no se
distinguen entre sí**. Cinco es el número en el que cada uno todavía se
reconoce de un vistazo, que es lo que hace una barra. El orden **no** es el de
`NAV_ITEMS`: es por frecuencia de uso; Punto de Venta va segundo solo porque
Dashboard es la puerta de entrada.

El algoritmo es: filtrar `NAV_ITEMS` por permisos → ordenar por
`PREFERIDAS_BARRA.indexOf` (los que no están, al final; `sort` de JS es
estable, así que dentro de cada grupo se conserva el orden de `NAV_ITEMS`) →
`slice(0, MAX_TABS)`. Los que sobran van al menú de perfil, en el mismo orden.

**Resultado real por rol** (ejecutando el algoritmo, no estimado):

| Rol | Barra | Al menú de perfil |
|---|---|---|
| `admin` | Dashboard · Punto de Venta · Inventario · Cierre de Caja · Facturas | Contabilidad, Envíos |
| `cajero` | Dashboard · Punto de Venta · Cierre de Caja · Facturas · Envíos | — |
| `almacenista` | Dashboard · Punto de Venta · Inventario · Cierre de Caja · Envíos | — |
| `contador` | Dashboard · Contabilidad | — |

O sea: **el recorte de 5 solo muerde al admin**, que es el único rol con los
7 módulos. Los otros tres entran enteros. Añadir un módulo nuevo a `NAV_ITEMS`
no rompe nada hasta que lo tiene admin.

> Nota: **la clave de ruta es el `label` en español** (`<Tab.Screen
> name={t.label} />`, `AppNavigator.tsx:441`). Cambiar un label renombra la
> ruta y rompe la navegación por `navigation.navigate(label)` del menú.

### 5.2 ⚠️ LA TRAMPA: ocultar una pestaña no la quita

En `@react-navigation/bottom-tabs`, **`tabBarButton: () => null` NO libera la
casilla**.

Lo que hace es vaciar lo que se **dibuja**. El `View` exterior que envuelve
cada pestaña sigue ahí, y ese View es `flex: 1` (`bottomItem`). Es decir: la
casilla fantasma sigue ocupando su parte del ancho, invisible pero
**hambrienta**.

Cómo se nota: con 9 rutas registradas y 5 visibles, 4 casillas fantasma se
comían el 44% de la barra y los cinco iconos que sí se veían quedaban
apretados a la izquierda, con media pantalla vacía a la derecha.

Por eso las ocultas llevan **las dos cosas**:

```tsx
options={{
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' },   // ← esto sí saca la casilla
}}
```

Está aplicado en `AppNavigator.tsx:471` (desbordados) y `:479` (pantallas de
menú), y también en la rama `visibleEnBarra(...) === false` de `screenOptions`
(`:415-418`), que es lo que hace el intercambio barra-módulos del §5.3.

El mismo comentario advierte de lo que **no** hay que hacer: nada de `flex`
en `tabBarStyle` ni en `tabBarIconStyle`, porque React Navigation ya reparte el
ancho (`bottomItem` es `flex: 1`). El `flex: 1` que una vez se coló en
`tabBarIconStyle` estiraba el icono verticalmente y empujaba la etiqueta hacia
abajo.

> Si alguna vez se ven cuatro huecos en la barra, el primer sitio donde mirar
> es si falta el `display: 'none'`.

### 5.3 Configuración es un MODO del navegador, no un modal

**Antes**: `ConfiguracionScreen` era un `Modal` colgado **fuera** del
`NavigationContainer`, con sus propias 7 pestañas. **Ahora**: no existe
`ConfiguracionScreen`; `ConfigGrupo.tsx` (creado en `93927d3`) son rutas del
**mismo** `Tab.Navigator`.

Hay **una** barra que se vacía y se rellena:

```ts
const esGrupo   = (name) => name.startsWith('config:');
const esModulo  = (name) => tabs.some(t => t.label === name)
                          || desbordados.some(t => t.label === name);
const visibleEnBarra = (name) => configOpen ? esGrupo(name) : esModulo(name);
```

Y en la cabecera, la marca `CubaGest` se sustituye **en el sitio** por una
chevron `‹` que devuelve a los módulos (no se añade una pieza más).

`abrirConfig(grupoId?)` no se limita a poner `configOpen`: **salta a un grupo a
propósito**. Sin eso, la pantalla actual es un módulo, los módulos quedan
ocultos en modo configuración y el usuario acaba mirando el último módulo con
la barra de ajustes encima. `null` significa "abre en la primera pestaña
visible para este rol".

### 5.4 Los 5 grupos (y por qué el gate va por PARTE)

| Grupo | Icono | Partes | Gate de cada parte |
|---|---|---|---|
| **Cajas y cierres** | `pos` | Cajas | `roles: ['admin']` |
| | | Cierre | *(ninguno)* |
| **Monedas y tasas** | `contabilidad` | Monedas | `roles: ['admin']` |
| **Descuentos** | `gift` | Descuentos | `roles: ['admin']` |
| **Usuarios y auditoría** | `usuarios` | Usuarios | `roles: ['admin']` |
| | | Auditoría | `perms: ['auditoria']` |
| **Mi plan** | `facturacion` | Mi plan | *(ninguno)* |

- Los grupos de **dos partes** llevan un interruptor arriba
  (`ConfigGrupo.tsx:168-186`) para cambiar sin volver a la barra.
- **El gate va por PARTE y no por grupo, a propósito**: "Usuarios" es de admin
  y "Auditoría" no. Metidas en el mismo grupo, las dos siguen teniendo que
  distinguirse — un cajero con permiso de auditoría ve el grupo **con su parte
  dentro**, no un grupo entero que no puede abrir.
- Un grupo al que le quedan **todas** las partes cerradas desaparece de la
  barra: aparecer en una barra una opción que no lleva a ningún sitio es peor
  que no aparecer (`visiblesPara`, `ConfigGrupo.tsx:137-141`).
- `ConfigGrupo` vuelve a filtrar por si acaso, aunque el grupo ya llegue
  filtrado: si el usuario pierde el rol con la pantalla montada, la parte
  elegida podría quedar cerrada y se pintaría un panel en blanco.

Qué ve cada rol:

| Rol | Grupos visibles |
|---|---|
| `admin` | los 5, con las dos partes en Cajas y Acceso |
| `cajero` / `almacenista` / `contador` | **Cajas y cierres** (solo la parte "Cierre") y **Mi plan** |

> `Cierre` es la parte **sin gate**, y es a propósito: `PUT /settings` (que es
> quien guarda `cashToleranceMode` / `cashToleranceValue`) **no** lleva
> `requireRole`, mientras que `POST /locations` y
> `PUT /shift/assignments/:userId` sí. Juntas en una pantalla de admin, un
> cajero se queda sin dónde fijar la tolerancia de **su** caja, que es el dato
> que más le afecta. De ahí que `CajaSettings` sea un componente aparte de
> `CajasAdminScreen`, y que un test prohíbe que `CajasAdminScreen` mencione
> `cashTolerance` o `SettingsAPI`.

### 5.5 El header unificado

**Antes** eran dos cosas apiladas: el `TrialBanner` dentro de un
`SafeAreaView` **fuera** del `NavigationContainer`, y el header de React
Navigation debajo. Cada una aplicaba su propio margen de seguridad → **el
notch del iPhone se contaba DOS veces** y la marca quedaba empujada muy abajo,
casi fuera de pantalla.

**Ahora**: un solo `header: () => …` con **un** `SafeAreaView edges={['top']}`
(`AppNavigator.tsx:347-382`): fila de marca + perfil arriba, banner de prueba
debajo. El orden también es el que tiene sentido — primero la marca y el
perfil (donde está "Cerrar sesión"), debajo el aviso de la prueba, que es
información y no navegación.

### 5.6 Menú de perfil

Modal con: nombre, email, badge de rol → **Configuración** → módulos
desbordados → Entradas y Salidas (si `cierre` o `contabilidad`) → tour →
modo claro/oscuro → divider → política de privacidad → términos → divider →
cerrar sesión (con confirmación: "Se cerrará el turno abierto").

Los módulos que no cabían van **justo después** de Configuración y **antes**
de Entradas y Salidas: son módulos de trabajo, y dejarlos debajo del tour y
del modo oscuro los escondería entre los ajustes.

> ⚠️ `menuScreens` (`AppNavigator.tsx:283-292`) es **código muerto**: filtra
> `MENU_SCREENS` comprobando `t.key === 'usuarios'`, `'descuentos'`,
> `'monedas'`, `'auditoria'` y `'cajas'`, y `MENU_SCREENS` solo contiene
> `movimientos`. Solo sobrevive la línea de `movimientos`. No confundir con
> los grupos de Configuración, que son otra cosa.

---

## 6. El patrón de recarga (`src/components/Recarga.tsx`)

Este fichero son 38 líneas y explica uno de los bugs más caros del repo.

### 6.1 Por qué dos componentes

```tsx
export function RecargaAlMontar({ fn }) {
  useEffect(() => { fn(); }, [fn]);
  return null;
}

export function RecargaAlEnfocar({ fn }) {
  useFocusEffect(useCallback(() => { fn(); }, [fn]));
  return null;
}
```

`useFocusEffect` **exige un `NavigationContainer` encima**; sin él lanza:

```
Couldn't find a navigation object. Is your component inside NavigationContainer?
```

Históricamente, `ConfiguracionScreen` era un `Modal` colgado **fuera** del
`NavigationContainer`, y las pantallas embebidas dentro de él (Cajas, Usuarios,
Monedas, Descuentos, Auditoría y luego `CajaSettings`) llamaban a
`useFocusEffect`: **las seis reventaban al abrirlas**.

El arreglo **no puede** ser "si estoy embebido, no llamo al hook": los hooks no
se pueden condicionar, y saltarse la llamada cambia el número de hooks entre
renders. Por eso el hook vive en un **hijo** que se monta o no, y el padre
elige el hijo. En `Recarga.tsx` no hay ningún hook, así que cambiar de rama no
puede romper nada.

### 6.2 El error trampa: un bloque no es JSX

La versión anterior estaba escrita así, **en el cuerpo del componente, antes
del `return`**:

```tsx
{embedded ? <RecargaAlMontar fn={cargar} /> : <RecargaAlEnfocar fn={cargar} />}
// ^^^^^^^^^^ esto es un BLOQUE, no JSX
```

Eso **construye el elemento y lo tira**. No se monta nada. No hay excepción, no
hay warning, no hay nada. `RecargaAlMontar` nunca se montaba → `load()` nunca
se llamaba → y como las pantallas arrancan con `loading = true`, **el esqueleto
se quedaba para siempre**. Cinco pantallas —Cajas, Cierre de caja, Monedas,
Usuarios y Auditoría— se quedaban en blanco sin decir por qué.

El elemento tiene que ir **dentro del JSX que se pinta**. Hoy se hace así:

```tsx
const recarga = embedded
  ? <RecargaAlMontar fn={cargar} />
  : <RecargaAlEnfocar fn={cargar} />;

if (loading) return <View style={styles.wrap}>{recarga}<Spinner /></View>;
return (
  <View style={styles.wrap}>
    {recarga}
    …
```

Y en `CajaSettings` la variable se monta en **las dos ramas**, con su comentario
(`CajaSettings.tsx:82-90`): *"El `return` de carga tiene que montar la recarga
también. Si se deja solo en la rama de abajo, nunca monta: en el primer render
`loading` es true, así que se va por aquí, y el hijo que dispara la carga vive
en una rama que no se llega a pintar."*

### 6.3 Estado actual: la mitad del patrón ya no se ejercita

Las siete pantallas con prop `embedded` (`CajasAdminScreen`, `CajaSettings`,
`MonedasScreen`, `DiscountsScreen`, `UsuariosScreen`, `AuditoriaScreen` y
`PlanModal`) se montan **siempre** con `embedded` desde `ConfigGrupo.tsx`, y
todas viven ya **dentro** del `NavigationContainer`. Comprobado con grep: no
hay ni un solo uso no-embebido.

Consecuencias:

1. En la práctica esas pantallas usan siempre `RecargaAlMontar`.
2. `RecargaAlEnfocar` sigue siendo **el camino correcto** para cualquier
   pantalla que viva suelta en el navegador. Hoy lo usan directamente
   `useFocusEffect`: `DashboardScreen`, `POSScreen`, `FacturacionScreen`,
   `InventarioScreen`, `CierreCajaScreen`, `ContabilidadScreen`,
   `TransferenciasScreen` y `MovimientosDineroScreen`.
3. El comentario de cabecera de `Recarga.tsx` (`:3-14`) sigue describiendo el
   `ConfiguracionScreen` modal, que **ya no existe**. El componente sigue
   siendo correcto; su explicación histórica ya no. No lo tomes como
   descripción del estado actual.
4. Todas las ramas `!embedded && …` (títulos de pantalla, botones "atrás") son
   **inalcanzables** por ahora. No las borres sin quitar también la prop.

---

## 7. Sistema de diseño

Todo vive en `src/config/theme.ts` (344 líneas) y en `src/components/UI.tsx`.
La regla de uso está en la cabecera del theme:

> Fondos, textos y bordes **siempre** vía `colors.*`, nunca hex suelto. Blanco
> sobre color de marca sí puede ser `'#fff'` literal: es texto sobre un fondo
> siempre saturado.

Hay un test (`noInlineColors.test.ts`) que recorre `src/` y falla si aparece
un color inline fuera de la lista de excepciones.

### 7.1 Color

- Marca: `BRAND = #048afb` (el Brand Kit oficial), `BRAND_DARK = #026ace`,
  `BRAND_LIGHT = #47a9ff`.
- `NAVY = #0B1220`: fondo del login y del header, **fijo en los dos temas**.
- Paletas completas `light` y `dark` con superficies (`bg`, `bgCard`,
  `bgSecondary`), bordes, inputs, textos (`text`, `textSecondary`,
  `textMuted`), acentos (`success`, `warning`, `danger`), **tonos de texto para
  escribir encima** (`successText`, `warningText`, `dangerText`, `primaryText`,
  `infoText` — los acentos están elegidos como *relleno*, y puestos como texto
  sobre blanco el naranja mediría 2.8:1) y los tonos de la banda de
  sincronización (`syncOk`, `syncBusy`, `syncWarn`, `syncError`).
- El tema oscuro usa `rgba()` para fondos translúcidos; el claro, hex.

**Excepción deliberada (documentada en `theme.ts:100-127`, no la "arregles"):**
los cuatro acentos del oscuro **no** son los de la web. La web no re-declara
`--brand`, `--color-ok`, `--color-warn` ni `--color-bad` en `.dark`, así que
mantiene los valores de claro. El móvil usa otros cuatro, y el motivo está
medido en el propio fichero:

| Color | Sobre `#101A2C` (card oscura) | El valor oscuro |
|---|---|---|
| `#10b981` verde | 6.7:1 | `#34d399` → 9.4:1 |
| `#f97316` naranja | 6.1:1 | `#fb923c` → 8.5:1 |
| `#dc2626` rojo | **3.0:1** | `#f87171` → 6.3:1 |

WCAG pide 4.5:1 para texto normal. Igualar el rojo a la web dejaría el botón
de borrar como lo menos legible de la app, en el tema que el dueño eligió para
trabajar de noche. *"La paridad que importa no es el mismo número, es la misma
decisión de diseño tomada por el mismo motivo."*

- **`colors` es un objeto vivo**: `ThemeContext` hace `Object.assign(colors, …)`
  al cambiar de tema, para que los `StyleSheet.create` hechos al importar el
  módulo sigan vivos. Por eso `roles.ts` lleva los colores de rol en **hex** y
  no en `colors.*` (los roles se evalúan al importar, antes de que
  `applyTheme` rellene) — y por eso tienen que ser hex de 6: `Badge` deriva el
  tinte con `color + '20'`.
- `themeRef.version` es la versión global de tema: quien la mire (el Proxy de
  estilos del navigator, `SalesAreaChart`) reconstruye.

### 7.2 Espaciado

```
xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32      (`spacing`, alias `space`)
```

`space` no es un alias tonto: el plan de diseño pedía claves **numéricas**
(`space.1`…`space.6`) y en JavaScript eso obliga a `space['3']` en los veinte
usos. Un token que se escribe con corchetes en todas partes es peor que uno
con palabra. **Los valores no se tocan**: cambiarlos reestiliza veinte sitios
sin poder ver la app.

### 7.3 Tipografía

14 pasos con nombre de **papel**, no de número:

```
2xs 10 · xs 11 · sm 12 · base 13 · md 14 · lg 15 · xl 16
title 17 · section 18 · 2xl 20 · display 22 · 3xl 24 · hero 28
```

`md` (14) es el tamaño de las primitivas de la web, y por eso los inputs y
botones están ahí: es donde la paridad se puede medir en vez de suponer. Antes
había quince tamaños distintos, once con decimales; medio punto no se ve, pero
sí se nota que dos pantallas se ven distintas.

`fontSize` es alias de `type` para lo que ya se leía así.

### 7.4 Radios

```
xs 8 · sm 10 · md 12 · lg 14 · xl 16 · 2xl 18 · 3xl 20 · pill 9999 (alias full)
```

El plan pedía `sm:8, md:10, lg:12, xl:16` y **no** se aplicó: la escalera que
usa la app es de dos en dos y 49 de sus radios estaban escritos a mano porque
el token no tenía nombre para tres de los siete escalones. Lo que queda fuera
de la escalera no es descuido: son círculos (un punto de 22×22 lleva radio 11,
un avatar de 36×36 lleva 18), y bajarlo "lo deja en escala" solo convirtiéndolo
en un cuadrado redondeado, que se lee como otra cosa. `escalas.test.ts`
comprueba la **relación** (radio = lado ÷ 2) en vez del valor.

### 7.5 Sombras

`shadow.sm` (elevation 2), `.md` (4), `.lg` (8) con `#0F172A`; más `card3d`
(elevation 12, `radius 36`) para la tarjeta blanca del login.

### 7.6 Layout por ancho (`useLayoutMode.ts`)

Dos cortes, no los siete de la web (que es una rejilla de escritorio):

- **860** — copiado literal de la media query de la web
  (`Configuracion.tsx`), donde las pestañas pasan a lateral. *"Se copia tal
  cual, no redondeado: si el número se documentara distinto del de la web, la
  paridad sería una casualidad y no una decisión."*
- **1024** — el punto en que la barra inferior se convertiría en barra lateral.
  No viene de una media query de contenido: es el ancho a partir del cual un
  dedo alcanza cómodamente la columna de la izquierda con el teléfono en la
  otra mano. Por debajo, una barra lateral obliga a estirar el brazo.

Entre 860 y 1024 se aplica `tablet`. Motivo real de que el módulo exista: *la
pantalla de cierre en una tablet es un formulario de dinero*; a 360px la misma
tabla obliga a scroll lateral para leer una cifra, y una cifra que hay que ir a
buscar es una que no se comprueba.

### 7.7 Iconos

`components/Icon.tsx`: **43 iconos SVG** con los mismos paths que la web
(stroke 2, cap/join round) vía `react-native-svg`. El tipo es un **union**, no
`IconName | string` — la unión ancha anula el chequeo de tipos, que es lo que
dejó pasar nueve estados vacíos con un emoji en vez de un icono. `noEmoji.test.ts`
vigila que no vuelva a colarse un emoji como interfaz.

---

## 8. Cliente HTTP y endpoints

### 8.1 `client.ts` — un solo camino de salida

`apiFetch<T>(path, opts)`. Lo único "inteligente" es el **401**:

| Situación | Qué hace |
|---|---|
| 401 y el refresh lo acepta el **servidor** | Renueva y reintenta la petición original **una** vez |
| 401 y el refresh es imposible por **RED** | **NO** cierra la sesión: lanza `OFFLINE_MESSAGE` para que la pantalla caiga a su caché |
| 401 y el refresh no existe / 5xx | Mismo tratamiento: la sesión sigue abierta |
| 401 en el refresh (revocación real) | `clearSession()` + `emitSessionExpired()` |

Esas reglas están en `session.ts`, que además garantiza:

- **Un solo refresh en vuelo** para toda la app (`inflightRefresh`): varias
  pantallas pueden recibir 401 a la vez y no queremos una avalancha.
- El mensaje **real** del servidor llega siempre a la UI (antes el 401 del
  login caía en "sesión expirada").
- La sesión **nunca se cierra sola**. Un token vencido no expulsa al usuario.
- `logout` borra primero el estado local y luego revoca en segundo plano: el
  botón nunca se queda colgado esperando a un servidor inalcanzable.

### 8.2 `endpoints.ts` — el catálogo

Organizado por **cliente de dominio**, no por pantalla. Los comentarios
declaran el contrato verificado contra el backend.

| Cliente | Endpoints |
|---|---|
| `AuthAPI` | `/auth/login`, `/auth/me`, `/auth/register`, `/auth/forgot-password` |
| `PlanAPI` | `/subscription` (raíz, **no** `/plan`) |
| `SubscriptionAPI` | `/subscription/status`, `/subscription/authorize`, `/subscription/cancel` |
| `LocationsAPI` | `/locations`, `/locations/:id/stock`, `/locations/assignables`, `POST /locations`, `/locations/:id/adjust` |
| `DashboardAPI` | `/dashboard/summary`, `/dashboard/analytics?days=N` |
| `SettingsAPI` | `GET /settings`, `PUT /settings` (monedas, tasas, tolerancia) |
| `DiscountsAPI` | `/discounts` CRUD |
| `ReferralsAPI` | `/referrals` |
| `ProductsAPI` | `/products` CRUD + `/products/:id/reactivate` |
| `SalesAPI` | `/sales` listar/crear/actualizar, `/sales/:id/void`, `/sales/sync` |
| `AccountingAPI` | `/accounting/summary`, `/accounting/income` |
| `ExpensesAPI` | `/accounting/expenses` listar/crear/borrar |
| `UsersAPI` | `/users` CRUD + `/users/:id/resend-set-password` |
| `ClosingAPI` | `/closing`, `/closing/:id`, `/closing/readings`, `/closing/chain/:locationId`, `/closing/preview/:id`, `/closing/confirm`, `/closing/:id/explain`, `/closing/:id/note` |
| `ShiftAPI` | `/shift/current`, `/shift/start`, `/shift/end`, `/shift/assignments/:userId` (GET y PUT) |
| `TransfersAPI` | `/transfers`, `/:id/approve`, `/:id/reject`, `/:id/cancel` |
| `AuditAPI` | `/audit` |
| `CashMovementsAPI` | `/cash-movements`, `/:id/decide` |

Puntos donde el móvil ya no puede con el backend sin saberlo:

- El ajuste de stock usa `POST /locations/:id/adjust`. El viejo
  `POST /products/:id/adjust-stock` **ya no existe**: la app lo llamaba y **el
  ajuste de stock desde el móvil fallaba siempre**.
- `GET /auth/me` devuelve `{ ok, user }`, sin clave `data`: hay que extraer
  `.user` a mano o `user.role` queda `undefined` y la app arranca con **0
  pestañas**.
- El alta de usuario **no lleva contraseña**; devuelve `setPasswordUrl` y
  `emailSent`.
- `POST /sales` y `/sales/sync` exigen `clientSaleId` (UUID del dispositivo) y
  `locationId`.
- `PUT /shift/assignments/:userId` es **reemplazo total**, no un toggle.
- El registro del backend devuelve un único `token` (sin `refreshToken`); el
  cliente acepta ambos nombres.

---

## 9. Pantallas

Cada una es una línea: qué sirve. `src/screens/`.

| Pantalla | Para qué |
|---|---|
| `LoginScreen.tsx` | Acceso con el fondo navy y el hero difuminado, tarjeta 3D, recuperación de contraseña y acceso al registro |
| `RegisterScreen.tsx` | Alta de empresa con trial de 30 días vía `POST /auth/register`, con código de referido |
| `DashboardScreen.tsx` | Resumen del negocio (ventas de hoy, etc.) + gráfico de área con rangos 7d/30d/90d/180d; funciona con caché sin red |
| `POSScreen.tsx` | Punto de venta: catálogo de **su** caja, carrito, cobro mixto, descuentos, turno, y **cola offline** con folio `LOCAL-XXXX` |
| `FacturacionScreen.tsx` | Facturas: lista, anular, CSV, y **fusión servidor + cola local**; botón "Sincronizar ahora" |
| `InventarioScreen.tsx` | Productos con stock **por ubicación**, alta/edición, ajuste de stock y envío a CSV |
| `CierreCajaScreen.tsx` | El cierre, en 4 vistas (`list` → `selectReading` → `validate` → `detail`): lista, lectura de apertura, validación de stock + dinero, y detalle con pendientes |
| `ContabilidadScreen.tsx` | Resumen contable, libro de ingresos y egresos con método de pago |
| `TransferenciasScreen.tsx` | Envíos entre ubicaciones: crear, aprobar, rechazar con motivo, cancelar; tabs pendientes/todos |
| `MovimientosDineroScreen.tsx` | Entradas y salidas de dinero de la caja, con la cola de aprobación del admin/contador |
| `CajasAdminScreen.tsx` | Crear cajas y repartir cajas entre cajeros (solo admin) |
| `MonedasScreen.tsx` | Monedas del negocio y tasa de cambio manual o vía eLToque (solo admin) |
| `DiscountsScreen.tsx` | Descuentos por venta o producto, en porcentaje o fijos (solo admin) |
| `UsuariosScreen.tsx` | Alta (por link de activación), edición de nombre/rol, reenvío del link y borrado |
| `AuditoriaScreen.tsx` | Registro de actividad con filtros por entidad y acciones con etiqueta legible |
| `ConfigGrupo.tsx` | **Un** grupo de Configuración con su interruptor de partes; es también el adaptador de ruta del navegador |

Componentes que hacen de pantalla pero viven en `components/`:

| Componente | Para qué |
|---|---|
| `CajaSettings.tsx` | Tolerancia de descuadre de **esta** caja. Sin filtro de rol, a propósito (§5.4) |
| `PlanModal.tsx` | Plan, suscripción, pago con Qvapay y cancelación |

---

## 10. Modo offline

La app es **offline-first**, no "tolerante a cortes". Las operaciones quedan
separadas por empresa, usuario y ubicación, conservan su hora de negocio y llevan
un identificador para que reintentar no duplique ventas ni movimientos.

- **Vender sin red** guarda la venta en la cola local con folio temporal
  (`LOCAL-0001`, …), descuenta el stock local y avisa con la franja "MODO
  OFFLINE" (color `colors.syncBusy`; el README anterior la llamaba *morada* y
  es azul petróleo).
- **`localStock = stockDelServidor − pendienteDeEsteDispositivo`**
  (`offline/localStock.ts`). Para ventas se permite que el resultado sea cero o
  negativo: el cajero puede tener mercancía que todavía no aparece en el sistema
  porque el traspaso o entrada física no se ha sincronizado. El negativo queda
  visible para que el conteo y el recálculo lo resuelvan; no habilita enviar
  mercancía inexistente en un traspaso.
- **Sincronización** (`POST /sales/sync`) en cinco momentos: arranque con
  internet, volver a primer plano, reconexión de red, acción manual y cada 5
  minutos con la app en primer plano.
- **Idempotencia**: cada venta viaja con `clientSaleId` (UUID del dispositivo,
  `utils/uuid.ts`) y `locationId` inmutable. Un reintento devuelve la factura
  original en vez de duplicar.
- **Los tres invariantes** de `syncManager` (y sus tests): resultado ausente o
  de forma desconocida ⇒ la venta vuelve a `pending` y **no** se restaura el
  stock; solo un conflicto **explícito** (`status:'conflict'`) restaura el
  stock.
- **Las ventas en `syncing`** de una app muerta se reparan solas al arrancar.
- **Namespace**: todo lo offline vive bajo `companyId + userId + locationId`
  (`offline/namespace.ts`), así que dos cuentas en el mismo teléfono nunca
  mezclan datos ni se los reenvían. Sobrevive al logout — es la decisión de
  producto "cada usuario tiene su dispositivo personal".
- **Warm cache** (`offline/warmCache.ts`): al entrar se baja **todo** de una
  vez. Antes la caché nacía de rebote y un cajero que perdía la conexión a los
  dos minutos tenía el POS vacío.
- **Carrito y operaciones**: el carrito pendiente se conserva localmente; también
  se encolan aperturas/cierres, lecturas, traspasos, retiros y gastos. La cola se
  ordena por fecha de negocio y una operación en conflicto frena las posteriores
  hasta que se resuelva, sin borrar el trabajo pendiente.
- **Pago mixto y descuentos**: una factura puede combinar métodos y monedas. La
  tasa automática cacheada se recomienda primero cuando esté activada, con opción
  de tasa manual por venta; el detalle aplicado se conserva. Un descuento cuyo
  máximo se exceda por ventas offline no invalida esas ventas: al sincronizar se
  registra el uso y se desactiva para ventas posteriores.
- **Anulación y traspaso**: anular una factura devuelve el inventario en la fecha
  original de la venta para que el recálculo corrija las fotos históricas; no
  aumenta directamente el stock presente. Un traspaso aprobado se contabiliza
  desde su hora de creación, guarda aparte la aprobación y, si se rechaza, no
  genera movimiento.
- **Avisos**: la campanita muestra la bandeja interna y sus estados. El push del
  sistema móvil necesita un identificador de proyecto EAS y credenciales de
  Apple/Google configurados para el lanzamiento; la bandeja interna no depende
  de esa configuración.
- **Conectividad = dos señales** (`config/conectividad.ts`): NetInfo (avisa de
  la antena) **y** una sonda al servidor (detecta el wifi que se asocia y no
  lleva a ningún sitio — el caso real del negocio). La sonda es `fetch` **crudo**
  a propósito: `apiFetch` traduce cualquier fallo de red (y algún 403) a
  `OFFLINE_MESSAGE`, así que usarlo sería medir dos cosas a la vez.

**Cómo probarlo en 4 pasos** (sigue valiendo):

1. Inicia sesión y entra en **Punto de Venta**.
2. Activa el **modo avión**.
3. Vende: verás la franja "MODO OFFLINE" y la factura quedará como
   `LOCAL-XXXX`.
4. Desactiva el modo avión: la píldora del header sincroniza sola (o toca
   **⟳ Sincronizar ahora** en Facturas). Revisa después en la web.

---

## 11. Conceptos de dominio

El detalle vive en el backend. Lo mínimo para leer el móvil:

**Ubicación = caja o almacén.** `inventory_locations.type` es
`"almacen" | "caja"`. Cada empresa tiene **un** almacén central; las cajas las
crea el admin. El backend normaliza `type`: cualquier cosa que no sea
exactamente `"almacen"` se guarda como `"caja"` (sin error). El stock vive en
`location_stock` (una fila por ubicación+producto); `products.stock` es el
total de la empresa y **no** se usa para vender.

**La caja es del negocio, no del cajero.** `POST /locations` crea con
`ownerUserId: null` a propósito. El reparto se hace en `location_assignments`
(`userId` + `locationId`), que **no** impide asignar la misma caja a varias
personas — la mercancía física es una sola. Por eso `inventory_locations.ownerUserId`
está **obsoleto a propósito**: se conserva como respaldo de las cajas creadas
antes del cambio y preguntarle por él daba `false` siempre. (El comentario más
completo está en `CubaGest/src/routes/transfers.ts:50-59`.)

**Mi caja de trabajo.** Hay una regla autoritativa en el servidor
(`resolveOwnLocation`, backend) y una copia en el móvil
(`config/locationResolution.ts`, que es la de la web), con una diferencia
deliberada:

*Servidor* (`CubaGest/src/lib/locations.ts:150-179`):

1. `almacenista` → el almacén central activo.
2. `cajero` → **turno abierto** → su caja; sin turno y con **una sola** caja
   asignada → esa; con varias → `null` (tiene que abrir turno y elegir).
3. `admin` → turno abierto → su caja; sin turno → el almacén central.

*Móvil / web* (`locationResolution.ts:58-97`, copia de `POS.tsx`):

1. El **turno abierto** manda por encima de todo (se busca sobre todas las
   ubicaciones, no solo las activas: si el turno dice caja 2, esa es la caja 2).
2. El **almacén**, para el `almacenista`.
3. La **única caja asignada**, para el cajero que solo tiene una.
4. La **recordada** o la **primera disponible** (nunca una caja borrada o
   desactivada: es un id muerto), para el admin y cualquier otro rol.

La diferencia del paso 3 es explícita en el código: un cajero con **varias**
cajas y **sin turno** devuelve `null` en el móvil (como el servidor) en vez de
caer en "la primera disponible" (como hace la web). *"Si el móvil eligiera una
por su cuenta, el cajero vería un catálogo con stock de una caja, cobraría
contra ella y el servidor rechazaría la venta — o peor, la aceptaría en
otra."* Devolver `null` obliga a la pantalla a preguntar, que es lo que hace
`debePedirTurno` (misma carpeta, a propósito).

El turno manda porque la caja es del negocio y la pueden llevar varios cajeros
en distintos momentos. Si el orden cambia en un sitio, hay que cambiarlo en
los tres, o el stock se descuenta de una caja mientras se vende en otra.

**Turno** = "esta persona, en esta caja, desde esta hora". `GET /shift/current`
devuelve `{ shift, assignedCajas, aviso }` — **`assignedCajas`, no `cajas`**:
si el cliente lee `cajas`, la lista sale vacía sin error, `debePedirTurno` ve
cero cajas, nunca pregunta, y el cajero vende desde la primera de la lista. El
síntoma aparece semanas después como "el cierre no cuadra nunca". Hay un test
de contrato para exactamente eso.

`baseCash` (el fondo con el que se abrió el turno) existe porque *"sin esto no
hay forma de saber si un faltante es de este turno o venía de antes"*.

**Lectura de apertura y de cierre.** Una "foto" de la caja en un instante, con
los productos contados. `POST /shift/start` y `POST /closing/readings` crean la
de apertura. El campo `items` es lo que la convierte en un conteo de verdad: sin
él, el backend copia el stock actual y no se cuenta nada (comportamiento viejo
que se conserva por compatibilidad). Con `items` es **obligatorio pasar por
ahí pero libre de rellenarlo**: se puede aceptar tal cual, y eso es firma, no
error. `businessAt` es la hora **en la que se cuenta**, no la de ahora.

**Cadena de conciliación.** `GET /closing/chain/:locationId` compara cada foto
con su vecina **inmediata** anterior. Si falta un eslabón, solo difiere **su**
comparación entrante; el resto de la cadena sigue viva. Una caja sin ninguna
foto previa no "le falta" un eslabón: la cadena empieza ahí. Los pares se
guardan en `turn_reconciliations` con estado `conciliado | diferente` (el enum
tiene un tercer valor, `pendiente`, que hoy el reconciliador no escribe nunca).

**Cerrar el turno ES cerrar el periodo.** `POST /shift/end` reutiliza el
**mismo handler** que `POST /closing/confirm` (no hay dos maneras de cerrar un
período). Hace, en un solo lote: crea la lectura de cierre, inserta el cierre,
ajusta el stock por diferencia, marca `last_snapshot_at`, **cierra el turno**,
audita y concilia la cadena. Si el cierre se queda en la cola sin conexión, el
lote no corre y el turno sigue abierto — el negocio no se para.

**Esperado y descuadre** (`CubaGest/src/lib/cierreDinero.ts`):

```
esperado  = fondo del turno + ventas en efectivo + entradas − salidas
descuadre = contado − esperado
```

- **Cada moneda por separado**: 100 CUP y 2 USD se comparan por separado.
  Sumarlos daría "102" contra un total en pesos, que no significa nada.
- Solo entran ventas `emitidas`, de esa caja, del periodo, y **pagadas en
  efectivo**: una venta por transferencia no entró a la caja.
- Solo entran movimientos **`aprobada`**: los pendientes no cuentan, o el
  cierre se descuadraría por un retiro que nadie ha autorizado.
- Si **no** llega `countedCash`, el backend **no calcula descuadre**: comparar
  "contado = 0" contra 17 500 de esperado daría un faltante enorme y falso.
- Diferencias ≤ 0.005 se descartan como cero.

**Tolerancia.** `cashToleranceMode` (`porcentaje` 0–100 / `absoluto`, tope
1 000 000 000) y `cashToleranceValue`, **por empresa**. Default: absoluto 0 —
*"perdonar descuadres sin que el dueño lo haya pedido sería esconderle
dinero"*. En porcentaje aplica a todas las monedas; **en absoluto solo a la
moneda base**: un margen de 100 CUP ignora un descuadre de 5 USD. La
mercadería **no tiene margen** (`MERCANCIA_TOLERANCIA = 0.001`): *"un peso de
diferencia es ruido en una caja, y un cigarrito es una caja que alguien abrió
sin querer"*. Aun así se guardan **todas** las diferencias, no solo las
bloqueantes: *"si el dueño vale 500, un faltante de 200 sigue siendo un
faltante de 200"`.

**Provisional.** Un cierre con algo sin cuadrar queda `provisional` con
`provisionalUntil = countedAt + 20 h` (`VENTANA_PROVISIONAL_HORAS = 20`).
Pasado el plazo el backend lo cierra solo y avisa a los admins. El móvil calcula
lo que queda en `config/ventanaCierre.ts`, con una asimetría deliberada:
`null` = ya no hay ventana (no 0), `false` = el plazo ya pasó (no negativo), y
el borde exacto se devuelve como 0, no como `false`.

**Explicar ≠ anotar.** Son dos endpoints y dos tablas:

| | `POST /closing/:id/explain` | `POST /closing/:id/note` |
|---|---|---|
| Qué | Descuadre de **dinero** | Línea de **mercadería** |
| Regla | La cantidad debe coincidir **exactamente** con el descuadre (400 `AMOUNT_MISMATCH` si no) | Solo texto |
| Efecto | `provisional` → `resuelto` | Ninguno |

*"Una nota NO cuenta como explicación: es el relato de por qué faltó, no una
línea cuadrada."*

---

## 12. Cambios recientes (y por qué)

Todos en el commit `93927d3` *"Configuracion como modo del navegador, barra de
5 y arreglo de la recarga"* salvo donde se indica.

### 12.1 La barra nativa de iOS y el cristal: **probados y revertidos**

- Se instaló `react-native-bottom-tabs` (barra nativa de iOS) y `expo-blur`
  (barra "de cristal").
- **No funcionaron.** Se revirtieron **por completo** y se desinstalaron.

**El motivo concreto NO quedó registrado en el repo.** El commit `93927d3` dice
literalmente: *"La nativa de iOS y el cristal con expo-blur se han ido: la barra
vuelve a la de siempre, con `height: 64`, fondo `bgCard` y el punto azul."* Ni
el mensaje del commit, ni un comentario en el código, ni el historial explican
qué falló. Si alguien lo reintenta, **documente el motivo esta vez**.

Verificado en el estado actual: `react-native-bottom-tabs`, `expo-blur` y
cualquier rastro de `blur`/`glass` **no aparecen** ni en `package.json`, ni en
`app.json`, ni en `node_modules/`, ni en `src/`. Tampoco hay ninguna entrada en
el historial de `package.json` que los haya tenido: el intento nunca se
commitió. Es decir, la reversión fue total y no dejó ni dependencia fantasma.

> **Decisión vigente:** la barra es la de siempre, de
> `@react-navigation/bottom-tabs`, con `height: 64`, fondo sólido
> `colors.bgCard` y el puntito azul de activo. Esa es la versión que se sabe que
> funciona con los cuatro roles, con las pantallas ocultas (`display: 'none'`)
> y con Expo Go. Si la cristalina se vuelve a intentar, la decisión a
> reevaluar no es solo el aspecto: hay que rehacer cómo se ocultan las
> casillas y cómo se comporta en cada versión de iOS.

### 12.2 Configuración pasó de modal a modo del navegador

Ver §5.3 y §5.4. `screens/ConfiguracionScreen.tsx` **se borró** (185 líneas) y
apareció `screens/ConfigGrupo.tsx` (209). Los grupos son pantallas del mismo
`Tab.Navigator`, con `initialParams={{ grupo: g }}` y un adaptador
`GrupoScreen` que saca el grupo de `route.params`.

### 12.3 El límite de 5 destinos

Ver §5.1. `MAX_TABS = PREFERIDAS_BARRA.length`, con los sobrantes como
pantallas ocultas al final del registro y registrados en el menú de perfil
(necesario: si no, el menú navegaría a un nombre que el navegador no conoce).

### 12.4 El header unificado

Ver §5.5. Antes el notch se contaba dos veces.

### 12.5 El arreglo de las pantallas que no cargaban

Ver §6.2. `CajaSettings` era el sexto `useFocusEffect` dentro del modal y
abrir Configuración reventaba; y el arreglo anterior (el bloque que no es JSX)
hacía que cinco pantallas se quedaran en el esqueleto para siempre.

### 12.6 Otras cosas de esa serie

- Contadores de apertura y cierre con el **esperado al lado** (`584ceeb`,
  `98b6cf9`): el conteo va al abrir turno y al cerrarlo, y `POST /shift/end`
  reutiliza el handler del cierre.
- Warm cache y compuertas de CI (`c1758f2`).
- `.gitignore` completo: dependencias, cachés de Expo, proyectos nativos
  generados, editores, EAS y secretos (`cc6060c`).

---

## 13. Publicar

### Desarrollo
Expo Go + Metro (`npm start`), como hasta ahora.

### APK de release (la vía que ya existe)

`.github/workflows/build-android.yml`, **solo manual** (`workflow_dispatch`) —
deliberadamente: un APK tarda minutos y no se quiere uno por commit.

```
checkout → Node 24 → Java 17 → npm ci
  → npx tsc --noEmit && npx jest --ci --silent   ← compuertas: sin esto no hay APK
  → npx expo prebuild --platform android --no-install
  → ./gradlew assembleRelease
  → upload-artifact (30 días)
```

Las compuertas van **después** de `npm ci` y **antes** del prebuild a
propósito: si algo está roto, se entera en segundos y no tras minutos de
Gradle. `android/` e `ios/` están en `.gitignore`: los genera el prebuild,
`app.json` + dependencias son la fuente de verdad.

### EAS
`npx eas-cli build` sigue siendo la vía si se quiere iOS sin Mac ni tiendas.
En `app.json` ya están los identificadores (`com.cubagest.app`) y el plugin de
splash.

---

## 14. Testing

### 14.1 Cómo se ejecuta

```bash
npm test                       # jest
npx jest --ci                  # un pase, sin watch (lo que usa CI)
npx jest --ci --listTests      # 27 rutas
npx jest src/config/__tests__/configuracion.test.ts
```

**Estado verificado el 6 de octubre de 2026: 27 suites, 261 tests, 27/27 en verde.**

| Suite | Tests | Qué fija |
|---|---|---|
| `config/cierreDinero` | 22 | esperado/descuadre por moneda, `countedCashDe`, `esCero` |
| `api/session` | 20 | almacenamiento, refresh silencioso, 401, logout, `revalidateSession` |
| `config/movimientoDinero` | 13 | validación de entradas/salidas, quién aprueba |
| `config/escalas` | 13 | que todo spacing/tipo/radio venga de la escala |
| `offline/syncManager` | 14 | invariantes, orden temporal y conflicto como barrera |
| `hooks/useShift` | 12 | contrato de `assignedCajas`, respaldo sin conexión |
| `config/tolerancia` | 12 | porcentaje 0–100, absoluto con tope de 9 dígitos |
| `config/ventanaCierre` | 11 | `number \| false \| null` |
| `config/roles` | 11 | matriz de roles + contrato de users y transfers |
| `config/badge` | 11 | `danger` de `Btn` y `color + '20'` |
| `offline/localStock` | 10 | resta de ventas pendientes, admite stock negativo |
| `config/mergeSales` | 10 | la local gana al colisionar |
| `config/conectividad` | 10 | dos señales, sonda cruda |
| `config/locationResolution` | 9 | orden de resolución y `cajasParaVender` |
| `offline/namespace` | 9 | `companyId + userId + locationId` |
| `config/configuracion` | 8 | **los 7 gates de Configuración** (§14.3) |
| `offline/syncCycle` | 8 | la condición de la pasada de 5 min |
| `config/layoutMode` | 8 | cortes 860/1024, columnas, rejillas |
| `config/tokensOscuros` | 7 | tokens con la excepción de acentos |
| `config/noEmoji` | 7 | ningún emoji como interfaz |
| `offline/cacheCollections` | 6 | colecciones de lectura |
| `config/ubicacionInicial` | 6 | que una elección del usuario no se pise |
| `config/debePedirTurno` | 6 | cuándo interrumpir al cajero |
| `config/selNoModal` | 5 | `Sel` no es una ventana del sistema |
| `offline/adoptUnscoped` | 5 | no adopta datos de otra cuenta (uno de ellos usa `test()` en vez de `it()`) |
| `config/noSystemAlert` | 4 | ningún `Alert.alert` sobrevive |
| `config/noInlineColors` | 4 | ningún color suelto fuera de las excepciones |

### 14.2 Por qué el preset de Jest es `react-native` y no `jest-expo`

Está escrito en `jest.config.js`: el setup de `jest-expo` importa
`expo-modules-core`, que **no está instalado** en este checkout y no se puede
instalar sin red. Así que se usa el preset oficial de React Native
(`@react-native/jest-preset`, que sí viene) y el mismo `babel-preset-expo` del
proyecto para transpilar TS/TSX.

`jest.setup.js` mockea solo lo imprescindible: AsyncStorage (mock oficial del
paquete), NetInfo y `global.fetch` (cada test define su comportamiento).
**No hay Keychain ni red reales.**

### 14.3 El test de paridad de permisos: la técnica y su límite

`src/config/__tests__/configuracion.test.ts` protege que Configuración siga
teniendo **las mismas 7 partes con los mismos gates**.

**La técnica:** en vez de importar `GRUPOS` (o la copia de la web), el test
**lee `src/screens/ConfigGrupo.tsx` como texto** con `readFileSync`, recorta el
array `GRUPOS`, y parsea con regex cada línea que empieza por `{ id:` para
sacar `id`, `label`, `roles` y `perms`. Eso obliga a que **el formato esté
pensado para el test**: cada `sub` va en **una sola línea**, y el propio
`ConfigGrupo.tsx` avisa de que partir una en dos rompería el gate sin avisar.

```ts
const PANTALLA = readFileSync(join(__dirname, '..','..','screens','ConfigGrupo.tsx'), 'utf8');
// …ESPERADO = la tabla de 7 partes con su gate…
```

Dos reglas del `ESPERADO` son deliberadas:

- `roles: undefined` significa **SIN GATE**, que es un dato y no una ausencia:
  es justo la diferencia entre la parte de Cajas y la de Cierre de caja. Hay un
  `it` que lo fija por su nombre (*"la parte de cierre NO es de admin: es la que
  se le perdía al cajero"*).
- El test **no lee el repo web**. Compara contra una copia a mano de la tabla
  web. Verificado hoy: esa copia sigue coincidiendo con
  `CubaGest-Web/src/screens/Configuracion.tsx` en ids, orden, labels y gates.

**Las limitaciones — léelas antes de confiar en verde:**

1. **No hay paridad automática.** Si mañana cambia un gate en la web, este test
   **no se entera**: compararía el fichero móvil contra una copia que ya está
   vieja. La web lo dice al revés (`Configuracion.tsx:46-48`: *"ESTA TABLA TIENE
   QUE SEGUIR EN PARIDAD… hay un test en cada repo que compara los gates de uno
   contra los del otro"*), pero **los dos tests son locales**: cada uno compara
   contra su propia copia. El momento de romper la paridad sigue siendo humano.
2. **Es un test de texto, no de comportamiento.** Si alguien reescribe `GRUPOS`
   con una forma equivalente pero distinta sintaxis, el parser devuelve `[]` y
   el test falla… por la razón equivocada. Y un gate que pase a estar dentro de
   una función `puede()` seguiría dando verde: lo que el test ve es el
   **dato declarado**, no la regla que lo aplica.
3. Los otros `it` son de apoyo: que los grupos sean ≤ 5 (el motivo del
   agrupamiento), que no se pierda ninguna parte, que `CajasAdminScreen` no
   mencione `cashTolerance` ni `SettingsAPI`, y que cada parte monte una
   pantalla real (buscando `activa.id === '<id>'` y `not.toContain('TODO')`).

### 14.4 El estilo de los tests de este repo

Los comentarios de cabecera de estas suites son la mejor documentación de
contrato que hay. Ejemplos reales:

- `roles.test.ts`: *"Estos tests fijan lo que la app ENVÍA y lo que ESPERA del
  backend. Si el backend cambia uno de estos contratos, el test avisa en vez de
  fallar en producción con un 400/403 en la caja."*
- `useShift.test.ts`: *"El hook no se monta (no hay
  @testing-library/react-native en este repo), así que…"* — los hooks se prueban
  sobre la función pura que hay detrás, no sobre el hook.
- `syncCycle.ts`: *"El temporizador de React no se puede probar sin
  @testing-library/react-native, pero la CONDICIÓN que decide si la pasada
  ocurre sí: y es la que importa."*

---

## 15. Problemas conocidos

### 15.1 ⚠️ La barra inferior ignora el safe-area inferior

**NO está arreglado.** `tabBarStyle` tiene `height: 64` **fijo** y
`paddingBottom: 6`, y **en ningún sitio del repo se usa
`useSafeAreaInsets()`** (comprobado con grep). En iPhones con barra de inicio
por gesto, la barra del sistema invade los iconos de la barra inferior.

**Arreglo propuesto (NO aplicado, NO verificado en dispositivo):**

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

screenOptions={({ navigation, route }) => {
  const insets = useSafeAreaInsets();   // dentro de screenOptions, no fuera
  return {
    tabBarStyle: {
      backgroundColor: colors.bgCard,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      height: 64 + insets.bottom,        // ← crecer con el inset
      paddingTop: 8,
      paddingBottom: 6 + insets.bottom,   // ← y empujar los iconos
      ...shadow.sm,
    },
  };
}}
```

Notas para quien lo aplique:

- El hook tiene que ir **dentro** de `screenOptions`, que se llama como una
  función de render del navegador; si se saca al cuerpo de `AppNavigator` el
  inset no se actualiza al rotar.
- Sumar el inset **en las dos cosas**: si solo se crece el `height` sin
  `paddingBottom`, la barra queda más alta pero los iconos siguen pegados
  abajo.
- En Android con barra de 3 botones el inset suele ser 0 o pequeño, así que el
  cambio no debería notarse ahí.
- Hay que probarlo en un iPhone **con gesto** (no con botón Home): el síntoma
  solo aparece con la barra translúcida.
- `DiscountsScreen` ya usa `<SafeAreaView edges={['bottom']}>`, o sea que la
  dependencia ya está instalada y usada; solo falta en la barra.

### 15.2 `npm run lint` está roto

Falla con *"ESLint couldn't find a configuration file"*: `eslint` está en
`devDependencies` y el script existe, pero **no hay `.eslintrc*` ni
`eslint.config.js` en el repo**. O se añade una configuración, o se borra el
script — pero dejarlo es una trampa para el siguiente.

### 15.3 Versiones de release desalineadas

`package.json` y `app.json` en 1.3.0 pese al commit "v1.4.0", y
`android.versionCode` (3) / `ios.buildNumber` (1) sin relación entre sí
(§1.3).

### 15.4 Sin modo local de API

`API_BASE_URL` está fijado a producción y no hay forma de apuntar a un backend
local sin editar el fichero (§3.3).

### 15.5 La mitad del patrón `Recarga` es código inalcanzable

La rama `!embedded` de las pantallas de Configuración (las siete con la prop)
y su `RecargaAlEnfocar` no se ejecutan nunca (§6.3).

### 15.6 `menuScreens` filtra claves que no existen

`AppNavigator.tsx:283-292` comprueba `usuarios`, `descuentos`, `monedas`,
`auditoria` y `cajas` sobre un array que solo tiene `movimientos` (§5.6).

### 15.7 El comentario de `Recarga.tsx` describe un mundo que ya no existe

Su cabecera explica el fallo con `ConfiguracionScreen`, el modal que se borró
en `93927d3`. El código es correcto; la explicación ya no (§6.3.3).

### 15.8 Divergencia real de la matriz de roles con la web

`roles.ts` da al `admin` dos permisos que la web **no** tiene:
`'descuentos'` y `'monedas'` (`CubaGest-Web/src/config/constants.ts:11-16`
lista diez; el móvil lista doce). Hoy es inocuo: esas dos secciones se gatean
por `roles: ['admin']`, no por `perms`. Pero `roles.test.ts` solo comprueba que
el admin tenga "todos" (con su propia lista), no que no tenga de más.

### 15.9 Sin pruebas de render

No hay `@testing-library/react-native`. Los tests cubren lógica, contratos y
**texto de ficheros**, no la aparición de componentes. Un `tabBarButton` mal
puesto o un `{cond ? <X/> : <Y/>}` suelto en el cuerpo de un componente (el bug
del §6.2) **no lo detecta ningún test**: son fallos que solo se ven en el
dispositivo.

### 15.10 Menudo: `react-native.config.js` apunta a una carpeta inexistente

Declara `assets: ['./assets/fonts/']` y **`assets/fonts/` no existe**.

---

## 16. Deuda técnica conocida

Ordenada por lo que más cuesta si se deja.

1. **Tokens en AsyncStorage, no cifrados** (`api/secureStore.ts`). Está
   **aislado a propósito** en un único `SecretBackend` con `secure: false`, y el
   fichero trae el bloque exacto de migración a `expo-secure-store` listo para
   pegar *después* de instalar el paquete (instalarlo antes rompe el
   `typecheck`). El riesgo está aceptado por el dueño y documentado: en Cuba
   los teléfonos casi nunca están rooteados. **No pegues ese bloque antes de
   `npx expo install expo-secure-store`.**
2. **El `useFocusEffect` sin contenedor sigue siendo posible.** Nada impide
   que alguien vuelva a meter una pantalla embebida fuera del navegador y
   reviente. El patrón está, pero no hay lint que lo compruebe.
3. **Duplicación de datos declarados con la web**: matriz de roles, tabla de
   los 7 gates, orden de resolución de caja. Los tres están replicados "a mano
   con un test al lado", ninguno lee el repo hermano (§14.3).
4. **`src/types/index.ts` con 32 interfaces** escritas contra lo que el backend
   devuelve hoy, no generadas desde el esquema. Cuando el backend cambie una
   forma, el typecheck no avisa.
5. **Push nativo requiere configuración de lanzamiento**: `expo-device` y
   `expo-notifications` ya se usan para permisos y registro de tokens. La bandeja
   interna está disponible, pero las notificaciones del sistema requieren
   `extra.eas.projectId` y credenciales de Apple/Google válidas para el build.
6. **`eslint` sin configuración** y `prettier` declarado sin config (§15.2).
7. **Sin CI de tests en cada push**: el workflow solo corre a mano, para no
   gastar minutos de Gradle. Las compuertas (`tsc` + `jest`) existen, pero solo
   se ejecutan cuando alguien las dispara.
8. **Pantallas grandes**: `CierreCajaScreen` (818), `POSScreen` (802),
   `InventarioScreen` (692). El cierre tiene máquina de vistas explícita
   (`ViewMode`), lo cual ayuda; el POS todavía mezcla catálogo, carrito, turno y
   cola offline en el mismo componente.
9. **El `Alert` del sistema ya no se usa** (había 83 `Alert.alert`; los
   sustituyen `showAlert`/`showConfirm` de `dialogs.tsx`), pero `AppModal` y los
   sheets siguen siendo `Modal` de RN: no tienen animación de hoja nativa ni
   arrastrar para cerrar.
10. **`src/config/legalContent.ts`** lleva datos legales reales y de contacto
    como `[TU NOMBRE COMPLETO]`: hay que rellenar eso antes de publicar.
11. **Credenciales de prueba sin fuente**: las que citaba el README anterior no
    aparecen en ningún fichero del workspace (§2.2). No las publiques en otra
    documentación hasta confirmarlas contra la semilla real de D1.

---

## 17. Mapa rápido de "dónde está X"

| Quiero… | Mirar |
|---|---|
| Añadir un destino a la barra | `PREFERIDAS_BARRA` en `AppNavigator.tsx:59` (y su límite) |
| Añadir un módulo (que va al menú) | `NAV_ITEMS` / `MENU_SCREENS`, `AppNavigator.tsx:62-75` |
| Añadir un grupo de Configuración | `GRUPOS` en `ConfigGrupo.tsx:74` (**una línea por parte**, el test lo lee) |
| Cambiar un color | `src/config/theme.ts` (nunca inline: hay test) |
| Cambiar la API o sus reglas | `src/api/endpoints.ts` + `src/api/client.ts` |
| Cambiar a dónde apunta la API | `src/api/config.ts` (una línea) |
| Cambiar una regla de dinero/cierre | `src/config/cierreDinero.ts`, `tolerancia.ts`, `movimientoDinero.ts` |
| Cambiar cómo se decide "mi caja" | `src/config/locationResolution.ts` **y** el backend, a la vez |
| Arreglar "la pantalla no carga" | `src/components/Recarga.tsx` (§6.2) |
| Arreglar "la barra tiene huecos" | `tabBarItemStyle: { display: 'none' }` (§5.2) |
| Arreglar "la barra invade los iconos" | `tabBarStyle` en `AppNavigator.tsx:394-402` (§15.1) |
| Cambiar el ancho de las columnas | `src/config/useLayoutMode.ts` (860 / 1024) |
