import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ProductsAPI } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { colors } from "../config/theme";
import { Badge, EmptyState, ErrorBanner } from "../components/UI";

// Roles que pueden crear/editar productos (debe coincidir con backend)
const CAN_MANAGE = ["admin", "almacenista"];

const EMPTY_PRODUCT = {
  code: "",
  name: "",
  category: "",
  unit: "unidad",
  price: "",
  cost: "",
  stock: "",
  minStock: "",
};

export default function InventarioScreen() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE.includes(user?.role);

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Modal ajuste de stock
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState("");
  const [type, setType] = useState("entrada");

  // Modal crear / editar producto
  const [productModal, setProductModal] = useState(false);
  const [editing, setEditing] = useState(null); // null = nuevo, objeto = editar
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const list = await ProductsAPI.list();
      setProducts(list);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  );

  // ── Ajuste de stock ──────────────────────────────────────────────
  const openAdjust = (p) => {
    setSelected(p);
    setQty("");
    setType("entrada");
  };

  const saveAdjust = async () => {
    const n = Number(qty);
    if (!n || n <= 0)
      return Alert.alert("Cantidad inválida", "Ingrese una cantidad mayor a 0");
    try {
      await ProductsAPI.adjustStock(
        selected.id,
        type,
        n,
        "Ajuste desde app móvil"
      );
      setSelected(null);
      load();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  // ── Crear / Editar producto ──────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PRODUCT);
    setProductModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      code: p.code,
      name: p.name,
      category: p.category || "",
      unit: p.unit || "unidad",
      price: String(p.price),
      cost: String(p.cost || ""),
      stock: String(p.stock),
      minStock: String(p.minStock || ""),
    });
    setProductModal(true);
  };

  const saveProduct = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.price) {
      Alert.alert("Campos requeridos", "Código, nombre y precio son obligatorios.");
      return;
    }
    const price = Number(form.price);
    if (isNaN(price) || price < 0) {
      Alert.alert("Precio inválido", "Ingrese un precio válido mayor o igual a 0.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category.trim(),
        unit: form.unit.trim() || "unidad",
        price,
        cost: Number(form.cost) || 0,
        stock: Number(form.stock) || 0,
        minStock: Number(form.minStock) || 0,
      };

      if (editing) {
        await ProductsAPI.update(editing.id, payload);
      } else {
        await ProductsAPI.create(payload);
      }

      setProductModal(false);
      load();
    } catch (err) {
      Alert.alert("Error al guardar", err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (p) => {
    Alert.alert(
      "Desactivar producto",
      `¿Desea desactivar "${p.name}"? No se eliminará, solo se ocultará del inventario activo.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desactivar",
          style: "destructive",
          onPress: async () => {
            try {
              await ProductsAPI.remove(p.id);
              load();
            } catch (err) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ]
    );
  };

  const Field = ({ label, ...props }) => (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={colors.textMuted} {...props} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventario</Text>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        )}
      </View>

      <ErrorBanner message={error} />

      <TextInput
        style={styles.search}
        placeholder="Buscar por nombre o código..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text="No hay productos" />}
        renderItem={({ item }) => {
          const low = Number(item.stock) <= Number(item.minStock);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => openAdjust(item)}
              onLongPress={() => canManage && openEdit(item)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.code}>
                  {item.code} · {item.category}
                </Text>
                {canManage && (
                  <Text style={styles.hint}>Mantén presionado para editar</Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.price}>${Number(item.price).toFixed(2)}</Text>
                <Badge
                  label={`${item.stock} ${item.unit}`}
                  color={low ? colors.warning : colors.success}
                />
                {canManage && (
                  <TouchableOpacity
                    onPress={() => confirmDelete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.deleteLink}>Desactivar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Modal: Ajuste de stock ── */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Ajustar stock — {selected?.name}
            </Text>
            <View style={styles.typeRow}>
              {["entrada", "salida"].map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      type === t && styles.typeBtnTextActive,
                    ]}
                  >
                    {t === "entrada" ? "Entrada (+)" : "Salida (-)"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.qtyInput}
              placeholder="Cantidad"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={qty}
              onChangeText={setQty}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSelected(null)}
              >
                <Text style={{ color: colors.textMuted }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAdjust}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Crear / Editar producto ── */}
      <Modal
        visible={productModal}
        transparent
        animationType="slide"
        onRequestClose={() => setProductModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { maxHeight: "90%" }]}>
              <Text style={styles.modalTitle}>
                {editing ? "Editar producto" : "Nuevo producto"}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Field
                  label="Código *"
                  value={form.code}
                  onChangeText={(v) => setForm((f) => ({ ...f, code: v }))}
                  placeholder="Ej: P001"
                  autoCapitalize="characters"
                  editable={!editing} // el código no se cambia al editar
                />
                <Field
                  label="Nombre *"
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="Nombre del producto"
                />
                <Field
                  label="Categoría"
                  value={form.category}
                  onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
                  placeholder="Ej: Alimentos"
                />
                <Field
                  label="Unidad de medida"
                  value={form.unit}
                  onChangeText={(v) => setForm((f) => ({ ...f, unit: v }))}
                  placeholder="unidad / kg / litro..."
                />
                <Field
                  label="Precio de venta (CUP) *"
                  value={form.price}
                  onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Costo (CUP)"
                  value={form.cost}
                  onChangeText={(v) => setForm((f) => ({ ...f, cost: v }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                {!editing && (
                  <Field
                    label="Stock inicial"
                    value={form.stock}
                    onChangeText={(v) => setForm((f) => ({ ...f, stock: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                )}
                <Field
                  label="Stock mínimo (alerta)"
                  value={form.minStock}
                  onChangeText={(v) => setForm((f) => ({ ...f, minStock: v }))}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </ScrollView>

              <View style={[styles.modalActions, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setProductModal(false)}
                  disabled={saving}
                >
                  <Text style={{ color: colors.textMuted }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={saveProduct}
                  disabled={saving}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    {saving ? "Guardando…" : "Guardar"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#fff",
    marginBottom: 12,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  name: { fontWeight: "700", fontSize: 14, color: colors.text },
  code: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 10, color: colors.border, marginTop: 2 },
  price: { fontWeight: "700", color: colors.text, marginBottom: 4 },
  deleteLink: { fontSize: 11, color: colors.danger, marginTop: 6 },

  // Modales
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 16,
    color: colors.text,
  },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  typeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeBtnText: { color: colors.text, fontWeight: "600" },
  typeBtnTextActive: { color: "#fff" },
  qtyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 16,
    color: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },

  // Formulario de producto
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
});
