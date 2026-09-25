import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DashboardAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { ROLES } from '../config/roles';
import { ErrorBanner, StatCard, SectionCard, PageHeader, Badge } from '../components/UI';
import Icon from '../components/Icon';
import SalesAreaChart, { RANGE_OPTIONS } from '../components/SalesAreaChart';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DashboardSummary } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2 }).format(n || 0);
const curSymbol = (c: string) => (c === 'EUR' ? '€' : '$');
const CACHE_KEY = 'cubagest_dashboard';

// ─── DASHBOARD (clon del Dashboard.tsx de la web) ────────────────────────────
export default function DashboardScreen() {
  const { user, online } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  const [range, setRange] = useState('30d');
  const [cur, setCur] = useState('all');

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
      const days = RANGE_OPTIONS.find((r) => r.value === range)?.days || 30;
      DashboardAPI.analytics(String(days)).then(setAnalytics).catch(() => {});
    } else {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, cachedAt } = JSON.parse(raw);
        setSummary(data);
        setCacheDate(new Date(cachedAt).toLocaleDateString('es-CU'));
      } else {
        setError('Sin conexión y sin datos cacheados');
      }
    }
    setLoading(false);
  }, [online, range]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !summary) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const byCurrency: Record<string, { revenue: number; expenses: number }> = (summary as any)?.byCurrency || {};
  const salesCount: number = (summary as any)?.salesCount || 0;
  const lowStockProducts: any[] = (summary as any)?.lowStock || [];
  const todayCount: number = (summary as any)?.todaySalesCount || 0;
  const chartDays: { date: string; total: number }[] = (summary as any)?.chartDays || [];
  const rev = analytics?.revenueByCurrency || {};

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 24 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
    >
      <ErrorBanner message={error && !summary ? error : ''} />
      {cacheDate && (
        <Text style={{ fontSize: 12, color: '#F97316' }}>⚡ Datos del {cacheDate} · sin conexión</Text>
      )}

      {/* Título — igual que la web: "Panel Principal" + bienvenida */}
      <PageHeader
        title="Panel Principal"
        subtitle={`Bienvenido, ${user?.name} · ${ROLES[user?.role || '']?.label || user?.role}`}
        error={cacheDate ? `Datos del ${cacheDate}` : undefined}
      />

      {/* KPIs — mismos 3 StatCards, mismos colores/iconos que la web */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <View style={{ flexGrow: 1, minWidth: 150 }}>
          <StatCard label="Ventas de Hoy" value={`${todayCount}`} sub={`${fmt((summary as any)?.todaySalesTotal || 0)} en el día`} color="#10B981" icon="pos" />
        </View>
        <View style={{ flexGrow: 1, minWidth: 150 }}>
          <StatCard label="Facturas Emitidas" value={`${salesCount}`} sub="Histórico total" color={colors.primary} icon="facturacion" />
        </View>
        <View style={{ flexGrow: 1, minWidth: 150 }}>
          <StatCard label="Alertas de Stock" value={`${lowStockProducts.length}`} sub={lowStockProducts.length ? lowStockProducts.map((p: any) => p.name).join(', ').slice(0, 60) : 'Todos los productos OK'} color={lowStockProducts.length ? '#F97316' : '#10B981'} icon="alert" />
        </View>
      </View>

      {/* Ingresos/gastos POR MONEDA — nunca se convierten entre sí */}
      {Object.keys(byCurrency).length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Ingresos y gastos por moneda</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {Object.entries(byCurrency).map(([c, v]) => (
              <View key={c} style={{ backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: 16, minWidth: 140 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6 }}>{c}</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#10B981' }}>{curSymbol(c)}{fmt(v.revenue)}</Text>
                <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2 }}>Gastos: {curSymbol(c)}{fmt(v.expenses)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Gráfico interactivo (clon del shadcn de la web) */}
      <SalesAreaChart analytics={analytics} fallback={chartDays} range={range} onRange={setRange} cur={cur} onCur={setCur} />

      {/* Analítica — inteligencia de negocio, mismas 3 tarjetas que la web */}
      {analytics && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <View style={{ flexGrow: 1, minWidth: 260 }}>
            <SectionCard title="Mes vs. mes anterior">
              {Object.entries(rev).map(([c, v]: any) => (
                <View key={c} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{c}</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{fmt(v.thisMonth)} vs {fmt(v.prevMonth)} mes anterior</Text>
                  </View>
                  {v.deltaPct !== null && (
                    <Text style={{ fontSize: 13, fontWeight: '800', color: v.deltaPct >= 0 ? '#10B981' : '#DC2626' }}>
                      {v.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(v.deltaPct)}%
                    </Text>
                  )}
                </View>
              ))}
              {Object.keys(rev).length === 0 && (
                <Text style={{ fontSize: 13, color: colors.textMuted }}>Sin ventas registradas todavía.</Text>
              )}
            </SectionCard>
          </View>

          <View style={{ flexGrow: 1, minWidth: 260 }}>
            <SectionCard title="Top productos (histórico)">
              {(analytics.topProducts || []).length === 0 && (
                <Text style={{ fontSize: 13, color: colors.textMuted }}>Sin datos aún.</Text>
              )}
              {(analytics.topProducts || []).map((p: any, i: number) => (
                <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i === 0 ? colors.primary : colors.inputBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: i === 0 ? '#fff' : colors.text }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, color: colors.text }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>{p.qty} u · {fmt(p.revenue)}</Text>
                </View>
              ))}
            </SectionCard>
          </View>

          <View style={{ flexGrow: 1, minWidth: 260 }}>
            <SectionCard title="Sin ventas hace 30 días">
              {(analytics.deadProducts || []).length === 0 ? (
                <Text style={{ fontSize: 13, color: '#10B981' }}>✅ Todo tu inventario se ha movido recientemente.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {analytics.deadProducts.slice(0, 12).map((p: any) => (
                    <View key={p.id} style={{ backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}>
                      <Text style={{ fontSize: 12, color: colors.text }}>
                        <Text style={{ fontWeight: '700' }}>{p.name}</Text>
                        <Text style={{ color: '#DC2626' }}> stock: {p.stock} {p.unit}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>
          </View>
        </View>
      )}

      {/* Stock bajo — mismo banner naranja que la web */}
      {lowStockProducts.length > 0 && (
        <View style={{ backgroundColor: 'rgba(249,115,22,0.08)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.30)', borderRadius: 16, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="alert" size={18} color="#F97316" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#C2410C' }}>Productos con Stock Bajo</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {lowStockProducts.map((p: any) => (
              <View key={p.id} style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: 'rgba(249,115,22,0.35)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 }}>
                <Text style={{ fontSize: 13 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{p.name}</Text>
                  <Text style={{ color: '#F97316' }}>  Stock: {p.stock} {p.unit} (mín: {p.minStock})</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
