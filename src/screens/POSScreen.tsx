import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ScrollView, DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { isOfflineError } from '../api/client';
import { LocationsAPI, SalesAPI, SettingsAPI, DiscountsAPI } from '../api/endpoints';
import { useShift } from '../hooks/useShift';
import { useLocations } from '../hooks/useLocations';
import { resolveOwn, debePedirTurno } from '../config/locationResolution';
import ShiftSheet, { ShiftBadge } from '../components/ShiftSheet';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { colors, themeRef } from '../config/theme';
import { PAYMENT_METHODS_BY_CURRENCY, CURRENCY_SYMBOLS } from '../config/roles';
import { EmptyState, ErrorBanner, Sel, Inp, Field, Skeleton, showToast } from '../components/UI';
import { showConfirm, showError } from '../components/dialogs';
import Icon from '../components/Icon';
import {
  cacheProducts, getOfflineProducts, saveSaleOffline, cacheSettings, getOfflineSettings,
  cacheDiscounts, getOfflineDiscounts, getAllOfflineSales,
  getOfflineCart, saveOfflineCart, clearOfflineCart, type OfflineCartSnapshot,
} from '../offline/offlineStore';
import { activateNamespace, getActiveNamespace, UNKNOWN_LOCATION } from '../offline/namespace';
import { generateUuid } from '../utils/uuid';

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
  // Aviso único: se venderó sin conexión sin ubicación conocida en el teléfono.
  const warnedUnknownLocation = React.useRef(false);

  // ── TURNO ────────────────────────────────────────────────────────────────
  // La caja de trabajo sale de aquí. Sin esto el POS tenía que adivinarla, y
  // con cajas compartidas adivina siempre en algún sitio que no es el suyo.
  const {
    shift, cajas, cargando: cargandoTurno, offline: turnoSinRed,
    aviso: avisoTurno, abrirTurno, cerrarTurno, refresh: refreshTurno,
  } = useShift(user?.id);

  // Las ubicaciones, cacheadas de cuenta: sin esta copia el modo sin conexión
  // no sabe a qué caja pertenece el catálogo y el POS entero se ve roto.
  const { locations, cargando: cargandoLocs, sinCache, refresh: refreshLocs } =
    useLocations(user, { shiftLocationId: shift?.locationId ?? null });

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [myLocationId, setMyLocationId] = useState('');
  const [myLocationName, setMyLocationName] = useState('');
  const [pidiendoTurno, setPidiendoTurno] = useState(false);
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartRestore, setCartRestore] = useState<OfflineCartSnapshot | null>(null);
  const [cartReady, setCartReady] = useState(false);
  const restoredCartLocation = React.useRef('');
  const [paymentLines, setPaymentLines] = useState<any[]>([
    { id: 'payment-1', method: 'efectivo', currency: 'CUP', amount: '', rateSource: 'automatic', exchangeRate: '' },
  ]);
  const [clientName, setClientName] = useState('');
  const [clientNit, setClientNit] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [error, setError] = useState('');
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [saving, setSaving] = useState(false);
  // Multimoneda + descuentos
  const [saleCurrency, setSaleCurrency] = useState('CUP');
  const [currencies, setCurrencies] = useState<string[]>(['CUP']);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [rateSettings, setRateSettings] = useState<any>({ rateMode: 'manual', rates: {}, manualRates: {}, taxRate: 0 });
  const [localDiscountUsage, setLocalDiscountUsage] = useState<Record<string, number>>({});
  const [saleDiscountId, setSaleDiscountId] = useState('');
  // Descuento por producto: se guarda el mismo precio/descuento para sincronizar
  // una venta offline sin cambiar lo que aceptó el cajero.
  const [lineDiscounts, setLineDiscounts] = useState<Record<string, string>>({});

  const needsTransfer = paymentLines.some((p) => p.method === 'transferencia');
  // El admin no tiene turno propio por defecto: el backend exige que indique en
  // cuál vende. Pero en cuanto ABRE turno, la caja la dicta el turno y se
  // ofrece el selector solo cuando no hay ninguno — si no, el admin cambiaría
  // de caja con el turno abierto y las ventas se irían a la caja que él eligió
  // mientras el cierre cuenta la del turno.
  const needsLocationPicker = user?.role === 'admin' && !shift;

  // Con UN solo juego de cajas asignadas no hay nada que decidir.
  const unicaAsignada = cajas.length === 1 ? cajas[0].id : undefined;

  // La caja en la que se vende. La decide `resolveOwn`, que es la MISMA regla
  // que aplica el servidor; la lista de esta pantalla no vuelve a decidirlo.
  React.useEffect(() => {
    if (!locations.length) return;
    const own = resolveOwn({
      locations,
      shift,
      role: user?.role || '',
      unicaAsignada,
      recordada: myLocationId,
    });
    if (own && own.id !== myLocationId) {
      setMyLocationId(own.id);
      setMyLocationName(own.name);
    }
  }, [locations, shift, user?.role, unicaAsignada]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un cajero con varias cajas y sin turno no puede vender: hay que preguntarle
  // cuál. Con una sola no se pregunta nada.
  React.useEffect(() => {
    if (debePedirTurno({ role: user?.role || '', cargando: cargandoTurno, shift, aviso: avisoTurno, cajas })) {
      setPidiendoTurno(true);
    }
  }, [user?.role, cargandoTurno, shift, avisoTurno, cajas]);

  // La última configuración y descuentos descargados permiten vender con las
  // mismas monedas, tasas y promociones si se pierde internet.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const [cachedSettings, cachedDiscounts, localSales] = await Promise.all([
        getOfflineSettings(), getOfflineDiscounts(), getAllOfflineSales(),
      ]);
      if (!mounted) return;
      if (cachedSettings) {
        setRateSettings((prev: any) => ({ ...prev, ...cachedSettings }));
        if (Array.isArray((cachedSettings as any).currencies) && (cachedSettings as any).currencies.length) setCurrencies((cachedSettings as any).currencies);
      }
      setDiscounts(cachedDiscounts || []);
      setLocalDiscountUsage(countLocalDiscountUses(localSales));
      if (!online) return;
      const [settings, remoteDiscounts] = await Promise.all([SettingsAPI.get(), DiscountsAPI.list()]);
      if (!mounted) return;
      setRateSettings(settings as any);
      if (settings?.currencies?.length) setCurrencies(settings.currencies);
      setPaymentLines((prev) => prev.map((p, i) => i === 0 && prev.length === 1
        ? { ...p, currency: saleCurrency, method: (PAYMENT_METHODS_BY_CURRENCY[saleCurrency] || [])[0]?.id || 'efectivo', rateSource: settings.rateMode === 'eltoque' ? 'automatic' : 'manual' }
        : p));
      setDiscounts(remoteDiscounts || []);
      await Promise.all([cacheSettings(settings), cacheDiscounts(remoteDiscounts || [])]);
    })().catch(() => {});
    return () => { mounted = false; };
  }, [online]);

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('cubagest:discounts-updated', async () => {
      const [cachedDiscounts, localSales] = await Promise.all([getOfflineDiscounts(), getAllOfflineSales()]);
      setDiscounts(cachedDiscounts || []);
      setLocalDiscountUsage(countLocalDiscountUses(localSales));
    });
    return () => subscription.remove();
  }, []);

  function countLocalDiscountUses(sales: any[]) {
    const counts: Record<string, number> = {};
    for (const sale of sales) {
      if (sale.status === 'synced') continue;
      if (sale.discountId) counts[sale.discountId] = (counts[sale.discountId] || 0) + 1;
      for (const item of sale.items || []) if (item.discountId) counts[item.discountId] = (counts[item.discountId] || 0) + 1;
    }
    return counts;
  }

  const avail = (p: PosProduct) =>
    p.isOfflineRow ? (p.localStock ?? 0) : Number(p.stock);

  // ── Carga ────────────────────────────────────────────────────────────────
  // Online usa el stock de la caja en la que se está trabajando (igual que la
  // web); sin conexión cae al catálogo cacheado de esa misma caja.
  //
  // RENDER Y CACHÉ VAN SEPARADOS A PROPÓSITO. Antes era
  // `await cacheProducts(...); setProducts(items...)`: la pantalla no se
  // repintaba hasta que el catálogo entero se escribía en el disco. En un
  // teléfono normal son unos milisegundos; en uno viejo, con la pantalla
  // bloqueada o con un almacenamiento lento, el POS se quedaba EN BLANCO
  // con red y productos disponibles. La venta no puede depender de una
  // escritura en disco que no es un requisito para cobrar.
  const load = useCallback(async (opts: { locationId?: string } = {}) => {
    setError('');
    setCargandoCatalogo(true);
    try {
      if (!online) {
        const cached = await getOfflineProducts();
        setProducts(cached.filter((p) => p.active).map((p) => ({ ...p, isOfflineRow: true })));
        return;
      }

      // La ubicación indicada por el llamador manda: setMyLocationId es
      // asíncrono, así que leer `myLocationId` aquí seguiría viendo el valor
      // anterior y el admin acabaría viendo el stock de la caja equivocada.
      const locationId = opts.locationId || myLocationId;

      if (!locationId) {
        setProducts([]);
        return;
      }

      // Namespace offline = cuenta + ubicación. A partir de aquí, catálogo y
      // cola pertenecen a ESTA caja/almacén (nunca se mezclan entre cuentas).
      await activateNamespace(user, locationId);

      const { items } = await LocationsAPI.stock(locationId);
      setProducts(items.filter((p: any) => p.active));
      // El catálogo se guarda DESPUÉS de pintar, sin esperar. Si esta escritura
      // falla, el POS sigue funcionando con los datos del servidor; solo se
      // pierde la capacidad de vender sin conexión en esa caja.
      void cacheProducts(items, locationId).catch(() => {});
    } catch (err) {
      // Falló la red/permisos: caemos al cache offline sin bloquear la venta.
      const cached = await getOfflineProducts();
      if (cached.length > 0) {
        setProducts(cached.filter((p) => p.active).map((p) => ({ ...p, isOfflineRow: true })));
        setError('Sin conexión con el servidor — vendiendo con datos locales');
      } else {
        setError((err as Error).message);
      }
    } finally {
      // El flag se baja aquí y no a mano en cada rama. `load` tiene dos salidas
      // tempranas y con un `set` en cada una, el camino que se añadiera después
      // lo olvidaría y el POS se quedaría cargando para siempre: el mismo modo
      // de fallo que un `SET` sin `RETURN`.
      setCargandoCatalogo(false);
    }
  }, [online, user, myLocationId]);

  // Al abrir la pantalla sin conexión reabrimos el namespace de la última
  // ubicación conocida, para que la cola de esa caja siga visible.
  React.useEffect(() => {
    if (user) void activateNamespace(user, myLocationId || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // `shift?.id` está en la dependencia a propósito: al abrir el turno cambia la
  // caja, y sin esto el POS seguiría mostrando el catálogo de la caja anterior
  // — el mismo bug que la web ya tuvo.
  useFocusEffect(useCallback(() => { load(); }, [load, shift?.id]));

  React.useEffect(() => {
    if (!myLocationId || !user || restoredCartLocation.current === myLocationId) return;
    let alive = true;
    restoredCartLocation.current = myLocationId;
    setCartReady(false);
    void getOfflineCart(myLocationId).then((snapshot) => {
      if (!alive) return;
      if (snapshot && Object.keys(snapshot.cart || {}).length) setCartRestore(snapshot);
      else setCartReady(true);
    }).catch(() => { if (alive) setCartReady(true); });
    return () => { alive = false; };
  }, [myLocationId, user?.id]);

  React.useEffect(() => {
    if (!cartReady || !myLocationId || cartRestore) return;
    const hasCart = Object.keys(cart).length > 0 || !!saleDiscountId || !!clientName || !!clientNit || !!clientPhone;
    const write = hasCart ? saveOfflineCart({
      locationId: myLocationId, cart, lineDiscounts, saleCurrency, paymentLines, saleDiscountId,
      clientName, clientNit, clientPhone, updatedAt: Date.now(),
    }) : clearOfflineCart(myLocationId);
    void write.catch(() => {});
  }, [cartReady, myLocationId, cart, lineDiscounts, saleCurrency, paymentLines, saleDiscountId, clientName, clientNit, clientPhone, cartRestore]);

  const resolveCartRestore = (continueCart: boolean) => {
    if (continueCart && cartRestore) {
      setCart(cartRestore.cart || {});
      setLineDiscounts(cartRestore.lineDiscounts || {});
      setSaleCurrency(cartRestore.saleCurrency || 'CUP');
      setPaymentLines(cartRestore.paymentLines?.length ? cartRestore.paymentLines : [{ id: generateUuid(), method: 'efectivo', currency: cartRestore.saleCurrency || 'CUP', amount: '', rateSource: 'automatic', exchangeRate: '' }]);
      setSaleDiscountId(cartRestore.saleDiscountId || '');
      setClientName(cartRestore.clientName || '');
      setClientNit(cartRestore.clientNit || '');
      setClientPhone(cartRestore.clientPhone || '');
    } else if (myLocationId) {
      setCart({}); setLineDiscounts({}); setSaleDiscountId('');
      void clearOfflineCart(myLocationId);
    }
    setCartRestore(null);
    setCartReady(true);
  };

  const selectLocation = (id: string) => {
    if (!id || id === myLocationId) return;
    const loc = locations.find((l) => l.id === id);
    setMyLocationId(id);
    if (loc) setMyLocationName(loc.name);
    setCart({});
    setLineDiscounts({});
    setCartRestore(null);
    setCartReady(false);
    restoredCartLocation.current = '';
    // Se pasa la ubicación explícitamente: dentro de `load` el estado todavía
    // es el anterior y buscaría el stock de la caja que acabamos de dejar.
    load({ locationId: id });
  };

  const abrirTurnoEn = async (locationId: string, baseCash: Record<string, number>) => {
    try {
      await activateNamespace(user, locationId);
      await abrirTurno(locationId, baseCash);
      setPidiendoTurno(false);
      // El turno es lo que fija la caja; el catálogo se recarga solo porque
      // `shift?.id` cambió.
      await refreshLocs().catch(() => {});
    } catch (e) {
      // El mensaje del servidor llega tal cual: "Abre tu turno…", "No tienes
      // esa caja asignada", "Ya tienes un turno abierto" — todos son errores
      // que el cajero puede entender y no un genérico.
      showError((e as Error).message);
    }
  };

  // Terminar el turno ES cerrar el periodo: contar la caja, cerrarla y conciliar la
  // cadena. Antes este botón llamaba a /shift/end a pelo, que cerraba el turno sin
  // foto de cierre y dejaba un hueco que el siguiente cajero heredaba como
  // descuadre propio.
  const terminarTurno = async () => setPidiendoCierre(true);

  const cerrarYa = async () => {
    try {
      setPidiendoCierre(false);
      await refreshTurno();
      setCart({});
      load();
    } catch (e) {
      showError((e as Error).message);
    }
  };

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
    (d.maxUses == null || Number(d.timesUsed || 0) + Number(localDiscountUsage[d.id] || 0) < Number(d.maxUses)) &&
    (d.locationScope !== 'seleccion' || (d.locationIds || []).includes(myLocationId))
  );
  const productDiscounts = usableDiscounts.filter((d) => d.scope === 'producto');
  const findDisc = (id?: string | null) => (id ? usableDiscounts.find((x) => x.id === id) : undefined);
  // ── Descuentos guardados con la venta para conservar el precio acordado offline ──
  const activeSaleDiscount = findDisc(saleDiscountId);
  const saleDiscAmount = activeSaleDiscount
    ? (activeSaleDiscount.type === 'fijo'
      ? Math.min(Number(activeSaleDiscount.value), subtotal)
      : subtotal * Number(activeSaleDiscount.value) / 100)
    : 0;
  // ── Descuentos por producto (por línea, mismo cálculo que el backend) ──
  const lineDiscount = (productId: string) => {
    const d = findDisc(lineDiscounts[productId]);
    if (!d) return 0;
    const l = cartItems.find((x) => x.product.id === productId);
    if (!l) return 0;
    const base = l.qty * Number(l.product.price);
    const amount = d.type === 'porcentaje' ? base * Number(d.value) / 100 : Number(d.value) * l.qty;
    return Math.max(0, Math.min(amount, base));
  };
  const itemDiscountTotal = cartItems.reduce((a, l) => a + lineDiscount(l.product.id), 0);
  const taxableTotal = Math.max(0, subtotal - saleDiscAmount - itemDiscountTotal);
  const taxAmount = Math.round(taxableTotal * Number(rateSettings.taxRate || 0) * 100) / 100;
  const total = taxableTotal + taxAmount;
  const curSym = CURRENCY_SYMBOLS[saleCurrency] || '$';

  const cupRates: Record<string, number> = {
    CUP: 1,
    ...((rateSettings.rateMode === 'eltoque' ? rateSettings.rates : rateSettings.manualRates) || {}),
  };
  const automaticRate = (from: string, to: string): number | null => {
    if (rateSettings.rateMode !== 'eltoque') return null;
    const source = Number(cupRates[from]);
    const target = Number(cupRates[to]);
    return Number.isFinite(source) && source > 0 && Number.isFinite(target) && target > 0 ? source / target : null;
  };
  const configuredManualRate = (from: string, to: string): number | null => {
    const rates: Record<string, number> = { CUP: 1, ...(rateSettings.manualRates || {}) };
    const source = Number(rates[from]);
    const target = Number(rates[to]);
    return Number.isFinite(source) && source > 0 && Number.isFinite(target) && target > 0 ? source / target : null;
  };
  const effectivePayments = paymentLines.map((line) => {
    const same = line.currency === saleCurrency;
    const auto = same ? 1 : automaticRate(line.currency, saleCurrency);
    const manual = same ? 1 : configuredManualRate(line.currency, saleCurrency);
    const rate = same ? 1 : line.rateSource === 'manual'
      ? Number(line.exchangeRate || manual || 0)
      : Number(auto ?? manual ?? line.exchangeRate ?? 0);
    return {
      ...line,
      amount: line.amount === '' && paymentLines.length === 1 ? total : Number(line.amount || 0),
      exchangeRate: rate,
      rateSource: same ? 'same_currency' : (line.rateSource === 'manual' ? 'manual' : (auto ? 'automatic' : 'manual')),
    };
  });
  const paidTotal = effectivePayments.reduce((sum, p) => sum + Number(p.amount || 0) * Number(p.exchangeRate || 0), 0);
  const paymentsMatch = effectivePayments.length > 0 && effectivePayments.every((p) =>
    Number(p.amount) > 0 && Number.isFinite(Number(p.exchangeRate)) && Number(p.exchangeRate) > 0,
  ) && Math.abs(Math.round(paidTotal * 100) / 100 - Math.round(total * 100) / 100) <= 0.01;

  const checkout = async () => {
    if (cartItems.length === 0) {
      return showError('Carrito vacio: ' + 'Agrega al menos un producto');
    }
    if (needsTransfer && (!clientName || !clientNit || !clientPhone)) {
      return showError('Datos requeridos: ' + 'Para transferencia completa nombre, carnet y telefono');
    }
    if (online && needsLocationPicker && !myLocationId) {
      return showError('Ubicación requerida: ' + 'Elija la ubicación desde la que va a vender');
    }
    if (!paymentsMatch) return showError('Los pagos deben ser mayores que cero y su equivalente debe coincidir con el total.');

    setSaving(true);
    try {
      // clientSaleId (UUID del dispositivo) + locationId viajan SIEMPRE, online
      // y offline: son la idempotencia de la venta y su anclaje a la
      // ubicación. Si el POST se pierde y se reintenta, el backend devuelve la
      // factura original en lugar de facturar dos veces.
      const clientSaleId = generateUuid();
      const saleData = {
        clientSaleId,
        locationId: myLocationId || undefined,
        clientName: needsTransfer ? clientName : 'Consumidor Final',
        clientNit: needsTransfer ? clientNit : '00000000000',
        clientPhone: needsTransfer ? clientPhone : undefined,
        payMethod: effectivePayments[0]?.method || 'efectivo',
        payments: effectivePayments.map((p) => ({
          method: p.method,
          currency: p.currency,
          amount: Number(p.amount),
          exchangeRate: p.currency === saleCurrency ? null : Number(p.exchangeRate),
          rateSource: p.rateSource,
          rateUpdatedAt: p.currency === saleCurrency ? null : rateSettings.ratesUpdatedAt || null,
        })),
        items: cartItems.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          qty: l.qty,
          price: Number(l.product.price),
          total: l.qty * Number(l.product.price),
          discountId: lineDiscounts[l.product.id] || undefined,
          discountAmount: lineDiscount(l.product.id),
        })),
        subtotal,
        total,
        currency: saleCurrency,
        discountId: saleDiscountId || undefined,
        saleDiscountAmount: saleDiscAmount,
        taxAmount,
        offlineTimestamp: Date.now(),
      };

      let receiptId: string;
      if (!online) {
        // Sin namespace activo no hay dónde encolar la venta: se activa aquí
        // con la ubicación de esta pantalla (nunca se escribe fuera de una
        // cuenta ni fuera de su caja/almacén).
        if (!getActiveNamespace()) await activateNamespace(user, myLocationId);

        // ── Venta OFFLINE: va a la cola local y sincroniza sola después.
        const offline = await saveSaleOffline(saleData);
        receiptId = offline.localId;
        setLocalDiscountUsage((prev) => {
          const next = { ...prev };
          if (saleData.discountId) next[saleData.discountId] = (next[saleData.discountId] || 0) + 1;
          for (const item of saleData.items) if (item.discountId) next[item.discountId] = (next[item.discountId] || 0) + 1;
          return next;
        });

        // Si el usuario nunca ha vendido con red en este teléfono, aún no
        // conocemos su ubicación: la venta se guarda igual (el servidor la
        // atribuye a la ubicación del usuario al sincronizar), pero el stock
        // local queda en un namespace "sin ubicación" hasta que se resuelva.
        // Avisamos UNA vez para que el cajero lo sepa en vez de vender a ciegas.
        if (offline.locationId === UNKNOWN_LOCATION && !warnedUnknownLocation.current) {
          warnedUnknownLocation.current = true;
          setError(
            'Vendiendo sin conexión sin ubicación registrada en este teléfono: ' +
            'las ventas se guardan y se sincronizarán cuando vuelva la señal.',
          );
        }

        await refreshSync();
        // Recargar con stock local actualizado
        const cached = await getOfflineProducts();
        setProducts(cached.filter((p) => p.active).map((p) => ({ ...p, isOfflineRow: true })));
        showToast(`Factura ${offline.localId} se sincronizará automáticamente`, 'success');
      } else {
        // ── Venta ONLINE: el backend recalcula precios/impuestos y descuenta
        //    el stock de la ubicación indicada.
        try {
          const invoice = await SalesAPI.create(saleData);
          receiptId = (invoice as any)?.invoiceNumber || (invoice as any)?.id || '';
          // Solo se refresca el stock de ESTA ubicación (una llamada), no el
          // catálogo completo de la empresa.
          if (myLocationId) {
            const { items } = await LocationsAPI.stock(myLocationId);
            await cacheProducts(items, myLocationId);
            setProducts(items.filter((p: any) => p.active));
          }
          showToast(`La factura ${receiptId} se generó correctamente`, 'success');
        } catch (error) {
          if (!isOfflineError(error)) throw error;
          if (!getActiveNamespace()) await activateNamespace(user, myLocationId);
          const offline = await saveSaleOffline(saleData);
          receiptId = offline.localId;
          const cached = await getOfflineProducts();
          setProducts(cached.filter((p) => p.active).map((p) => ({ ...p, isOfflineRow: true })));
          await refreshSync();
          showToast(`Factura ${receiptId} guardada; se sincronizará automáticamente`, 'success');
        }
      }

      setCart({});
      setLineDiscounts({});
      setClientName(''); setClientNit(''); setClientPhone('');
      setSaleDiscountId('');
      setPaymentLines([{ id: generateUuid(), method: 'efectivo', currency: saleCurrency, amount: '', rateSource: rateSettings.rateMode === 'eltoque' ? 'automatic' : 'manual', exchangeRate: '' }]);
      if (myLocationId) await clearOfflineCart(myLocationId);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Mientras se resuelven el turno y la caja, el catálogo aún no ha llegado. La
  // lista no se sustituye por un spinner: se dibujan las MISMAS filas que van a
  // venir (`productRow` + `qtyRow`), porque esta tarjeta es la que manda sobre
  // el alto del resto. Con la lista en el sitio, cuando entra el catálogo no
  // se recoloca ni el carrito ni el total.
  // Son TRES cosas distintas y solo la primera la cubre `cargandoLocs`: saber
  // qué ubicaciones existen no es lo mismo que tener el catálogo. Con el
  // esqueleto atado solo a `cargandoLocs`, una caja con las ubicaciones ya en
  // caché mostraba "no hay productos" mientras llegaba la lista, y un
  // mostrador vacío de verdad se confundía con uno que aún no había cargado.
  const loadingCatalog = cargandoTurno || cargandoLocs || cargandoCatalogo;

  return (
    <View style={styles.wrap}>
      <ErrorBanner message={error} />
      {cartRestore && (
        <View style={{ marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder }}>
          <Text style={{ color: colors.warningTextDark, fontWeight: '700' }}>Hay un carrito sin terminar de esta caja.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <TouchableOpacity onPress={() => resolveCartRestore(true)}><Text style={{ color: colors.primary, fontWeight: '700' }}>Continuar carrito</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => resolveCartRestore(false)}><Text style={{ color: colors.danger, fontWeight: '700' }}>Descartarlo</Text></TouchableOpacity>
          </View>
        </View>
      )}
      {!online && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            MODO OFFLINE — las ventas se guardan y sincronizan solas{pendingCount > 0 ? ` (${pendingCount} pendientes)` : ''}
          </Text>
        </View>
      )}

      {/* La caja en la que se está trabajando, y cuánto lleva abierta. La web ya
          lo tenía y el móvil no: el cajero no tenía forma de saber de un vistazo
          dónde estaba cobrando. */}
      {shift && <ShiftBadge shift={shift} onTerminar={terminarTurno} />}

      {shift && (
        <CerrarTurnoSheet
          visible={pidiendoCierre}
          openingReadingId={shift.openingReadingId ?? ''}
          locationName={shift.locationName}
          baseCash={shift.baseCash}
          onConfirm={cerrarTurno}
          onCerrar={cerrarYa}
          onCancel={() => setPidiendoCierre(false)}
        />
      )}

      {/* Aviso del servidor. NUNCA se trata como "no tienes turno": casi siempre
          es una migración sin aplicar, y mandar a un cajero a abrir un turno que
          no puede existir no arregla nada. */}
      {avisoTurno && (
        <View style={styles.offlineBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="alert" size={13} color={colors.warning} />
        <Text style={styles.offlineText}>{avisoTurno}</Text>
      </View>
        </View>
      )}

      {/* Título + ubicación — igual que la web (h2 20/800 + sub 12) */}
      <Text style={styles.pageTitle}>Punto de Venta</Text>
      {myLocationName ? (
        <Text style={styles.locationLabel}>Vendiendo desde: <Text style={styles.locationName}>{myLocationName}</Text></Text>
      ) : null}
      {/* El admin no tiene turno propio: el backend exige indicar cuál es, así
          que puede cambiarla aquí antes de cobrar. Con un turno abierto no se
          ofrece: la caja la dicta el turno. */}
      {needsLocationPicker && online && locations.length > 0 && (
        <View style={styles.locationPicker}>
          <Field label="Ubicación de venta">
            <Sel
              style={{ minWidth: 200 }}
              value={myLocationId}
              onValueChange={selectLocation}
              items={[
                { label: 'Seleccione...', value: '' },
                ...locations
                  .filter((l) => l.active !== false)
                  .map((l) => ({ label: l.name, value: l.id })),
              ]}
            />
          </Field>
        </View>
      )}

      {/* Sin caja donde vender no se enseña un POS vacío: se dice qué hacer. Un
          catálogo en blanco hace pensar que faltan productos, y no es eso. */}
      {!pidiendoTurno && !myLocationId && !cargandoTurno && !cargandoLocs && !sinCache && (
        <EmptyState
          text={
            needsLocationPicker
              ? 'Elige arriba la ubicación desde la que vas a vender.'
              : user?.role === 'almacenista'
                ? 'No hay ningún almacén en esta empresa. Pídele al administrador que lo cree.'
                : 'No tienes una caja asignada para vender. Pídele al administrador que te asigne una.'
          }
        />
      )}

      {/* Sin red y sin copia local de /locations no hay nada que mostrar, y hay
          que decirlo: no es que no haya productos, es que no se sabe a qué caja
          pertenece el catálogo. */}
      {sinCache && (
        <EmptyState text="Sin conexión y sin datos guardados de esta empresa. Conéctate una vez para poder trabajar sin internet después." />
      )}

      {/* Abrir turno. Bloquea el POS mientras esté abierto: vender sin saber en
          qué caja es exactamente el descuadre que este arreglo elimina. */}
      <ShiftSheet
        visible={pidiendoTurno}
        cajas={cajas}
        offline={turnoSinRed}
        onClose={() => setPidiendoTurno(false)}
        onAbrir={abrirTurnoEn}
      />

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
          ListEmptyComponent={
            loadingCatalog && products.length === 0 ? (
              <View>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={[styles.productRow, i > 0 && styles.productRowSep]}>
                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Skeleton w={`${58 + (i * 9) % 32}%`} h={13} />
                      <Skeleton w="42%" h={11} />
                    </View>
                    <View style={styles.qtyRow}>
                      <Skeleton w={28} h={28} r={8} />
                      <Skeleton w={22} h={14} r={8} />
                      <Skeleton w={28} h={28} r={8} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState text="No hay productos disponibles" />
            )
          }
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
                    {productDiscounts.length > 0 && (
                      <Sel
                        style={{ alignSelf: 'flex-start', minWidth: 160, marginTop: 3 }}
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
                    {ld > 0 && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 2 }}>Descuento: -{curSym}{fmt(ld)}</Text>}
                  </View>
                  <Text style={styles.cartLineAmt}>{curSym}{fmt(l.qty * Number(l.product.price) - ld)}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Moneda de factura y descuento. Los pagos se indican por separado para
            poder combinar efectivo, transferencias y monedas. */}
        <View style={styles.optsRow}>
          {currencies.length > 0 && (
            <Field label="Moneda">
              <Sel
                style={{ minWidth: 90 }}
                value={saleCurrency}
                onValueChange={(next) => {
                  setSaleCurrency(next);
                  setPaymentLines((prev) => prev.map((p, i) => i === 0 && prev.length === 1
                    ? { ...p, currency: next, method: (PAYMENT_METHODS_BY_CURRENCY[next] || [])[0]?.id || 'efectivo', exchangeRate: '', rateSource: rateSettings.rateMode === 'eltoque' ? 'automatic' : 'manual' }
                    : p));
                }}
                items={currencies.map((m) => ({ label: m, value: m }))}
              />
            </Field>
          )}
          {usableDiscounts.some((d) => d.scope === 'venta') && (
            <Field label="Descuento">
              <Sel
                style={{ minWidth: 120 }}
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
        </View>

        <View style={{ maxHeight: 150, paddingHorizontal: 12, paddingTop: 6 }}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {paymentLines.map((line, index) => {
              const methods = PAYMENT_METHODS_BY_CURRENCY[line.currency] || [];
              const same = line.currency === saleCurrency;
              const auto = same ? 1 : automaticRate(line.currency, saleCurrency);
              const manual = same ? 1 : configuredManualRate(line.currency, saleCurrency);
              const source = same ? 'same_currency' : (line.rateSource === 'manual' || !auto ? 'manual' : 'automatic');
              const shownRate = same ? 1 : source === 'automatic' ? auto : Number(line.exchangeRate || manual || 0);
              return (
                <View key={line.id} style={{ gap: 6, paddingVertical: 7, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Field label="Moneda recibida">
                      <Sel style={{ minWidth: 95 }} value={line.currency} onValueChange={(currency) => {
                        const method = (PAYMENT_METHODS_BY_CURRENCY[currency] || [])[0]?.id || 'efectivo';
                        setPaymentLines((prev) => prev.map((p) => p.id === line.id ? { ...p, currency, method, exchangeRate: '', rateSource: rateSettings.rateMode === 'eltoque' ? 'automatic' : 'manual' } : p));
                      }} items={currencies.map((currency) => ({ label: currency, value: currency }))} />
                    </Field>
                    <Field label="Método">
                      <Sel style={{ minWidth: 115 }} value={line.method} onValueChange={(method) => setPaymentLines((prev) => prev.map((p) => p.id === line.id ? { ...p, method } : p))} items={methods.map((m) => ({ label: m.label, value: m.id }))} />
                    </Field>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <Field label={`Monto (${line.currency})`}>
                      <Inp style={{ width: 105 }} keyboardType="decimal-pad" value={line.amount === '' && paymentLines.length === 1 ? String(total) : line.amount} onChangeText={(amount) => setPaymentLines((prev) => prev.map((p) => p.id === line.id ? { ...p, amount } : p))} placeholder="0.00" />
                    </Field>
                    {!same && (
                      <>
                        <Field label="Tasa">
                          <Sel style={{ minWidth: 110 }} value={source} onValueChange={(rateSource) => setPaymentLines((prev) => prev.map((p) => p.id === line.id ? { ...p, rateSource, exchangeRate: rateSource === 'manual' ? String(manual || '') : '' } : p))} items={[
                            ...(auto ? [{ label: 'Automática · recomendada', value: 'automatic' }] : []),
                            { label: 'Manual', value: 'manual' },
                          ]} />
                        </Field>
                        {source === 'manual' ? (
                          <Field label={`${line.currency} → ${saleCurrency}`}>
                            <Inp style={{ width: 90 }} keyboardType="decimal-pad" value={line.exchangeRate || String(manual || '')} onChangeText={(exchangeRate) => setPaymentLines((prev) => prev.map((p) => p.id === line.id ? { ...p, exchangeRate, rateSource: 'manual' } : p))} placeholder="Tasa" />
                          </Field>
                        ) : (
                          <Text style={{ color: colors.textMuted, fontSize: 10, flex: 1, paddingBottom: 8 }}>{shownRate ? `${Number(shownRate).toFixed(4)} automática` : 'Sin tasa automática'}</Text>
                        )}
                      </>
                    )}
                    {paymentLines.length > 1 && <TouchableOpacity onPress={() => setPaymentLines((prev) => prev.filter((p) => p.id !== line.id))} style={{ padding: 8 }}><Text style={{ color: colors.danger }}>Quitar</Text></TouchableOpacity>}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <TouchableOpacity disabled={paymentLines.length >= 8} onPress={() => {
            const first = paymentLines[0];
            setPaymentLines((prev) => [...prev.map((p, i) => i === 0 && p.amount === '' ? { ...p, amount: String(total) } : p), {
              id: generateUuid(), method: (PAYMENT_METHODS_BY_CURRENCY[saleCurrency] || [])[0]?.id || 'efectivo',
              currency: saleCurrency, amount: '0', rateSource: rateSettings.rateMode === 'eltoque' ? 'automatic' : 'manual', exchangeRate: '',
            }]);
          }} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>+ Añadir forma de pago</Text></TouchableOpacity>
          <Text style={{ color: paymentsMatch ? colors.success : colors.warning, fontSize: 11 }}>
            {paymentsMatch ? 'Pagos conciliados' : `Equivalente: ${curSym}${fmt(paidTotal)} ${saleCurrency} · debe coincidir con ${curSym}${fmt(total)}`}
          </Text>
        </View>
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
  offlineBanner: { backgroundColor: colors.syncBusy, padding: 8, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  pageTitle: { fontSize: 20, fontWeight: '800', color: colors.text, paddingHorizontal: 16, paddingTop: 12, marginBottom: 4 },
  locationLabel: { paddingHorizontal: 16, fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  locationPicker: { paddingHorizontal: 16, marginBottom: 10 },
  locationName: { fontWeight: '700', color: colors.text },
  searchWrap: { paddingHorizontal: 16, marginBottom: 10 },
  search: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, paddingLeft: 34, paddingRight: 44, paddingVertical: 9, backgroundColor: colors.inputBg, fontSize: 14, color: colors.text },
  addUnique: { position: 'absolute', right: 22, top: '50%', transform: [{ translateY: -14 }], backgroundColor: colors.primaryTint, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 7 },
  addUniqueText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  // SIN `overflow: 'hidden'`, y no por descuido. Dentro de esta tarjeta caen
  // los cuatro desplegables del ticket (pago, cliente, entrega, método), y la
  // lista de cada uno se dibuja con `position: absolute` para no ser una
  // ventana del sistema — ver el comentario de `Sel` en UI.tsx. Con recorte
  // activo, esa lista se cortaría justo por donde empieza la tarjeta, y se vería
  // una franja de opciones sin cerrar.
  //
  // El radio redondeado no se pierde: el borde lo dibuja la propia tarjeta, y
  // las filas de productos de dentro ya traen su separador.
  listCard: { flex: 1, marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
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
  discRowText: { fontSize: 12, color: colors.danger },
  changeText: { fontSize: 13, fontWeight: '700', color: colors.success },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  total: { fontSize: 18, fontWeight: '800', color: colors.text },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.success, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
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

import CerrarTurnoSheet from '../components/CerrarTurnoSheet';
