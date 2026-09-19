import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DashboardAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors } from '../config/theme';
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

  // Gráfico de barras de los últimos 7 días (sin dependencias externas).
  const chart = summary?.chartDays || [];
  const maxTotal = Math.max(1, ...chart.map((d) => d.total));

  return (
    <ScrollView
      style={styles.wrap}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={'#3B82F6'} />}
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

          {/* Gráfico últimos 7 días */}
          {chart.length > 0 && (
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>Ventas últimos 7 días</Text>
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

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  offlineBanner: { backgroundColor: '#F97316', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  header: { padding: 16, paddingBottom: 8 },
  welcome: { fontSize: 20, fontWeight: '800', color: colors.text },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  grid: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, position: 'relative' },
  cardLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 18, fontWeight: '800', marginTop: 6, marginBottom: 4 },
  cardSub: { fontSize: 11, color: colors.textMuted },
  cardIcon: { position: 'absolute', top: 12, right: 12, fontSize: 20 },

  todayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 14,
  },
  todayLabel: { fontSize: 10, fontWeight: '800', color: '#3B82F6', letterSpacing: 1 },

  curBox: { marginHorizontal: 12, marginBottom: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  curTitle: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1 },
  curRevenue: { fontSize: 20, fontWeight: '800', color: '#10B981', marginTop: 2 },
  curExpenses: { fontSize: 12, color: '#3B82F6', marginTop: 2 },

  anBox: { marginHorizontal: 12, marginBottom: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  anTitle: { fontSize: 13, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  anRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  anCur: { fontSize: 13, color: '#1E293B', fontWeight: '600' },
  anDelta: { fontSize: 12, fontWeight: '800' },
  anItem: { fontSize: 12, color: '#475569', paddingVertical: 2 },
  todayValue: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginTop: 2 },
  todayCount: { fontSize: 12, fontWeight: '700', color: '#3B82F6' },

  chartBox: {
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBar: { width: '70%', backgroundColor: '#3B82F6', borderRadius: 4, minHeight: 4 },
  chartBarLabel: { fontSize: 8, color: colors.textMuted },
  chartDay: { fontSize: 9, color: colors.textMuted, fontWeight: '600' },

  alertBox: { margin: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 10, padding: 14 },
  alertTitle: { fontWeight: '700', fontSize: 14, color: colors.warningTextDark, marginBottom: 8 },
  alertItem: { fontSize: 13, color: colors.warningTextDark, marginBottom: 4 },
});
