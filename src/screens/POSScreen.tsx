import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LocationsAPI, SalesAPI, SettingsAPI, DiscountsAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { colors, themeRef } from '../config/theme';
import { PAY_METHODS, CURRENCY_SYMBOLS } from '../config/roles';
import { EmptyState, ErrorBanner, Sel, Inp, Field } from '../components/UI';
import Icon from '../components/Icon';
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
  // Descuento por producto: un descuento por línea (productId → discountId),
  // solo se envía en ventas online (el backend lo valida y aplica).
  const [lineDiscounts, setLineDiscounts] = useState<Record<string, string>>({});

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
  // ── Descuentos utilizables desde MI ubicación (el backend re-valida todo) ──
  // activos, dentro de su vigencia y disponibles en esta location.
  const usableDiscounts = discounts.filter((d) =>
    d.active !== false &&
    (!d.startsAt || new Date(d.startsAt) <= new Date()) &&
    (!d.endsAt || new Date(d.endsAt) >= new Date()) &&
    (d.locationScope !== 'seleccion' || (d.locationIds || []).includes(myLocationId))
  );
  const productDiscounts = usableDiscounts.filter((d) => d.scope === 'producto');
  const findDisc = (id?: string | null) => (id ? usableDiscounts.find((x) => x.id === id) : undefined);
  // ── Descuento por venta (al total) — solo online (offline no lo soporta) ──
  const activeSaleDiscount = findDisc(saleDiscountId);
  const saleDiscAmount = online && activeSaleDiscount
    ? (activeSaleDiscount.type === 'fijo'
      ? Math.min(Number(activeSaleDiscount.value), subtotal)
      : subtotal * Number(activeSaleDiscount.value) / 100)
    : 0;
  // ── Descuentos por producto (por línea, mismo cálculo que el backend) ──
  const lineDiscount = (productId: string) => {
    if (!online) return 0;
    const d = findDisc(lineDiscounts[productId]);
    if (!d) return 0;
    const l = cartItems.find((x) => x.product.id === productId);
    if (!l) return 0;
    const base = l.qty * Number(l.product.price);
    const amount = d.type === 'porcentaje' ? base * Number(d.value) / 100 : Number(d.value) * l.qty;
    return Math.max(0, Math.min(amount, base));
  };
  const itemDiscountTotal = cartItems.reduce((a, l) => a + lineDiscount(l.product.id), 0);
  const total = Math.max(0, subtotal - saleDiscAmount - itemDiscountTotal);
  const change = Number(cashGiven) - total;
  const curSym = CURRENCY_SYMBOLS[saleCurrency] || '$';

  const checkout = async () => {
    if (cartItems.length === 0) {
      return Alert.alert('Carrito vacio', 'Agrega al menos un producto');
    }
    if (needsTransfer && (!clientName || !clientNit || !clientPhone)) {
      return Alert.alert('Datos requeridos', 'Para transferencia completa nombre, carnet y telefono');
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
          discountId: online ? lineDiscounts[l.product.id] || undefined : undefined,
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
      setLineDiscounts({});
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

      {/* Título + ubicación — igual que la web (h2 20/800 + sub 12) */}
      <Text style={styles.pageTitle}>Punto de Venta</Text>
      {myLocationName ? (
        <Text style={styles.locationLabel}>Vendiendo desde: <Text style={styles.locationName}>{myLocationName}</Text></Text>
      ) : null}

      {/* Buscador fijo con icono + botón agregar (igual que la web) */}
      <View style={styles.searchWrap}>
        <View style={{ position: 'absolute', left: 22, top: '50%', transform: [{ translateY: -8 }], zIndex: 1 }}>
          <Icon name="search" size={15} color={colors.textMuted} />
        </View>
        <TextInput
          style={styles.search}
          placeholder="Buscar producto o escanear..."
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
            } else if (filtered.length === 1) {
              setQty(filtered[0], qtyFor(filtered[0].id) + 1);
              setSearch('');
            }
          }}
        />
        <TouchableOpacity
          style={styles.addUnique}
          onPress={() => {
            const q = search.trim().toLowerCase();
            if (!q) return;
            const matches = products.filter((p) =>
              String((p as any).barcode || '').toLowerCase() === q || p.code.toLowerCase() === q);
            const one = matches.length === 1 ? matches[0] : filtered.length === 1 ? filtered[0] : null;
            if (one) { setQty(one, qtyFor(one.id) + 1); setSearch(''); }
          }}
        >
          <Text style={styles.addUniqueText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de productos — UNA tarjeta con separadores (igual que la web) */}
      <View style={styles.listCard}>
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          style={styles.productList}
          ListEmptyComponent={<EmptyState text="No hay productos disponibles" />}
          renderItem={({ item: p, index }) => {
            const q = qtyFor(p.id);
            return (
              <View style={[styles.productRow, index > 0 && styles.productRowSep]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.productSub}>Stock: {avail(p)} {p.unit} · {curSym}{fmt(Number(p.price))}</Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, q === 0 && styles.qtyBtnDisabled]}
                    onPress={() => setQty(p, q - 1)}
                    disabled={q === 0}
                  >
                    <Icon name="minus" size={13} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyVal, q > 0 && { color: colors.primary }]}>{q}</Text>
                  <TouchableOpacity style={styles.qtyBtnPlus} onPress={() => setQty(p, q + 1)}>
                    <Icon name="plus" size={13} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      </View>

      {/* Carrito fijo abajo */}
      <View style={styles.cartBox}>
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>Carrito</Text>
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
          </View>
        </View>

        {cartItems.length > 0 && (
          <ScrollView style={{ maxHeight: 110 }}>
            {cartItems.map((l) => {
              const ld = lineDiscount(l.product.id);
              return (
                <View key={l.product.id} style={styles.cartLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartLineText}>{l.qty}× {l.product.name}</Text>
                    {online && productDiscounts.length > 0 && (
                      <Sel
                        style={{ alignSelf: 'flex-start', height: 30, minWidth: 150, marginTop: 3 }}
                        value={lineDiscounts[l.product.id] || ''}
                        onValueChange={(v: string) => setLineDiscounts((prev) => { const next = { ...prev }; if (!v) delete next[l.product.id]; else next[l.product.id] = v; return next; })}
                        items={[
                          { label: 'Sin descuento', value: '' },
                          ...productDiscounts.map((d) => ({
                            label: `${d.code || d.name} (${d.type === 'porcentaje' ? `${d.value}%` : `${curSym}${d.value}/u`})`,
                            value: d.id,
                          })),
                        ]}
                      />
                    )}
                    {ld > 0 && <Text style={{ color: '#DC2626', fontSize: 11, marginTop: 2 }}>Descuento: -{curSym}{fmt(ld)}</Text>}
                  </View>
                  <Text style={styles.cartLineAmt}>{curSym}{fmt(l.qty * Number(l.product.price) - ld)}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Moneda / Pago / Descuento / Efectivo — Fields con selects nativos,
            idéntico al bloque de la web */}
        <View style={styles.optsRow}>
          {currencies.length > 0 && (
            <Field label="Moneda">
              <Sel
                style={{ minWidth: 90, height: 34 }}
                value={saleCurrency}
                onValueChange={setSaleCurrency}
                items={currencies.map((m) => ({ label: m, value: m }))}
              />
            </Field>
          )}
          <Field label="Pago">
            <Sel
              style={{ minWidth: 130, height: 34 }}
              value={payMethod}
              onValueChange={setPayMethod}
              items={PAY_METHODS.map((m) => ({ label: m.label, value: m.id }))}
            />
          </Field>
          {online && usableDiscounts.some((d) => d.scope === 'venta') && (
            <Field label="Descuento">
              <Sel
                style={{ minWidth: 120, height: 34 }}
                value={saleDiscountId}
                onValueChange={setSaleDiscountId}
                items={[
                  { label: '—', value: '' },
                  ...usableDiscounts.filter((d) => d.scope === 'venta').map((d) => ({
                    label: `${d.code || d.name} (${d.type === 'fijo' ? `-${d.value}` : `-${d.value}%`})`,
                    value: d.id,
                  })),
                ]}
              />
            </Field>
          )}
          {payMethod === 'efectivo' && (
            <Field label="Efectivo">
              <Inp
                style={{ width: 100, paddingVertical: 6, paddingHorizontal: 10, fontSize: 12 }}
                value={cashGiven}
                onChangeText={setCashGiven}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </Field>
          )}
        </View>

        {/* Cambio / descuentos — mismo orden y formato que la web */}
        {payMethod === 'efectivo' && cashGiven && Number(cashGiven) >= total && (
          <Text style={styles.changeText}>Cambio: {curSym}{fmt(change)} {saleCurrency}</Text>
        )}
        {saleDiscAmount > 0 && (
          <View style={styles.discRow}>
            <Text style={styles.discRowText}>Descuento:</Text>
            <Text style={styles.discRowText}>-{curSym}{fmt(saleDiscAmount)}</Text>
          </View>
        )}
        {itemDiscountTotal > 0 && (
          <View style={styles.discRow}>
            <Text style={styles.discRowText}>Descuento por producto:</Text>
            <Text style={styles.discRowText}>-{curSym}{fmt(itemDiscountTotal)}</Text>
          </View>
        )}

        {/* Datos de transferencia */}
        {needsTransfer && (
          <View style={{ gap: 8 }}>
            <Inp style={{ fontSize: 12 }} placeholder="Nombre del cliente *" value={clientName} onChangeText={setClientName} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Inp style={[{ flex: 1, fontSize: 12, fontFamily: 'monospace' }]} placeholder="Carnet *" value={clientNit} onChangeText={setClientNit} maxLength={11} keyboardType="numeric" />
              <Inp style={[{ flex: 1, fontSize: 12 }]} placeholder="Teléfono *" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
            </View>
          </View>
        )}

        {/* Total y cobrar — botón VERDE con check (igual que la web) */}
        <View style={styles.footer}>
          <Text style={styles.total}>Total: {curSym}{fmt(total)} {saleCurrency}</Text>
          <TouchableOpacity
            style={[styles.checkoutBtn, (saving || cartItems.length === 0) && { opacity: 0.6 }]}
            onPress={checkout}
            disabled={saving || cartItems.length === 0}
          >
            <Icon name="check" size={15} color="#ffffff" />
            <Text style={styles.checkoutText}>{saving ? '...' : online ? 'Cobrar' : 'Cobrar (offline)'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  offlineBanner: { backgroundColor: '#1A5C8B', padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  pageTitle: { fontSize: 20, fontWeight: '800', color: colors.text, paddingHorizontal: 16, paddingTop: 12, marginBottom: 4 },
  locationLabel: { paddingHorizontal: 16, fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  locationName: { fontWeight: '700', color: colors.text },
  searchWrap: { paddingHorizontal: 16, marginBottom: 10 },
  search: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, paddingLeft: 34, paddingRight: 44, paddingVertical: 9, backgroundColor: colors.inputBg, fontSize: 14, color: colors.text },
  addUnique: { position: 'absolute', right: 22, top: '50%', transform: [{ translateY: -14 }], backgroundColor: colors.primaryTint, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 7 },
  addUniqueText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  listCard: { flex: 1, marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  productList: { flex: 1 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  productRowSep: { borderTopWidth: 1, borderTopColor: colors.border },
  productName: { fontWeight: '700', fontSize: 13, color: colors.text },
  productSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyBtnPlus: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyVal: { width: 22, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.text },
  cartBox: { backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginHorizontal: 16, marginBottom: 12, padding: 14, gap: 10 },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  cartBadge: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 1, marginLeft: 'auto' },
  cartBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cartLine: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 4, marginBottom: 4 },
  cartLineText: { fontSize: 12, color: colors.text },
  cartLineAmt: { fontSize: 12, fontWeight: '700', color: colors.text },
  optsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  discRow: { flexDirection: 'row', justifyContent: 'space-between' },
  discRowText: { fontSize: 12, color: '#DC2626' },
  changeText: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  total: { fontSize: 18, fontWeight: '800', color: colors.text },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// Estilos VIVOS: se reconstruyen cuando cambia el tema (dark mode).
let __stylesVersion = -1;
let __styles: ReturnType<typeof createStyles> | null = null;
export const styles = new Proxy({} as ReturnType<typeof createStyles>, {
  get(_t, prop) {
    if (__stylesVersion !== themeRef.version || !__styles) {
      __styles = createStyles();
      __stylesVersion = themeRef.version;
    }
    return __styles[prop as keyof ReturnType<typeof createStyles>];
  },
});

