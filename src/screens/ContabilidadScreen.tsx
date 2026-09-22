import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AccountingAPI, ExpensesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
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
  // Informe Fiscal en-app (paridad con la web): capa a pantalla completa con
  // botón "← Volver" — nunca una pestaña huérfana.
  const [showInforme, setShowInforme] = useState(false);

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
      {/* ── Informe Fiscal (capa completa dentro del módulo) ── */}
      {showInforme ? (
        <View style={styles.informeWrap}>
          <TouchableOpacity style={styles.informeBack} onPress={() => setShowInforme(false)}>
            <Text style={styles.informeBackText}>← Volver</Text>
          </TouchableOpacity>
          <ScrollView contentContainerStyle={{ padding: 14 }}>
            <View style={styles.informeCard}>
              <Text style={styles.informeTitle}>CubaGest — Informe Fiscal</Text>
              <Text style={styles.informeSub}>
                Período: {new Date().toLocaleString('es-CU', { month: 'long', year: 'numeric' })} · Generado: {new Date().toLocaleDateString('es-CU')}
              </Text>
              <View style={styles.informeBox}>
                {[
                  ['Ingresos brutos por ventas', totalIncome, colors.text],
                  ['Total egresos registrados', totalExp, colors.danger],
                  ['Utilidad neta', net, net >= 0 ? colors.success : colors.danger],
                ].map(([label, value, color]) => (
                  <View key={label as string} style={styles.informeRow}>
                    <Text style={[styles.informeLabel, { color: color as string }]}>{label}</Text>
                    <Text style={[styles.informeValue, { color: color as string }]}>${fmt(Number(value))}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.informeDetTitle}>Detalle de Egresos</Text>
              {expenses.length === 0 && <Text style={styles.informeEmpty}>Sin egresos registrados</Text>}
              {expenses.map((e) => (
                <View key={e.id} style={styles.informeRow}>
                  <Text style={styles.informeLabel}>{(e.date || (e as any).createdAt || '').split('T')[0]} · {e.concept}</Text>
                  <Text style={styles.informeValue}>${fmt(Number(e.amount))}</Text>
                </View>
              ))}
              <Text style={styles.informeNote}>
                Informe generado automáticamente por CubaGest para uso interno. Datos orientativos; consulte con su contador para la declaración oficial.
              </Text>
            </View>
          </ScrollView>
        </View>
      ) : (
      <>
      <ErrorBanner message={error} />

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowInforme(true)}>
          <Text style={styles.actionBtnText}>📄 Informe Fiscal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => shareCSV('gastos', expenses as any, [
            { key: 'date', label: 'Fecha' }, { key: 'category', label: 'Categoría' }, { key: 'concept', label: 'Concepto' },
            { key: 'amount', label: 'Monto' }, { key: 'method', label: 'Método de pago' },
          ])}
        >
          <Text style={styles.actionBtnText}>⇩ CSV</Text>
        </TouchableOpacity>
      </View>

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
              <Text style={[styles.rowAmt, { color: colors.danger }]}>${fmt(Number(e.amount))}</Text>
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
      </>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 10 },
  actionBtn: {
    flex: 1, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryTintB,
    borderRadius: 10, paddingVertical: 9, alignItems: 'center',
  },
  actionBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  informeWrap: { flex: 1, backgroundColor: colors.bg },
  informeBack: {
    alignSelf: 'flex-start', marginHorizontal: 12, marginTop: 8, marginBottom: 2,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14,
  },
  informeBackText: { color: colors.text, fontWeight: '700', fontSize: 13.5 },
  informeCard: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 16,
  },
  informeTitle: { fontSize: 17, fontWeight: '800', color: colors.primary, marginBottom: 3 },
  informeSub: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  informeBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 14 },
  informeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  informeLabel: { fontSize: 13.5, flex: 1, color: colors.text },
  informeValue: { fontSize: 13.5, fontWeight: '700', marginLeft: 10 },
  informeDetTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginBottom: 4 },
  informeEmpty: { fontSize: 12.5, color: colors.textMuted, fontStyle: 'italic', paddingVertical: 8 },
  informeNote: { fontSize: 11, color: colors.textMuted, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 10, lineHeight: 16 },
  csvBtn: { backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryTintB, borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginHorizontal: 12, marginBottom: 10 },
  csvBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.bgSecondary, margin: 12, borderRadius: 14, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 7 },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  summaryBox: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  summaryTitle: { fontWeight: '700', fontSize: 15, color: colors.text, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  summaryLabel: { fontSize: 14, color: colors.text },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  addBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  rowPrimary: { fontWeight: '600', fontSize: 13, color: colors.text },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowAmt: { fontWeight: '800', fontSize: 15, color: colors.text },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgCard, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 14, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, backgroundColor: colors.bg, marginBottom: 10, color: colors.text },
  payRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  modalActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  btnPrimary: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnSecondary: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
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

