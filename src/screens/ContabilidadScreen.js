import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ExpensesAPI } from "../api/endpoints";
import { colors } from "../config/theme";
import { EmptyState, ErrorBanner } from "../components/UI";

const CATEGORIES = ["Compras", "Servicios", "Nómina", "Operaciones", "Otros"];
const METHODS = [{ id: "efectivo", label: "Efectivo" }, { id: "transferencia", label: "Transferencia" }];

export default function ContabilidadScreen() {
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [method, setMethod] = useState("efectivo");

  const load = useCallback(async () => {
    try {
      setError("");
      const list = await ExpensesAPI.list();
      setExpenses(list);
    } catch (err) { setError(err.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);

  const openNew = () => { setConcept(""); setAmount(""); setCategory(CATEGORIES[0]); setMethod("efectivo"); setModal(true); };

  const save = async () => {
    if (!concept || !amount) return Alert.alert("Faltan datos", "Complete concepto y monto");
    try {
      await ExpensesAPI.create({
        date: new Date().toISOString().split("T")[0],
        concept, amount: Number(amount), category, method,
      });
      setModal(false);
      load();
    } catch (err) { Alert.alert("Error", err.message); }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Contabilidad</Text>
          <Text style={styles.subtitle}>Gastos totales: ${total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}><Text style={styles.addBtnText}>+ Gasto</Text></TouchableOpacity>
      </View>
      <ErrorBanner message={error} />

      <FlatList
        data={expenses}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text="No hay gastos registrados" />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.concept}>{item.concept}</Text>
              <Text style={styles.meta}>{item.category} · {item.date} · {item.method}</Text>
            </View>
            <Text style={styles.amount}>${Number(item.amount).toFixed(2)}</Text>
          </View>
        )}
      />

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nuevo gasto</Text>
            <TextInput style={styles.input} placeholder="Concepto" value={concept} onChangeText={setConcept} />
            <TextInput style={styles.input} placeholder="Monto" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <View style={styles.chipsRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.chipsRow}>
              {METHODS.map((m) => (
                <TouchableOpacity key={m.id} onPress={() => setMethod(m.id)} style={[styles.chip, method === m.id && styles.chipActive]}>
                  <Text style={[styles.chipText, method === m.id && styles.chipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}><Text>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={{ color: "#fff", fontWeight: "700" }}>Guardar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  row: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: "center" },
  concept: { fontWeight: "600", fontSize: 13, color: colors.text },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  amount: { fontWeight: "800", color: colors.danger },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 20 },
  modalTitle: { fontWeight: "700", fontSize: 16, marginBottom: 14, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 10 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
});
