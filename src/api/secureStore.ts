// ─── Adaptador de almacenamiento de secretos ────────────────────────────────
// IMPORTANTE: este archivo NO importa `expo-secure-store`, y a propósito.
//
// Ese paquete NO está en package.json. Si se añadiera el import ahora, el
// proyecto dejaría de compilar (`tsc` da "Cannot find module") y Metro fallaría
// al empaquetar, hasta que alguien instalara el paquete con red. El requisito
// P0 de esta pasada es la sesión persistente y el namespace offline, no la
// instalación de paquetes, así que el backend de este adaptador es
// AsyncStorage, que ya es una dependencia declarada.
//
// RIESGO ACEPTADO Y REPORTADO: los tokens quedan en claro en el almacenamiento
// de la app. En un Android rooteado o con acceso al sandbox son legibles. El
// RIESGO ACEPTADO Y DECIDIDO POR EL DUEÑO: se decide NO cifrar los tokens.
// Se evaluó y la conclusión es que el riesgo real es bajo — en Cuba los
// teléfonos casi nunca están rooteados, y la app ya pide el PIN al volver del
// fondo, así que las llaves no se pueden copiar desde otro teléfono. Lo que
// quedaría fuera de alcance es un dispositivo rooteado o con acceso por ADB:
// aceptado a conciencia, no por descuido.
//
// El riesgo está aislado en ESTE archivo porque el resto de la app (session.ts,
// client.ts) solo habla con `secretStorage`. Cambiarlo después es cosa de un
// solo archivo.
//
// ── Cómo migrar cuando instales expo-secure-store (con red) ────────────────
// 1. `npx expo install expo-secure-store` (la añade a package.json)
// 2. Pegar el import y el backend de abajo en `createBackend()`.
//
// NO pegues este bloque antes de instalar el paquete: rompe el typecheck.
//
//     import * as SecureStore from 'expo-secure-store';
//     const secureBackend: SecretBackend = {
//       get:    (k) => SecureStore.getItemAsync(k),
//       set:    (k, v) => SecureStore.setItemAsync(k, v),
//       remove: (k) => SecureStore.deleteItemAsync(k),
//       secure: true,
//     };
//
// SecureStore solo admite claves [A-Za-z0-9._-]; `secureKey()` ya las
// normaliza, así que no hay nada más que ajustar al migrar.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SecretBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** ¿El backend usa el almacén seguro del sistema operativo? */
  secure: boolean;
}

const asyncStorageBackend: SecretBackend = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
  secure: false,
};

function createBackend(): SecretBackend {
  // Único punto de migración (ver cabecera). Hoy: AsyncStorage.
  return asyncStorageBackend;
}

const backend = createBackend();

/** Normaliza una clave al alfabeto que exige SecureStore. */
export function secureKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export const secretStorage = {
  /** ¿Los tokens se guardan cifrados por el sistema operativo? */
  isSecure(): boolean {
    return backend.secure;
  },

  get(key: string): Promise<string | null> {
    return backend.get(secureKey(key));
  },

  async set(key: string, value: string): Promise<void> {
    await backend.set(secureKey(key), value);
  },

  async remove(key: string): Promise<void> {
    await backend.remove(secureKey(key));
  },
};
