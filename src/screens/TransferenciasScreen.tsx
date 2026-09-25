import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Modal, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TransfersAPI, LocationsAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { Badge, EmptyState, ErrorBanner } from '../components/UI';
import type { Location, LocationStockItem, Transfer } from '../types';

const fmt = (n: number) => Number(n || 0).toFixed(2);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleString('es-CU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#F97316' },
  aprobado: { label: 'Aprobado', color: colors.success },
  rechazado: { label: 'Rechazado', color: colors.danger },
  cancelado: { label: 'Cancelado', color: colors.textMuted },
};

export default function TransferenciasScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'pendientes' | 'todos'>('pendientes');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Nuevo envío
  const [modal, setModal] = useState(false);
  const [stockItems, setStockItems] = useState<LocationStockItem[]>([]);
  const [toLocationId, setToLocationId] = useState('');
  // El admin no tiene ubicación propia: el backend exige fromLocationId.
  const [fromLocationId, setFromLocationId] = useState('');
  const [selProductId, setSelProductId] = useState('');
  const [selQty, setSelQty] = useState('');
  const [selItems, setSelItems] = useState<{ productId: string; name: string; qty: number }[]>([]);
  const [notes, setNotes] = useState('');

  // Rechazo
  const [rejectTarget, setRejectTarget] = useState<Transfer | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Ubicación propia del usuario (la que el backend usa como origen cuando no
  // se manda fromLocationId: almacenista → almacén, cajero → su caja).
  const ownLocationId = (locs: Location[]): string => {
    if (user?.role === 'almacenista') return locs.find((l) => l.type === 'almacen')?.id || '';
    if (user?.role === 'cajero') return locs.find((l) => l.type === 'caja' && l.ownerUserId === user?.id)?.id || '';
    return '';
  };

  // ── Permisos de resolución (el backend manda) ─────────────────────────────
  // canResolveTransfer: solo el dueño del DESTINO resuelve (almacenista si el
  // destino es un almacén, cajero si es su caja). El admin NO puede.
  // Cada envío llega con canResolve/canCancel ya resueltos por el servidor; el
  // cálculo local solo se usa si el backend no los manda (respuestas viejas).
  const canResolve = (t: Transfer): boolean => {
    if (typeof t.canResolve === 'boolean') return t.canResolve;
    const dest = locations.find((l) => l.id === t.toLocationId);
    if (!dest || dest.active === false) return false;
    if (user?.role === 'almacenista') return dest.type === 'almacen';
    if (user?.role === 'cajero') return dest.type === 'caja' && dest.ownerUserId === user?.id;
    return false;
  };
  // Cancelar: quien creó el envío, o el admin (cualquier otro recibe 403).
  const canCancel = (t: Transfer): boolean =>
    typeof t.canCancel === 'boolean' ? t.canCancel : user?.role === 'admin' || t.requestedById === user?.id;

  const load = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const [trs, locs] = await Promise.all([
        TransfersAPI.list(),
        LocationsAPI.list(),
      ]);
      setTransfers(trs);
      setLocations(locs);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const locName = (id: string) => locations.find((l) => l.id === id)?.name || '—';
  const pending = transfers.filter((t) => t.status === 'pendiente');
  const visible = tab === 'pendientes' ? pending : transfers;

  // Carga el stock de la ubicación de ORIGEN elegida (admin) o propia.
  const loadSourceStock = async (sourceId: string) => {
    if (!sourceId) {
      setStockItems([]);
      return;
    }
    const { items } = await LocationsAPI.stock(sourceId);
    setStockItems(items.filter((p) => p.stock > 0));
  };

  const openNew = async () => {
    try {
      const locs = locations.length ? locations : await LocationsAPI.list();
      setLocations(locs);
      const own = ownLocationId(locs);
      const source = isAdmin ? '' : own;
      setFromLocationId(source);
      if (!isAdmin) await loadSourceStock(own);
      setSelItems([]);
      setSelProductId('');
      setSelQty('');
      setNotes('');
      setToLocationId('');
      setModal(true);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  };

  const addItem = () => {
    const p = stockItems.find((i) => i.id === selProductId);
    const q = Number(selQty);
    if (!p || !q || q <= 0) return Alert.alert('Error', 'Seleccione producto y cantidad válida');
    if (q > Number(p.stock)) return Alert.alert('Stock insuficiente', `Disponible: ${p.stock}`);
    setSelItems((prev) => [...prev.filter((i) => i.productId !== p.id), { productId: p.id, name: p.name, qty: q }]);
    setSelProductId('');
    setSelQty('');
  };

  const createTransfer = async () => {
    if (isAdmin && !fromLocationId) return Alert.alert('Error', 'Seleccione la ubicación de origen');
    if (!toLocationId) return Alert.alert('Error', 'Seleccione ubicación de destino');
    if (selItems.length === 0) return Alert.alert('Error', 'Agregue al menos un producto');
    setSaving(true);
    try {
      await TransfersAPI.create({
        // El admin debe indicar el origen; los demás roles usan el suyo.
        fromLocationId: isAdmin ? fromLocationId : undefined,
        toLocationId,
        items: selItems.map((i) => ({ productId: i.productId, qty: i.qty })),
        notes: notes || undefined,
      });
      setModal(false);
      load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const approve = async (t: Transfer) => {
    Alert.alert('Aprobar envío', 'Se moverá el stock del origen al destino. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar', style: 'default', onPress: async () => {
          try {
            await TransfersAPI.approve(t.id);
            Alert.alert('✓', 'Envío aprobado');
            load();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await TransfersAPI.reject(rejectTarget.id, rejectReason || undefined);
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (t: Transfer) => {
    Alert.alert('Cancelar envío', '¿Seguro que desea cancelar este envío?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
          try {
            await TransfersAPI.cancel(t.id);
            load();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Envíos entre ubicaciones</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {([['pendientes', `Pendientes (${pending.length})`], ['todos', 'Todos']] as const).map(([v, l]) => (
          <TouchableOpacity key={v} style={[styles.tabBtn, tab === v && styles.tabBtnActive]} onPress={() => setTab(v)}>
            <Text style={[styles.tabText, tab === v && styles.tabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ErrorBanner message={error} />

      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <EmptyState icon="🚚" text={tab === 'pendientes' ? 'No hay envíos pendientes' : 'No hay envíos registrados todavía'} />
        }
        renderItem={({ item: t }) => {
          const st = STATUS_BADGE[t.status] || { label: t.status, color: colors.textMuted };
          // Solo se muestran las acciones que el backend acepta para este
          // usuario: antes se mostraban siempre y el usuario recibía un 403
          // ("Solo quien recibe puede aprobar") sin saber por qué.
          const showApprove = t.status === 'pendiente' && canResolve(t);
          const showCancel = t.status === 'pendiente' && canCancel(t);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.route}>{locName(t.fromLocationId)} → {locName(t.toLocationId)}</Text>
                  <Text style={styles.cardSub}>{fmtDate(t.createdAt)} · Por {t.requestedBy?.name || '—'}</Text>
                  {t.notes ? <Text style={styles.cardSub}>📝 {t.notes}</Text> : null}
                </View>
                <Badge label={st.label} color={st.color} />
              </View>

              {(t.items || []).map((i) => (
                <Text key={i.id} style={styles.itemLine}>• {i.qty} {i.unit} — {i.productName}</Text>
              ))}

              {t.status === 'pendiente' && (showApprove || showCancel) && (
                <View style={styles.actionsRow}>
                  {showApprove && (
                    <TouchableOpacity style={styles.btnApprove} onPress={() => approve(t)}>
                      <Text style={styles.btnApproveText}>Aprobar</Text>
                    </TouchableOpacity>
                  )}
                  {showApprove && (
                    <TouchableOpacity style={styles.btnReject} onPress={() => setRejectTarget(t)}>
                      <Text style={styles.btnRejectText}>Rechazar</Text>
                    </TouchableOpacity>
                  )}
                  {showCancel && (
                    <TouchableOpacity style={styles.btnCancel} onPress={() => cancel(t)}>
                      <Text style={styles.btnCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Modal nuevo envío */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Nuevo envío</Text>
            <Text style={styles.hint}>El stock sigue en su ubicación hasta que el destino apruebe.</Text>

            {/* Origen: solo el admin lo elige (los demás roles usan su propia
                ubicación y el backend la resuelve solo). */}
            {isAdmin && (
              <>
                <Text style={styles.fieldLabel}>Origen *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {locations
                      .filter((l) => l.active !== false)
                      .map((l) => (
                        <TouchableOpacity
                          key={l.id}
                          style={[styles.chip, fromLocationId === l.id && styles.chipActive]}
                          onPress={() => {
                            setFromLocationId(l.id);
                            setSelItems([]);
                            loadSourceStock(l.id).catch((e) =>
                              Alert.alert('Error', (e as Error).message),
                            );
                          }}
                        >
                          <Text style={[styles.chipText, fromLocationId === l.id && { color: '#fff' }]}>{l.name}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                </ScrollView>
              </>
            )}

            <Text style={styles.fieldLabel}>Destino *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {locations
                  .filter((l) => l.active !== false && l.id !== (isAdmin ? fromLocationId : ownLocationId(locations)))
                  .map((l) => (
                    <TouchableOpacity
                      key={l.id}
                      style={[styles.chip, toLocationId === l.id && styles.chipActive]}
                      onPress={() => setToLocationId(l.id)}
                    >
                      <Text style={[styles.chipText, toLocationId === l.id && { color: '#fff' }]}>{l.name}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </ScrollView>

            <Text style={styles.fieldLabel}>Productos</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              <ScrollView style={{ flex: 1, maxHeight: 120 }}>
                {stockItems.length === 0 && (
                  <Text style={styles.hint}>
                    {isAdmin
                      ? 'Elija la ubicación de origen para ver su stock.'
                      : 'No hay stock disponible en su ubicación.'}
                  </Text>
                )}
                {stockItems.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.productOption, selProductId === p.id && styles.productOptionActive]}
                    onPress={() => setSelProductId(p.id)}
                  >
                    <Text style={styles.productOptionText}>{p.name} ({p.stock} {p.unit})</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ width: 90, gap: 6 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Cant."
                  keyboardType="numeric"
                  value={selQty}
                  onChangeText={setSelQty}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={styles.btnApprove} onPress={addItem}>
                  <Text style={styles.btnApproveText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {selItems.map((i) => (
              <View key={i.productId} style={styles.selItemRow}>
                <Text style={styles.selItemText}>{i.qty}x {i.name}</Text>
                <TouchableOpacity onPress={() => setSelItems((prev) => prev.filter((x) => x.productId !== i.productId))}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Notas (opcional)"
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setModal(false)}>
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnApprove, saving && { opacity: 0.6 }]} onPress={createTransfer} disabled={saving}>
                <Text style={styles.btnApproveText}>{saving ? 'Enviando...' : 'Crear envío'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal rechazo con motivo */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rechazar envío</Text>
            <TextInput
              style={styles.input}
              placeholder="Motivo (opcional)"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setRejectTarget(null)}>
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnReject, saving && { opacity: 0.6 }]} onPress={reject} disabled={saving}>
                <Text style={styles.btnRejectText}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  addBtn: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 4, marginBottom: 10 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  route: { fontWeight: '700', fontSize: 14, color: colors.text },
  cardSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  itemLine: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnApprove: { backgroundColor: colors.success, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnApproveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnReject: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnRejectText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  btnCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  btnCancelText: { color: colors.textMuted, fontWeight: '600', fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 20 },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 8, color: colors.text },
  hint: { fontSize: 11, color: colors.textMuted, marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bgCard },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  productOption: { paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 4, backgroundColor: colors.bgCard },
  productOptionActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  productOptionText: { fontSize: 12, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: colors.bg, color: colors.text },
  selItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  selItemText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14, alignItems: 'center' },
});

// Estilos VIVOS: se reconstruyen cuando cambia el tema (dark mode).
let __stylesVersion = -1;
let __styles: ReturnType<typeof createStyles> | null = null;
export const styles = new Proxy({} as ReturnType<typeof createStyles>, {
  get(_t, prop) {
    if (__stylesVersion !== themeRef.version || !__styles) {
      __styles = createStyles();
      __stylesVersion = themeRef.version;
    }
    return __styles[prop as keyof ReturnType<typeof createStyles>];
  },
});

