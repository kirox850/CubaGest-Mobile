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
      </View>

      {summary && (
        <>
          <View style={styles.grid}>
            <StatCard
              label="Ingresos del Mes"
              value={`$${fmt(summary.totalRevenue)} CUP`}
              sub={`${summary.salesCount || 0} facturas`}
              color={'#10B981'}
              icon="📈"
            />
            <StatCard
              label="Gastos del Mes"
              value={`$${fmt(summary.totalExpenses)} CUP`}
              sub="Total egresos"
              color={'#EF4444'}
              icon="💸"
            />
          </View>
          <View style={styles.grid}>
            <StatCard
              label="Utilidad Neta"
              value={`$${fmt(summary.netProfit)} CUP`}
              sub={`Margen: ${Math.round((summary.netProfit / Math.max(summary.totalRevenue, 1)) * 100)}%`}
              color={summary.netProfit >= 0 ? '#3B82F6' : '#EF4444'}
              icon="💰"
            />
            <StatCard
              label="Alertas Stock"
              value={String(summary.lowStock?.length || 0)}
              sub={summary.lowStock?.length ? 'Productos con stock bajo' : 'Todo OK'}
              color={summary.lowStock?.length ? '#F97316' : '#10B981'}
              icon="📦"
            />
          </View>

          {summary.lowStock?.length > 0 && (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>⚠ Productos con stock bajo</Text>
              {summary.lowStock.map(p => (
                <Text key={p.id} style={styles.alertItem}>• {p.name} — {p.stock} {p.unit} (min: {p.minStock})</Text>
              ))}
            </View>
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
  alertBox: { margin: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 10, padding: 14 },
  alertTitle: { fontWeight: '700', fontSize: 14, color: colors.warningTextDark, marginBottom: 8 },
  alertItem: { fontSize: 13, color: colors.warningTextDark, marginBottom: 4 },
});
