import React, { useRef, useState } from 'react';
import { TouchableOpacity, Text, View, Image, StyleSheet, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GrupoScreen, visiblesPara } from '../screens/ConfigGrupo';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTheme } from '../context/ThemeContext';
import { ROLES } from '../config/roles';
import { colors, shadow, NAVY, themeRef } from '../config/theme';
import { PRIVACY_POLICY_MD, TERMS_MD } from '../config/legalContent';
import type { User } from '../types';
import PlanModal from '../components/PlanModal';
import { DialogHost, showConfirm } from '../components/dialogs';
import { ToastHost } from '../components/UI';
import LegalModal from '../components/LegalModal';
import WelcomeTour from '../components/WelcomeTour';
import Icon, { type IconName } from '../components/Icon';

import DashboardScreen from '../screens/DashboardScreen';
import InventarioScreen from '../screens/InventarioScreen';
import POSScreen from '../screens/POSScreen';
import FacturacionScreen from '../screens/FacturacionScreen';
import ContabilidadScreen from '../screens/ContabilidadScreen';
import CierreCajaScreen from '../screens/CierreCajaScreen';
import TransferenciasScreen from '../screens/TransferenciasScreen';
import MovimientosDineroScreen from '../screens/MovimientosDineroScreen';

const Tab = createBottomTabNavigator();

// ─── NAV ITEMS (paridad 1:1 con App.tsx de la web) ───────────────────────────
// Mismos ids, labels e iconos que la barra inferior / sidebar de la web.
// Los módulos usuarios/auditoria/monedas/descuentos NO van en la barra: en la
// web se abren desde el menú de perfil y aquí se replican igual (screens
// ocultas a las que el menú navega).
// Qué se queda en la barra y en qué orden. Un admin tiene los 7 módulos y 7
// iconos en una barra de 64px: se leen regular, y sobre todo NO se distinguen
// entre sí. Cinco es el número en el que cada uno todavía se reconoce de un
// vistazo, que es justo lo que hace una barra.
//
// El orden NO es el de NAV_ITEMS: es por frecuencia de uso. Punto de Venta es la
// acción del negocio y va segundo solo porque Dashboard es la puerta de entrada.
// El resto que sobre no se pierde — pasa al menú de perfil — pero hay que abrir
// un nivel más para llegar, que es el precio de que los cinco que sí están se
// puedan leer sin effort.
// El `name` de una pantalla de grupo tiene que ser único —es por donde navega el
// menú—, así que se construye aquí y no se reusa el label, que es texto para el
// usuario y podría repetirse entre grupos.
const GRUPO_NOMBRE = (id: string) => `config:${id}`;

// Qué iconos usa cada grupo. Vive con los grupos y no aquí para que añadir uno sea
// tocar un sitio, no dos.
const ICONO_GRUPO: Record<string, IconName> = {
  caja: 'pos', monedas: 'contabilidad', descuentos: 'gift',
  acceso: 'usuarios', plan: 'facturacion',
};

const PREFERIDAS_BARRA = ['dashboard', 'pos', 'inventario', 'cierre', 'facturacion'];
const MAX_TABS = PREFERIDAS_BARRA.length;

const NAV_ITEMS: { key: string; label: string; icon: IconName; component: React.ComponentType<any> }[] = [
  { key: 'dashboard',    label: 'Dashboard',      icon: 'dashboard',    component: DashboardScreen },
  { key: 'inventario',   label: 'Inventario',     icon: 'inventario',   component: InventarioScreen },
  { key: 'pos',          label: 'Punto de Venta', icon: 'pos',          component: POSScreen },
  { key: 'facturacion',  label: 'Facturas',       icon: 'facturacion',  component: FacturacionScreen },
  { key: 'contabilidad', label: 'Contabilidad',   icon: 'contabilidad', component: ContabilidadScreen },
  { key: 'cierre',       label: 'Cierre de Caja', icon: 'cierre',       component: CierreCajaScreen },
  { key: 'transferencias', label: 'Envíos',       icon: 'transferencias', component: TransferenciasScreen },
];

// Screens de menú (sin botón en la tab bar)
const MENU_SCREENS: { key: string; label: string; icon: IconName; component: React.ComponentType<any> }[] = [
  { key: 'movimientos', label: 'Entradas y Salidas', icon: 'cash', component: MovimientosDineroScreen },
];

function HeaderRight({ navigation, onOpenPlan, onOpenLegal, onOpenTour, onOpenModule, desbordados }: {
  navigation: any;
  onOpenPlan: () => void;
  onOpenLegal: (doc: 'privacy' | 'terms') => void;
  onOpenTour: () => void;
  onOpenModule: (key: string) => void;
  // Los módulos que no cabían en la barra. Vienen como prop y no se filtran aquí
  // porque el corte depende de MAX_TABS, que solo conoce el navigator.
  desbordados: { key: string; label: string; icon: IconName }[];
}) {
  const { user, logout, online } = useAuth();
  const { mode, toggle: toggleTheme } = useTheme();
  const { pendingCount, conflictCount, syncing, syncNow } = useSync();
  const [menuOpen, setMenuOpen] = useState(false);
  const perms = ROLES[user?.role || '']?.perms || [];

  const confirmLogout = async () => {
    setMenuOpen(false);
    if (await showConfirm('¿Seguro que desea salir? Se cerrará el turno abierto.')) logout();;
  };

  const roleColor = ROLES[user?.role || '']?.color || colors.primary;

  // Item del menú con icono SVG real (paridad con el menú de perfil web)
  const Item = ({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color?: string }) => (
    <TouchableOpacity style={s.menuItem} onPress={() => { setMenuOpen(false); onPress(); }}>
      <Icon name={icon} size={16} color={color || colors.textSecondary} />
      <Text style={[s.menuItemText, color ? { color } : null]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.headerRight}>
      {/* Pills de sync — equivalente móvil del OfflineBanner de la web */}
      {!online && (
        <View style={s.offlinePill}>
          <Text style={s.offlinePillText}>● OFFLINE</Text>
        </View>
      )}
      {(pendingCount > 0 || conflictCount > 0) && (
        <TouchableOpacity
          style={[s.syncPill, conflictCount > 0 && s.syncPillConflict]}
          onPress={() => syncNow(true)}
        >
          <Text style={s.syncPillText}>
            {conflictCount > 0
              ? `${conflictCount} conflicto${conflictCount !== 1 ? 's' : ''}`
              : syncing
                ? '⟳ Sync...'
                : `⇅ ${pendingCount}`}
          </Text>
        </TouchableOpacity>
      )}
      {/* Avatar — idéntico a la web: círculo con color de rol e inicial */}
      <TouchableOpacity
        onPress={() => setMenuOpen(true)}
        style={[s.avatarBtn, { backgroundColor: roleColor }]}
      >
        <Text style={s.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={s.menuCard} onPress={() => {}}>
            {/* Header del menú — igual que la web: nombre, email, badge de rol */}
            <View style={s.menuHeader}>
              <Text style={s.menuName}>{user?.name}</Text>
              <Text style={s.menuEmail}>{user?.email}</Text>
              <View style={[s.roleBadge, { backgroundColor: roleColor + '18' }]}>
                <Text style={[s.roleBadgeText, { color: roleColor }]}>{ROLES[user?.role || '']?.label || user?.role}</Text>
              </View>
            </View>

            {/* Antes eran cinco entradas sueltas (Usuarios, Auditoría, Descuentos,
                Monedas, Cajas) más "Mi Plan" y "Entradas y Salidas". Todas menos
                esta última son PESTAÑAS de Configuración en la web: aquí
                mantenidas aparte, cada una era una pantalla completa, seis rutas
                distintas a las que había que aprender una a una.
                La pestaña de arranque se pasa para no obligar a elegir dos veces. */}
            <Item icon="settings" label="Configuración" onPress={() => onOpenModule('configuracion')} />
            {/* Los módulos que se quedaron fuera de la barra. Van aquí arriba,
                justo después de Configuración y antes de Entradas y Salidas: son
                módulos de trabajo, y dejarlos debajo del tour y del modo oscuro
                los escondería entre los ajustes. */}
            {desbordados.map(t => (
              <Item key={t.key} icon={t.icon} label={t.label} onPress={() => onOpenModule(t.key)} />
            ))}
            {(perms.includes('cierre') || perms.includes('contabilidad')) && (
              <Item icon="cash" label="Entradas y Salidas" onPress={() => onOpenModule('movimientos')} />
            )}
            <Item icon="dashboard" label="Ver tour de bienvenida" onPress={onOpenTour} />
            <TouchableOpacity style={s.menuItem} onPress={() => { toggleTheme(); }}>
              <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={17} color={colors.text} />
              <Text style={s.menuItemText}>{mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}</Text>
            </TouchableOpacity>

            <View style={s.menuDivider} />

            <Item icon="doc" label="Política de Privacidad" onPress={() => onOpenLegal('privacy')} />
            <Item icon="doc" label="Términos y Condiciones" onPress={() => onOpenLegal('terms')} />

            <View style={s.menuDivider} />

            <Item icon="logout" label="Cerrar sesión" onPress={confirmLogout} color={colors.primary} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface TrialBannerInfo { daysLeft: number; urgent: boolean; color: string }

function getTrialBannerInfo(user: User | null): TrialBannerInfo | null {
  if (!user?.company?.trialActive) return null;
  const planExpiry = user.company.planExpiry;
  const daysLeft = planExpiry
    ? Math.max(0, Math.ceil((new Date(planExpiry).getTime() - Date.now()) / 86400000))
    : null;
  if (daysLeft === null) return null;
  const urgent = daysLeft <= 7;
  return { daysLeft, urgent, color: urgent ? colors.warningText : colors.primaryText };
}

function TrialBanner({ info, onPress }: { info: TrialBannerInfo; onPress: () => void }) {
  const { daysLeft, urgent, color } = info;
  return (
    <TouchableOpacity style={[s.trialBanner, { backgroundColor: color }]} onPress={onPress}>
      <Text style={s.trialBannerText}>
        {urgent ? '' : ''}
        Período de prueba gratis — {daysLeft} día{daysLeft !== 1 ? 's' : ''} restante{daysLeft !== 1 ? 's' : ''}
        {urgent ? ' · Toca aquí para ver planes' : ' · Plan Empresarial completo'}
      </Text>
    </TouchableOpacity>
  );
}

export default function AppNavigator() {
  const { user, logout } = useAuth();
  const { mode, version } = useTheme();
  const perms = ROLES[user?.role || '']?.perms || [];
  const isDark = mode === 'dark';

  // Reglas de Hooks: TODOS los hooks van antes de cualquier return temprano.
  // Antes estos tres useState estaban DESPUÉS del `if (tabs.length === 0)`,
  // así que un usuario sin módulos ("rol desconocido") montaba el componente
  // con un número de hooks distinto al del resto → error de hooks en
  // producción justo cuando se navega tras un cambio de rol.
  const [configOpen, setConfigOpen] = useState(false);
  // `null` = que Configuración abra en su primera pestaña visible para este rol.
  // Qué grupo de Configuración está abierto. Vive aquí y no dentro de
  // ConfiguraciónScreen porque ahora es la BARRA la que navega entre grupos: quien
  // necesita saber cuál es el activo es el navegador, no la pantalla.
  const [configTab, setConfigTab] = useState<string | null>(null);
  // `AppNavigator` está FUERA del NavigationContainer que él mismo monta, así que
  // no puede usar `useNavigation`. Se guarda la referencia que llega por
  // screenOptions para poder saltar a un grupo concreto al entrar.
  const navRef = useRef<any>(null);
  const gruposConfig = visiblesPara(user?.role, perms);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  // Barra inferior: solo los 7 nav items de la web filtrados por permisos.
  const permitidos = NAV_ITEMS.filter(n => perms.includes(n.key));
  // El sort de JS es estable: dentro de cada grupo se conserva el orden de
  // NAV_ITEMS, así que cambiar PREFERIDAS_BARRA no reordena lo que no ha tocado.
  const tabs = permitidos
    .slice()
    .sort((a, b) => {
      const pa = PREFERIDAS_BARRA.indexOf(a.key);
      const pb = PREFERIDAS_BARRA.indexOf(b.key);
      return (pa === -1 ? MAX_TABS : pa) - (pb === -1 ? MAX_TABS : pb);
    })
    .slice(0, MAX_TABS);
  // Los que se quedaron fuera de la barra, en el MISMO orden, y van al menú.
  const desbordados = permitidos.filter(n => !tabs.includes(n));

  // ── La misma barra, dos contenidos ─────────────────────────────────────
  //
  // Configuración ya no es un modal: es otro MODO del mismo navegador. En vez de
  // dos barras pegadas, hay una que se vacía y se rellena. Estas tres funciones
  // son las que deciden qué rutas se ven en cada modo.
  const esGrupo = (name: string) => name.startsWith('config:');
  const esModulo = (name: string) =>
    tabs.some(t => t.label === name) || desbordados.some(t => t.label === name);
  const visibleEnBarra = (name: string) => configOpen ? esGrupo(name) : esModulo(name);

  /**
   * Entra en Configuración, opcionalmente abriendo un grupo concreto.
   *
   * No basta con poner `configOpen`: en ese momento la pantalla actual es un
   * módulo, y en modo configuración los módulos quedan ocultos. Sin saltar a un
   * grupo a propósito se acabaría mirando el último módulo con la barra de
   * ajustes encima.
   */
  const abrirConfig = (grupoId?: string | null) => {
    const destino = grupoId ? gruposConfig.find(g => g.id === grupoId) : gruposConfig[0];
    setConfigOpen(true);
    if (destino) navRef.current?.navigate(GRUPO_NOMBRE(destino.id));
  };
  // El gate de cada pantalla va POR PERMISO, no por rol, cuando lo que
  // protege el backend es un módulo. `GET /cash-movements` es
  // `requireAnyModule("cierre", "pos", "contabilidad")` (cashMovements.ts:46), y
  // los cuatro roles lo pasan por alguna vía: el cajero y el almacenista por
  // "cierre", el contador por "contabilidad". Un filtro por rol escondería la
  // pantalla de dinero a un cajero que sí puede verla y usarla.
  const menuScreens = MENU_SCREENS.filter(t =>
    (t.key === 'usuarios' && user?.role === 'admin') ||
    (t.key === 'descuentos' && user?.role === 'admin') ||
    (t.key === 'monedas' && user?.role === 'admin') ||
    (t.key === 'auditoria' && perms.includes('auditoria')) ||
    (t.key === 'movimientos' && (perms.includes('cierre') || perms.includes('contabilidad'))) ||
    // Cajas: TODO lo que hay detrás es requireRole("admin") —
    // POST /locations, PUT /shift/assignments/:userId y PUT /settings.
    (t.key === 'cajas' && user?.role === 'admin')
  );

  if (tabs.length === 0) {
    return (
      <View style={s.noTabsWrap}>
        <Text style={s.noTabsTitle}>Sin módulos para tu rol</Text>
        <Text style={s.noTabsText}>
          Tu usuario (rol: {String(user?.role || 'desconocido')}) no tiene
          módulos asignados. Cierra sesión y vuelve a entrar para refrescar
          tus permisos, o contacta al administrador.
        </Text>
        <TouchableOpacity style={s.noTabsBtn} onPress={logout}>
          <Text style={s.noTabsBtnText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const trialInfo = getTrialBannerInfo(user);

  return (
    <View style={{ flex: 1 }}>
      {/* key={version}: al cambiar el tema re-monta el navigator con los
          estilos nuevos. El tema SIEMPRE extiende DefaultTheme/DarkTheme:
          la v7 exige el campo fonts (sin él crashea el HeaderTitle). */}
      <NavigationContainer key={version} theme={{
        ...(isDark ? DarkTheme : DefaultTheme),
        dark: isDark,
        colors: {
          ...(isDark ? DarkTheme : DefaultTheme).colors,
          primary: colors.primary,
          background: colors.bg,
          card: NAVY,
          text: colors.text,
          border: colors.border,
          notification: colors.danger,
        },
      }}>
        <Tab.Navigator
          screenOptions={({ navigation, route }) => {
            navRef.current = navigation;
            return ({
            headerStyle: { backgroundColor: NAVY, ...shadow.sm },
            // ── CABECERA ÚNICA: marca arriba, banner debajo ─────────────────
            //
            // Antes eran dos cosas apiladas: el TrialBanner dentro de un
            // SafeAreaView FUERA del NavigationContainer, y el header de React
            // Navigation debajo. Cada uno aplicaba su propio margen de seguridad,
            // así que el notch del iphone se contaba DOS veces y la marca quedaba
            // empujada muy abajo, casi fuera de pantalla.
            //
            // Un solo header con UN SafeAreaView lo arregla, y de paso deja el
            // orden que tiene sentido: primero la marca y el perfil — donde está
            // el botón de cerrar sesión — y debajo el aviso de la prueba, que es
            // información y no navegación.
            header: () => (
              <SafeAreaView edges={['top']} style={{ backgroundColor: NAVY, ...shadow.sm }}>
                <View style={s.brandRow}>
                  {configOpen ? (
                    // Chevron ‹ para volver a los módulos. Va a la IZQUIERDA
                    // porque ahí está el logo siempre: se sustituye en el sitio en
                    // que estaba, no se añade una pieza más.
                    <TouchableOpacity onPress={() => setConfigOpen(false)}
                      hitSlop={12} style={s.back}>
                      <Icon name="arrow_left" size={22} color="#ffffff" />
                    </TouchableOpacity>
                  ) : (
                    <Image source={require('../../assets/images/icon.png')} style={s.brandLogo} />
                  )}
                  <Text style={s.brandName}>{configOpen ? 'Configuración' : 'CubaGest'}</Text>
                  <View style={{ flex: 1 }} />
                  <HeaderRight
                    navigation={navigation}
                    desbordados={desbordados}
                    onOpenPlan={() => abrirConfig('plan')}
                    onOpenLegal={(doc) => setLegalDoc(doc)}
                    onOpenTour={() => setTourOpen(true)}
                    onOpenModule={(key) => {
                      if (key === 'configuracion') { abrirConfig(); return; }
                      // La lista completa, no solo MENU_SCREENS: los módulos que se
                      // quedaron fuera de la barra también son NAV_ITEMS, y mirando
                      // una sola el menú los deja pulsando y sin pasar nada.
                      const destino = [...NAV_ITEMS, ...MENU_SCREENS].find(t => t.key === key);
                      if (destino) navigation.navigate(destino.label);
                    }}
                  />
                </View>
                {trialInfo && (
                  <TrialBanner info={trialInfo} onPress={() => abrirConfig('plan')} />
                )}
              </SafeAreaView>
            ),
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            // Labels compactos + tab bar más alta: los 7 items de la web caben
            // sin cortar el nombre (el problema era la altura fija con labels
            // largos tipo "Punto de Venta").
            // 9 era ilegible en un teléfono. 10 es el mínimo de la escala (`type.2xs`): por
            // debajo, un usuario tiene que agrandar la pantalla para leer dónde está.
            // `textAlign: center` sin lo cual la etiqueta se pegaba al borde
            // izquierdo de su casilla en vez de quedar centrada bajo el icono.
            tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginBottom: 3, textAlign: 'center' },
            tabBarStyle: {
              backgroundColor: colors.bgCard,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              height: 64,
              paddingTop: 8,
              paddingBottom: 6,
              ...shadow.sm,
            },
            // Nada de `flex` aquí: React Navigation YA reparte el ancho solo
            // (`bottomItem` es `flex: 1`). Forzarlo otra vez era ruido, y el
            // `flex: 1` que se coló en `tabBarIconStyle` estiraba el icono
            // verticalmente y empujaba la etiqueta hacia abajo.
            // ── La MISMA barra, dos contenidos ─────────────────────────────
            //
            // Configuración ya no es un modal: es otro MODO del mismo navegador,
            // así que en vez de dos barras pegadas hay una que se vacía y se
            // rellena. Estas dos piezas son necesarias por el mismo motivo que en
            // las pantallas ocultas: `tabBarButton: () => null` quita lo que se
            // DIBUJA, pero el View de fuera conserva `flex: 1` y `display:
            // 'none'` es lo que saca la casilla de verdad.
            tabBarButton: visibleEnBarra(route.name) ? undefined : () => null,
            tabBarItemStyle: visibleEnBarra(route.name)
              ? { paddingVertical: 2, justifyContent: 'center' }
              : { display: 'none' },
            tabBarLabel: esGrupo(route.name)
              ? gruposConfig.find(g => GRUPO_NOMBRE(g.id) === route.name)?.label || route.name
              : route.name,
            // Icono SVG real por tab (mismo Icon que la web) + puntito activo
            tabBarIcon: ({ focused }: { focused: boolean }) => {
              const item = [...NAV_ITEMS, ...MENU_SCREENS].find(t => t.label === route.name);
              // En Configuración el icono sale del grupo, no del módulo: el
              // `route.name` de un grupo es `config:<id>` y no está en NAV_ITEMS.
              const grupo = esGrupo(route.name)
                ? gruposConfig.find(g => GRUPO_NOMBRE(g.id) === route.name)
                : undefined;
              return (
                <View style={s.tabIcon}>
                  <Icon name={grupo ? ICONO_GRUPO[grupo.id] : (item?.icon || 'dashboard')} size={21} color={focused ? colors.primary : colors.textMuted} />
                  {focused && <View style={s.tabDot} />}
                </View>
              );
            },
          });
        }}
        >
          {tabs.map(t => (
            <Tab.Screen key={t.key} name={t.label} component={t.component} />
          ))}
          {/* Los grupos de Configuración son pantallas del MISMO navegador y no un
              modal aparte. Así la barra de abajo puede ser una cosa u otra según el
              modo, sin que haya dos pilas de navegación peleándose. */}
          {gruposConfig.map(g => (
            <Tab.Screen
              key={`grupo-${g.id}`}
              name={GRUPO_NOMBRE(g.id)}
              component={GrupoScreen}
              initialParams={{ grupo: g }}
            />
          ))}
          {/* Screens del menú de perfil: registradas sin botón en la tab bar */}
          {/* Los que se salieron de la barra también necesitan registro, sin
              botón: si no, el menú navega a un nombre que el navigator no conoce.

              OJO con el `display: 'none'`, que no es opcional. React Navigation
              envuelve cada pestaña en un View con `flex: 1`, y ese View es el
              que lleva `tabBarItemStyle`. Poner solo `tabBarButton: () => null`
              vacía lo que se DIBUJA pero no quita la casilla: la casilla sigue
              ocupando su tercio de ancho sin pintar nada. Con 9 rutas y 5
              visibles, 4 casillas fantasma se comían el 44% de la barra y los
              cinco iconos que sí se veían quedaban apretados a la izquierda con
              media pantalla vacía a la derecha. Por eso van las dos cosas. */}
          {desbordados.map(t => (
            <Tab.Screen
              key={`desbordado-${t.key}`}
              name={t.label}
              component={t.component}
              options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
            />
          ))}
          {menuScreens.map(t => (
            <Tab.Screen
              key={t.key}
              name={t.label}
              component={t.component}
              options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
            />
          ))}
        </Tab.Navigator>
      </NavigationContainer>

      {/* UN host de cada uno, montados aquí y no en cada pantalla: los 83
          Alert.alert que había eran 83 diálogos distintos, cada uno con su
          estilo. Aquí hay uno solo, con el tema del producto. */}
      <ToastHost />
      <DialogHost />

      <WelcomeTour forceOpen={tourOpen} onClose={() => setTourOpen(false)} />
      <LegalModal
        visible={legalDoc === 'privacy'}
        title="Política de Privacidad"
        content={PRIVACY_POLICY_MD}
        onClose={() => setLegalDoc(null)}
      />
      <LegalModal
        visible={legalDoc === 'terms'}
        title="Términos y Condiciones"
        content={TERMS_MD}
        onClose={() => setLegalDoc(null)}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 14 },
  // `paddingHorizontal` separa el logo del borde izquierdo y el icono de perfil
  // del derecho: sin él ambos quedaban pegados al canto de la pantalla. El
  // `paddingBottom` es el hueco que separa la fila del banner de prueba, que va
  // justo debajo y se le pegaba al icono.
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  back: { padding: 2, marginLeft: -2 },
  brandLogo: { width: 32, height: 32, borderRadius: 8 },
  brandName: { color: '#ffffff', fontWeight: '800', fontSize: 15 },

  offlinePill: {
    backgroundColor: colors.warning + '20',
    borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  offlinePillText: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  syncPill: {
    backgroundColor: colors.primaryTint,
    borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.primaryTintB,
  },
  syncPillConflict: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  syncPillText: { color: colors.primary, fontSize: 10, fontWeight: '700' },

  avatarBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  menuCard: {
    position: 'absolute', top: 110, right: 12, minWidth: 230,
    backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 6, ...shadow.md,
  },
  menuHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuName: { fontWeight: '700', fontSize: 14, color: colors.text },
  menuEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', marginTop: 6, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 8, borderRadius: 12 },
  menuItemText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  menuDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },

  trialBanner: { paddingVertical: 8, paddingHorizontal: 16 },
  trialBannerText: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },

  tabIcon: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabDot: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: colors.primary },

  noTabsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg },
  noTabsTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 },
  noTabsText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  noTabsBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 22 },
  noTabsBtnText: { color: '#fff', fontWeight: '700' },
});

// Estilos VIVOS: se reconstruyen cuando cambia el tema (dark mode).
let __stylesVersion = -1;
let __styles: ReturnType<typeof createStyles> | null = null;
const s = new Proxy({} as ReturnType<typeof createStyles>, {
  get(_t, prop) {
    if (__stylesVersion !== themeRef.version || !__styles) {
      __styles = createStyles();
      __stylesVersion = themeRef.version;
    }
    return __styles[prop as keyof ReturnType<typeof createStyles>];
  },
});
