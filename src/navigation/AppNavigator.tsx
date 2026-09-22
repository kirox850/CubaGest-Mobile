import React, { useState } from 'react';
import { TouchableOpacity, Text, Alert, View, Image, StyleSheet, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTheme } from '../context/ThemeContext';
import { ROLES } from '../config/roles';
import { colors, shadow, NAVY, themeRef } from '../config/theme';
import { PRIVACY_POLICY_MD, TERMS_MD } from '../config/legalContent';
import type { User } from '../types';
import PlanModal from '../components/PlanModal';
import LegalModal from '../components/LegalModal';
import WelcomeTour from '../components/WelcomeTour';
import Icon from '../components/Icon';

import DashboardScreen from '../screens/DashboardScreen';
import InventarioScreen from '../screens/InventarioScreen';
import POSScreen from '../screens/POSScreen';
import FacturacionScreen from '../screens/FacturacionScreen';
import ContabilidadScreen from '../screens/ContabilidadScreen';
import UsuariosScreen from '../screens/UsuariosScreen';
import CierreCajaScreen from '../screens/CierreCajaScreen';
import TransferenciasScreen from '../screens/TransferenciasScreen';
import AuditoriaScreen from '../screens/AuditoriaScreen';
import MonedasScreen from '../screens/MonedasScreen';
import DiscountsScreen from '../screens/DiscountsScreen';

const Tab = createBottomTabNavigator();

// ─── NAV ITEMS (paridad 1:1 con App.tsx de la web) ───────────────────────────
// Mismos ids, labels e iconos que la barra inferior / sidebar de la web.
// Los módulos usuarios/auditoria/monedas/descuentos NO van en la barra: en la
// web se abren desde el menú de perfil y aquí se replican igual (screens
// ocultas a las que el menú navega).
const NAV_ITEMS: { key: string; label: string; icon: string; component: React.ComponentType<any> }[] = [
  { key: 'dashboard',    label: 'Dashboard',      icon: 'dashboard',    component: DashboardScreen },
  { key: 'inventario',   label: 'Inventario',     icon: 'inventario',   component: InventarioScreen },
  { key: 'pos',          label: 'Punto de Venta', icon: 'pos',          component: POSScreen },
  { key: 'facturacion',  label: 'Facturas',       icon: 'facturacion',  component: FacturacionScreen },
  { key: 'contabilidad', label: 'Contabilidad',   icon: 'contabilidad', component: ContabilidadScreen },
  { key: 'cierre',       label: 'Cierre de Caja', icon: 'cierre',       component: CierreCajaScreen },
  { key: 'transferencias', label: 'Envíos',       icon: 'transferencias', component: TransferenciasScreen },
];

// Screens de menú (sin botón en la tab bar)
const MENU_SCREENS: { key: string; label: string; icon: string; component: React.ComponentType<any> }[] = [
  { key: 'usuarios',   label: 'Usuarios',    icon: 'usuarios',   component: UsuariosScreen },
  { key: 'auditoria',  label: 'Auditoría',   icon: 'auditoria',  component: AuditoriaScreen },
  { key: 'descuentos', label: 'Descuentos',  icon: 'facturacion', component: DiscountsScreen },
  { key: 'monedas',    label: 'Monedas y Tasas', icon: 'contabilidad', component: MonedasScreen },
];

function HeaderRight({ navigation, onOpenPlan, onOpenLegal, onOpenTour, onOpenModule }: {
  navigation: any;
  onOpenPlan: () => void;
  onOpenLegal: (doc: 'privacy' | 'terms') => void;
  onOpenTour: () => void;
  onOpenModule: (key: string) => void;
}) {
  const { user, logout, online } = useAuth();
  const { mode, toggle: toggleTheme } = useTheme();
  const { pendingCount, conflictCount, syncing, syncNow } = useSync();
  const [menuOpen, setMenuOpen] = useState(false);
  const perms = ROLES[user?.role || '']?.perms || [];

  const confirmLogout = () => {
    setMenuOpen(false);
    Alert.alert('Cerrar sesión', '¿Seguro que desea salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  };

  const roleColor = ROLES[user?.role || '']?.color || colors.primary;

  // Item del menú con icono SVG real (paridad con el menú de perfil web)
  const Item = ({ icon, label, onPress, color }: { icon: string; label: string; onPress: () => void; color?: string }) => (
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
              ? `⚠ ${conflictCount} conflicto${conflictCount !== 1 ? 's' : ''}`
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

            <Item icon="facturacion" label="Mi Plan" onPress={onOpenPlan} />
            {user?.role === 'admin' && <Item icon="usuarios" label="Usuarios" onPress={() => onOpenModule('usuarios')} />}
            {perms.includes('auditoria') && <Item icon="auditoria" label="Auditoría" onPress={() => onOpenModule('auditoria')} />}
            {user?.role === 'admin' && <Item icon="facturacion" label="Descuentos" onPress={() => onOpenModule('descuentos')} />}
            {user?.role === 'admin' && <Item icon="contabilidad" label="Monedas y Tasas" onPress={() => onOpenModule('monedas')} />}
            <Item icon="dashboard" label="Ver tour de bienvenida" onPress={onOpenTour} />
            <TouchableOpacity style={s.menuItem} onPress={() => { toggleTheme(); }}>
              <Text style={{ fontSize: 16 }}>{mode === 'dark' ? '☀️' : '🌙'}</Text>
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
  return { daysLeft, urgent, color: urgent ? '#C2410C' : '#1D4ED8' };
}

function TrialBanner({ info, onPress }: { info: TrialBannerInfo; onPress: () => void }) {
  const { daysLeft, urgent, color } = info;
  return (
    <TouchableOpacity style={[s.trialBanner, { backgroundColor: color }]} onPress={onPress}>
      <Text style={s.trialBannerText}>
        {urgent ? '⚠ ' : '🎁 '}
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

  // Barra inferior: solo los 7 nav items de la web filtrados por permisos.
  const tabs = NAV_ITEMS.filter(n => perms.includes(n.key));
  // Screens de menú disponibles según rol (se registran ocultas para poder
  // navegar a ellas desde el menú de perfil).
  const menuScreens = MENU_SCREENS.filter(t =>
    (t.key === 'usuarios' && user?.role === 'admin') ||
    (t.key === 'descuentos' && user?.role === 'admin') ||
    (t.key === 'monedas' && user?.role === 'admin') ||
    (t.key === 'auditoria' && perms.includes('auditoria'))
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

  const [planOpen, setPlanOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const trialInfo = getTrialBannerInfo(user);

  return (
    <View style={{ flex: 1 }}>
      {trialInfo && (
        <SafeAreaView edges={['top']} style={{ backgroundColor: NAVY }}>
          <TrialBanner info={trialInfo} onPress={() => setPlanOpen(true)} />
        </SafeAreaView>
      )}

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
          screenOptions={({ navigation, route }) => ({
            headerStyle: { backgroundColor: NAVY, ...shadow.sm },
            // Header navy de marca con logo — idéntico al top header de la web
            headerTitle: () => (
              <View style={s.brandRow}>
                <Image source={require('../assets/images/icon.png')} style={s.brandLogo} />
                <Text style={s.brandName}>CubaGest</Text>
              </View>
            ),
            headerRight: () => (
              <HeaderRight
                navigation={navigation}
                onOpenPlan={() => setPlanOpen(true)}
                onOpenLegal={(doc) => setLegalDoc(doc)}
                onOpenTour={() => setTourOpen(true)}
                onOpenModule={(key) => navigation.navigate(key === 'monedas' ? 'Monedas y Tasas' : key === 'descuentos' ? 'Descuentos' : key === 'usuarios' ? 'Usuarios' : 'Auditoría')}
              />
            ),
            headerTintColor: '#ffffff',
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontSize: 10, fontWeight: '400', marginBottom: 2 },
            tabBarStyle: {
              backgroundColor: colors.bgCard,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              height: 58,
              paddingTop: 6,
              ...shadow.sm,
            },
            // Icono SVG real por tab (mismo Icon que la web) + puntito activo
            tabBarIcon: ({ focused }: { focused: boolean }) => {
              const item = [...NAV_ITEMS, ...MENU_SCREENS].find(t => t.label === route.name);
              return (
                <View style={s.tabIcon}>
                  <Icon name={item?.icon || 'dashboard'} size={22} color={focused ? colors.primary : colors.textMuted} />
                  {focused && <View style={s.tabDot} />}
                </View>
              );
            },
          })}
        >
          {tabs.map(t => (
            <Tab.Screen key={t.key} name={t.label} component={t.component} />
          ))}
          {/* Screens del menú de perfil: registradas sin botón en la tab bar */}
          {menuScreens.map(t => (
            <Tab.Screen
              key={t.key}
              name={t.label}
              component={t.component}
              options={{ tabBarButton: () => null }}
            />
          ))}
        </Tab.Navigator>
      </NavigationContainer>

      <PlanModal visible={planOpen} onClose={() => setPlanOpen(false)} user={user} />
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

  tabIcon: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },

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
