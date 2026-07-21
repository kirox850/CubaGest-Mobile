import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { UsersAPI } from "../api/endpoints";
import { ROLES } from "../config/roles";
import { colors } from "../config/theme";
import { Badge, EmptyState, ErrorBanner } from "../components/UI";

export default function UsuariosScreen() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("cajero");

  const load = useCallback(async () => {
    try {
      setError("");
      const list = await UsersAPI.list();
      setUsers(list);
    } catch (err) { setError(err.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setName(""); setEmail(""); setPassword(""); setRole("cajero"); setModal(true); };

  const save = async () => {
    if (!name || !email || !password) return Alert.alert("Faltan datos", "Complete nombre, correo y contraseña");
    try {
      await UsersAPI.create({ name, email, password, role });
      setModal(false);
      load();
    } catch (err) { Alert.alert("Error", err.message); }
  };

  const deactivate = (u) => {
    Alert.alert("Desactivar usuario", `¿Desactivar a ${u.name}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Desactivar", style: "destructive", onPress: async () => {
        try { await UsersAPI.remove(u.id); load(); }
        catch (err) { Alert.alert("Error", err.message); }
      }},
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Usuarios</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}><Text style={styles.addBtnText}>+ Usuario</Text></TouchableOpacity>
      </View>
      <ErrorBanner message={error} />

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text="No hay usuarios" />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.email}>{item.email}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Badge label={ROLES[item.role]?.label || item.role} color={ROLES[item.role]?.color} />
              {item.active && (
                <TouchableOpacity onPress={() => deactivate(item)}>
                  <Text style={styles.deactivateLink}>Desactivar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nuevo usuario</Text>
            <TextInput style={styles.input} placeholder="Nombre completo" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextInput style={styles.input} placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
            <View style={styles.chipsRow}>
              {Object.entries(ROLES).map(([key, r]) => (
                <TouchableOpacity key={key} onPress={() => setRole(key)} style={[styles.chip, role === key && { backgroundColor: r.color, borderColor: r.color }]}>
                  <Text style={[styles.chipText, role === key && styles.chipTextActive]}>{r.label}</Text>
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
  addBtn: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  row: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: "center" },
  name: { fontWeight: "700", fontSize: 14, color: colors.text },
  email: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deactivateLink: { color: colors.danger, fontSize: 12, fontWeight: "600" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 20 },
  modalTitle: { fontWeight: "700", fontSize: 16, marginBottom: 14, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 10 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
});
