import React, { useState } from 'react';
import { TouchableOpacity, Text, Alert, View, StyleSheet, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { ROLES } from '../config/roles';
import { colors, shadow } from '../config/theme';
import { PRIVACY_POLICY_MD, TERMS_MD } from '../config/legalContent';
import PlanModal from '../components/PlanModal';
import LegalModal from '../components/LegalModal';
import WelcomeTour from '../components/WelcomeTour';

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

const Tab = createBottomTabNavigator();

// Emojis modernos como íconos de tab
const TAB_EMOJI: Record<string, string> = {
  dashboard: '📊',
  inventario: '📦',
  pos: '🖥️',
  facturacion: '🧾',
  contabilidad: '💰',
  cierre: '🧮',
  transferencias: '🚚',
  auditoria: '🕵️',
  usuarios: '👥',
  monedas: '💱',
};

interface TabDef {
  key: string;
  label: string;
  component: React.ComponentType<any>;
}

const ALL_TABS: TabDef[] = [
  { key: 'dashboard', label: 'Inicio', component: DashboardScreen },
  { key: 'inventario', label: 'Inventario', component: InventarioScreen },
  { key: 'pos', label: 'Vender', component: POSScreen },
  { key: 'facturacion', label: 'Facturas', component: FacturacionScreen },
  { key: 'contabilidad', label: 'Gastos', component: ContabilidadScreen },
  { key: 'cierre', label: 'Cierre', component: CierreCajaScreen },
  { key: 'transferencias', label: 'Envíos', component: TransferenciasScreen },
  { key: 'auditoria', label: 'Auditoría', component: AuditoriaScreen },
  { key: 'monedas', label: 'Monedas', component: MonedasScreen },
  { key: 'usuarios', label: 'Usuarios', component: UsuariosScreen },
];

function HeaderRight({ onOpenPlan, onOpenLegal, onOpenTour }: { onOpenPlan: () => void; onOpenLegal: (doc: 'privacy' | 'terms') => void; onOpenTour: () => void }) {
  const { user, logout, online } = useAuth();
  const { pendingCount, conflictCount, syncing, syncNow } = useSync();
  const [menuOpen, setMenuOpen] = useState(false);

  const confirmLogout = () => {
    setMenuOpen(false);
    Alert.alert('Cerrar sesión', '¿Seguro que desea salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  };

  const roleColor = ROLES[user?.role || '']?.color || colors.primary;

  return (
    <View style={styles.headerRight}>
      {!online && (
        <View style={styles.offlinePill}>
          <Text style={styles.offlinePillText}>● OFFLINE</Text>
        </View>
      )}
      {/* Contador de ventas offline pendientes/conflictos — paridad con
          OfflineBanner de la web. Toca para forzar sincronización. */}
      {(pendingCount > 0 || conflictCount > 0) && (
        <TouchableOpacity
          style={[styles.syncPill, conflictCount > 0 && styles.syncPillConflict]}
          onPress={() => syncNow(true)}
        >
          <Text style={styles.syncPillText}>
            {conflictCount > 0
              ? `⚠ ${conflictCount} conflicto${conflictCount !== 1 ? 's' : ''}`
              : syncing
                ? '⟳ Sync...'
                : `⇅ ${pendingCount}`}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => setMenuOpen(true)}
        style={[styles.avatarBtn, { backgroundColor: roleColor }]}
      >
        <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuName}>{user?.name}</Text>
              <Text style={styles.menuEmail}>{user?.email}</Text>
              <View style={[styles.roleBadge, { backgroundColor: roleColor + '18' }]}>
                <Text style={[styles.roleBadgeText, { color: roleColor }]}>{ROLES[user?.role || '']?.label || user?.role}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); onOpenPlan(); }}>
              <Text style={styles.menuItemText}>💳  Mi Plan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); onOpenTour(); }}>
              <Text style={styles.menuItemText}>👋  Ver tour de bienvenida</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); onOpenLegal('privacy'); }}>
              <Text style={styles.menuItemText}>📄  Política de Privacidad</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); onOpenLegal('terms'); }}>
              <Text style={styles.menuItemText}>📄  Términos y Condiciones</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={confirmLogout}>
              <Text style={[styles.menuItemText, { color: colors.primary }]}>🚪  Cerrar sesión</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

interface TrialBannerInfo {
  daysLeft: number;
  urgent: boolean;
  color: string;
}

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
    <TouchableOpacity style={[styles.trialBanner, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.trialBannerText}>
        {urgent ? '⚠ ' : '🎁 '}
        Período de prueba gratis — {daysLeft} día{daysLeft !== 1 ? 's' : ''} restante{daysLeft !== 1 ? 's' : ''}
        {urgent ? ' · Toca aquí para ver planes' : ' · Plan Empresarial completo'}
      </Text>
    </TouchableOpacity>
  );
}

export default function AppNavigator() {
  const { user, logout } = useAuth();
  const perms = ROLES[user?.role || '']?.perms || [];
  const tabs = ALL_TABS.filter(t => perms.includes(t.key));

  // Blindaje: si el rol del usuario no produce ninguna pestaña (rol nuevo,
  // usuario cacheado antiguo, etc.), mostramos un aviso en vez de dejar que
  // el Tab.Navigator crashee con "Couldn't find any screens for the
  // navigator" — que es el crash reportado al iniciar sesión.
  if (tabs.length === 0) {
    return (
      <View style={styles.noTabsWrap}>
        <Text style={styles.noTabsTitle}>Sin módulos para tu rol</Text>
        <Text style={styles.noTabsText}>
          Tu usuario (rol: {String(user?.role || 'desconocido')}) no tiene
          módulos asignados. Cierra sesión y vuelve a entrar para refrescar
          tus permisos, o contacta al administrador.
        </Text>
        <TouchableOpacity style={styles.noTabsBtn} onPress={logout}>
          <Text style={styles.noTabsBtnText}>Cerrar sesión</Text>
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
        <SafeAreaView edges={['top']} style={{ backgroundColor: trialInfo.color }}>
          <TrialBanner info={trialInfo} onPress={() => setPlanOpen(true)} />
        </SafeAreaView>
      )}

      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => {
            const tabKey = ALL_TABS.find(t => t.label === route.name)?.key;
            return {
              headerRight: () => (
                <HeaderRight
                  onOpenPlan={() => setPlanOpen(true)}
                  onOpenLegal={(doc) => setLegalDoc(doc)}
                  onOpenTour={() => setTourOpen(true)}
                />
              ),
              headerStyle: {
                backgroundColor: '#ffffff',
                ...shadow.sm,
              },
              headerTitleStyle: {
                fontWeight: '800',
                fontSize: 17,
                color: colors.text,
              },
              headerTintColor: colors.text,
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
              tabBarStyle: {
                backgroundColor: '#ffffff',
                borderTopColor: colors.border,
                borderTopWidth: 1,
                height: 60,
                paddingTop: 6,
                ...shadow.sm,
              },
              tabBarIcon: ({ focused }: { focused: boolean }) => (
                <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                  <Text style={{ fontSize: 20 }}>{TAB_EMOJI[tabKey || ''] || '●'}</Text>
                </View>
              ),
            };
          }}
        >
          {tabs.map(t => (
            <Tab.Screen key={t.key} name={t.label} component={t.component} />
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

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 14 },
  offlinePill: {
    backgroundColor: colors.warning + '20',
    borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  offlinePillText: { color: colors.warning, fontSize: 10, fontWeight: '700' },
  syncPill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  syncPillConflict: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  syncPillText: { color: '#1D4ED8', fontSize: 10, fontWeight: '700' },

  avatarBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' },
  menuCard: {
    position: 'absolute', top: 56, right: 12, minWidth: 230,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 6, ...shadow.md,
  },
  menuHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  menuName: { fontWeight: '700', fontSize: 14, color: colors.text },
  menuEmail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', marginTop: 6, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  menuDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 4 },

  trialBanner: { paddingVertical: 8, paddingHorizontal: 16 },
  trialBannerText: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },

  tabIcon: { alignItems: 'center', justifyContent: 'center', width: 32, height: 28, borderRadius: 8 },
  tabIconActive: { backgroundColor: colors.primary + '15' },

  noTabsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F8FAFC' },
  noTabsTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  noTabsText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  noTabsBtn: { backgroundColor: '#3B82F6', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 22 },
  noTabsBtnText: { color: '#fff', fontWeight: '700' },
});
