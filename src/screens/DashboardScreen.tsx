import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DashboardAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { ROLES } from '../config/roles';
import { ErrorBanner, StatCard, SectionCard, PageHeader, Badge, Skeleton, SkeletonRows } from '../components/UI';
import Icon from '../components/Icon';
import SalesAreaChart, { RANGE_OPTIONS } from '../components/SalesAreaChart';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountScopedKey } from '../offline/namespace';
import { companyIdOf } from '../api/userShape';
import type { DashboardSummary } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2 }).format(n || 0);
const curSymbol = (c: string) => (c === 'EUR' ? '€' : '$');

// El resumen cacheado es POR CUENTA: con una cache global, entrar con otra
// cuenta en el mismo teléfono mostraba los números de la anterior. Se conserva
// al cerrar sesión (no es dato sensible de la sesión, es caché del negocio).
const cacheKeyFor = (userId: string, companyId: string) =>
  accountScopedKey('dashboard', companyId, userId);

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

  const CACHE_KEY = user ? cacheKeyFor(user.id, companyIdOf(user)) : '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    if (online) {
      try {
        const data = await DashboardAPI.summary();
        setSummary(data);
        if (CACHE_KEY) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }));
        setCacheDate(null);
      } catch (e) {
        const raw = CACHE_KEY ? await AsyncStorage.getItem(CACHE_KEY) : null;
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
      const raw = CACHE_KEY ? await AsyncStorage.getItem(CACHE_KEY) : null;
      if (raw) {
        const { data, cachedAt } = JSON.parse(raw);
        setSummary(data);
        setCacheDate(new Date(cachedAt).toLocaleDateString('es-CU'));
      } else {
        setError('Sin conexión y sin datos cacheados');
      }
    }
    setLoading(false);
  }, [online, range, CACHE_KEY]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Antes esto devolvía una <View /> vacía: dos segundos de pantalla en blanco,
  // que no se distinguen de una app colgada —y el panel es la pantalla que más
  // se nota, porque es la que abre la app. Se esboza su FORMA real (cabecera,
  // las tres tarjetas de KPI, el gráfico y las listas) dentro del mismo
  // contenedor, de modo que al llegar los datos nada cambia de sitio.
  if (loading && !summary) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 24 }}
      >
        {/* PageHeader: título 22/800 + subtítulo 14 */}
        <View style={{ gap: 6 }}>
          <Skeleton w="45%" h={22} r={7} />
          <Skeleton w="65%" h={14} />
        </View>

        {/* KPIs: mismas cajas que `StatCard` (radio 16, borde 1, padding 22/24) */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexGrow: 1, minWidth: 150, backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 22, paddingHorizontal: 24, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flexShrink: 1, gap: 6 }}>
                  <Skeleton w="62%" h={12} r={6} />
                  <Skeleton w="45%" h={24} r={8} />
                </View>
                <Skeleton w={42} h={42} r={12} />
              </View>
              <Skeleton w="70%" h={12} r={6} />
            </View>
          ))}
        </View>

        {/* Gráfico: selector de rango arriba y el área de barras de abajo, con
            la misma proporción de altura que el área real. */}
        <View style={{ backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Skeleton w="38%" h={15} />
            <Skeleton w={92} h={26} r={13} />
          </View>
          <View style={{ height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {[52, 88, 64, 112, 74, 98, 46, 84, 68, 106].map((h, i) => (
              <Skeleton key={i} h={h} r={6} style={{ flex: 1 }} />
            ))}
          </View>
        </View>

        {/* Listas de analítica: filas con borde, la forma que se repite */}
        <SkeletonRows n={3} h={62} />
      </ScrollView>
    );
  }

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="zap" size={12} color={colors.warning} />
            <Text style={{ fontSize: 12, color: colors.warning }}>Datos del {cacheDate} · sin conexión</Text>
          </View>
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
          <StatCard label="Ventas de Hoy" value={`${todayCount}`} sub={`${fmt((summary as any)?.todaySalesTotal || 0)} en el día`} color={colors.success} icon="pos" />
        </View>
        <View style={{ flexGrow: 1, minWidth: 150 }}>
          <StatCard label="Facturas Emitidas" value={`${salesCount}`} sub="Histórico total" color={colors.primary} icon="facturacion" />
        </View>
        <View style={{ flexGrow: 1, minWidth: 150 }}>
          <StatCard label="Alertas de Stock" value={`${lowStockProducts.length}`} sub={lowStockProducts.length ? lowStockProducts.map((p: any) => p.name).join(', ').slice(0, 60) : 'Todos los productos OK'} color={lowStockProducts.length ? colors.warning : colors.success} icon="alert" />
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
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.success }}>{curSymbol(c)}{fmt(v.revenue)}</Text>
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
                    <Text style={{ fontSize: 13, fontWeight: '800', color: v.deltaPct >= 0 ? colors.success : colors.danger }}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Badge icon="check" label="Al día" color={colors.success} />
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Todo tu inventario se ha movido recientemente.</Text>
          </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {analytics.deadProducts.slice(0, 12).map((p: any) => (
                    <View key={p.id} style={{ backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}>
                      <Text style={{ fontSize: 12, color: colors.text }}>
                        <Text style={{ fontWeight: '700' }}>{p.name}</Text>
                        <Text style={{ color: colors.danger }}> stock: {p.stock} {p.unit}</Text>
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
            <Icon name="alert" size={18} color={colors.warning} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.warningText }}>Productos con Stock Bajo</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {lowStockProducts.map((p: any) => (
              <View key={p.id} style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: 'rgba(249,115,22,0.35)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 }}>
                <Text style={{ fontSize: 13 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{p.name}</Text>
                  <Text style={{ color: colors.warning }}>  Stock: {p.stock} {p.unit} (mín: {p.minStock})</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
