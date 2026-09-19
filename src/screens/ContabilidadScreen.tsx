import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AccountingAPI, ExpensesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors } from '../config/theme';
import { PAY_METHODS } from '../config/roles';
import { EmptyState, ErrorBanner, Badge } from '../components/UI';
import { shareCSV } from '../utils/csv';
import type { AccountingSummary, IncomeRow, Expense } from '../types';

const fmt = (n: number) => Number(n || 0).toFixed(2);
const EXPENSE_CATS = ['Compras', 'Nomina', 'Servicios', 'Operaciones', 'Impuestos', 'Otros'];
const today = () => new Date().toISOString().split('T')[0];

export default function ContabilidadScreen() {
  const { online } = useAuth();
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState('resumen');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: today(), concept: '', amount: '', category: 'Compras', method: 'efectivo' });

  const load = useCallback(async () => {
    try {
      setError('');
      // Usa el summary contable del backend (paridad con la web) en lugar de
      // recalcular localmente sobre la lista completa de ventas.
      const [sum, inc, exp] = await Promise.all([
        AccountingAPI.summary(),
        AccountingAPI.income(),
        ExpensesAPI.list(),
      ]);
      setSummary(sum);
      setIncome(inc);
      setExpenses(exp);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalIncome = summary ? Number(summary.totalRevenue) : 0;
  const totalExp = summary ? Number(summary.totalExpenses) : expenses.reduce((a, e) => a + Number(e.amount), 0);
  const net = summary ? Number(summary.netProfit) : totalIncome - totalExp;

  const addExpense = async () => {
    if (!form.concept || !form.amount) return Alert.alert('Error', 'Complete concepto y monto');
    setSaving(true);
    try {
      await ExpensesAPI.create({ ...form, amount: Number(form.amount) });
      setModal(false);
      setForm({ date: today(), concept: '', amount: '', category: 'Compras', method: 'efectivo' });
      load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ErrorBanner message={error} />

      <TouchableOpacity
        style={styles.csvBtn}
        onPress={() => shareCSV('gastos', expenses as any, [
          { key: 'date', label: 'Fecha' }, { key: 'category', label: 'Categoría' }, { key: 'concept', label: 'Concepto' },
          { key: 'amount', label: 'Monto' }, { key: 'method', label: 'Método de pago' },
        ])}
      >
        <Text style={styles.csvBtnText}>⇩ Exportar gastos (CSV)</Text>
      </TouchableOpacity>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[['resumen', 'Resumen'], ['ingresos', 'Ingresos'], ['gastos', 'Egresos']].map(([v, l]) => (
          <TouchableOpacity key={v} style={[styles.tabBtn, tab === v && styles.tabBtnActive]} onPress={() => setTab(v)}>
            <Text style={[styles.tabText, tab === v && styles.tabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'resumen' && (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>📋 Resumen</Text>
            {[
              ['Ingresos brutos', totalIncome, colors.success],
              ['Total egresos', totalExp, colors.danger],
              ['Utilidad neta', net, net >= 0 ? colors.primary : colors.danger],
            ].map(([label, value, color]) => (
              <View key={label as string} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text style={[styles.summaryValue, { color: color as string }]}>${fmt(Number(value))} CUP</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
            <Text style={styles.addBtnText}>+ Registrar Egreso</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {tab === 'ingresos' && (
        <FlatList
          data={income}
          keyExtractor={s => s.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EmptyState text="No hay ingresos" />}
          renderItem={({ item: s }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowPrimary}>{s.invoiceNumber || s.id}</Text>
                <Text style={styles.rowSub}>{(s.date || '').split('T')[0]} · {s.clientName || s.client} · {s.payMethod || ''}</Text>
              </View>
              <Text style={styles.rowAmt}>${fmt(Number(s.total))}</Text>
            </View>
          )}
        />
      )}

      {tab === 'gastos' && (
        <FlatList
          data={expenses}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EmptyState text="No hay egresos" />}
          renderItem={({ item: e }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowPrimary}>{e.concept}</Text>
                <Text style={styles.rowSub}>{(e.date || e.createdAt || '').split('T')[0]} · {e.category}</Text>
              </View>
              <Text style={[styles.rowAmt, { color: '#EF4444' }]}>${fmt(Number(e.amount))}</Text>
            </View>
          )}
        />
      )}

      {modal && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setModal(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Registrar Egreso</Text>
              <TextInput style={styles.input} value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="Fecha (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} />
              <TextInput style={styles.input} value={form.concept} onChangeText={v => setForm(f => ({ ...f, concept: v }))} placeholder="Concepto *" placeholderTextColor={colors.textMuted} />
              <TextInput style={styles.input} value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))} placeholder="Monto CUP *" keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
              {/* Metodo de pago del egreso — paridad con la web */}
              <View style={styles.payRow}>
                {PAY_METHODS.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.chip, form.method === m.id && styles.chipActive]}
                    onPress={() => setForm(f => ({ ...f, method: m.id }))}
                  >
                    <Text style={[styles.chipText, form.method === m.id && { color: '#fff' }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {EXPENSE_CATS.map(c => (
                    <TouchableOpacity key={c} style={[styles.chip, form.category === c && styles.chipActive]} onPress={() => setForm(f => ({ ...f, category: c }))}>
                      <Text style={[styles.chipText, form.category === c && { color: '#fff' }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setModal(false)}>
                  <Text style={{ fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={addExpense} disabled={saving}>
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
  wrap: { flex: 1, backgroundColor: '#F8FAFC' },
  csvBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginHorizontal: 12, marginBottom: 10 },
  csvBtnText: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.bgSecondary, margin: 12, borderRadius: 14, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 7 },
  tabBtnActive: { backgroundColor: '#3B82F6' },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  summaryBox: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 12 },
  summaryTitle: { fontWeight: '700', fontSize: 15, color: '#1E293B', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  summaryLabel: { fontSize: 14, color: '#1E293B' },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  addBtn: { backgroundColor: '#3B82F6', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 8, alignItems: 'center' },
  rowPrimary: { fontWeight: '600', fontSize: 13, color: '#1E293B' },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowAmt: { fontWeight: '800', fontSize: 15, color: '#1E293B' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 14, color: '#1E293B' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, backgroundColor: '#F8FAFC', marginBottom: 10, color: '#1E293B' },
  payRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  modalActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  btnPrimary: { backgroundColor: '#3B82F6', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnSecondary: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
});
