import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LocationsAPI, SalesAPI, SettingsAPI, DiscountsAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { colors } from '../config/theme';
import { PAY_METHODS, CURRENCY_SYMBOLS } from '../config/roles';
import { EmptyState, ErrorBanner } from '../components/UI';
import {
  cacheProducts, getOfflineProducts, saveSaleOffline,
} from '../offline/offlineStore';

const fmt = (n: number) => Number(n || 0).toFixed(2);

// Producto listo para vender: viene de la API online (LocationStockItem) o
// del cache offline (OfflineProduct). Ambos comparten estos campos base;
// el stock efectivo es localStock cuando la fila viene del cache offline.
type PosProduct = {
  id: string;
  code: string;
  barcode?: string | null;
  currency?: string;
  name: string;
  price: number;
  stock: number;
  unit: string;
  isOfflineRow?: boolean;
  localStock?: number;
};

export default function POSScreen() {
  const { user, online } = useAuth();
  const { refresh: refreshSync, pendingCount } = useSync();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [myLocationId, setMyLocationId] = useState('');
  const [myLocationName, setMyLocationName] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payMethod, setPayMethod] = useState('efectivo');
  const [clientName, setClientName] = useState('');
  const [clientNit, setClientNit] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [cashGiven, setCashGiven] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Multimoneda + descuentos
  const [saleCurrency, setSaleCurrency] = useState('CUP');
  const [currencies, setCurrencies] = useState<string[]>(['CUP']);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [saleDiscountId, setSaleDiscountId] = useState('');

  const needsTransfer = payMethod === 'transferencia';

  // Config de empresa (monedas habilitadas) y descuentos disponibles
  React.useEffect(() => {
    if (!online) return;
    SettingsAPI.get().then((s: any) => {
      if (s?.currencies?.length) setCurrencies(s.currencies);
    }).catch(() => {});
    DiscountsAPI.list().then((d: any[]) => setDiscounts(d || [])).catch(() => {});
  }, [online]);

  const avail = (p: PosProduct) =>
    p.isOfflineRow ? (p.localStock ?? 0) : Number(p.stock);

  // ── Carga: online usa stock de MI ubicación (igual que la web); offline
  //    cae al cache local automáticamente.
  const load = useCallback(async () => {
    setError('');
    if (!online) {
      const cached = await getOfflineProducts();
      setProducts(cached.filter((p) => p.localStock > 0).map((p) => ({ ...p, isOfflineRow: true })));
      return;
    }
    try {
      const locs = await LocationsAPI.list();
      const own = user?.role === 'almacenista'
        ? locs.find((l) => l.type === 'almacen')
        : locs.find((l) => l.type === 'caja' && l.ownerUserId === user?.id);
      if (!own) {
        setProducts([]);
        setError('No tiene una ubicación asignada para vender. Contacte al administrador.');
        return;
      }
      setMyLocationId(own.id);
      setMyLocationName(own.name);
      const { items } = await LocationsAPI.stock(own.id);
      await cacheProducts(items);
      setProducts(items.filter((p: any) => p.active && p.stock > 0));
    } catch (err) {
      // Falló la red/permisos: caemos al cache offline sin bloquear la venta.
      const cached = await getOfflineProducts();
      if (cached.length > 0) {
        setProducts(cached.filter((p) => (p.localStock ?? 0) > 0).map((p) => ({ ...p, isOfflineRow: true })));
        setError('Sin conexión con el servidor — vendiendo con datos locales');
      } else {
        setError((err as Error).message);
      }
    }
  }, [online, user?.id, user?.role]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q)
      || p.code.toLowerCase().includes(q)
      || String((p as any).barcode || '').toLowerCase().includes(q);
  });

  const qtyFor = (id: string) => cart[id] || 0;

  const setQty = (product: PosProduct, qty: number) => {
    if (qty < 0) return;
    if (qty > avail(product)) {
      Alert.alert('Stock insuficiente', `Solo hay ${avail(product)} unidades disponibles`);
      return;
    }
    setCart((prev) => {
      const next = { ...prev };
      if (qty === 0) delete next[product.id];
      else next[product.id] = qty;
      return next;
    });
  };

  const cartItems = products
    .filter((p) => cart[p.id])
    .map((p) => ({ product: p, qty: cart[p.id] }));

  const subtotal = cartItems.reduce((a, l) => a + l.qty * Number(l.product.price), 0);
  // Descuento de tipo "venta": solo online (el flujo offline no lo soporta aún)
  const activeSaleDiscount = discounts.find((d) => d.id === saleDiscountId) || null;
  const saleDiscAmount = online && activeSaleDiscount
    ? (activeSaleDiscount.type === 'fixed'
      ? Math.min(Number(activeSaleDiscount.value), subtotal)
      : subtotal * Number(activeSaleDiscount.value) / 100)
    : 0;
  const total = Math.max(0, subtotal - saleDiscAmount);
  const change = Number(cashGiven) - total;
  const curSym = CURRENCY_SYMBOLS[saleCurrency] || '$';

  const checkout = async () => {
    if (cartItems.length === 0) {
      return Alert.alert('Carrito vacio', 'Agrega al menos un producto');
    }
    if (needsTransfer && (!clientName || !clientNit || !clientPhone)) {
      return Alert.alert('Datos requeridos', 'Para transferencia completa nombre, NIT y telefono');
    }

    setSaving(true);
    try {
      const saleData = {
        clientName: needsTransfer ? clientName : 'Consumidor Final',
        clientNit: needsTransfer ? clientNit : '00000000000',
        clientPhone: needsTransfer ? clientPhone : undefined,
        payMethod,
        items: cartItems.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          qty: l.qty,
          price: Number(l.product.price),
          total: l.qty * Number(l.product.price),
        })),
        subtotal,
        total,
        currency: saleCurrency,
        discountId: online && saleDiscountId ? saleDiscountId : undefined,
      };

      let receiptId: string;
      if (!online) {
        // ── Venta OFFLINE: va a la cola local y sincroniza sola después.
        const offline = await saveSaleOffline(saleData);
        receiptId = offline.localId;
        await refreshSync();
        // Recargar con stock local actualizado
        const cached = await getOfflineProducts();
        setProducts(cached.filter((p) => (p.localStock ?? 0) > 0).map((p) => ({ ...p, isOfflineRow: true })));
        Alert.alert('✓ Venta guardada offline', `Factura ${offline.localId} se sincronizará automáticamente`);
      } else {
        // ── Venta ONLINE: igual que antes.
        const invoice = await SalesAPI.create(saleData);
        receiptId = (invoice as any)?.invoiceNumber || (invoice as any)?.id || '';
        if (myLocationId) {
          const { items } = await LocationsAPI.stock(myLocationId);
          await cacheProducts(items);
          setProducts(items.filter((p: any) => p.active && p.stock > 0));
        }
        Alert.alert('✓ Venta registrada', `La factura ${receiptId} se genero correctamente`);
      }

      setCart({});
      setClientName(''); setClientNit(''); setClientPhone(''); setCashGiven('');
      setSaleDiscountId('');
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
          <Text style={styles.offlineText}>
            ⚡ MODO OFFLINE — las ventas se guardan y sincronizan solas{pendingCount > 0 ? ` (${pendingCount} pendientes)` : ''}
          </Text>
        </View>
      )}

      {myLocationName ? (
        <Text style={styles.locationLabel}>Vendiendo desde: <Text style={styles.locationName}>{myLocationName}</Text></Text>
      ) : null}

      {/* Buscador (también matchea barcode) */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Buscar producto o código de barras..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => {
            // Lectores USB/BT emulan teclado + Enter: match exacto → agregar
            const q = search.trim().toLowerCase();
            if (!q) return;
            const matches = products.filter((p) =>
              String((p as any).barcode || '').toLowerCase() === q || p.code.toLowerCase() === q);
            if (matches.length === 1) {
              setQty(matches[0], qtyFor(matches[0].id) + 1);
              setSearch('');
            }
          }}
        />
      </View>

      {/* Lista de productos scrollable */}
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        style={styles.productList}
        ListEmptyComponent={<EmptyState text="No hay productos disponibles" />}
        renderItem={({ item: p }) => {
          const q = qtyFor(p.id);
          return (
            <View style={styles.productRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{p.name}</Text>
                <Text style={styles.productSub}>Stock: {avail(p)} {p.unit} · {curSym}{fmt(Number(p.price))} {(p as any).currency || ''}</Text>
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
            {cartItems.map((l) => (
              <View key={l.product.id} style={styles.cartLine}>
                <Text style={styles.cartLineText}>{l.qty}x {l.product.name}</Text>
                <Text style={styles.cartLineAmt}>${fmt(l.qty * Number(l.product.price))}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Moneda de la venta */}
        {currencies.length > 1 && (
          <View style={styles.payRow}>
            {currencies.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.payBtn, saleCurrency === m && styles.payBtnActive]}
                onPress={() => setSaleCurrency(m)}
              >
                <Text style={[styles.payBtnText, saleCurrency === m && { color: '#fff' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Metodo de pago */}
        <View style={styles.payRow}>
          {PAY_METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.payBtn, payMethod === m.id && styles.payBtnActive]}
              onPress={() => setPayMethod(m.id)}
            >
              <Text style={[styles.payBtnText, payMethod === m.id && { color: '#fff' }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Descuento (solo online) */}
        {online && discounts.filter((d) => d.scope === 'venta' && d.active !== false).length > 0 && (
          <ScrollView horizontal style={{ marginBottom: 8 }} showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.payBtn, styles.discBtn, saleDiscountId === '' && styles.payBtnActive]}
              onPress={() => setSaleDiscountId('')}
            >
              <Text style={[styles.payBtnText, saleDiscountId === '' && { color: '#fff' }]}>Sin descuento</Text>
            </TouchableOpacity>
            {discounts.filter((d) => d.scope === 'venta' && d.active !== false).map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.payBtn, styles.discBtn, saleDiscountId === d.id && styles.payBtnActive]}
                onPress={() => setSaleDiscountId(saleDiscountId === d.id ? '' : d.id)}
              >
                <Text style={[styles.payBtnText, saleDiscountId === d.id && { color: '#fff' }]}>
                  {d.code || d.name} −{d.type === 'fixed' ? d.value : `${d.value}%`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

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
        {saleDiscAmount > 0 && (
          <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12, marginBottom: 4 }}>
            Descuento: −{curSym}{fmt(saleDiscAmount)}
          </Text>
        )}
        {payMethod === 'efectivo' && cashGiven && change >= 0 && (
          <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13, marginBottom: 6 }}>
            Cambio: {curSym}{fmt(change)}
          </Text>
        )}

        {/* Total y cobrar */}
        <View style={styles.footer}>
          <Text style={styles.total}>Total: {curSym}{fmt(total)} {saleCurrency}</Text>
          <TouchableOpacity
            style={[styles.checkoutBtn, (saving || cartItems.length === 0) && { opacity: 0.5 }]}
            onPress={checkout}
            disabled={saving || cartItems.length === 0}
          >
            <Text style={styles.checkoutText}>{saving ? 'Procesando...' : online ? 'Cobrar' : 'Cobrar (offline)'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC' },
  offlineBanner: { backgroundColor: '#7C3AED', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  locationLabel: { paddingHorizontal: 12, paddingTop: 10, fontSize: 12, color: colors.textMuted },
  locationName: { fontWeight: '700', color: colors.text },
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
  discBtn: { flex: 0, paddingHorizontal: 12, marginRight: 6, minWidth: 90 },
  payBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  payBtnText: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: '#F8FAFC', color: '#1E293B' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  total: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
  checkoutBtn: { backgroundColor: '#3B82F6', paddingVertical: 11, paddingHorizontal: 22, borderRadius: 10 },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
