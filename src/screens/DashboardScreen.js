import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { DashboardAPI } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { colors } from "../config/theme";
import { ROLES } from "../config/roles";
import { ErrorBanner } from "../components/UI";
import AsyncStorage from "@react-native-async-storage/async-storage";

const fmt = (n) => new Intl.NumberFormat("es-CU", { minimumFractionDigits: 2 }).format(n || 0);
const CACHE_KEY = "cubagest_dashboard";

export default function DashboardScreen() {
  const { user, online } = useAuth();
  const [summary, setSummary]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [cacheDate, setCacheDate] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    if (online) {
      try {
        const data = await DashboardAPI.summary();
        setSummary(data);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }));
        setCacheDate(null);
      } catch (e) {
        // Intentar caché
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data, cachedAt } = JSON.parse(raw);
          setSummary(data);
          setCacheDate(new Date(cachedAt).toLocaleDateString("es-CU"));
        } else {
          setError(e.message);
        }
      }
    } else {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, cachedAt } = JSON.parse(raw);
        setSummary(data);
        setCacheDate(new Date(cachedAt).toLocaleDateString("es-CU"));
      } else {
        setError("Sin conexión y sin datos en caché");
      }
    }
    setLoading(false);
  }, [online]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const StatCard = ({ label, value, sub, color, icon }) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, { color: color || colors.text }]}>{value}</Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
      <Text style={styles.cardIcon}>{icon}</Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.wrap}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary}/>}
    >
      <ErrorBanner message={error}/>
      {cacheDate && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚡ Datos del {cacheDate} — sin conexión</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.welcome}>Bienvenido, {user?.name}</Text>
        <Text style={styles.role}>{ROLES[user?.role]?.label}</Text>
      </View>

      {summary && (
        <>
          <View style={styles.grid}>
            <StatCard
              label="Ingresos del Mes"
              value={`$${fmt(summary.totalRevenue)} CUP`}
              sub={`${summary.salesCount || 0} facturas`}
              color={colors.success}
              icon="📈"
            />
            <StatCard
              label="Gastos del Mes"
              value={`$${fmt(summary.totalExpenses)} CUP`}
              sub="Total egresos"
              color={colors.danger}
              icon="💸"
            />
          </View>
          <View style={styles.grid}>
            <StatCard
              label="Utilidad Neta"
              value={`$${fmt(summary.netProfit)} CUP`}
              sub={`Margen: ${Math.round((summary.netProfit / Math.max(summary.totalRevenue, 1)) * 100)}%`}
              color={summary.netProfit >= 0 ? "#1A5C8B" : colors.danger}
              icon="💰"
            />
            <StatCard
              label="Alertas Stock"
              value={summary.lowStockProducts?.length || 0}
              sub={summary.lowStockProducts?.length ? "Productos con stock bajo" : "Todo OK"}
              color={summary.lowStockProducts?.length ? "#c17a00" : colors.success}
              icon="📦"
            />
          </View>

          {summary.lowStockProducts?.length > 0 && (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>⚠ Productos con stock bajo</Text>
              {summary.lowStockProducts.map(p => (
                <Text key={p.id} style={styles.alertItem}>• {p.name} — {p.stock} {p.unit} (mín: {p.minStock})</Text>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap:         { flex: 1, backgroundColor: colors.bg },
  offlineBanner:{ backgroundColor: "#c17a00", padding: 8, alignItems: "center" },
  offlineText:  { color: "#fff", fontSize: 12, fontWeight: "600" },
  header:       { padding: 16, paddingBottom: 8 },
  welcome:      { fontSize: 20, fontWeight: "800", color: colors.text },
  role:         { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  grid:         { flexDirection: "row", gap: 12, paddingHorizontal: 12, marginBottom: 12 },
  card:         { flex: 1, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, position: "relative" },
  cardLabel:    { fontSize: 11, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  cardValue:    { fontSize: 18, fontWeight: "800", marginTop: 6, marginBottom: 4 },
  cardSub:      { fontSize: 11, color: colors.textMuted },
  cardIcon:     { position: "absolute", top: 12, right: 12, fontSize: 20 },
  alertBox:     { margin: 12, backgroundColor: "#fffbf0", borderWidth: 1, borderColor: "#f0d070", borderRadius: 10, padding: 14 },
  alertTitle:   { fontWeight: "700", fontSize: 14, color: "#7a4a00", marginBottom: 8 },
  alertItem:    { fontSize: 13, color: "#5a3a00", marginBottom: 4 },
});
