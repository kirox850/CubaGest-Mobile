import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SalesAPI } from "../api/endpoints";
import { colors } from "../config/theme";
import { Badge, EmptyState, ErrorBanner } from "../components/UI";

export default function FacturacionScreen() {
  const [sales, setSales] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const list = await SalesAPI.list();
      setSales(list);
    } catch (err) { setError(err.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmVoid = (sale) => {
    Alert.alert("Anular factura", `¿Anular ${sale.invoiceNumber}? Esto repone el stock vendido.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Anular", style: "destructive", onPress: async () => {
        try { await SalesAPI.voidSale(sale.id); load(); }
        catch (err) { Alert.alert("Error", err.message); }
      }},
    ]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Facturación</Text>
      <ErrorBanner message={error} />
      <FlatList
        data={sales}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text="No hay facturas" />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invoice}>{item.invoiceNumber}</Text>
              <Text style={styles.client}>{item.clientName} · {item.date}</Text>
              <Text style={styles.items}>{item.items?.length || 0} producto(s) · {item.payMethod}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={styles.total}>${Number(item.total).toFixed(2)}</Text>
              <Badge label={item.status === "emitida" ? "Emitida" : "Anulada"} color={item.status === "emitida" ? colors.success : colors.textMuted} />
              {item.status === "emitida" && (
                <TouchableOpacity onPress={() => confirmVoid(item)}>
                  <Text style={styles.voidLink}>Anular</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 10 },
  row: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  invoice: { fontWeight: "700", fontFamily: "monospace", color: colors.text },
  client: { fontSize: 13, color: colors.text, marginTop: 2 },
  items: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  total: { fontWeight: "800", color: colors.text },
  voidLink: { color: colors.danger, fontSize: 12, fontWeight: "600" },
});
