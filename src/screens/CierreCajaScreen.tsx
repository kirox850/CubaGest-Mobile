import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ClosingAPI, LocationsAPI, ProductsAPI } from '../api/endpoints';
import { isOfflineError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { Badge, EmptyState, ErrorBanner, Skeleton, Btn, PageHeader, showToast } from '../components/UI';
import DineroCierre, { countedCashDe, hayConteo, type ContadoTexto } from '../components/DineroCierre';
import ClosingResolve from '../components/ClosingResolve';
import Icon from '../components/Icon';
import type { Closing, ClosingItem, ClosingPreview, InventoryReading, Location } from '../types';
import { showError } from '../components/dialogs';
import {
  cacheClosings, getOfflineClosings,
  cacheReadings, getOfflineReadings,
  cacheLocations, getOfflineLocations,
  enqueueOfflineOperation, getOfflineOperations, getOfflineProducts,
} from '../offline/offlineStore';
import { generateUuid } from '../utils/uuid';

const fmt = (n: number) => new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleString('es-CU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

type ViewMode = 'list' | 'selectReading' | 'validate' | 'detail';

export default function CierreCajaScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [view, setView] = useState<ViewMode>('list');
  const [closings, setClosings] = useState<Closing[]>([]);
  const [readings, setReadings] = useState<InventoryReading[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [readingLocationId, setReadingLocationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [selectedReading, setSelectedReading] = useState<InventoryReading | null>(null);
  const [preview, setPreview] = useState<ClosingPreview | null>(null);
  const [validatedItems, setValidatedItems] = useState<Record<string, string>>({});
  // El dinero contado, por moneda. ARRANCA VACÍO a propósito: solo se envía al
  // backend lo que el cajero escribió de verdad. Mandar ceros por defecto
  // inventaría un descuadre del 100% en cada moneda con saldo.
  const [contado, setContado] = useState<ContadoTexto>({});
  // El instante REAL del conteo, no el del envío. Sin conexión puede pasar una
  // hora entre que se cuenta y se sube, y de ese instante depende la ventana
  // para explicar el descuadre: por eso se captura al empezar a escribir, no al
  // confirmar.
  const [contadoAt, setContadoAt] = useState<number | null>(null);
  const [detailClosing, setDetailClosing] = useState<Closing | null>(null);
  const [confirmReading, setConfirmReading] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const locationName = (id?: string) => locations.find((l) => l.id === id)?.name || '—';

  // Servidor primero, caché después. El orden importa: la caché puede tener la
  // última versión buena, y entrar por ella solo añadiría latencia cuando hay
  // red. Lo que cambia es que sin red se pinta la copia local en vez de un
  // error: sin esta segunda parte no había forma de consultar un cierre, y el
  // cajero se quedaba sin poder ver el descuadre que tenía delante.
  const loadClosings = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const list = await ClosingAPI.list();
      setClosings(list);
      void cacheClosings(list).catch(() => {});
    } catch (e) {
      const local = await getOfflineClosings();
      if (local.length > 0) {
        setClosings(local);
        setError('Sin conexión con el servidor — mostrando los cierres guardados en este dispositivo');
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadClosings();
      LocationsAPI.list()
        .then((locs) => {
          setLocations(locs);
          void cacheLocations(locs).catch(() => {});
        })
        .catch(async () => {
          const local = await getOfflineLocations();
          if (local.length > 0) setLocations(local);
        });
    }, [loadClosings]),
  );

  const startClosing = async () => {
    try {
      setError('');
      const list = await ClosingAPI.readings();
      const localOps = await getOfflineOperations(['pending', 'syncing', 'conflict']);
      const queued = localOps.filter((op) => op.kind === 'manual_reading').map((op: any) => ({
        id: op.payload.clientReadingId, companyId: user?.businessId || user?.company?.id || '',
        locationId: op.payload.locationId, takenById: user?.id || '', type: 'apertura' as const,
        notes: op.payload.notes, items: (op.payload.items || []).map((i: any) => ({ productId: i.productId, productCode: '', productName: '', unit: '', qty: i.contado })),
        createdAt: op.payload.businessAt, syncStatus: op.status,
      }));
      setReadings([...queued, ...list]);
      void cacheReadings(list).catch(() => {});
      setView('selectReading');
    } catch (e) {
      // Las lecturas de apertura son la BASE del conteo. Sin copia local no se
      // puede ni siquiera empezar a cerrar sin red, que es exactamente lo que
      // pasaba: la caja no tenía ninguna hasta que alguien entraba aquí con red.
      const local = await getOfflineReadings();
      const localOps = await getOfflineOperations(['pending', 'syncing', 'conflict']);
      const queued = localOps.filter((op) => op.kind === 'manual_reading').map((op: any) => ({
        id: op.payload.clientReadingId, companyId: user?.businessId || user?.company?.id || '',
        locationId: op.payload.locationId, takenById: user?.id || '', type: 'apertura' as const,
        notes: op.payload.notes, items: (op.payload.items || []).map((i: any) => ({ productId: i.productId, productCode: '', productName: '', unit: '', qty: i.contado })),
        createdAt: op.payload.businessAt, syncStatus: op.status,
      }));
      if (local.length > 0 || queued.length > 0) {
        setReadings([...queued, ...local]);
        setError('Sin conexión — usando las lecturas guardadas en este dispositivo');
        setView('selectReading');
      } else {
        setError('Sin conexión y sin lecturas guardadas. Conéctate una vez para poder cerrar sin internet después.');
      }
    }
  };

  const selectReading = async (reading: InventoryReading) => {
    try {
      setSaving(true);
      setSelectedReading(reading);
      let data: any;
      try {
        data = await ClosingAPI.preview(reading.id);
      } catch (error) {
        if (!isOfflineError(error)) throw error;
        const cached = await getOfflineProducts();
        if (!cached.length) throw new Error('No hay un catálogo guardado para contar esta caja.');
        data = { items: cached.map((p) => ({ productId: p.id, productName: p.name, stockValidated: p.localStock, stockExpected: p.localStock, price: p.price })), totalSales: 0, totalIncome: 0 };
      }
      setPreview(data);
      const init: Record<string, string> = {};
      for (const item of data.items) init[item.productId] = String(item.stockValidated ?? item.stockExpected ?? 0);
      setValidatedItems(init);
      // Cada lectura arranca con su conteo: el dinero se cuenta en la caja, en
      // un momento concreto, y arrastrar el conteo de otro conteo inventaría
      // un descuadre.
      setContado({});
      setContadoAt(null);
      setView('validate');
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onContadoChange = (next: ContadoTexto) => {
    if (contadoAt === null) setContadoAt(Date.now());
    setContado(next);
  };

  const confirmClosing = async () => {
    if (!selectedReading) return;
    try {
      setSaving(true);
      const items = Object.entries(validatedItems).map(([productId, v]) => ({
        productId,
        stockValidated: Number(v) || 0,
      }));
      // El dinero va en el MISMO POST que el inventario. Es lo que faltaba:
      // sin countedCash el backend conciliaba contra un conteo vacío y cada
      // cierre hecho desde el teléfono salía money-blind.
      const conDinero = hayConteo(contado);
      const countedAt = conDinero ? new Date(contadoAt ?? Date.now()).toISOString() : new Date().toISOString();
      const clientClosingId = generateUuid();
      const clientReadingId = generateUuid();
      const request = {
        initialReadingId: selectedReading.id,
        items,
        notes: notes || undefined,
        countedCash: conDinero ? countedCashDe(contado) : {},
        countedAt,
        clientClosingId,
        clientReadingId,
      };
      try {
        await ClosingAPI.confirm(request);
      } catch (error) {
        if (!isOfflineError(error)) throw error;
        await enqueueOfflineOperation('closing_confirm', request, Date.parse(countedAt), clientClosingId);
      }
      showToast('Cierre registrado correctamente', 'success');
      setView('list');
      setPreview(null);
      setNotes('');
      setContado({});
      setContadoAt(null);
      loadClosings();
    } catch (e) {
      if (!isOfflineError(e)) showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Conteo de apertura: una fila por producto con lo esperado (la última foto de
  // la caja, según el servidor) y lo que el cajero cuenta. El esperado NO se
  // calcula en el teléfono: si las dos pantallas dijeran cosas distintas, el
  // conteo se compararía contra un número que el backend no usa.
  const [countRows, setCountRows] = useState<{ productId: string; productName: string; unit: string; esperado: number; contado: number }[]>([]);
  const [chainInfo, setChainInfo] = useState<any>(null);

  const openReading = async (locationId: string) => {
    try {
      let chain: any;
      let productos: any[];
      try {
        [chain, productos] = await Promise.all([ClosingAPI.chain(locationId), ProductsAPI.list()]);
      } catch (error) {
        if (!isOfflineError(error)) throw error;
        chain = { aperturaHeredada: false, offline: true };
        productos = await getOfflineProducts();
        if (!productos.length) throw new Error('No hay productos guardados para contar esta caja.');
      }
      const esperadoPorProducto = new Map<string, number>(
        ((chain as any)?.esperado?.items || []).map((x: any) => [String(x.productId), Number(x.diff || 0)]),
      );
      setCountRows((productos || []).map((p: any) => ({
        productId: p.id,
        productName: p.name,
        unit: p.unit || 'u',
        esperado: esperadoPorProducto.get(String(p.id)) ?? Number(p.localStock ?? 0),
        contado: esperadoPorProducto.get(String(p.id)) ?? Number(p.localStock ?? 0),
      })));
      setChainInfo(chain);
      setConfirmReading(true);
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const takeReading = async () => {
    if (!readingLocationId) return showError('Selecciona la ubicación');
    try {
      setSaving(true);
      const businessAt = new Date().toISOString();
      const clientReadingId = generateUuid();
      const requestItems = countRows.map((r) => ({ productId: r.productId, contado: Number(r.contado) || 0 }));
      try {
        await ClosingAPI.takeReading(readingLocationId, 'Conteo de apertura', requestItems, businessAt, clientReadingId);
      } catch (error) {
        if (!isOfflineError(error)) throw error;
        await enqueueOfflineOperation('manual_reading', {
          locationId: readingLocationId, notes: 'Conteo de apertura', items: requestItems, businessAt, clientReadingId,
        }, Date.parse(businessAt), clientReadingId);
      }
      showToast(
        chainInfo?.aperturaHeredada
          ? 'Apertura registrada heredando el cierre anterior'
          : `Conteo guardado (${countRows.length} productos)`,
        'success',
      );
      setConfirmReading(false);
      setChainInfo(null);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Detalle del cierre ───────────────────────────────────────────────────────
  //
  // Estos tres handlers vivían AQUÍ ABAJO, después del `return` de la vista de
  // lista. Con la lista en pantalla ese return se ejecuta y la declaración
  // nunca llegaba a correr, así que `openDetail` valía `undefined` y tocar
  // cualquier cierre petaba con "undefined is not a function". Metro transpila
  // `const` a `var`, que se iza pero sin valor: por eso el síntoma era ese y no
  // un ReferenceError. TypeScript no lo ve porque el uso está dentro de una
  // arrow del JSX, que puede invocarse más tarde.
  //
  // Van aquí arriba con el resto de handlers (`startClosing`, `selectReading`,
  // `confirmClosing`, `openReading`) para que en CUALQUIER vista ya existan.
  const openDetail = async (c: Closing) => {
    setDetailClosing(c);
    setView('detail');
    // El detalle NO es la fila de la lista. `GET /closing` devuelve las filas
    // crudas; solo `GET /closing/:id` añade `notas`, `explicaciones` y
    // `pendientes` — ya descontado lo explicado. Sin esta llamada, la pantalla
    // nunca puede decir si un cierre está resuelto, porque no tiene el dato.
    try {
      setDetailClosing(await ClosingAPI.detail(c.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const explicar = async (currency: string, amount: number, note: string) => {
    if (!detailClosing) return;
    try {
      await ClosingAPI.explain(detailClosing.id, { currency, amount, note });
      // Se vuelve a pedir el detalle: el `status` cambia en el servidor según lo
      // que quedaba por cuadrar, y recalcularlo aquí sería adivinar.
      setDetailClosing(await ClosingAPI.detail(detailClosing.id));
      await loadClosings();
    } catch (e) {
      // 400 = el importe no coincide EXACTO. 409 = el cierre ya no espera
      // explicaciones. El mensaje del servidor dice cuál de las dos fue.
      showError((e as Error).message);
    }
  };

  const anotar = async (productId: string, note: string) => {
    if (!detailClosing) return;
    try {
      await ClosingAPI.addNote(detailClosing.id, { productId, note });
      setDetailClosing(await ClosingAPI.detail(detailClosing.id));
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const retryClosing = async () => {
    if (!detailClosing) return;
    try {
      setRetrying(true);
      const response = await ClosingAPI.retry(detailClosing.id);
      const updated = response.cierre;
      setDetailClosing(updated);
      await loadClosings();
      showToast(updated.status === 'cerrado'
        ? 'El cierre ya cuadra con las ventas sincronizadas.'
        : 'El cierre fue recalculado; todavía queda un descuadre pendiente.', 'success');
    } catch (e) {
      showToast((e as Error).message || 'No se pudo recalcular el cierre', 'error');
    } finally {
      setRetrying(false);
    }
  };

  // ── Lista de cierres ───────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <View style={styles.wrap}>
        {/* Header — igual que la web: título + botones */}
        <View style={styles.header}>
          <PageHeader title="Cierre de Caja" subtitle="Conciliación de ventas, stock e ingresos" />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {isAdmin && (
              <Btn variant="secondary" icon="refresh" label="Lectura de apertura" onPress={() => openReading(readingLocationId)} />
            )}
            <Btn icon="check" label="Iniciar cierre" onPress={startClosing} />
          </View>
        </View>

        <ErrorBanner message={error} />

        {/* El spinner centrado dejaba la pantalla en blanco dos segundos, que es
            justo lo que hace que una app lenta parezca rota. En su lugar se
            dibujan tres tarjetas con la FORMA de las reales —fecha y quién
            cerró a la izquierda, badges a la derecha, las tres cifras del
            arqueo abajo—, para que cuando entra el primer cierre la lista no
            salte de sitio. */}
        {loading ? (
          <View style={{ padding: 12, paddingBottom: 32 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Skeleton w={`${78 - i * 6}%`} h={14} />
                    <Skeleton w="45%" h={11} />
                    <Skeleton w="28%" h={11} />
                  </View>
                  <View style={{ gap: 4, alignItems: 'flex-end' }}>
                    <Skeleton w={94} h={20} r={20} />
                    <Skeleton w={72} h={20} r={20} />
                  </View>
                </View>
                <View style={styles.cardStatsRow}>
                  {[0, 1, 2].map((j) => (
                    <View key={j} style={{ gap: 6 }}>
                      <Skeleton w={64} h={10} />
                      <Skeleton w={88} h={14} />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={closings}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            ListEmptyComponent={<EmptyState icon="cierre" text="No hay cierres registrados aún" />}
            renderItem={({ item: c }) => {
              const hasShortage = (c.items || []).some((i) => i.shortage > 0.001);
              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => { void openDetail(c); }}
                >
                  <View style={styles.cardTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>Cierre — {fmtDate(c.createdAt)}</Text>
                      <Text style={styles.cardSub}>
                        Por {c.closedBy?.name || '—'}
                      </Text>
                      <Text style={styles.cardLoc}>{locationName(c.locationId)}</Text>
                    </View>
                    <View style={{ gap: 4, alignItems: 'flex-end' }}>
                      {/* Un cierre provisional tiene un plazo corriendo: quien
                          lo ve desde la lista debería saber que hay algo que
                          explicar, no descubrirlo al abrirlo. */}
                      {c.status === 'provisional' && <Badge icon="clock" label="Provisional" color={colors.warning} />}
                      {c.status === 'resuelto' && <Badge icon="check" label="Resuelto" color={colors.success} />}
                      {hasShortage && <Badge icon="alert" label="Faltantes" color={colors.warning} />}
                      <Badge label={`${c.totalSales} ventas`} color={colors.primary} />
                    </View>
                  </View>
                  <View style={styles.cardStatsRow}>
                    <View>
                      <Text style={styles.statLabel}>Total ingresos</Text>
                      <Text style={[styles.statValue, { color: colors.success }]}>{fmt(c.totalIncome)} CUP</Text>
                    </View>
                    <View>
                      <Text style={styles.statLabel}>Efectivo</Text>
                      <Text style={styles.statValue}>{fmt(c.incomeEfectivo)} CUP</Text>
                    </View>
                    <View>
                      <Text style={styles.statLabel}>Transferencia</Text>
                      <Text style={styles.statValue}>{fmt(c.incomeTransferencia)} CUP</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Modal lectura de apertura */}
        <Modal visible={confirmReading} transparent animationType="fade" onRequestClose={() => setConfirmReading(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Contar la caja para abrir el turno</Text>
              {locations.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {locations.map((l) => (
                      <TouchableOpacity
                        key={l.id}
                        style={[styles.chip, readingLocationId === l.id && styles.chipActive]}
                        onPress={() => {
                          setReadingLocationId(l.id);
                          openReading(l.id);
                        }}
                      >
                        <Text style={[styles.chipText, readingLocationId === l.id && { color: '#fff' }]}>{l.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              ) : null}

              {/* El eslabón que falta. Sin esto, un descuadre que en realidad es de
                  un turno anterior aparece como si fuera de este y el cajero carga
                  con la culpa de otro. */}
              {chainInfo?.esperado?.faltaEslabon && (
                <View style={[styles.warnBox, { marginBottom: 10 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="alert" size={15} color={colors.warning} />
                    <Text style={styles.warnTitle}>Falta un eslabón de esta caja</Text>
                  </View>
                  <Text style={styles.warnText}>
                    {chainInfo.esperado.eslabonFaltante || 'Falta el cierre anterior de esta caja'}.
                    {'\n'}Los faltantes que veas PUEDEN ser de un turno anterior, no de este.
                  </Text>
                </View>
              )}

              {chainInfo?.aperturaHeredada ? (
                <View style={[styles.warnBox, { marginBottom: 10 }]}>
                  <Text style={styles.warnText}>
                    Este negocio tiene activada la opción de NO contar al abrir: la apertura heredará el
                    cierre anterior y la caja no se verificará en este cambio de turno.
                  </Text>
                </View>
              ) : (
                <View style={[styles.warnBox, { marginBottom: 10 }]}>
                  <Text style={styles.warnTitle}>Instrucción</Text>
                  <Text style={styles.warnText}>
                    Cuenta cada producto y escribe la cantidad. El esperado es lo que dejó el turno
                    anterior, así que ves enseguida si no cuadra. Lo que no cambies se queda igual.
                  </Text>
                </View>
              )}

              <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                {countRows.map((r) => {
                  const d = Math.round(((Number(r.contado) || 0) - Number(r.esperado)) * 1000) / 1000;
                  const cambia = Math.abs(d) > 0.001;
                  return (
                    <View key={r.productId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ flex: 1, color: colors.text, fontSize: 13 }} numberOfLines={1}>{r.productName}</Text>
                      <Text style={{ width: 54, textAlign: 'right', color: colors.textMuted, fontSize: 12 }}>{r.esperado}</Text>
                      <TextInput
                        style={{
                          width: 82, paddingVertical: 5, paddingHorizontal: 8, textAlign: 'right',
                          borderWidth: 1, borderColor: colors.border, borderRadius: 7,
                          color: colors.text, fontSize: 13, backgroundColor: colors.inputBg,
                        }}
                        keyboardType="decimal-pad"
                        value={String(r.contado)}
                        onChangeText={(t) => setCountRows((prev) =>
                          prev.map((x) => (x.productId === r.productId ? { ...x, contado: t === '' ? 0 : Number(t) } : x)),
                        )}
                      />
                      <Text style={{ width: 52, textAlign: 'right', fontWeight: '700', fontSize: 12, color: !cambia ? colors.success : (d < 0 ? colors.danger : colors.warning) }}>
                        {!cambia ? 'OK' : (d < 0 ? `-${Math.abs(d)}` : `+${d}`)}
                      </Text>
                    </View>
                  );
                })}
                {countRows.length === 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                    Esta caja no tiene productos que contar.
                  </Text>
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmReading(false)}>
                  <Text style={{ color: colors.textMuted }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={takeReading} disabled={saving}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Guardando...' : 'Guardar conteo y abrir'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Seleccionar lectura ────────────────────────────────────────────────────
  if (view === 'selectReading') {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView('list')}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Iniciar cierre</Text>
        <Text style={styles.subtitle}>
          Elige desde cuándo contar las ventas. El stock registrado en esa fecha será el punto de partida.
        </Text>
        {readings.length === 0 ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>No hay lecturas disponibles</Text>
            <Text style={styles.warnText}>
              Para hacer el primer cierre el administrador debe tomar una lectura de apertura primero.
            </Text>
          </View>
        ) : (
          <FlatList
            data={readings}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            renderItem={({ item: r, index }) => {
              const isRec = index === 0;
              const typeLabel = r.type === 'apertura' ? 'Lectura de apertura' : 'Lectura al cierre anterior';
              return (
                <TouchableOpacity
                  style={[styles.readingCard, isRec && styles.readingCardRec]}
                  onPress={() => !saving && selectReading(r)}
                  disabled={saving}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.readingTitle}>{typeLabel}</Text>
                    <Text style={styles.cardSub}>{fmtDate(r.createdAt)}</Text>
                    <Text style={styles.cardLoc}>{locationName(r.locationId)}</Text>
                    {r.takenBy?.name ? <Text style={styles.cardSub}>Por {r.takenBy.name}</Text> : null}
                  </View>
                  {isRec && <Badge label="Recomendado" color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  // ── Validar stock ──────────────────────────────────────────────────────────
  if (view === 'validate' && preview) {
    const itemsWithShortage = preview.items.filter((i) => {
      const validated = Number(validatedItems[i.productId] ?? i.stockValidated);
      return i.stockExpected - validated > 0.001;
    });
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView('selectReading')}>
          <Text style={styles.backText}>← Cambiar lectura</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Validar stock del período</Text>
        <Text style={styles.subtitle}>
          Desde {fmtDate(preview.periodStart)} · {preview.totalSales} ventas · {fmt(preview.totalIncome)} CUP
        </Text>

        <View style={styles.summaryInline}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.statLabel}>Efectivo</Text>
            <Text style={styles.statValue}>{fmt(preview.incomeEfectivo)} CUP</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.statLabel}>Transferencia</Text>
            <Text style={styles.statValue}>{fmt(preview.incomeTransferencia)} CUP</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Cuenta físicamente cada producto y corrige el valor si difiere del esperado. La diferencia quedará registrada como faltante.
          </Text>
        </View>

        <View style={styles.dinero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="cash" size={15} color={colors.primary} />
            <Text style={styles.dineroTitle}>Contar el dinero de la caja</Text>
          </View>
          <Text style={styles.infoText}>
            Es opcional: si no escribes nada aquí, el cierre se guarda solo con la mercancía.
          </Text>
        </View>

        <FlatList
          data={preview.items}
          keyExtractor={(i) => i.productId}
          contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
          ListEmptyComponent={<EmptyState text="Sin productos en esta lectura" />}
          // El dinero va PRIMERO, en la cabecera. Es lo que se cuenta con las
          // manos vacías sobre la caja, y lo que más caro sale cuando falta.
          ListHeaderComponent={
            <View style={styles.dinero}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="cash" size={15} color={colors.primary} />
            <Text style={styles.dineroTitle}>Contar el dinero de la caja</Text>
          </View>
              <DineroCierre
                preview={preview.cash}
                contado={contado}
                onChange={onContadoChange}
                baseCash={preview.baseCash}
              />
            </View>
          }
          renderItem={({ item }) => {
            const validated = validatedItems[item.productId] ?? String(item.stockValidated);
            const shortage = Number((item.stockExpected - (Number(validated) || 0)).toFixed(3));
            const hasS = shortage > 0.001;
            return (
              <View style={[styles.validateRow, hasS && { backgroundColor: colors.warningBg }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.validateName}>{item.productName}</Text>
                  <Text style={styles.cardSub}>
                    Inicial: {item.stockInitial} · Vendido: {item.stockSold} · Esperado: {item.stockExpected} {item.unit}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.success }]}>Ingreso: ${fmt(item.income)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      style={styles.validateInput}
                      value={validated}
                      onChangeText={(v) => setValidatedItems((prev) => ({ ...prev, [item.productId]: v }))}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.cardSub}>{item.unit}</Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 12, color: hasS ? colors.warning : colors.success }}>
                    {hasS ? `-${shortage} ${item.unit}` : <Icon name="check" size={14} color={colors.success} />}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {itemsWithShortage.length > 0 && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              ⚠ Se registrarán faltantes en {itemsWithShortage.length} producto(s). Quedarán en el historial.
            </Text>
          </View>
        )}

        <TextInput
          style={styles.notesInput}
          placeholder="Observaciones (opcional)..."
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setView('selectReading')}>
            <Text style={{ color: colors.textMuted }}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={confirmClosing} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Guardando...' : 'Confirmar cierre'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (view === 'detail' && detailClosing) {
    const c = detailClosing;
    const hasShortage = (c.items || []).some((i: ClosingItem) => i.shortage > 0.001);
    const provisional = c.status === 'provisional';
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView('list')}>
          <Text style={styles.backText}>← Volver a cierres</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Detalle del cierre</Text>
        <Text style={styles.subtitle}>
          {fmtDate(c.createdAt)} · Cerrado por {c.closedBy?.name || '—'}
        </Text>
        <Text style={styles.cardSub}>Período: {fmtDate(c.periodStart)} → {fmtDate(c.periodEnd)}</Text>
        {c.notes ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <Icon name="doc" size={13} color={colors.textMuted} />
                    <Text style={[styles.cardSub, { flex: 1 }]}>{c.notes}</Text>
                  </View>
                ) : null}

        {provisional && (
          <Btn
            variant="secondary"
            icon="refresh"
            label={retrying ? 'Recalculando…' : 'Recalcular con ventas sincronizadas'}
            onPress={retryClosing}
            disabled={retrying}
            style={{ marginHorizontal: 12, marginTop: 12 }}
          />
        )}

        <View style={styles.detailGrid}>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Total ingresos</Text>
            <Text style={[styles.detailValue, { color: colors.success }]}>{fmt(c.totalIncome)}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Efectivo</Text>
            <Text style={styles.detailValue}>{fmt(c.incomeEfectivo)}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Transferencia</Text>
            <Text style={styles.detailValue}>{fmt(c.incomeTransferencia)}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.statLabel}>Ventas</Text>
            <Text style={[styles.detailValue, { color: colors.primary }]}>{c.totalSales}</Text>
          </View>
        </View>

        {/* Un cierre provisional no está cerrado: hay un plazo para explicar el
            descuadre. Sin esta banda, un cajero que abre el cierre ve una lista
            de productos y ninguna señal de que le faltan pesos por justificar. */}
        {provisional && (
          <ClosingResolve closing={c} onExplicar={explicar} onAnotar={anotar} />
        )}

        {/* Notas ya escritas: el relato de por qué faltó, con su autor. */}
        {(c.notas || []).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notas de mercancía</Text>
            {(c.notas || []).map((nta) => (
              <Text key={nta.id} style={styles.cardSub}>
                • {nta.productName}: “{nta.note}” — {nta.autor}
              </Text>
            ))}
          </View>
        )}

        {hasShortage && (
          <View style={styles.warnBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="alert" size={14} color={colors.warning} />
            <Text style={styles.warnText}>Este cierre registra faltantes de inventario</Text>
          </View>
          </View>
        )}

        <FlatList
          data={c.items || []}
          keyExtractor={(i, idx) => `${i.productId}-${idx}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const hasS = item.shortage > 0.001;
            return (
              <View style={[styles.validateRow, hasS && { backgroundColor: colors.warningBg }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.validateName}>{item.productName}</Text>
                  <Text style={styles.cardSub}>
                    Inicial: {item.stockInitial} · Vendido: {item.stockSold} · Esperado: {item.stockExpected} · Físico: {item.stockValidated} {item.unit}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.success }]}>Ingreso: ${fmt(item.income)}</Text>
                </View>
                <Text style={{ fontWeight: '800', fontSize: 13, color: hasS ? colors.warning : colors.success }}>
                  {hasS ? `-${item.shortage}` : <Icon name="check" size={14} color={colors.success} />}
                </Text>
              </View>
            );
          }}
        />
      </View>
    );
  }

  return null;
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  secondaryBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  backBtn: { marginBottom: 8 },
  backText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  cardSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  cardLoc: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 },
  cardStatsRow: { flexDirection: 'row', gap: 24, marginTop: 10 },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2 },
  readingCard: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readingCardRec: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryTint },
  readingTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  summaryInline: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.primaryTint, borderRadius: 12, padding: 10, marginBottom: 10 },
  infoBox: { backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryTintB, borderRadius: 12, padding: 10, marginBottom: 8 },
  infoText: { fontSize: 12, color: colors.primaryText },
  dinero: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, gap: 8 },
  dineroTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  validateRow: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  validateName: { fontWeight: '700', fontSize: 13, color: colors.text },
  validateInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, width: 70, textAlign: 'right', fontSize: 14, color: colors.text, backgroundColor: colors.bgCard },
  notesInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, fontSize: 13, backgroundColor: colors.bgCard, color: colors.text, minHeight: 50, textAlignVertical: 'top', marginBottom: 10 },
  warnBox: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warnBorder, borderRadius: 12, padding: 12, marginBottom: 10 },
  warnTitle: { fontWeight: '700', color: colors.warningText, marginBottom: 6, fontSize: 13 },
  warnText: { fontSize: 12, color: colors.warningText, lineHeight: 18 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  detailCard: { flexGrow: 1, minWidth: '45%', backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  detailValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 20, maxHeight: '85%' },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 12, color: colors.text },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bgCard },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
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
