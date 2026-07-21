import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ProductsAPI } from "../api/endpoints";
import { colors } from "../config/theme";
import { Badge, EmptyState, ErrorBanner } from "../components/UI";

export default function InventarioScreen() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState("");
  const [type, setType] = useState("entrada");

  const load = useCallback(async () => {
    try {
      setError("");
      const list = await ProductsAPI.list();
      setProducts(list);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
  );

  const openAdjust = (p) => { setSelected(p); setQty(""); setType("entrada"); };

  const saveAdjust = async () => {
    const n = Number(qty);
    if (!n || n <= 0) return Alert.alert("Cantidad inválida", "Ingrese una cantidad mayor a 0");
    try {
      await ProductsAPI.adjustStock(selected.id, type, n, "Ajuste desde app móvil");
      setSelected(null);
      load();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Inventario</Text>
      <ErrorBanner message={error} />
      <TextInput style={styles.search} placeholder="Buscar por nombre o código..." value={search} onChangeText={setSearch} />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text="No hay productos" />}
        renderItem={({ item }) => {
          const low = Number(item.stock) <= Number(item.minStock);
          return (
            <TouchableOpacity style={styles.row} onPress={() => openAdjust(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.code}>{item.code} · {item.category}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.price}>${Number(item.price).toFixed(2)}</Text>
                <Badge label={`${item.stock} ${item.unit}`} color={low ? colors.warning : colors.success} />
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ajustar stock — {selected?.name}</Text>
            <View style={styles.typeRow}>
              {["entrada", "salida"].map((t) => (
                <TouchableOpacity key={t} onPress={() => setType(t)} style={[styles.typeBtn, type === t && styles.typeBtnActive]}>
                  <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>{t === "entrada" ? "Entrada (+)" : "Salida (-)"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.qtyInput} placeholder="Cantidad" keyboardType="numeric" value={qty} onChangeText={setQty} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}><Text>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAdjust}><Text style={{ color: "#fff", fontWeight: "700" }}>Guardar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 10 },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#fff", marginBottom: 12 },
  row: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: "center" },
  name: { fontWeight: "700", fontSize: 14, color: colors.text },
  code: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  price: { fontWeight: "700", color: colors.text, marginBottom: 4 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 20 },
  modalTitle: { fontWeight: "700", fontSize: 16, marginBottom: 16, color: colors.text },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  typeBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  typeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeBtnText: { color: colors.text, fontWeight: "600" },
  typeBtnTextActive: { color: "#fff" },
  qtyInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 16 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
});
