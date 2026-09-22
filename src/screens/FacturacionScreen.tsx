import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ScrollView, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SalesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { colors, themeRef } from '../config/theme';
import { PAY_METHODS, CURRENCY_SYMBOLS } from '../config/roles';
import { EmptyState, ErrorBanner, Badge } from '../components/UI';
import { shareCSV } from '../utils/csv';
import type { Sale } from '../types';
import type { OfflineSale } from '../offline/offlineStore';

const fmt = (n: number) => Number(n || 0).toFixed(2);

export default function FacturacionScreen() {
  const { user, online } = useAuth();
  const { offlineSales, syncNow, syncing, refresh: refreshSync } = useSync();
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [viewInv, setViewInv] = useState<Sale | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const list = online ? await SalesAPI.list() : [];
      setSales(list);
      await refreshSync();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [online, refreshSync]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingOffline = offlineSales.filter((s) => s.status === 'pending' || s.status === 'syncing');
  const conflictOffline = offlineSales.filter((s) => s.status === 'conflict');

  const handleManualSync = async () => {
    setSyncMsg('');
    const r = await syncNow(true);
    if (r.error) setSyncMsg(r.error);
    else if (r.attempted === 0) setSyncMsg('No hay ventas pendientes por sincronizar');
    else {
      setSyncMsg(`${r.synced} venta(s) sincronizada(s)${r.conflicts ? ` · ${r.conflicts} conflicto(s) de stock` : ''}`);
      load();
    }
  };

  const filtered = sales.filter(s =>
    (s.invoiceNumber || s.id || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.clientName || s.client || '').toLowerCase().includes(search.toLowerCase()),
  );

  const openEdit = (s: Sale) => {
    setEditForm({
      clientName: s.clientName || s.client || '',
      clientNit: s.clientNit || '',
      clientPhone: s.clientPhone || '',
      payMethod: s.payMethod || 'efectivo',
    });
    setEditModal(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await SalesAPI.update(viewInv!.id, editForm);
      Alert.alert('✓', 'Factura actualizada');
      setEditModal(false);
      setViewInv(null);
      load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const voidSale = async (id: string) => {
    Alert.alert('Anular factura', 'Seguro? El stock se repondra.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Anular', style: 'destructive', onPress: async () => {
          try {
            await SalesAPI.voidSale(id);
            Alert.alert('✓', 'Factura anulada');
            setViewInv(null);
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
      <ErrorBanner message={error} />

      <TouchableOpacity
        style={styles.csvBtn}
        onPress={() => shareCSV('ventas', sales as any, [
          { key: 'invoiceNumber', label: 'Factura' }, { key: 'date', label: 'Fecha' }, { key: 'clientName', label: 'Cliente' },
          { key: 'subtotal', label: 'Subtotal' }, { key: 'discountTotal', label: 'Descuento' }, { key: 'tax', label: 'Impuesto' },
          { key: 'total', label: 'Total' }, { key: 'currency', label: 'Moneda' }, { key: 'payMethod', label: 'Método' },
          { key: 'status', label: 'Estado' },
        ])}
      >
        <Text style={styles.csvBtnText}>⇩ Exportar CSV (respaldo)</Text>
      </TouchableOpacity>

      {/* Ventas offline pendientes / con conflicto — paridad con la web */}
      {(pendingOffline.length > 0 || conflictOffline.length > 0 || syncMsg) && (
        <View style={styles.offlineBox}>
          {syncMsg ? <Text style={styles.syncMsg}>{syncMsg}</Text> : null}
          {pendingOffline.map((s: OfflineSale) => (
            <View key={s.localId} style={styles.offlineRow}>
              <Text style={styles.offlineId}>⏳ {s.localId}</Text>
              <Text style={styles.offlineAmt}>${fmt(Number(s.total))}</Text>
            </View>
          ))}
          {conflictOffline.map((s: OfflineSale) => (
            <View key={s.localId} style={styles.offlineRow}>
              <Text style={styles.offlineConflict}>⚠ {s.localId} — {s.conflictReason || 'Conflicto de stock'}</Text>
              <Text style={styles.offlineAmt}>${fmt(Number(s.total))}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
            onPress={handleManualSync}
            disabled={syncing || !online}
          >
            <Text style={styles.syncBtnText}>
              {syncing ? 'Sincronizando...' : '⟳ Sincronizar ahora'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TextInput
        style={styles.search}
        placeholder="Buscar por No. o cliente..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text={online ? 'No hay facturas' : 'Sin conexión — mostrando solo ventas locales'} />}
        renderItem={({ item: s }) => (
          <TouchableOpacity style={[styles.row, s.status === 'anulada' && { opacity: 0.5 }]} onPress={() => setViewInv(s)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invoice}>{s.invoiceNumber || s.id}</Text>
              <Text style={styles.client}>{s.clientName || s.client}</Text>
              <Text style={styles.date}>{(s.date || s.createdAt || '').split('T')[0]}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.amount}>{CURRENCY_SYMBOLS[s.currency] || '$'}{fmt(Number(s.total))}</Text>
              <Badge
                label={s.status === 'emitida' ? 'Emitida' : 'Anulada'}
                color={s.status === 'emitida' ? '#10B981' : '#EF4444'}
              />
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Modal detalle */}
      {viewInv && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setViewInv(null)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Factura {viewInv.invoiceNumber || viewInv.id}</Text>
              <ScrollView>
                <View style={styles.receipt}>
                  <Text style={styles.receiptCenter}>{user?.company?.name || 'Mi Negocio'}</Text>
                  <Text style={styles.receiptCenter}>FACTURA</Text>
                  <Text style={styles.receiptLine}>No. {viewInv.invoiceNumber || viewInv.id}</Text>
                  {viewInv.status === 'anulada' && <Text style={[styles.receiptCenter, { color: colors.danger, fontWeight: '800' }]}>⚠ ANULADA</Text>}
                  <Text style={styles.receiptLine}>Fecha: {(viewInv.date || viewInv.createdAt || '').split('T')[0]}</Text>
                  <Text style={styles.receiptLine}>Cliente: {viewInv.clientName || viewInv.client}</Text>
                  {viewInv.clientNit && viewInv.clientNit !== '00000000000' && <Text style={styles.receiptLine}>Carnet: {viewInv.clientNit}</Text>}
                  {viewInv.clientPhone && <Text style={styles.receiptLine}>Tel: {viewInv.clientPhone}</Text>}
                  <Text style={styles.receiptLine}>Metodo: {PAY_METHODS.find(p => p.id === viewInv.payMethod)?.label || viewInv.payMethod}</Text>
                  <Text style={styles.receiptDivider}>─────────────────────</Text>
                  {(viewInv.items || (viewInv as any).SaleItems || []).map((item: any, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.receiptLine}>{item.qty}x {item.name}</Text>
                      <Text style={styles.receiptLine}>{CURRENCY_SYMBOLS[viewInv.currency] || '$'}{fmt(Number(item.total) || item.price * item.qty)}</Text>
                    </View>
                  ))}
                  <Text style={styles.receiptDivider}>─────────────────────</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.receiptLine, { fontWeight: '800' }]}>TOTAL:</Text>
                    <Text style={[styles.receiptLine, { fontWeight: '800' }]}>{CURRENCY_SYMBOLS[viewInv.currency] || '$'}{fmt(Number(viewInv.total))} {viewInv.currency || 'CUP'}</Text>
                  </View>
                  <Text style={[styles.receiptCenter, { fontSize: 8, color: colors.textMuted, marginTop: 6 }]}>Hecho con CubaGest</Text>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                {viewInv.status === 'emitida' && (
                  <>
                    <TouchableOpacity style={styles.btnDanger} onPress={() => voidSale(viewInv.id)}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Anular</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnSecondary} onPress={() => openEdit(viewInv)}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>Editar datos</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setViewInv(null)}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal editar */}
      {editModal && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Editar datos de factura</Text>
              <Text style={styles.note}>Solo se pueden editar datos del cliente y metodo de pago.</Text>
              <TextInput style={styles.input} value={editForm.clientName} onChangeText={v => setEditForm(f => ({ ...f, clientName: v }))} placeholder="Nombre del cliente" placeholderTextColor={colors.textMuted} />
              <TextInput style={styles.input} value={editForm.clientNit} onChangeText={v => setEditForm(f => ({ ...f, clientNit: v }))} placeholder="Carnet" keyboardType="numeric" maxLength={11} placeholderTextColor={colors.textMuted} />
              <TextInput style={styles.input} value={editForm.clientPhone} onChangeText={v => setEditForm(f => ({ ...f, clientPhone: v }))} placeholder="Telefono" keyboardType="phone-pad" placeholderTextColor={colors.textMuted} />
              <View style={styles.payRow}>
                {PAY_METHODS.map(m => (
                  <TouchableOpacity key={m.id} style={[styles.payBtn, editForm.payMethod === m.id && styles.payBtnActive]} onPress={() => setEditForm(f => ({ ...f, payMethod: m.id }))}>
                    <Text style={[styles.payBtnText, editForm.payMethod === m.id && { color: '#fff' }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setEditModal(false)}>
                  <Text style={{ fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Guardando...' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 12 },
  csvBtn: { backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryTintB, borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginBottom: 10 },
  csvBtnText: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  offlineBox: { backgroundColor: colors.primaryTint, borderRadius: 12, borderWidth: 1, borderColor: colors.primaryTintB, padding: 10, marginBottom: 10 },
  offlineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  offlineId: { fontSize: 12, fontWeight: '700', color: '#1D4ED8', fontFamily: 'monospace' },
  offlineConflict: { fontSize: 11, fontWeight: '600', color: '#C2410C', flex: 1, marginRight: 8 },
  offlineAmt: { fontSize: 12, fontWeight: '700', color: colors.text },
  syncMsg: { fontSize: 12, fontWeight: '600', color: '#1E40AF', marginBottom: 6 },
  syncBtn: { backgroundColor: '#1D4ED8', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 6 },
  syncBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.bgCard, marginBottom: 12, fontSize: 14, color: colors.text },
  row: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  invoice: { fontWeight: '700', fontSize: 13, color: colors.primary, fontFamily: 'monospace' },
  client: { fontSize: 13, color: colors.text, marginTop: 2 },
  date: { fontSize: 11, color: colors.textMuted },
  amount: { fontWeight: '800', fontSize: 15, color: colors.text },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgCard, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%' },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 14, color: colors.text },
  receipt: { backgroundColor: colors.bg, borderRadius: 12, padding: 14, marginBottom: 16 },
  receiptCenter: { textAlign: 'center', fontWeight: '700', fontSize: 13, color: colors.text, marginBottom: 2, fontFamily: 'monospace' },
  receiptLine: { fontSize: 12, color: colors.text, fontFamily: 'monospace', marginBottom: 2 },
  receiptDivider: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', marginVertical: 4 },
  modalActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 8 },
  btnPrimary: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnSecondary: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnDanger: { backgroundColor: colors.danger, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  note: { fontSize: 12, color: colors.warningTextDark, backgroundColor: colors.warningBg, borderRadius: 8, padding: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: colors.bg, marginBottom: 10, color: colors.text },
  payRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  payBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  payBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  payBtnText: { fontSize: 12, fontWeight: '600', color: colors.text },
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

