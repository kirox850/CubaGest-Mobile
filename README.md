# CubaGest — App móvil (React Native + Expo Go)

App para celular que consume la misma API del backend de `cubagest-backend`.
Se desarrolla y prueba con **Expo Go** (QR): el proyecto no declara el
paquete `expo` en sus dependencias, pero todas sus librerías (React
Navigation, AsyncStorage, NetInfo) están incluidas en Expo Go, así que
funciona directo escaneando el código QR.

> ⚠️ **Importante:** Expo Go solo ejecuta proyectos cuya versión de
> React Native coincida con el **SDK de tu app Expo Go**. Si abres la app
> y aparecen muchos errores desde `node_modules`, casi siempre es porque
> la app Expo Go del celular se actualizó a un SDK más nuevo que el
> proyecto. Solución más abajo (sección 3).

---

## 🆕 Novedades v1.2.0 — paridad con la web

Esta versión nivela la app con el sistema web. **No se añadieron
dependencias nuevas** — todo usa las librerías que ya estaban en el
proyecto (AsyncStorage, NetInfo, React Navigation).

### ⚡ POS offline-first (la novedad principal)
- Ya se puede vender **sin conexión**: la venta se guarda en una cola local
  con folio temporal (`LOCAL-0001`, `LOCAL-0002`…) y se descuenta el stock
  local al momento.
- Al recuperar la conexión, la cola se sincroniza sola contra
  `POST /sales/sync` (al volver la red o al abrir la app); también hay un
  botón manual **"Sincronizar ahora"** en Facturas.
- Si el servidor rechaza una venta por stock insuficiente, queda marcada
  como **conflicto** (con su motivo) y el stock local se restaura.
- Si la app murió a mitad de una sincronización, las ventas quedadas en
  `syncing` se reparan solas al arrancar.
- El header muestra una píldora con pendientes/conflictos; tócala para
  forzar la sincronización.
- Archivos: `src/offline/offlineStore.ts`, `src/offline/syncManager.ts`,
  `src/context/SyncContext.tsx`.

### 🏬 Multi-ubicación (igual que la web)
- POS e Inventario ya no usan el stock global de la empresa sino el stock
  **de tu ubicación** (`GET /locations/:id/stock`): el cajero vende desde su
  caja, el almacenista desde el almacén, y el admin puede cambiar entre
  ubicaciones con un selector.
- El ajuste de stock usa el endpoint real `POST /locations/:id/adjust`.
  🔴 Antes la app llamaba a `/products/:id/adjust-stock`, que ya no existe
  en el backend — **el ajuste de stock desde la app siempre fallaba**.

### 🧮 Módulos nuevos
- **Cierre de Caja**: flujo completo de 4 pasos (lista de cierres →
  seleccionar lectura de apertura → validar conteo físico del stock →
  detalle). El admin puede tomar lecturas de apertura.
- **Envíos (transferencias)**: crear envíos desde tu ubicación, aprobar,
  rechazar con motivo y cancelar, con tabs pendientes/todos.
- **Auditoría**: registro de actividad con filtros por entidad.

### 🔐 Roles alineados con el backend
- Los permisos de `src/config/roles.ts` estaban desactualizados (ej: el
  cajero no veía Cierre, Envíos ni Auditoría). Ahora coinciden 1:1 con el
  backend y la web, incluidos los colores.

### ✨ Mejoras en módulos existentes
- **Dashboard**: ventas de hoy y gráfico de barras de los últimos 7 días.
- **Contabilidad**: usa el resumen contable del backend
  (`/accounting/summary` + `/accounting/income`) y los egresos ahora
  registran método de pago.
- **Facturación**: muestra las ventas offline pendientes y en conflicto.
- **Usuarios**: editar nombre/rol y reenviar el link de establecimiento de
  contraseña.
- **Login**: recuperación de contraseña funcional (forgot-password) y
  acceso al formulario de registro.
- **Registro**: ya funciona desde la app (crea la empresa con trial de
  30 días vía `POST /auth/register`).

### 🧪 Cómo probar el modo offline
1. Inicia sesión y entra a **Vender**.
2. Activa el **modo avión** del teléfono.
3. Vende normalmente: verás el banner morado "MODO OFFLINE" y la factura
   quedará como `LOCAL-XXXX`.
4. Desactiva el modo avión: la píldora del header sincroniza sola; luego
   revisa las facturas en la web.

---

## 1. Requisitos

- Tener Node.js instalado en tu computadora (nodejs.org, versión LTS).
- Instalar la app **Expo Go** en tu celular (gratis, en Play Store / App Store).
- El backend (`cubagest-backend`) corriendo y accesible desde tu celular.

## 2. Configurar la URL de la API

Abre `src/api/config.ts` y cambia `API_BASE_URL`:

- Si estás probando en tu misma red WiFi (computadora + celular conectados
  al mismo WiFi de casa/negocio), usa la IP local de tu computadora, por
  ejemplo `http://192.168.1.50:4000/api` (busca tu IP con `ipconfig` en
  Windows o `ifconfig`/`ipconfig getifaddr en0` en Mac).
- Si ya desplegaste el backend en Railway/Cloudflare, usa esa URL directa,
  ej. `https://api.tunegocio.com/api`.

**Nunca uses `localhost`** — el celular no tiene idea de qué computadora
es "localhost", eso solo funciona dentro de la misma máquina.

## 3. Instalar y correr con Expo

```bash
npm install
npx expo install --fix   # fija expo/react/react-native a tu Expo Go
npx expo start --clear
```

Escanea el QR con la app **Expo Go** (Android: desde Expo Go; iPhone:
desde la cámara).

> La configuración ya está migrada a Expo en este repo (`babel.config.js`
> con `expo/babel`, `metro.config.js` con `expo/metro-config`, entry point
> con `registerRootComponent`, y bloque `expo` en `app.json`).
> `npx expo install --fix` ajusta `expo`, `react` y `react-native` a las
> versiones exactas que pide tu app Expo Go.

### Si Expo Go muestra "Project is incompatible..."
Tu Expo Go quedó en un SDK distinto al que instaló npm. Fija el SDK de tu
app Expo Go manualmente (el número aparece en Expo Go → Ajustes):

```bash
npm install expo@^54.0.0   # ejemplo para SDK 54 — usa tu número
npx expo install --fix
npx expo start --clear
```

Para verificar tipos: `npm run typecheck`.

## 4. Probar en tu celular

1. Escanea el QR que muestra Metro en la terminal.
2. Usa las mismas credenciales de prueba del backend:
   - `admin@cubagest.cu` / `Admin123`
   - `cajero@cubagest.cu` / `Cajero123`
   - `contadora@cubagest.cu` / `Conta123`

Con Metro corriendo, los cambios de código se recargan solos en el
dispositivo (no hace falta escanear de nuevo).

## 5. Publicar más adelante (cuando estés listo)

Cuando quieras instalarla "de verdad" (sin depender de Expo Go) o subirla
a las tiendas, se usa **EAS Build** (`npx eas-cli build`), que genera un
`.apk`/`.aab` para Android o un `.ipa` para iOS sin necesitar Mac ni
Android Studio.
