// ─── Un grupo de Configuración ────────────────────────────────────────────────
//
// QUÉ ES
// Antes Configuración tenía siete pestañas y cada una era una pantalla suelta.
// Ahora la barra de abajo ES la navegación de Configuración, y solo caben cinco
// cosas. Para no perder ninguna se juntan las que son del mismo dominio:
//
//   Cajas + Cierre de caja   →  las dos cosas son la caja
//   Usuarios + Auditoría     →  quién puede hacer qué, y quién lo hizo
//
// Cada grupo con dos partes lleva un interruptor arriba para cambiar entre ellas
// sin volver a la barra.
//
// POR QUÉ LOS PERMISOS SON DATOS Y NO CÓDIGO
// El gate va en la declaración de cada parte, igual que antes iba en la de cada
// pestaña, y hay un test que lee ESTE ARCHIVO de texto para comprobar que los
// permisos coinciden con los de la web. Con los gates metidos en una función el
// test leería el resultado y no la regla, que es como un gate de seguridad
// desaparece en silencio: seguiría funcionando hasta que alguien lo cambiara.
//
// El gate se comprueba por PARTE y no por grupo a propósito: "Usuarios" es de
// admin y "Auditoría" no. Metidas en el mismo grupo, las dos siguen teniendo que
// distinguirse — un cajero con permiso de auditoría ve el grupo con SU parte
// dentro, no un grupo entero que no puede abrir.
//
// POR QUÉ NO ES UNA PESTAÑA MÁS
// La barra ya la dibuja el navegador (`AppNavigator`), filtrada por rol. Si este
// componente volviera a pintar pestañas habría dos listas de secciones que se
// pueden desincronizar. Este solo pinta el INTERRUPTOR entre las partes de SU
// grupo, que es un detalle interno que la barra no tiene por qué saber.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon, { type IconName } from '../components/Icon';
import { colors, radius } from '../config/theme';
import { ROLES } from '../config/roles';

import CajasAdminScreen from '../screens/CajasAdminScreen';
import CajaSettings from '../components/CajaSettings';
import MonedasScreen from '../screens/MonedasScreen';
import DiscountsScreen from '../screens/DiscountsScreen';
import UsuariosScreen from '../screens/UsuariosScreen';
import AuditoriaScreen from '../screens/AuditoriaScreen';
import PlanModal from '../components/PlanModal';
import { useAuth } from '../context/AuthContext';

export type SubId = 'cajas' | 'caja' | 'monedas' | 'descuentos' | 'usuarios' | 'auditoria' | 'plan';

export interface SubDef {
  id: SubId;
  label: string;
  icon: IconName;
  /** Si se define, hace falta ese rol. */
  roles?: string[];
  /** Si se define, hace falta alguno de esos módulos. */
  perms?: string[];
}

export interface GrupoDef {
  id: string;
  label: string;
  icon: IconName;
  /** Las partes del grupo. Un grupo con una sola parte no lleva interruptor. */
  sub: SubDef[];
}

// EL FORMATO ESTÁ PARA EL TEST: cada `sub` va en UNA SOLA LÍNEA, y el archivo se
// reordena a mano si se toca. El test de paridad lee este texto buscando esas
// líneas, así que partir una en dos rompería el gate sin avisar. A cambio, el gate
// ve de verdad lo que la app enseña.
//
// El orden es el de la barra, no el alfabético: se llega primero a lo que se usa
// más.
export const GRUPOS: GrupoDef[] = [
  {
    id: 'caja',
    label: 'Cajas y cierres',
    icon: 'pos',
    sub: [
      { id: 'cajas', label: 'Cajas', icon: 'pos', roles: ['admin'] },
      { id: 'caja', label: 'Cierre', icon: 'cierre' },
    ],
  },
  {
    id: 'monedas',
    label: 'Monedas y tasas',
    icon: 'contabilidad',
    sub: [
      { id: 'monedas', label: 'Monedas', icon: 'contabilidad', roles: ['admin'] },
    ],
  },
  {
    id: 'descuentos',
    label: 'Descuentos',
    icon: 'gift',
    sub: [
      { id: 'descuentos', label: 'Descuentos', icon: 'gift', roles: ['admin'] },
    ],
  },
  {
    id: 'acceso',
    label: 'Usuarios y auditoría',
    icon: 'usuarios',
    sub: [
      { id: 'usuarios', label: 'Usuarios', icon: 'usuarios', roles: ['admin'] },
      { id: 'auditoria', label: 'Auditoría', icon: 'auditoria', perms: ['auditoria'] },
    ],
  },
  {
    id: 'plan',
    label: 'Mi plan',
    icon: 'facturacion',
    sub: [
      { id: 'plan', label: 'Mi plan', icon: 'facturacion' },
    ],
  },
];

/** ¿Este usuario puede abrir ESTA parte? */
export function puede(sub: SubDef, role: string | undefined, perms: string[]): boolean {
  if (sub.roles && !sub.roles.includes(role || '')) return false;
  if (sub.perms && !sub.perms.some((p) => perms.includes(p))) return false;
  return true;
}

/** Las partes de un grupo que este usuario puede ver, en orden. */
export function subVisibles(g: GrupoDef, role: string | undefined, perms: string[]): SubDef[] {
  return g.sub.filter((p) => puede(p, role, perms));
}

/**
 * Los grupos visibles, con sus partes ya filtradas.
 *
 * Un grupo con todas sus partes cerradas se queda FUERA: aparecer en la barra una
 * opción que no lleva a ningún sitio es peor que no aparecer.
 */
export function visiblesPara(role: string | undefined, perms: string[]): GrupoDef[] {
  return GRUPOS
    .map((g) => ({ ...g, sub: subVisibles(g, role, perms) }))
    .filter((g) => g.sub.length > 0);
}

/**
 * Adaptador para React Navigation. El navegador entrega `{ route, navigation }`
 * y no el grupo directo, así que se saca de los parámetros de la ruta.
 *
 * Va aparte para que `ConfigGrupo` siga siendo un componente normal —con una
 * prop— y se pueda probar sin montar un navegador entero.
 */
export function GrupoScreen({ route }: any) {
  return <ConfigGrupo grupo={route.params.grupo} />;
}

export default function ConfigGrupo({ grupo }: { grupo: GrupoDef }) {
  const { user } = useAuth();
  const perms = ROLES[user?.role || '']?.perms || [];
  // El grupo ya llega filtrado desde `visiblesPara`, pero se vuelve a filtrar por
  // si el usuario pierde el rol con la pantalla montada: sin esto, la parte
  // elegida puede quedar cerrada y se pintaría un panel en blanco.
  const permitidas = subVisibles(grupo, user?.role, perms);

  const [elegida, setElegida] = useState<SubId>(permitidas[0]?.id);
  const activa = permitidas.find((p) => p.id === elegida) || permitidas[0];
  if (!activa) return null;

  return (
    <View style={{ flex: 1 }}>
      {permitidas.length > 1 && (
        <View style={s.toggle}>
          {permitidas.map((p) => {
            const on = p.id === activa.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setElegida(p.id)}
                style={[s.parte, on && s.parteOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Icon name={p.icon} size={14} color={on ? colors.primary : colors.textMuted} />
                <Text style={[s.parteText, on && { color: colors.primary }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {activa.id === 'cajas' && <CajasAdminScreen embedded />}
      {activa.id === 'caja' && <CajaSettings embedded />}
      {activa.id === 'monedas' && <MonedasScreen embedded />}
      {activa.id === 'descuentos' && <DiscountsScreen embedded />}
      {activa.id === 'usuarios' && <UsuariosScreen embedded />}
      {activa.id === 'auditoria' && <AuditoriaScreen embedded />}
      {activa.id === 'plan' && <PlanModal embedded user={user} onClose={() => {}} />}
    </View>
  );
}

const s = StyleSheet.create({
  toggle: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  parte: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  parteOn: { borderColor: colors.primary, backgroundColor: colors.bg },
  parteText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});