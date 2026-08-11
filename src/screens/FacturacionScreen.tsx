import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ScrollView, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SalesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors } from '../config/theme';
import { PAY_METHODS } from '../config/roles';
import { EmptyState, ErrorBanner, Badge } from '../components/UI';
import type { Sale } from '../types';

const fmt = (n: number) => Number(n || 0).toFixed(2);

export default function FacturacionScreen() {
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [viewInv, setViewInv] = useState<Sale | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const list = await SalesAPI.list();
      setSales(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        ListEmptyComponent={<EmptyState text="No hay facturas" />}
        renderItem={({ item: s }) => (
          <TouchableOpacity style={[styles.row, s.status === 'anulada' && { opacity: 0.5 }]} onPress={() => setViewInv(s)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invoice}>{s.invoiceNumber || s.id}</Text>
              <Text style={styles.client}>{s.clientName || s.client}</Text>
              <Text style={styles.date}>{(s.date || s.createdAt || '').split('T')[0]}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.amount}>${fmt(Number(s.total))}</Text>
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
                  <Text style={styles.receiptCenter}>CUBAGEST</Text>
                  <Text style={styles.receiptCenter}>FACTURA COMERCIAL</Text>
                  {viewInv.status === 'anulada' && <Text style={[styles.receiptCenter, { color: '#EF4444', fontWeight: '800' }]}>⚠ ANULADA</Text>}
                  <Text style={styles.receiptLine}>Fecha: {(viewInv.date || viewInv.createdAt || '').split('T')[0]}</Text>
                  <Text style={styles.receiptLine}>Cliente: {viewInv.clientName || viewInv.client}</Text>
                  {viewInv.clientNit && <Text style={styles.receiptLine}>NIT: {viewInv.clientNit}</Text>}
                  {viewInv.clientPhone && <Text style={styles.receiptLine}>Tel: {viewInv.clientPhone}</Text>}
                  <Text style={styles.receiptLine}>Metodo: {PAY_METHODS.find(p => p.id === viewInv.payMethod)?.label || viewInv.payMethod}</Text>
                  <Text style={styles.receiptDivider}>─────────────────────</Text>
                  {(viewInv.items || viewInv.SaleItems || []).map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.receiptLine}>{item.qty}x {item.name}</Text>
                      <Text style={styles.receiptLine}>${fmt(Number(item.total) || item.price * item.qty)}</Text>
                    </View>
                  ))}
                  <Text style={styles.receiptDivider}>─────────────────────</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.receiptLine, { fontWeight: '800' }]}>TOTAL:</Text>
                    <Text style={[styles.receiptLine, { fontWeight: '800' }]}>${fmt(Number(viewInv.total))} CUP</Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                {viewInv.status === 'emitida' && (
                  <>
                    <TouchableOpacity style={styles.btnDanger} onPress={() => voidSale(viewInv.id)}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Anular</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnSecondary} onPress={() => openEdit(viewInv)}>
                      <Text style={{ color: '#1E293B', fontWeight: '600' }}>Editar datos</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setViewInv(null)}>
                  <Text style={{ color: '#1E293B', fontWeight: '600' }}>Cerrar</Text>
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
              <TextInput style={styles.input} value={editForm.clientNit} onChangeText={v => setEditForm(f => ({ ...f, clientNit: v }))} placeholder="NIT" keyboardType="numeric" maxLength={11} placeholderTextColor={colors.textMuted} />
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

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC', padding: 12 },
  search: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fff', marginBottom: 12, fontSize: 14, color: '#1E293B' },
  row: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 8 },
  invoice: { fontWeight: '700', fontSize: 13, color: '#3B82F6', fontFamily: 'monospace' },
  client: { fontSize: 13, color: '#1E293B', marginTop: 2 },
  date: { fontSize: 11, color: colors.textMuted },
  amount: { fontWeight: '800', fontSize: 15, color: '#1E293B' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%' },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 14, color: '#1E293B' },
  receipt: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 16 },
  receiptCenter: { textAlign: 'center', fontWeight: '700', fontSize: 13, color: '#1E293B', marginBottom: 2, fontFamily: 'monospace' },
  receiptLine: { fontSize: 12, color: '#1E293B', fontFamily: 'monospace', marginBottom: 2 },
  receiptDivider: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', marginVertical: 4 },
  modalActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 8 },
  btnPrimary: { backgroundColor: '#3B82F6', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnSecondary: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnDanger: { backgroundColor: '#EF4444', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  note: { fontSize: 12, color: '#c17a00', backgroundColor: '#fffbf0', borderRadius: 8, padding: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: '#F8FAFC', marginBottom: 10, color: '#1E293B' },
  payRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  payBtn: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  payBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  payBtnText: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
});
