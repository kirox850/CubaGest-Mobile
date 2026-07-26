import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, Modal, ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SalesAPI, ExpensesAPI } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { colors } from "../config/theme";
import { PAY_METHODS } from "../config/roles";
import { EmptyState, ErrorBanner, Badge } from "../components/UI";

const fmt = (n) => Number(n || 0).toFixed(2);
const EXPENSE_CATS = ["Compras","Nómina","Servicios","Operaciones","Impuestos","Otros"];
const today = () => new Date().toISOString().split("T")[0];

export default function ContabilidadScreen() {
  const { online } = useAuth();
  const [sales, setSales]         = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [tab, setTab]             = useState("resumen");
  const [error, setError]         = useState("");
  const [modal, setModal]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ date: today(), concept: "", amount: "", category: "Compras", method: "efectivo" });

  const load = useCallback(async () => {
    try {
      setError("");
      const [s, e] = await Promise.all([SalesAPI.list(), ExpensesAPI.list()]);
      setSales(s);
      setExpenses(e);
    } catch (err) { setError(err.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalIncome = sales.filter(s => s.status === "emitida").reduce((a, s) => a + Number(s.total), 0);
  const totalExp    = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const net         = totalIncome - totalExp;

  const addExpense = async () => {
    if (!form.concept || !form.amount) return Alert.alert("Error", "Complete concepto y monto");
    setSaving(true);
    try {
      await ExpensesAPI.create({ ...form, amount: Number(form.amount) });
      setModal(false);
      setForm({ date: today(), concept: "", amount: "", category: "Compras", method: "efectivo" });
      load();
    } catch (e) { Alert.alert("Error", e.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.wrap}>
      <ErrorBanner message={error}/>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[["resumen","Resumen"],["ingresos","Ingresos"],["gastos","Egresos"]].map(([v,l]) => (
          <TouchableOpacity key={v} style={[styles.tabBtn, tab===v && styles.tabBtnActive]} onPress={() => setTab(v)}>
            <Text style={[styles.tabText, tab===v && styles.tabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "resumen" && (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>📋 Resumen ONAT</Text>
            {[
              ["Ingresos brutos", totalIncome, "#1A7A3C"],
              ["Total egresos",   totalExp,    colors.danger],
              ["Utilidad neta",   net,         net >= 0 ? "#1A5C8B" : colors.danger],
            ].map(([label, value, color]) => (
              <View key={label} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text style={[styles.summaryValue, { color }]}>${fmt(value)} CUP</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
            <Text style={styles.addBtnText}>+ Registrar Egreso</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {tab === "ingresos" && (
        <FlatList
          data={sales.filter(s => s.status === "emitida")}
          keyExtractor={s => s.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EmptyState text="No hay ingresos"/>}
          renderItem={({ item: s }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowPrimary}>{s.invoiceNumber || s.id}</Text>
                <Text style={styles.rowSub}>{(s.date || s.createdAt || "").split("T")[0]} · {s.clientName || s.client}</Text>
              </View>
              <Text style={styles.rowAmt}>${fmt(s.total)}</Text>
            </View>
          )}
        />
      )}

      {tab === "gastos" && (
        <FlatList
          data={expenses}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<EmptyState text="No hay egresos"/>}
          renderItem={({ item: e }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowPrimary}>{e.concept}</Text>
                <Text style={styles.rowSub}>{(e.date || e.createdAt || "").split("T")[0]} · {e.category}</Text>
              </View>
              <Text style={[styles.rowAmt, { color: colors.danger }]}>${fmt(e.amount)}</Text>
            </View>
          )}
        />
      )}

      {modal && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setModal(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Registrar Egreso</Text>
              <TextInput style={styles.input} value={form.date} onChangeText={v => setForm(f=>({...f,date:v}))} placeholder="Fecha (YYYY-MM-DD)" placeholderTextColor={colors.textMuted}/>
              <TextInput style={styles.input} value={form.concept} onChangeText={v => setForm(f=>({...f,concept:v}))} placeholder="Concepto *" placeholderTextColor={colors.textMuted}/>
              <TextInput style={styles.input} value={form.amount} onChangeText={v => setForm(f=>({...f,amount:v}))} placeholder="Monto CUP *" keyboardType="decimal-pad" placeholderTextColor={colors.textMuted}/>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {EXPENSE_CATS.map(c => (
                    <TouchableOpacity key={c} style={[styles.chip, form.category===c && styles.chipActive]} onPress={() => setForm(f=>({...f,category:c}))}>
                      <Text style={[styles.chipText, form.category===c && {color:"#fff"}]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setModal(false)}>
                  <Text style={{ fontWeight: "600" }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnPrimary, saving && {opacity:0.6}]} onPress={addExpense} disabled={saving}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando..." : "Guardar"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:          { flex: 1, backgroundColor: colors.bg },
  tabRow:        { flexDirection: "row", backgroundColor: "#f0ebe4", margin: 12, borderRadius: 10, padding: 4 },
  tabBtn:        { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 7 },
  tabBtnActive:  { backgroundColor: colors.primary },
  tabText:       { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: "#fff" },
  summaryBox:    { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  summaryTitle:  { fontWeight: "700", fontSize: 15, color: colors.text, marginBottom: 12 },
  summaryRow:    { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLabel:  { fontSize: 14, color: colors.text },
  summaryValue:  { fontSize: 14, fontWeight: "700" },
  addBtn:        { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  addBtnText:    { color: "#fff", fontWeight: "700", fontSize: 15 },
  row:           { flexDirection: "row", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: "center" },
  rowPrimary:    { fontWeight: "600", fontSize: 13, color: colors.text },
  rowSub:        { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowAmt:        { fontWeight: "800", fontSize: 15, color: colors.text },
  modalBg:       { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard:     { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalTitle:    { fontWeight: "800", fontSize: 16, marginBottom: 14, color: colors.text },
  input:         { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, backgroundColor: colors.bg, marginBottom: 10, color: colors.text },
  chip:          { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText:      { fontSize: 12, fontWeight: "600", color: colors.text },
  modalActions:  { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  btnPrimary:    { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnSecondary:  { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
});
