// ─── CONFIGURACIÓN (puerto de screens/Configuracion.tsx de la web) ───────────
//
// Antes esto eran seis entradas sueltas en el menú de perfil —Monedas,
// Descuentos, Cajas, Usuarios, Auditoría, Movimientos— y cada una hacía algo
// distinto: unas abrían un modal encima de lo que estabas viendo y otras te
// sacaban de la pantalla. Seis entradas parecidas que además se comportan
// distinto es la peor forma de menú que existe: no se aprende.
//
// Aquí es un modal con pestañas, como en la web. Y la pestaña lateral es un
// botón grande, no un desplegable: en un teléfono se llega con el pulgar y se
// ve de un vistazo cuántas secciones hay.
//
// LAS PESTAÑAS Y SUS GATES SON LOS DE LA WEB, copiados uno a uno
// (Configuracion.tsx:28-37). No se inventan ni se simplifican:
//
//   cajas       → admin      · CajasAdmin      (crear cajas, repartirlas)
//   caja        → CUALQUIERA · CajaSettings    (la tolerancia de descuadre)
//   monedas     → admin      · MonedasScreen
//   descuentos  → admin      · DiscountsScreen
//   usuarios    → admin      · UsuariosScreen
//   auditoria   → perm       · AuditoriaScreen
//   plan        → CUALQUIERA · PlanModal
//
// OJO con `caja`: NO es de admin, y no es un descuido al copiar. `PUT /settings`
// no lleva requireRole, así que un cajero puede fijar el margen de su caja. Y al
// dividir la anterior pantalla única de Cajas en dos, si se hubiera dejado la
// tolerancia detrás del gate de admin se le habría quitado al cajero una
// capacidad que la web sí le da.
//
// Las pestañas se montan y desmontan al cambiar, no se ocultan con display:
// la tabla de usuarios no sigue repintando mientras el cajero mira la de
// monedas.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { ROLES } from '../config/roles';
import Icon, { type IconName } from '../components/Icon';
import CajasAdminScreen from './CajasAdminScreen';
import CajaSettings from '../components/CajaSettings';
import MonedasScreen from './MonedasScreen';
import DiscountsScreen from './DiscountsScreen';
import UsuariosScreen from './UsuariosScreen';
import AuditoriaScreen from './AuditoriaScreen';
import PlanModal from '../components/PlanModal';

export type TabId = 'cajas' | 'caja' | 'monedas' | 'descuentos' | 'usuarios' | 'auditoria' | 'plan';

interface TabDef {
  id: TabId;
  label: string;
  icon: IconName;
  /** Si se define, hace falta ese rol. */
  roles?: string[];
  /** Si se define, hace falta alguno de esos módulos. */
  perms?: string[];
}

const TABS: TabDef[] = [
  { id: 'cajas',      label: 'Cajas',           icon: 'pos',           roles: ['admin'] },
  { id: 'caja',       label: 'Cierre de caja',  icon: 'cierre' },
  { id: 'monedas',    label: 'Monedas y tasas', icon: 'contabilidad',  roles: ['admin'] },
  { id: 'descuentos', label: 'Descuentos',      icon: 'gift',          roles: ['admin'] },
  { id: 'usuarios',   label: 'Usuarios',        icon: 'usuarios',      roles: ['admin'] },
  { id: 'auditoria',  label: 'Auditoría',       icon: 'auditoria',     perms: ['auditoria'] },
  { id: 'plan',       label: 'Mi plan',         icon: 'facturacion' },
];

const Configuracion = ({
  visible, onClose, initialTab,
}: {
  visible: boolean;
  onClose: () => void;
  initialTab?: TabId;
}) => {
  const { user } = useAuth();
  const perms = ROLES[user?.role || '']?.perms || [];
  const insets = useSafeAreaInsets();
  // El rol puede cambiar mientras el modal está abierto (un logout, un cambio de
  // cuenta). Por eso la pestaña activa se recalcula en cada render en vez de
  // guardarse en el estado inicial: una pestaña que el usuario ya no puede ver
  // se queda en pantalla hasta que se cierre y se vuelva a abrir.
  const [elegida, setElegida] = useState<TabId | null>(initialTab || null);

  // Si el usuario no puede ver la pestaña pedida, se le manda a la primera que
  // sí pueda. Sin esto, un cajero que entre por deep-link a "usuarios" vería un
  // panel vacío en lugar de un motivo.
  const visibles = TABS.filter((t) => {
    if (t.roles && !t.roles.includes(user?.role || '')) return false;
    if (t.perms && !t.perms.some((p) => perms.includes(p))) return false;
    return true;
  });
  const activa = visibles.find((t) => t.id === elegida) || visibles[0];

  if (!activa) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.wrap, { paddingTop: insets.top }]}>
          <View style={s.split}>
            {/* Pestañas: arriba y con scroll en el teléfono, a la izquierda en
                pantalla grande. Igual que la web: se llega con el pulgar. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[s.tabs, { maxHeight: 46 }]}
              contentContainerStyle={s.tabsRow}
            >
              {visibles.map((t) => {
                const on = activa.id === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setElegida(t.id)}
                    style={[s.tab, on && s.tabOn]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Icon name={t.icon} size={15} color={on ? colors.primary : colors.textMuted} />
                    <Text style={[s.tabText, on && { color: colors.primary }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={s.body}>
              <View style={s.bodyHead}>
                <Text style={s.bodyTitle}>{activa.label}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
                  <Icon name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={s.bodyScroll}
                contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
              >
                {activa.id === 'cajas' && <CajasAdminScreen embedded />}
                {activa.id === 'caja' && <CajaSettings embedded />}
                {activa.id === 'monedas' && <MonedasScreen embedded />}
                {activa.id === 'descuentos' && <DiscountsScreen embedded />}
                {activa.id === 'usuarios' && <UsuariosScreen embedded />}
                {activa.id === 'auditoria' && <AuditoriaScreen embedded />}
                {activa.id === 'plan' && <PlanModal embedded user={user} onClose={onClose} />}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default Configuracion;

const createStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '100%', flex: 1, backgroundColor: colors.bgCard, overflow: 'hidden' },
  split: { flex: 1, minHeight: 0 },
  tabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgCard },
  tabsRow: { flexDirection: 'row', gap: 4, padding: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  tabOn: { backgroundColor: colors.inputBg, borderColor: colors.border },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  body: { flex: 1, minHeight: 0 },
  bodyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  bodyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  bodyScroll: { flex: 1, paddingHorizontal: 18 },
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
