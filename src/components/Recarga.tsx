// ─── Recarga al enfocar / al montar ───────────────────────────────────────────
//
// Existe por un fallo concreto: las pantallas de Configuración se EMBEBEN
// dentro de `ConfiguracionScreen`, que es un `Modal` colgado FUERA del
// `NavigationContainer`. `useFocusEffect` exige un contenedor de navegación
// encima y, sin él, lanza:
//
//   Couldn't find a navigation object. Is your component inside NavigationContainer?
//
// No era solo Cajas: las cinco pantallas embebidas (Cajas, Usuarios, Monedas,
// Descuentos y Auditoría) llamaban a `useFocusEffect` y las cinco reventaban al
// abrirlas. Solo se vio la primera porque era la que se abrió.
//
// El arreglo NO puede ser "si estoy embebido, no llamo al hook": los hooks no se
// pueden condicionar, y saltarse la llamada cambia el número de hooks del
// componente entre renders. Por eso el hook vive en un HIJO que se monta o no
// según el caso, y el padre elige el hijo. Aquí abajo no hay ningún hook, así que
// cambiar de rama no puede romper nada.
//
// Cuando la pantalla va suelta dentro del navegador, el hijo usa
// `useFocusEffect` y recarga cada vez que vuelve al frente — que es lo que se
// quiere: si alguien la dejó abierta y llegó una venta, al volver tiene que estar
// al día. Embebida no hay "foco" que recuperar: se carga al montarse y ya.

import React, { useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/** Embebida: carga al montarse. Sin navegación, porque no la hay. */
export function RecargaAlMontar({ fn }: { fn: () => void }) {
  useEffect(() => { fn(); }, [fn]);
  return null;
}

/** Suelta dentro del navegador: carga al montar y cada vez que vuelve al frente. */
export function RecargaAlEnfocar({ fn }: { fn: () => void }) {
  useFocusEffect(useCallback(() => { fn(); }, [fn]));
  return null;
}