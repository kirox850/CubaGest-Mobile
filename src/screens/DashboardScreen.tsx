import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DashboardAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { ROLES } from '../config/roles';
import { ErrorBanner } from '../components/UI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DashboardSummary } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2 }).format(n || 0);
const CACHE_KEY = 'cubagest_dashboard';

export default function DashboardScreen() {
  const { user, online } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  // Selectores del gráfico (paridad con la web): rango y moneda. En RN el
  // equivalente del <select> nativo de la web son estos chips — táctiles,
  // sin dropdowns que emular.
  const [range, setRange] = useState<7 | 30 | 90 | 180>(7);
  const [cur, setCur] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    if (online) {
      try {
        const data = await DashboardAPI.summary();
        setSummary(data);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }));
        setCacheDate(null);
      } catch (e) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data, cachedAt } = JSON.parse(raw);
          setSummary(data);
          setCacheDate(new Date(cachedAt).toLocaleDateString('es-CU'));
        } else {
          setError((e as Error).message);
        }
      }
      // Analítica: mes vs mes, top productos, tendencia, muertos
      DashboardAPI.analytics().then(setAnalytics).catch(() => {});
    } else {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, cachedAt } = JSON.parse(raw);
        setSummary(data);
        setCacheDate(new Date(cachedAt).toLocaleDateString('es-CU'));
      } else {
        setError('Sin conexion y sin datos en cache');
      }
    }
    setLoading(false);
  }, [online]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const StatCard = ({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon: string }) => (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardIcon}>{icon}</Text>
      </View>
      <Text style={[styles.cardValue, { color: color || colors.text }]}>{value}</Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
    </View>
  );

  // Serie del gráfico: la API expone trend30ByCurrency (por moneda) y
  // trend30 (suma solo para dibujar la curva — nunca se convierten).
  const allSeries: { date: string; total: number }[] =
    (analytics?.trend30ByCurrency && Object.keys(analytics.trend30ByCurrency).length > 0)
      ? Object.entries(analytics.trend30ByCurrency as Record<string, any[]>).flatMap(([c, arr]) =>
          (arr as any[]).map((d: any) => ({ date: d.date, total: Number(d.total) || 0, cur: c })))
          .filter((d: any) => cur === 'all' || d.cur === cur)
          .reduce((acc: { date: string; total: number }[], d: any) => {
            const found = acc.find((x) => x.date === d.date);
            if (found) found.total += d.total; // suma SOLO para dibujar, igual que web
            else acc.push({ date: d.date, total: d.total });
            return acc;
          }, [])
      : (summary?.chartDays || []).map((d) => ({ date: d.date, total: Number(d.total) || 0 }));
  // Rango seleccionado → últimos N días (el backend devuelve hasta 30; si el
  // rango pedido excede los datos disponibles, se muestran los que haya).
  const chart = allSeries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-range);
  const maxTotal = Math.max(1, ...chart.map((d) => d.total));
  const currencies: string[] = analytics?.trend30ByCurrency ? Object.keys(analytics.trend30ByCurrency) : [];
  const rangeLabel = range === 7 ? '7 días' : range === 30 ? '30 días' : range === 90 ? '3 meses' : '6 meses';

  return (
    <ScrollView
      style={styles.wrap}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
    >
      <ErrorBanner message={error} />
      {cacheDate && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚡ Datos del {cacheDate} — sin conexion</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.welcome}>Bienvenido, {user?.name}</Text>
        <Text style={styles.role}>{ROLES[user?.role || '']?.label}</Text>
      </View>      {summary && (
        <>

          {/* Ingresos y gastos POR MONEDA — no se convierten entre sí */}
          {Object.entries((summary as any).byCurrency || {}).map(([cur, v]: any) => (
            <View key={cur} style={styles.curBox}>
              <Text style={styles.curTitle}>{cur}</Text>
              <Text style={styles.curRevenue}>${fmt(v.revenue)}</Text>
              <Text style={styles.curExpenses}>Gastos: ${fmt(v.expenses)} · Neto: ${fmt(v.revenue - v.expenses)}</Text>
            </View>
          ))}

          <View style={styles.grid}>
            <StatCard
              label="Ventas de Hoy"
              value={`$${fmt(summary.todaySalesTotal || 0)}`}
              sub={`${summary.todaySalesCount || 0} factura${(summary.todaySalesCount || 0) === 1 ? '' : 's'} hoy`}
              color={'#10B981'}
              icon="🧾"
            />
            <StatCard
              label="Alertas Stock"
              value={String(summary.lowStock?.length || 0)}
              sub={summary.lowStock?.length ? 'Productos con stock bajo' : 'Todo OK'}
              color={summary.lowStock?.length ? '#F97316' : '#10B981'}
              icon="📦"
            />
          </View>

          {/* Ventas de hoy — igual que la web */}
          <View style={styles.todayBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayLabel}>HOY</Text>
              <Text style={styles.todayValue}>
                ${fmt(summary.todaySalesTotal || 0)} CUP
              </Text>
            </View>
            <Text style={styles.todayCount}>{summary.todaySalesCount || 0} factura{(summary.todaySalesCount || 0) === 1 ? '' : 's'}</Text>
          </View>

          {/* Gráfico con rango y moneda seleccionables (como la web) */}
          {chart.length > 0 && (
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>Ingresos por día · {rangeLabel}</Text>
              {/* Selector de rango — chips nativos (equiv. del select web) */}
              <View style={styles.chartSeg}>
                {([[7, '7d'], [30, '30d'], [90, '3m'], [180, '6m']] as const).map(([v, l]) => (
                  <TouchableOpacity key={l} style={[styles.chartSegBtn, range === v && styles.chartSegBtnOn]} onPress={() => setRange(v as 7 | 30 | 90 | 180)}>
                    <Text style={[styles.chartSegText, range === v && styles.chartSegTextOn]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Selector de moneda — solo si hay más de una */}
              {currencies.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={styles.chartSeg}>
                    {['all', ...currencies].map((c) => (
                      <TouchableOpacity key={c} style={[styles.chartSegBtn, cur === c && styles.chartSegBtnOn]} onPress={() => setCur(c)}>
                        <Text style={[styles.chartSegText, cur === c && styles.chartSegTextOn]}>{c === 'all' ? 'Todas' : c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
              <View style={styles.chartRow}>
                {chart.map((d) => (
                  <View key={d.date} style={styles.chartCol}>
                    <Text style={styles.chartBarLabel}>{d.total > 0 ? fmt(Number(d.total)).split(',')[0] : ''}</Text>
                    <View
                      style={[
                        styles.chartBar,
                        { height: Math.max(4, Math.round((Number(d.total) / maxTotal) * 90)) },
                      ]}
                    />
                    <Text style={styles.chartDay}>{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {summary.lowStock?.length > 0 && (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>⚠ Productos con stock bajo</Text>
              {summary.lowStock.map((p) => (
                <Text key={p.id} style={styles.alertItem}>• {p.name} — {p.stock} {p.unit} (min: {p.minStock})</Text>
              ))}
            </View>
          )}

          {/* ── Analítica (Fase 5) ── */}
          {analytics && (
            <>
              <View style={styles.anBox}>
                <Text style={styles.anTitle}>Mes vs. mes anterior</Text>
                {Object.entries(analytics.revenueByCurrency || {}).map(([cur, v]: any) => (
                  <View key={cur} style={styles.anRow}>
                    <Text style={styles.anCur}>{cur}: ${fmt(v.thisMonth)}</Text>
                    {v.deltaPct !== null && v.deltaPct !== undefined && (
                      <Text style={[styles.anDelta, { color: v.deltaPct >= 0 ? '#10B981' : '#EF4444' }]}>
                        {v.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(v.deltaPct)}%
                      </Text>
                    )}
                  </View>
                ))}
              </View>

              {(analytics.topProducts || []).length > 0 && (
                <View style={styles.anBox}>
                  <Text style={styles.anTitle}>Top productos</Text>
                  {analytics.topProducts.map((p: any, i: number) => (
                    <Text key={p.name} style={styles.anItem}>{i + 1}. {p.name} — {p.qty} u · ${fmt(p.revenue)}</Text>
                  ))}
                </View>
              )}

              {(analytics.deadProducts || []).length > 0 && (
                <View style={styles.alertBox}>
                  <Text style={styles.alertTitle}>🕓 Sin ventas hace 30 días</Text>
                  {analytics.deadProducts.slice(0, 8).map((p: any) => (
                    <Text key={p.id} style={styles.alertItem}>• {p.name} — stock: {p.stock} {p.unit}</Text>
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  offlineBanner: { backgroundColor: '#F97316', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  header: { padding: 16, paddingBottom: 8 },
  welcome: { fontSize: 20, fontWeight: '800', color: colors.text },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  grid: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, position: 'relative' },
  cardLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 18, fontWeight: '800', marginTop: 6, marginBottom: 4 },
  cardSub: { fontSize: 11, color: colors.textMuted },
  cardIcon: { position: 'absolute', top: 12, right: 12, fontSize: 20 },

  todayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryTintB,
    borderRadius: 12,
    padding: 14,
  },
  todayLabel: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 1 },

  curBox: { marginHorizontal: 12, marginBottom: 10, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  curTitle: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1 },
  curRevenue: { fontSize: 20, fontWeight: '800', color: colors.success, marginTop: 2 },
  curExpenses: { fontSize: 12, color: colors.primary, marginTop: 2 },

  anBox: { marginHorizontal: 12, marginBottom: 10, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  anTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 },
  anRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  anCur: { fontSize: 13, color: colors.text, fontWeight: '600' },
  anDelta: { fontSize: 12, fontWeight: '800' },
  anItem: { fontSize: 12, color: colors.textSecondary, paddingVertical: 2 },
  todayValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  todayCount: { fontSize: 12, fontWeight: '700', color: colors.primary },

  chartBox: {
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  chartTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 10 },
  chartSeg: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  chartSegBtn: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 12, backgroundColor: colors.bg,
  },
  chartSegBtnOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  chartSegText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chartSegTextOn: { color: colors.primary },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBar: { width: '70%', backgroundColor: colors.primary, borderRadius: 4, minHeight: 4 },
  chartBarLabel: { fontSize: 8, color: colors.textMuted },
  chartDay: { fontSize: 9, color: colors.textMuted, fontWeight: '600' },

  alertBox: { margin: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 10, padding: 14 },
  alertTitle: { fontWeight: '700', fontSize: 14, color: colors.warningTextDark, marginBottom: 8 },
  alertItem: { fontSize: 13, color: colors.warningTextDark, marginBottom: 4 },
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

