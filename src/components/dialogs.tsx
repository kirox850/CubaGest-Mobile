// ─── DIÁLOGOS (puerto de components/shared/dialogs.tsx de la web) ─────────────
//
// Por qué existe: cada pantalla reinventó su propio confirmatorio con
// `Alert.alert` de react-native — 83 llamadas en la app. Y un `Alert` nativo es
// la superficie más obviamente-no-tuya que hay en un móvil: otra tipografía,
// otros botones, colores que siguen al sistema operativo en vez de al tema, y un
// un check de título donde debería haber un toast.
//
// `showAlert` y `showConfirm` son IMPERATIVOS: se importan en cualquier archivo
// y funcionan, sin props ni contexto. Eso es lo que permite reemplazarlos sin
// reescribir la arquitectura de las pantallas.
//
// El `Promise<boolean>` de `showConfirm` es lo que permite escribir
// `if (await showConfirm(...))` — el mismo control de flujo que en la web. Un
// `Alert` con callbacks no da eso, y por eso casi todos los "confirmar antes de
// borrar" del móvil están mal: o no confirman, o confirman dos veces.
//
// LA COLA NO ES UN ADORN. Si el cajero toca "salida registrada" y el toast se
// convierte en diálogo mientras se borra algo, sin cola el segundo `showConfirm`
// PISA al primero: el `await` de la primera promesa no se resuelve nunca y la
// acción se queda colgada para siempre. Perder un "¿estás seguro?" sin enterarte
// es peor que un toast de más.
//
// El host se monta UNA vez, arriba del árbol, y se registra a sí mismo. Fuera de
// él, `showAlert` no es un error: se encola igual, y aparece en cuanto haya
// host. Un diálogo perdido es peor que uno tardío.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Btn } from './UI';
import { colors, themeRef } from '../config/theme';
import { showToast } from './UI';

type DialogState =
  | { kind: 'alert'; title?: string; message: string }
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void };

type Peticion = DialogState & { abrir: () => void };

/** Escribe en el diálogo visible. Lo instala `DialogHost` al montarse. */
let setAbierto: ((d: DialogState | null) => void) | null = null;
/** Vacía el diálogo visible y deja que entre el siguiente de la cola. */
let alCerrar: (() => void) | null = null;

let cola: Peticion[] = [];
let hayAbierto = false;

function bombear() {
  // Si ya hay uno en pantalla, los siguientes ESPERAN. Nunca se pisan.
  if (hayAbierto || cola.length === 0) return;
  const siguiente = cola.shift()!;
  hayAbierto = true;
  siguiente.abrir();
}

/**
 * Un aviso que hay que LEER, no decidir.
 *
 * El cuerpo va como texto seleccionable a propósito. El caso que lo motivó es
 * el link de activación de un usuario: un toast no sirve —se va en tres
 * segundos y nadie copia una URL de tres segundos— y el `Alert` del sistema no
 * deja seleccionar. Era el peor de los dos: se llegaba al enlace, se leía a
 * ojo y se transcribía a mano.
 */
export function showAlert(message: string, title?: string): void {
  cola.push({
    kind: 'alert',
    title,
    message,
    abrir: () => setAbierto?.({ kind: 'alert', title, message }),
  });
  bombear();
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    cola.push({
      kind: 'confirm',
      message,
      resolve,
      abrir: () => setAbierto?.({ kind: 'confirm', message, resolve }),
    });
    bombear();
  });
}

function cerrar(ok: boolean, resolve?: (ok: boolean) => void) {
  // Resolver PRIMERO: el `await` del call site reanuda la pantalla mientras
  // este diálogo sigue montado, y durante ese frame los dos son visibles.
  resolve?.(ok);
  hayAbierto = false;
  setAbierto?.(null);
  alCerrar?.();
}

export const DialogHost = () => {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    setAbierto = setDialog;
    alCerrar = bombear;
    // Si ya había peticiones en cola antes de montar el host (una pantalla que
    // pregunta durante el arranque), se entregan ahora.
    bombear();
    return () => {
      setAbierto = null;
      alCerrar = null;
      cola = [];
      hayAbierto = false;
    };
  }, []);

  if (!dialog) return null;
  const esConfirm = dialog.kind === 'confirm';

  return (
    <View style={s.overlay} accessibilityViewIsModal>
      {/* El overlay cierra con false (como en la web), pero NO en un alert: un
          aviso informativo que se cierra solo al tocar fuera se lee como
          accidentado. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (esConfirm ? cerrar(false, dialog.resolve) : undefined)}
      />
      <View style={s.card}>
        {dialog.kind === 'alert' && dialog.title ? <Text style={s.title}>{dialog.title}</Text> : null}
        {/* `selectable`: aquí se copian enlaces. Sin esto no hay forma de
            llevarse el texto, y se acaba transcribiéndolo a mano. */}
        <Text style={s.message} selectable={dialog.kind === 'alert'}>
          {dialog.message}
        </Text>
        <View style={s.row}>
          {esConfirm && (
            <Btn variant="secondary" label="Cancelar" onPress={() => cerrar(false, dialog.resolve)} />
          )}
          <Btn
            label={esConfirm ? 'Confirmar' : 'Aceptar'}
            onPress={() => (esConfirm ? cerrar(true, dialog.resolve) : cerrar(true, undefined))}
          />
        </View>
      </View>
    </View>
  );
};

const createStyles = () => StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center',
    padding: 16, zIndex: 9998,
  },
  card: { backgroundColor: colors.bgCard, borderRadius: 16, padding: 22, width: '100%', maxWidth: 380 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  message: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});

let __stylesVersion = -1;
let __styles: ReturnType<typeof createStyles> | null = null;
export const s = new Proxy({} as ReturnType<typeof createStyles>, {
  get(_t, prop) {
    if (__stylesVersion !== themeRef.version || !__styles) {
      __styles = createStyles();
      __stylesVersion = themeRef.version;
    }
    return __styles[prop as keyof ReturnType<typeof createStyles>];
  },
});

/**
 * El `Alert.alert` de un solo botón que solo dice "ha ido mal" es el peor
 * patrón de la app: un diálogo del sistema, con su tipografía, que tapa la
 * pantalla y hay que cerrar. Nadie lo lee y todos lo descartan.
 *
 * Este es el equivalente de un botón y sin decidir nada. Usa el toast de error,
 * que vive en la propia pantalla y se va solo. La diferencia con
 * `showConfirm` es que no devuelve nada: no hay nada que decidir, solo un aviso.
 */
export function showError(msg: string): void {
  showToast(msg, 'error');
}
