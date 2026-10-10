import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AccountingAPI, ExpensesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { PAY_METHODS, EXPENSE_CATS, CURRENCIES, CURRENCY_SYMBOLS } from '../config/roles';
import { EmptyState, ErrorBanner, Badge, Btn, Inp, Sel, PageHeader, Skeleton, SkeletonRows, SelectOverlayProvider, closeSelectOverlayIfOpen } from '../components/UI';
import Icon from '../components/Icon';
import { shareCSV } from '../utils/csv';
import type { AccountingSummary, IncomeRow, Expense } from '../types';
import { showError } from '../components/dialogs';
import { cacheContabilidad, getOfflineContabilidad, enqueueOfflineOperation, getOfflineOperations } from '../offline/offlineStore';
import { isOfflineError } from '../api/client';
import { generateUuid } from '../utils/uuid';

const fmt = (n: number) => Number(n || 0).toFixed(2);
const today = () => new Date().toISOString().split('T')[0];

export default function ContabilidadScreen() {
  const { online } = useAuth();
  const navigation = useNavigation<any>();
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState('resumen');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: today(), concept: '', amount: '', category: 'Compras', method: 'efectivo', currency: 'CUP', fundingSource: 'caja_fuerte' as 'caja_fuerte' | 'otra' });
  const [treasury, setTreasury] = useState<Record<string, number>>({});
  // Informe Fiscal en-app (paridad con la web): capa a pantalla completa con
  // botón "← Volver" — nunca una pestaña huérfana.
  const [showInforme, setShowInforme] = useState(false);
  // Esqueleto de la PRIMERA carga solamente: en los refrescos posteriores los
  // movimientos ya están en pantalla, y taparlos con un placeholder sería un
  // retroceso (la lista desaparecería un instante para volver).
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError('');
      // Usa el summary contable del backend (paridad con la web) en lugar de
      // recalcular localmente sobre la lista completa de ventas.
      const [sum, inc, exp, vault] = await Promise.all([
        AccountingAPI.summary(),
        AccountingAPI.income(),
        ExpensesAPI.list(),
        AccountingAPI.treasury(),
      ]);
      setSummary(sum);
      setIncome(inc);
      setExpenses(exp);
      setTreasury(vault?.balances || {});
      void cacheContabilidad({ sum, inc, exp, treasury: vault?.balances || {} }).catch(() => {});
    } catch (err) {
      // Sin red se enseña el último resumen guardado, marcado como tal. Un saldo
      // contable sin avisar de que es viejo se lee como el saldo de hoy, que es justo
      // el error que hace cerrar un mes con cifras equivocadas.
      const local = await getOfflineContabilidad();
      if (local) {
        setSummary(local.sum as AccountingSummary);
        setIncome(local.inc as IncomeRow[]);
        setExpenses(local.exp as Expense[]);
        setTreasury((local.treasury as Record<string, number>) || {});
        const queued = await getOfflineOperations(['pending', 'syncing', 'conflict']);
        const pendingExpenses = queued.filter((op) => op.kind === 'expense').map((op: any) => ({
          id: op.payload.clientExpenseId, date: op.payload.date, concept: op.payload.concept,
          amount: op.payload.amount, category: op.payload.category, method: op.payload.method,
          currency: op.payload.currency, offlinePending: true,
        } as any));
        setExpenses([...(local.exp as Expense[]), ...pendingExpenses]);
        setError('Sin conexión con el servidor — mostrando el resumen guardado en este dispositivo');
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalIncome = summary ? Number(summary.totalRevenue) : 0;
  const totalExp = summary ? Number(summary.totalExpenses) : expenses.reduce((a, e) => a + Number(e.amount), 0);
  const net = summary ? Number(summary.netProfit) : totalIncome - totalExp;

  const addExpense = async () => {
    if (!form.concept || !form.amount || Number(form.amount) <= 0) return showError('Complete concepto y monto válido');
    setSaving(true);
    try {
      const businessAt = new Date(`${form.date}T12:00:00`).toISOString();
      const body = { ...form, amount: Number(form.amount), businessAt, clientExpenseId: generateUuid() };
      try {
        await ExpensesAPI.create(body);
      } catch (error) {
        if (!isOfflineError(error)) throw error;
        await enqueueOfflineOperation('expense', body, Date.parse(businessAt), body.clientExpenseId);
      }
      setModal(false);
      setForm({ date: today(), concept: '', amount: '', category: 'Compras', method: 'efectivo', currency: 'CUP', fundingSource: 'caja_fuerte' });
      load();
    } catch (e) {
      showError((e as Error).message);
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

      {/* Header — accesos directos a gasto y retiro de caja, ambos movimientos distintos. */}
      <View style={styles.header}>
        <PageHeader title="Contabilidad" subtitle="Registro contable" />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="secondary" icon="refresh" label="Actualizar" onPress={load} />
          <Btn variant="secondary" icon="print" label="Informe Fiscal" onPress={() => setShowInforme(true)} />
          <Btn variant="secondary" icon="cash" label="Retirar de caja" onPress={() => navigation.navigate('Entradas y Salidas', { openNew: true })} />
          <Btn icon="plus" label="Registrar gasto de empresa" onPress={() => setModal(true)} />
        </View>
      </View>

      {/* Tabs — segment control como la web (fondo input-bg, radio 7) */}
      <View style={styles.tabRow}>
        {[['resumen', 'Resumen'], ['ingresos', 'Ingresos'], ['gastos', 'Egresos']].map(([v, l]) => (
          <TouchableOpacity key={v} style={[styles.tabBtn, tab === v && styles.tabBtnActive]} onPress={() => setTab(v)}>
            <Text style={[styles.tabText, tab === v && styles.tabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'resumen' && (
        loading ? (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {/* La caja real del resumen: título y tres filas de etiqueta + importe,
              con el botón de debajo. Se esboza a la misma altura para que al
              llegar los datos no se mueva ni una línea. */}
          <View style={styles.summaryBox}>
            <Skeleton w="35%" h={15} r={7} />
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.summaryRow}>
                <Skeleton w="34%" h={14} />
                <Skeleton w="26%" h={14} />
              </View>
            ))}
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Caja fuerte · saldo por moneda</Text>
            {Object.keys(treasury).length
              ? Object.entries(treasury).map(([currency, balance]) => <View key={currency} style={styles.summaryRow}><Text style={styles.summaryLabel}>{currency}</Text><Text style={styles.summaryValue}>{CURRENCY_SYMBOLS[currency] || ''}{fmt(Number(balance))}</Text></View>)
              : <Text style={styles.informeEmpty}>Sin movimientos confirmados</Text>}
          </View>
          <Skeleton h={48} r={14} />
        </ScrollView>
        ) : (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={styles.summaryBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="clipboard" size={15} color={colors.textMuted} />
        <Text style={styles.summaryTitle}>Resumen</Text>
      </View>
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
            <Text style={styles.addBtnText}>+ Registrar gasto de empresa</Text>
          </TouchableOpacity>
        </ScrollView>
        )
      )}

      {tab === 'ingresos' && (
        // Cada fila real es una tarjeta con concepto a la izquierda e importe a
        // la derecha: `SkeletonRows` repite justo esa tarjeta con borde.
        loading ? (
          <SkeletonRows n={5} h={62} />
        ) : (
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
        )
      )}

      {tab === 'gastos' && (
        // Misma forma que la pestaña de ingresos: la categoría y el método de
        // pago viajan en la segunda línea del esqueleto.
        loading ? (
          <SkeletonRows n={5} h={62} />
        ) : (
        <FlatList
          data={expenses}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EmptyState text="No hay egresos registrados" />}
          renderItem={({ item: e }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowPrimary}>{e.concept}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <Badge label={e.category || '—'} color={colors.category} />
                  <Badge label={PAY_METHODS.find(p => p.id === e.method)?.label || e.method || '—'} color={colors.primary} />
                </View>
              </View>
              <Text style={[styles.rowAmt, { color: colors.primary }]}>${fmt(Number(e.amount))}</Text>
            </View>
          )}
        />
        )
      )}

      {modal && (
        <Modal visible animationType="slide" transparent onRequestClose={() => {
          if (!closeSelectOverlayIfOpen()) setModal(false);
        }}>
          <SelectOverlayProvider>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Registrar gasto de empresa</Text>
              <Inp style={{ marginBottom: 10 }} value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="Fecha (YYYY-MM-DD)" />
              <Inp style={{ marginBottom: 10 }} value={form.concept} onChangeText={v => setForm(f => ({ ...f, concept: v }))} placeholder="Concepto *" />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Inp style={{ flex: 1 }} value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))} placeholder="Monto *" keyboardType="decimal-pad" />
                <View style={{ width: 110 }}><Sel value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))} items={CURRENCIES.map(c => ({ label: c, value: c }))} /></View>
              </View>
              {/* Método y categoría — selects nativos, igual que la web */}
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>Método de pago</Text>
                <Sel
                  value={form.method}
                  onValueChange={(v: string) => setForm(f => ({ ...f, method: v }))}
                  items={PAY_METHODS.map(m => ({ label: m.label, value: m.id }))}
                />
              </View>
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>Categoría</Text>
                <Sel
                  value={form.category}
                  onValueChange={(v: string) => setForm(f => ({ ...f, category: v }))}
                  items={EXPENSE_CATS.map(c => ({ label: c, value: c }))}
                />
              </View>
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.fieldLabel}>Origen de los fondos</Text>
                <Sel value={form.fundingSource} onValueChange={v => setForm(f => ({ ...f, fundingSource: v as 'caja_fuerte' | 'otra' }))} items={[
                  { label: 'Caja fuerte de la empresa', value: 'caja_fuerte' },
                  { label: 'Otra fuente (no descontar de caja fuerte)', value: 'otra' },
                ]} />
              </View>
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
          </SelectOverlayProvider>
        </Modal>
      )}
      </>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, marginBottom: 12, gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },

  informeWrap: { flex: 1, backgroundColor: colors.bg },
  informeBack: {
    alignSelf: 'flex-start', marginHorizontal: 12, marginTop: 8, marginBottom: 2,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14,
  },
  informeBackText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  informeCard: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 16,
  },
  informeTitle: { fontSize: 17, fontWeight: '800', color: colors.primary, marginBottom: 3 },
  informeSub: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  informeBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 14 },
  informeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  informeLabel: { fontSize: 14, flex: 1, color: colors.text },
  informeValue: { fontSize: 14, fontWeight: '700', marginLeft: 10 },
  informeDetTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 4 },
  informeEmpty: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', paddingVertical: 8 },
  informeNote: { fontSize: 11, color: colors.textMuted, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 10, lineHeight: 16 },
  csvBtn: { backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryTintB, borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginHorizontal: 12, marginBottom: 10 },
  csvBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.inputBg, marginHorizontal: 16, borderRadius: 12, padding: 4, alignSelf: 'flex-start' },
  tabBtn: { paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  summaryBox: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  summaryTitle: { fontWeight: '700', fontSize: 15, color: colors.text, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.text },
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
