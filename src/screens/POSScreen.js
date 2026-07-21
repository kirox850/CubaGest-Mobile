import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ProductsAPI, SalesAPI } from "../api/endpoints";
import { colors } from "../config/theme";
import { EmptyState, ErrorBanner } from "../components/UI";

const PAY_METHODS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "tarjeta", label: "Tarjeta" },
];

export default function POSScreen() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // [{ product, qty }]
  const [payMethod, setPayMethod] = useState("efectivo");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const list = await ProductsAPI.list();
      setProducts(list.filter((p) => p.active));
    } catch (err) { setError(err.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const addToCart = (product) => {
    setCart((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (found) return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product, qty: 1 }];
    });
  };

  const changeQty = (productId, delta) => {
    setCart((prev) => prev
      .map((l) => (l.product.id === productId ? { ...l, qty: l.qty + delta } : l))
      .filter((l) => l.qty > 0));
  };

  const total = cart.reduce((a, l) => a + l.qty * Number(l.product.price), 0);

  const checkout = async () => {
    if (cart.length === 0) return Alert.alert("Carrito vacío", "Agregue al menos un producto");
    setSaving(true);
    try {
      await SalesAPI.create({
        payMethod,
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
      });
      setCart([]);
      Alert.alert("Venta registrada", "La factura se generó correctamente");
      load();
    } catch (err) {
      Alert.alert("Error al vender", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Punto de Venta</Text>
      <ErrorBanner message={error} />
      <TextInput style={styles.search} placeholder="Buscar producto..." value={search} onChangeText={setSearch} />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        horizontal={false}
        style={{ maxHeight: 220 }}
        ListEmptyComponent={<EmptyState text="No hay productos" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.productRow} onPress={() => addToCart(item)}>
            <Text style={styles.productName}>{item.name}</Text>
            <Text style={styles.productPrice}>${Number(item.price).toFixed(2)} · stock {item.stock}</Text>
          </TouchableOpacity>
        )}
      />

      <Text style={styles.cartTitle}>Carrito ({cart.length})</Text>
      <FlatList
        data={cart}
        keyExtractor={(l) => l.product.id}
        style={{ flex: 1 }}
        ListEmptyComponent={<EmptyState text="Toque un producto para agregarlo" />}
        renderItem={({ item }) => (
          <View style={styles.cartRow}>
            <Text style={{ flex: 1, fontSize: 13 }}>{item.product.name}</Text>
            <TouchableOpacity onPress={() => changeQty(item.product.id, -1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
            <Text style={styles.qtyValue}>{item.qty}</Text>
            <TouchableOpacity onPress={() => changeQty(item.product.id, 1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
            <Text style={styles.lineTotal}>${(item.qty * Number(item.product.price)).toFixed(2)}</Text>
          </View>
        )}
      />

      <View style={styles.payRow}>
        {PAY_METHODS.map((m) => (
          <TouchableOpacity key={m.id} onPress={() => setPayMethod(m.id)} style={[styles.payBtn, payMethod === m.id && styles.payBtnActive]}>
            <Text style={[styles.payBtnText, payMethod === m.id && styles.payBtnTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.total}>Total: ${total.toFixed(2)}</Text>
        <TouchableOpacity style={styles.checkoutBtn} onPress={checkout} disabled={saving}>
          <Text style={styles.checkoutText}>{saving ? "Procesando..." : "Cobrar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 10 },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#fff", marginBottom: 10 },
  productRow: { backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 6 },
  productName: { fontWeight: "600", fontSize: 13, color: colors.text },
  productPrice: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cartTitle: { fontWeight: "700", fontSize: 14, marginTop: 10, marginBottom: 6, color: colors.text },
  cartRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 8, padding: 8, marginBottom: 6, gap: 6 },
  qtyBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  qtyBtnText: { fontSize: 16, fontWeight: "700" },
  qtyValue: { width: 24, textAlign: "center", fontWeight: "700" },
  lineTotal: { width: 64, textAlign: "right", fontWeight: "700", fontSize: 12 },
  payRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  payBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  payBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  payBtnText: { fontSize: 12, fontWeight: "600", color: colors.text },
  payBtnTextActive: { color: "#fff" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  total: { fontSize: 18, fontWeight: "800", color: colors.text },
  checkoutBtn: { backgroundColor: colors.success, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  checkoutText: { color: "#fff", fontWeight: "700" },
});
