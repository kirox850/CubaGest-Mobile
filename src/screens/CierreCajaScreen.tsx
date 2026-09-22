import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Modal, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ClosingAPI, LocationsAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { Badge, EmptyState, ErrorBanner, Spinner, Btn, PageHeader } from '../components/UI';
import Icon from '../components/Icon';
import type { Closing, ClosingItem, ClosingPreview, InventoryReading, Location } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleString('es-CU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

type ViewMode = 'list' | 'selectReading' | 'validate' | 'detail';

export default function CierreCajaScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [view, setView] = useState<ViewMode>('list');
  const [closings, setClosings] = useState<Closing[]>([]);
  const [readings, setReadings] = useState<InventoryReading[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [readingLocationId, setReadingLocationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedReading, setSelectedReading] = useState<InventoryReading | null>(null);
  const [preview, setPreview] = useState<ClosingPreview | null>(null);
  const [validatedItems, setValidatedItems] = useState<Record<string, string>>({});
  const [detailClosing, setDetailClosing] = useState<Closing | null>(null);
  const [confirmReading, setConfirmReading] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const locationName = (id?: string) => locations.find((l) => l.id === id)?.name || '—';

  const loadClosings = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const list = await ClosingAPI.list();
      setClosings(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadClosings();
      LocationsAPI.list().then(setLocations).catch(() => {});
    }, [loadClosings]),
  );

  const startClosing = async () => {
    try {
      setError('');
      const list = await ClosingAPI.readings();
      setReadings(list);
      setView('selectReading');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const selectReading = async (reading: InventoryReading) => {
    try {
      setSaving(true);
      setSelectedReading(reading);
      const data = await ClosingAPI.preview(reading.id);
      setPreview(data);
      const init: Record<string, string> = {};
      for (const item of data.items) init[item.productId] = String(item.stockValidated);
      setValidatedItems(init);
      setView('validate');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmClosing = async () => {
    if (!selectedReading) return;
    try {
      setSaving(true);
      const items = Object.entries(validatedItems).map(([productId, v]) => ({
        productId,
        stockValidated: Number(v) || 0,
      }));
      await ClosingAPI.confirm({ initialReadingId: selectedReading.id, items, notes: notes || undefined });
      Alert.alert('✓', 'Cierre registrado correctamente');
      setView('list');
      setPreview(null);
      setNotes('');
      loadClosings();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const takeReading = async () => {
    if (!readingLocationId) return Alert.alert('Error', 'Selecciona la ubicación');
    try {
      setSaving(true);
      await ClosingAPI.takeReading(readingLocationId, 'Lectura de apertura manual');
      Alert.alert('✓', 'Lectura de inventario tomada');
      setConfirmReading(false);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Lista de cierres ───────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <View style={styles.wrap}>
        {/* Header — igual que la web: título + botones */}
        <View style={styles.header}>
          <PageHeader title="Cierre de Caja" subtitle="Conciliación de ventas, stock e ingresos" />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {isAdmin && (
              <Btn variant="secondary" icon="refresh" label="Lectura de apertura" onPress={() => setConfirmReading(true)} />
            )}
            <Btn icon="check" label="Iniciar cierre" onPress={startClosing} />
          </View>
        </View>

        <ErrorBanner message={error} />

        {loading ? <Spinner /> : (
          <FlatList
            data={closings}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            ListEmptyComponent={<EmptyState icon="🧮" text="No hay cierres registrados aún" />}
            renderItem={({ item: c }) => {
              const hasShortage = (c.items || []).some((i) => i.shortage > 0.001);
              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => { setDetailClosing(c); setView('detail'); }}
                >
                  <View style={styles.cardTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>Cierre — {fmtDate(c.createdAt)}</Text>
                      <Text style={styles.cardSub}>
                        Por {c.closedBy?.name || '—'}
                      </Text>
                      <Text style={styles.cardLoc}>{locationName(c.locationId)}</Text>
                    </View>
                    <View style={{ gap: 4, alignItems: 'flex-end' }}>
                      {hasShortage && <Badge label="⚠ Faltantes" color="#F97316" />}
                      <Badge label={`${c.totalSales} ventas`} color={colors.primary} />
                    </View>
                  </View>
                  <View style={styles.cardStatsRow}>
                    <View>
                      <Text style={styles.statLabel}>Total ingresos</Text>
                      <Text style={[styles.statValue, { color: colors.success }]}>{fmt(c.totalIncome)} CUP</Text>
                    </View>
                    <View>
                      <Text style={styles.statLabel}>Efectivo</Text>
                      <Text style={styles.statValue}>{fmt(c.incomeEfectivo)} CUP</Text>
                    </View>
                    <View>
                      <Text style={styles.statLabel}>Transferencia</Text>
                      <Text style={styles.statValue}>{fmt(c.incomeTransferencia)} CUP</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Modal lectura de apertura */}
        <Modal visible={confirmReading} transparent animationType="fade" onRequestClose={() => setConfirmReading(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Tomar lectura de inventario</Text>
              {locations.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {locations.map((l) => (
                      <TouchableOpacity
                        key={l.id}
                        style={[styles.chip, readingLocationId === l.id && styles.chipActive]}
                        onPress={() => setReadingLocationId(l.id)}
                      >
                        <Text style={[styles.chipText, readingLocationId === l.id && { color: '#fff' }]}>{l.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              ) : null}
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>⚠ Antes de continuar</Text>
                <Text style={styles.warnText}>
                  • Registrará el stock actual de esa ubicación como punto de partida del próximo cierre.{'\n'}
                  • Si hay ventas sin cerrar quedarán FUERA del período.{'\n'}
                  • Hazlo solo al abrir el negocio o al cambiar de turno.{'\n'}
                  • No se puede deshacer.
                </Text>
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmReading(false)}>
                  <Text style={{ color: colors.textMuted }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={takeReading} disabled={saving}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Tomando...' : 'Tomar lectura'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Seleccionar lectura ────────────────────────────────────────────────────
  if (view === 'selectReading') {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView('list')}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Iniciar cierre</Text>
        <Text style={styles.subtitle}>
          Elige desde cuándo contar las ventas. El stock registrado en esa fecha será el punto de partida.
        </Text>
        {readings.length === 0 ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>No hay lecturas disponibles</Text>
            <Text style={styles.warnText}>
              Para hacer el primer cierre el administrador debe tomar una lectura de apertura primero.
            </Text>
          </View>
        ) : (
          <FlatList
            data={readings}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            renderItem={({ item: r, index }) => {
              const isRec = index === 0;
              const typeLabel = r.type === 'apertura' ? 'Lectura de apertura' : 'Lectura al cierre anterior';
              return (
                <TouchableOpacity
                  style={[styles.readingCard, isRec && styles.readingCardRec]}
                  onPress={() => !saving && selectReading(r)}
                  disabled={saving}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.readingTitle}>{typeLabel}</Text>
                    <Text style={styles.cardSub}>{fmtDate(r.createdAt)}</Text>
                    <Text style={styles.cardLoc}>{locationName(r.locationId)}</Text>
                    {r.takenBy?.name ? <Text style={styles.cardSub}>Por {r.takenBy.name}</Text> : null}
                  </View>
                  {isRec && <Badge label="Recomendado" color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  // ── Validar stock ──────────────────────────────────────────────────────────
  if (view === 'validate' && preview) {
    const itemsWithShortage = preview.items.filter((i) => {
      const validated = Number(validatedItems[i.productId] ?? i.stockValidated);
      return i.stockExpected - validated > 0.001;
    });
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView('selectReading')}>
          <Text style={styles.backText}>← Cambiar lectura</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Validar stock del período</Text>
        <Text style={styles.subtitle}>
          Desde {fmtDate(preview.periodStart)} · {preview.totalSales} ventas · {fmt(preview.totalIncome)} CUP
        </Text>

        <View style={styles.summaryInline}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.statLabel}>Efectivo</Text>
            <Text style={styles.statValue}>{fmt(preview.incomeEfectivo)} CUP</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.statLabel}>Transferencia</Text>
            <Text style={styles.statValue}>{fmt(preview.incomeTransferencia)} CUP</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Cuenta físicamente cada producto y corrige el valor si difiere del esperado. La diferencia quedará registrada como faltante.
          </Text>
        </View>

        <FlatList
          data={preview.items}
          keyExtractor={(i) => i.productId}
          contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
          ListEmptyComponent={<EmptyState text="Sin productos en esta lectura" />}
          renderItem={({ item }) => {
            const validated = validatedItems[item.productId] ?? String(item.stockValidated);
            const shortage = Number((item.stockExpected - (Number(validated) || 0)).toFixed(3));
            const hasS = shortage > 0.001;
            return (
              <View style={[styles.validateRow, hasS && { backgroundColor: '#FFF7ED' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.validateName}>{item.productName}</Text>
                  <Text style={styles.cardSub}>
                    Inicial: {item.stockInitial} · Vendido: {item.stockSold} · Esperado: {item.stockExpected} {item.unit}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.success }]}>Ingreso: ${fmt(item.income)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      style={styles.validateInput}
                      value={validated}
                      onChangeText={(v) => setValidatedItems((prev) => ({ ...prev, [item.productId]: v }))}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.cardSub}>{item.unit}</Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: hasS ? '#F97316' : '#10B981' }}>
                    {hasS ? `-${shortage} ${item.unit}` : '✓'}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {itemsWithShortage.length > 0 && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              ⚠ Se registrarán faltantes en {itemsWithShortage.length} producto(s). Quedarán en el historial.
            </Text>
          </View>
        )}

        <TextInput
          style={styles.notesInput}
          placeholder="Observaciones (opcional)..."
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setView('selectReading')}>
            <Text style={{ color: colors.textMuted }}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={confirmClosing} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Guardando...' : 'Confirmar cierre'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Detalle del cierre ─────────────────────────────────────────────────────
  if (view === 'detail' && detailClosing) {
    const c = detailClosing;
    const hasShortage = (c.items || []).some((i: ClosingItem) => i.shortage > 0.001);
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView('list')}>
          <Text style={styles.backText}>← Volver a cierres</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Detalle del cierre</Text>
        <Text style={styles.subtitle}>
          {fmtDate(c.createdAt)} · Cerrado por {c.closedBy?.name || '—'}
        </Text>
        <Text style={styles.cardSub}>Período: {fmtDate(c.periodStart)} → {fmtDate(c.periodEnd)}</Text>
        {c.notes ? <Text style={styles.cardSub}>📝 {c.notes}</Text> : null}

        <View style={styles.detailGrid}>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Total ingresos</Text>
            <Text style={[styles.detailValue, { color: colors.success }]}>{fmt(c.totalIncome)}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Efectivo</Text>
            <Text style={styles.detailValue}>{fmt(c.incomeEfectivo)}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Transferencia</Text>
            <Text style={styles.detailValue}>{fmt(c.incomeTransferencia)}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Ventas</Text>
            <Text style={[styles.detailValue, { color: colors.primary }]}>{c.totalSales}</Text>
          </View>
        </View>

        {hasShortage && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>⚠ Este cierre registra faltantes de inventario</Text>
          </View>
        )}

        <FlatList
          data={c.items || []}
          keyExtractor={(i, idx) => `${i.productId}-${idx}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const hasS = item.shortage > 0.001;
            return (
              <View style={[styles.validateRow, hasS && { backgroundColor: '#FFF7ED' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.validateName}>{item.productName}</Text>
                  <Text style={styles.cardSub}>
                    Inicial: {item.stockInitial} · Vendido: {item.stockSold} · Esperado: {item.stockExpected} · Físico: {item.stockValidated} {item.unit}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.success }]}>Ingreso: ${fmt(item.income)}</Text>
                </View>
                <Text style={{ fontWeight: '800', fontSize: 13, color: hasS ? '#F97316' : '#10B981' }}>
                  {hasS ? `-${item.shortage}` : '✓'}
                </Text>
              </View>
            );
          }}
        />
      </View>
    );
  }

  return null;
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  secondaryBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  backBtn: { marginBottom: 8 },
  backText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  cardSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  cardLoc: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 },
  cardStatsRow: { flexDirection: 'row', gap: 24, marginTop: 10 },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2 },
  readingCard: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readingCardRec: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryTint },
  readingTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  summaryInline: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.primaryTint, borderRadius: 12, padding: 10, marginBottom: 10 },
  infoBox: { backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryTintB, borderRadius: 12, padding: 10, marginBottom: 8 },
  infoText: { fontSize: 12, color: '#1E40AF' },
  validateRow: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  validateName: { fontWeight: '700', fontSize: 13, color: colors.text },
  validateInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, width: 70, textAlign: 'right', fontSize: 14, color: colors.text, backgroundColor: colors.bgCard },
  notesInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, fontSize: 13, backgroundColor: colors.bgCard, color: colors.text, minHeight: 50, textAlignVertical: 'top', marginBottom: 10 },
  warnBox: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 12, padding: 12, marginBottom: 10 },
  warnTitle: { fontWeight: '700', color: '#C2410C', marginBottom: 6, fontSize: 13 },
  warnText: { fontSize: 12, color: '#7C2D12', lineHeight: 18 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  detailCard: { flexGrow: 1, minWidth: '45%', backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  detailValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 20, maxHeight: '85%' },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 12, color: colors.text },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bgCard },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
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

