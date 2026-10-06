import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { NotificationsAPI, type AppNotification, type NativePushStatus } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors } from '../config/theme';
import Icon from './Icon';
import { showAlert } from './dialogs';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

const TOKEN_KEY = 'cubagest.nativePushToken';

export async function unregisterNativePush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) await NotificationsAPI.unsubscribeNative(token);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

const cuando = (iso: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Ayer' : `Hace ${days} días`;
};

function moduloPara(link: string | null): string | null {
  const value = (link || '').toLowerCase();
  if (value.includes('transfer') || value.includes('envio')) return 'transferencias';
  if (value.includes('cierre') || value.includes('closing')) return 'cierre';
  if (value.includes('inventario') || value.includes('stock')) return 'inventario';
  if (value.includes('descuento')) return 'config:descuentos';
  if (value.includes('movimiento') || value.includes('caja')) return 'movimientos';
  return null;
}

export default function NotificationsBell({ onNavigate }: { onNavigate?: (module: string) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [permission, setPermission] = useState<Notifications.PermissionStatus | 'unknown'>('unknown');
  const [pushStatus, setPushStatus] = useState<NativePushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  const companyId = user?.company?.id || '';
  const userId = user?.id || '';
  const cacheKey = useMemo(() => `cubagest.notifications.${companyId}.${userId}`, [companyId, userId]);
  const disabledKey = useMemo(() => `cubagest.nativePushDisabled.${companyId}.${userId}`, [companyId, userId]);
  const projectId = Constants.easConfig?.projectId || (Constants.expoConfig?.extra as any)?.eas?.projectId;

  const load = useCallback(async () => {
    if (!companyId || !userId) return;
    setLoading(true);
    try {
      const result = await NotificationsAPI.list();
      const nextItems = result?.items || [];
      setItems(nextItems);
      setUnread(result?.unread || 0);
      setOffline(false);
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ items: nextItems, unread: result?.unread || 0 }));
    } catch {
      setOffline(true);
      try {
        const saved = await AsyncStorage.getItem(cacheKey);
        if (saved) {
          const data = JSON.parse(saved) as { items?: AppNotification[]; unread?: number };
          setItems(data.items || []);
          setUnread(data.unread || 0);
        }
      } catch { /* una caché ilegible no impide abrir el resto de la app */ }
    } finally {
      setLoading(false);
    }
  }, [cacheKey, companyId, userId]);

  const refreshPushStatus = useCallback(async () => {
    try { setPushStatus(await NotificationsAPI.nativeStatus()); }
    catch { setPushStatus(null); }
  }, []);

  const registerToken = useCallback(async () => {
    if (!Device.isDevice) throw new Error('Las notificaciones del sistema requieren un teléfono físico.');
    if (!projectId) throw new Error('Falta el identificador del proyecto EAS. La bandeja interna sí funciona; configura el proyecto móvil antes de activar push.');
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new Error('Esta plataforma no admite avisos móviles.');
    let current = await Notifications.getPermissionsAsync();
    if (current.status !== 'granted') current = await Notifications.requestPermissionsAsync();
    setPermission(current.status);
    if (current.status !== 'granted') throw new Error('Permiso de notificaciones denegado. Puedes activarlo en los ajustes del teléfono.');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos de CubaGest',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await NotificationsAPI.subscribeNative(token, Platform.OS as 'ios' | 'android');
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.removeItem(disabledKey);
    await refreshPushStatus();
  }, [disabledKey, projectId, refreshPushStatus]);

  useEffect(() => {
    void load();
    void refreshPushStatus();
    Notifications.getPermissionsAsync().then(async (result) => {
      setPermission(result.status);
      if (result.status !== 'granted' || !projectId || !Device.isDevice) return;
      if ((await AsyncStorage.getItem(disabledKey)) === '1') return;
      try { await registerToken(); } catch { /* el inbox permanece disponible aunque falle el registro */ }
    }).catch(() => setPermission('unknown'));

    const received = Notifications.addNotificationReceivedListener(() => { void load(); });
    const response = Notifications.addNotificationResponseReceivedListener(() => {
      setOpen(true);
      void load();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') { void load(); void refreshPushStatus(); }
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 60000);
    return () => {
      received.remove();
      response.remove();
      appState.remove();
      clearInterval(timer);
    };
  }, [disabledKey, load, projectId, refreshPushStatus, registerToken]);

  const markRead = async (notice: AppNotification) => {
    if (notice.readAt) return;
    const nextItems = items.map((item) => item.id === notice.id ? { ...item, readAt: new Date().toISOString() } : item);
    const nextUnread = Math.max(0, unread - 1);
    setItems(nextItems);
    setUnread(nextUnread);
    await AsyncStorage.setItem(cacheKey, JSON.stringify({ items: nextItems, unread: nextUnread })).catch(() => {});
    await NotificationsAPI.markRead([notice.id]).catch(() => {});
  };

  const openNotice = async (notice: AppNotification) => {
    await markRead(notice);
    const module = moduloPara(notice.link);
    setOpen(false);
    if (module) onNavigate?.(module);
  };

  const markAllRead = async () => {
    const nextItems = items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }));
    setItems(nextItems);
    setUnread(0);
    await AsyncStorage.setItem(cacheKey, JSON.stringify({ items: nextItems, unread: 0 })).catch(() => {});
    await NotificationsAPI.markRead([], true).catch(() => {});
  };

  const activatePush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      await registerToken();
      showAlert('Avisos activados en este dispositivo. Los avisos también quedan guardados en la bandeja de CubaGest.');
    } catch (error) {
      const message = (error as Error).message || 'No se pudieron activar los avisos.';
      setPushMessage(message);
      showAlert(message);
    } finally { setPushBusy(false); }
  };

  const deactivatePush = async () => {
    setPushBusy(true);
    try {
      await AsyncStorage.setItem(disabledKey, '1');
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) await NotificationsAPI.unsubscribeNative(token);
      await AsyncStorage.removeItem(TOKEN_KEY);
      await refreshPushStatus();
      showAlert('Avisos del sistema desactivados en este dispositivo. La bandeja interna sigue disponible.');
    } catch (error) {
      setPushMessage((error as Error).message || 'No se pudo desactivar el push.');
    } finally { setPushBusy(false); }
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Avisos${unread ? `, ${unread} sin leer` : ''}`}
        style={styles.bellButton}
        onPress={() => { setOpen(true); void load(); }}
      >
        <Icon name="bell" size={19} color={colors.text} />
        {unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Avisos</Text>
                <Text style={styles.subtitle}>{unread} sin leer</Text>
              </View>
              <View style={styles.headerActions}>
                {unread > 0 && <TouchableOpacity onPress={markAllRead}><Text style={styles.action}>Marcar leídos</Text></TouchableOpacity>}
                <TouchableOpacity accessibilityLabel="Cerrar avisos" onPress={() => setOpen(false)}><Icon name="close" size={20} color={colors.textMuted} /></TouchableOpacity>
              </View>
            </View>

            {offline && <Text style={styles.offlineNote}>Sin conexión: mostrando los avisos guardados en este dispositivo.</Text>}
            <ScrollView style={styles.list}>
              {items.length === 0 && <Text style={styles.empty}>{loading ? 'Cargando avisos…' : 'No hay avisos todavía.'}</Text>}
              {items.map((notice) => (
                <TouchableOpacity key={notice.id} style={[styles.notice, !notice.readAt && styles.unreadNotice]} onPress={() => void openNotice(notice)}>
                  <View style={styles.noticeTitleRow}>
                    <Text style={styles.noticeTitle}>{notice.title}</Text>
                    {!notice.readAt && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.noticeBody}>{notice.body}</Text>
                  <Text style={styles.date}>{cuando(notice.createdAt)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.pushPanel}>
              <Text style={styles.pushTitle}>Avisos del sistema</Text>
              {!Device.isDevice ? (
                <Text style={styles.pushHint}>El push del sistema se activa desde un teléfono físico. La bandeja interna está disponible.</Text>
              ) : !projectId ? (
                <Text style={styles.pushHint}>Falta configurar el identificador del proyecto EAS para este build. La bandeja interna funciona mientras tanto.</Text>
              ) : pushStatus?.registered && permission === 'granted' ? (
                <View>
                  <Text style={styles.pushHint}>Este usuario tiene un dispositivo móvil registrado.</Text>
                  <TouchableOpacity style={styles.secondaryButton} disabled={pushBusy} onPress={() => void deactivatePush()}>
                    <Text style={styles.secondaryButtonText}>{pushBusy ? 'Actualizando…' : 'Desactivar en este dispositivo'}</Text>
                  </TouchableOpacity>
                </View>
              ) : permission === 'denied' ? (
                <Text style={styles.pushHint}>El permiso está bloqueado en los ajustes del teléfono. La bandeja interna sigue disponible.</Text>
              ) : (
                <View>
                  <Text style={styles.pushHint}>Recibe avisos en el teléfono cuando llegue un faltante, traspaso o movimiento que requiere atención.</Text>
                  <TouchableOpacity style={styles.primaryButton} disabled={pushBusy} onPress={() => void activatePush()}>
                    <Text style={styles.primaryButtonText}>{pushBusy ? 'Activando…' : 'Activar avisos del sistema'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!!pushMessage && <Text style={styles.pushError}>{pushMessage}</Text>}
              {pushStatus?.registered && pushStatus.devices[0]?.lastOkAt && (
                <Text style={styles.pushMeta}>Último envío aceptado {cuando(pushStatus.devices[0].lastOkAt)}.</Text>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 520, maxHeight: '88%', overflow: 'hidden', borderRadius: 18, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  header: { minHeight: 64, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  action: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  list: { flexGrow: 0, minHeight: 120, maxHeight: 350 },
  empty: { color: colors.textMuted, textAlign: 'center', padding: 28, fontSize: 13 },
  notice: { paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  unreadNotice: { backgroundColor: colors.primaryTint },
  noticeTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  noticeTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  noticeBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  date: { color: colors.textMuted, fontSize: 10, marginTop: 5 },
  offlineNote: { color: colors.warningTextDark, backgroundColor: colors.warningBg, padding: 10, fontSize: 11 },
  pushPanel: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary },
  pushTitle: { color: colors.text, fontSize: 12, fontWeight: '800', marginBottom: 5 },
  pushHint: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  pushError: { color: colors.dangerText, fontSize: 11, marginTop: 7 },
  pushMeta: { color: colors.textMuted, fontSize: 10, marginTop: 7 },
  primaryButton: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 9 },
  primaryButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  secondaryButton: { alignSelf: 'flex-start', backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 9 },
  secondaryButtonText: { color: colors.text, fontSize: 11, fontWeight: '700' },
});
