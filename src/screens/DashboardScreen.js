import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { DashboardAPI } from "../api/endpoints";
import { colors } from "../config/theme";
import { Card, ErrorBanner } from "../components/UI";

const fmt = (n) => Number(n || 0).toLocaleString("es-CU", { minimumFractionDigits: 2 });

export default function DashboardScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const summary = await DashboardAPI.summary();
      setData(summary);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.title}>Dashboard</Text>
      <ErrorBanner message={error} />
      {data && (
        <>
          <View style={styles.grid}>
            <Card style={styles.metric}>
              <Text style={styles.metricLabel}>Ingresos totales</Text>
              <Text style={[styles.metricValue, { color: colors.success }]}>${fmt(data.totalRevenue)}</Text>
            </Card>
            <Card style={styles.metric}>
              <Text style={styles.metricLabel}>Gastos totales</Text>
              <Text style={[styles.metricValue, { color: colors.danger }]}>${fmt(data.totalExpenses)}</Text>
            </Card>
            <Card style={styles.metric}>
              <Text style={styles.metricLabel}>Utilidad neta</Text>
              <Text style={styles.metricValue}>${fmt(data.netProfit)}</Text>
            </Card>
            <Card style={styles.metric}>
              <Text style={styles.metricLabel}>Ventas de hoy</Text>
              <Text style={styles.metricValue}>{data.todaySalesCount} (${fmt(data.todaySalesTotal)})</Text>
            </Card>
          </View>

          {data.lowStockCount > 0 && (
            <Card style={{ backgroundColor: colors.warningBg, borderColor: colors.warningBorder, marginTop: 12 }}>
              <Text style={styles.warnTitle}>⚠ Productos con stock bajo ({data.lowStockCount})</Text>
              {data.lowStock.map((p) => (
                <Text key={p.id} style={styles.warnItem}>
                  {p.name} — {p.stock} {p.unit} (mín: {p.minStock})
                </Text>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "47%" },
  metricLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  warnTitle: { fontWeight: "700", color: "#7a4a00", marginBottom: 8 },
  warnItem: { fontSize: 13, color: "#7a4a00", marginBottom: 4 },
});
