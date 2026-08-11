import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ProductsAPI, SalesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors } from '../config/theme';
import { PAY_METHODS } from '../config/roles';
import { EmptyState, ErrorBanner } from '../components/UI';
import type { Product } from '../types';

const fmt = (n: number) => Number(n || 0).toFixed(2);

export default function POSScreen() {
  const { online } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payMethod, setPayMethod] = useState('efectivo');
  const [clientName, setClientName] = useState('');
  const [clientNit, setClientNit] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [cashGiven, setCashGiven] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const needsTransfer = payMethod === 'transferencia';

  const load = useCallback(async () => {
    try {
      setError('');
      const list = await ProductsAPI.list();
      setProducts(list.filter(p => p.active && p.stock > 0));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase()),
  );

  const qtyFor = (id: string) => cart[id] || 0;

  const setQty = (product: Product, qty: number) => {
    if (qty < 0) return;
    if (qty > product.stock) {
      Alert.alert('Stock insuficiente', `Solo hay ${product.stock} unidades disponibles`);
      return;
    }
    setCart(prev => {
      const next = { ...prev };
      if (qty === 0) delete next[product.id];
      else next[product.id] = qty;
      return next;
    });
  };

  const cartItems = products
    .filter(p => cart[p.id])
    .map(p => ({ product: p, qty: cart[p.id] }));

  const subtotal = cartItems.reduce((a, l) => a + l.qty * Number(l.product.price), 0);
  const change = Number(cashGiven) - subtotal;

  const checkout = async () => {
    if (cartItems.length === 0) {
      return Alert.alert('Carrito vacio', 'Agrega al menos un producto');
    }
    if (needsTransfer && (!clientName || !clientNit || !clientPhone)) {
      return Alert.alert('Datos requeridos', 'Para transferencia completa nombre, NIT y telefono');
    }

    setSaving(true);
    try {
      await SalesAPI.create({
        client: needsTransfer ? clientName : 'Consumidor Final',
        clientNit: needsTransfer ? clientNit : '00000000000',
        clientPhone: needsTransfer ? clientPhone : undefined,
        payMethod,
        items: cartItems.map(l => ({
          productId: l.product.id,
          name: l.product.name,
          qty: l.qty,
          price: Number(l.product.price),
        })),
        subtotal,
        total: subtotal,
        currency: 'CUP',
      });
      setCart({});
      setClientName(''); setClientNit(''); setClientPhone(''); setCashGiven('');
      Alert.alert('✓ Venta registrada', 'La factura se genero correctamente');
      load();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ErrorBanner message={error} />
      {!online && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Sin conexion — ventas no disponibles offline en app</Text>
        </View>
      )}

      {/* Buscador */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Buscar producto..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Lista de productos scrollable */}
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        style={styles.productList}
        ListEmptyComponent={<EmptyState text="No hay productos disponibles" />}
        renderItem={({ item: p }) => {
          const q = qtyFor(p.id);
          return (
            <View style={styles.productRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{p.name}</Text>
                <Text style={styles.productSub}>Stock: {p.stock} {p.unit} · ${fmt(Number(p.price))}</Text>
              </View>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={[styles.qtyBtn, q === 0 && styles.qtyBtnDisabled]}
                  onPress={() => setQty(p, q - 1)}
                  disabled={q === 0}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.qtyVal, q > 0 && { color: '#3B82F6' }]}>{q}</Text>
                <TouchableOpacity style={styles.qtyBtnPlus} onPress={() => setQty(p, q + 1)}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Carrito fijo abajo */}
      <View style={styles.cartBox}>
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>Carrito</Text>
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
          </View>
        </View>

        {cartItems.length > 0 && (
          <ScrollView style={{ maxHeight: 80 }}>
            {cartItems.map(l => (
              <View key={l.product.id} style={styles.cartLine}>
                <Text style={styles.cartLineText}>{l.qty}x {l.product.name}</Text>
                <Text style={styles.cartLineAmt}>${fmt(l.qty * Number(l.product.price))}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Metodo de pago */}
        <View style={styles.payRow}>
          {PAY_METHODS.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[styles.payBtn, payMethod === m.id && styles.payBtnActive]}
              onPress={() => setPayMethod(m.id)}
            >
              <Text style={[styles.payBtnText, payMethod === m.id && { color: '#fff' }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Datos de transferencia */}
        {needsTransfer && (
          <View style={{ gap: 6, marginBottom: 8 }}>
            <TextInput style={styles.input} placeholder="Nombre del cliente *" value={clientName} onChangeText={setClientName} placeholderTextColor={colors.textMuted} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput style={[styles.input, { flex: 1, fontFamily: 'monospace' }]} placeholder="NIT *" value={clientNit} onChangeText={setClientNit} maxLength={11} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Telefono *" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" placeholderTextColor={colors.textMuted} />
            </View>
          </View>
        )}

        {/* Efectivo entregado */}
        {payMethod === 'efectivo' && (
          <TextInput
            style={[styles.input, { marginBottom: 6 }]}
            placeholder="Efectivo entregado"
            value={cashGiven}
            onChangeText={setCashGiven}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textMuted}
          />
        )}
        {payMethod === 'efectivo' && cashGiven && change >= 0 && (
          <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13, marginBottom: 6 }}>
            Cambio: ${fmt(change)}
          </Text>
        )}

        {/* Total y cobrar */}
        <View style={styles.footer}>
          <Text style={styles.total}>Total: ${fmt(subtotal)} CUP</Text>
          <TouchableOpacity
            style={[styles.checkoutBtn, (saving || cartItems.length === 0) && { opacity: 0.5 }]}
            onPress={checkout}
            disabled={saving || cartItems.length === 0}
          >
            <Text style={styles.checkoutText}>{saving ? 'Procesando...' : 'Cobrar'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC' },
  offlineBanner: { backgroundColor: '#8B1A1A', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  searchWrap: { padding: 12, paddingBottom: 6 },
  search: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fff', fontSize: 14, color: '#1E293B' },
  productList: { flex: 1, paddingHorizontal: 12 },
  productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 8 },
  productName: { fontWeight: '700', fontSize: 14, color: '#1E293B' },
  productSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  qtyBtnDisabled: { opacity: 0.35 },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  qtyBtnPlus: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  qtyVal: { width: 24, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#1E293B' },
  cartBox: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0', padding: 12 },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cartTitle: { fontWeight: '700', fontSize: 15, color: '#1E293B' },
  cartBadge: { backgroundColor: '#3B82F6', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 1 },
  cartBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cartLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cartLineText: { fontSize: 12, color: '#1E293B' },
  cartLineAmt: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  payRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  payBtn: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  payBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  payBtnText: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: '#F8FAFC', color: '#1E293B' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  total: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
  checkoutBtn: { backgroundColor: '#3B82F6', paddingVertical: 11, paddingHorizontal: 22, borderRadius: 10 },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
