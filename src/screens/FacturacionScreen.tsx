import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SalesAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { colors, themeRef } from '../config/theme';
import { PAY_METHODS, CURRENCY_SYMBOLS } from '../config/roles';
import { EmptyState, ErrorBanner, Badge, Btn, Inp, Sel, Skeleton, showToast } from '../components/UI';
import { showConfirm, showError } from '../components/dialogs';
import Icon from '../components/Icon';
import { shareCSV } from '../utils/csv';
import { mergeSales, type MergedSaleRow } from '../config/mergeSales';
import { getAllOfflineSales, cacheSales, getOfflineSales } from '../offline/offlineStore';
import type { Sale } from '../types';
import type { OfflineSale } from '../offline/offlineStore';

const fmt = (n: number) => Number(n || 0).toFixed(2);

export default function FacturacionScreen() {
  const { user, online } = useAuth();
  const { offlineSales, syncNow, syncing, refresh: refreshSync } = useSync();
  const [sales, setSales] = useState<MergedSaleRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [cargandoVentas, setCargandoVentas] = useState(true);
  const [syncMsg, setSyncMsg] = useState('');
  const [viewInv, setViewInv] = useState<MergedSaleRow | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // DOS PASOS, DOS `try`. Antes era uno solo que empezaba por la cola local: si
  // la lectura de AsyncStorage fallaba, la excepción se comía la petición de
  // facturas de al lado y estas nunca se pedían. La pantalla quedaba vacía y el
  // aviso era el del error de almacenamiento, que no señalaba el problema real
  // (el catálogo entero sí había llegado).
  //
  // Ahora el servidor va primero y en su propio try, y la cola local es un extra
  // en el suyo. Un fallo de almacenamiento no puede volver a vaciar la lista de
  // facturas, ni puede presentarse como la razón por la que está vacía.
  const load = useCallback(async () => {
    setError('');
    setCargandoVentas(true);
    // Sin red, o si el servidor falla, la lista sale de la última copia
    // guardada. Sin esto el cajero sin conexión veía únicamente las ventas que
    // aún no habían subido, y las ya facturadas desaparecían de su propia
    // pantalla: el mismo número dos veces, o entregar una factura a un cliente
    // que ya la tenía.
    const SIN_CONEXION = 'Sin conexión con el servidor — mostrando las facturas guardadas en este dispositivo';
    let delServidor: Sale[] = [];
    if (online) {
      try {
        delServidor = await SalesAPI.list();
        void cacheSales(delServidor).catch(() => {});
      } catch (err) {
        try {
          delServidor = await getOfflineSales();
        } catch {
          delServidor = [];
        }
        setError(delServidor.length > 0 ? SIN_CONEXION : (err as Error).message);
      }
    } else {
      try {
        delServidor = await getOfflineSales();
      } catch {
        delServidor = [];
      }
      if (delServidor.length > 0) setError(SIN_CONEXION);
    }
    let cola: OfflineSale[] = [];
    try {
      // Se lee el almacén directamente, no `offlineSales` del contexto: ese
      // valor es estado de React y aquí seguiría siendo el de la carga
      // anterior, así que la lista mezclaría la cola vieja con la nueva.
      cola = await getAllOfflineSales();
    } catch {
      // Sin la cola local se ven igual las facturas del servidor: la cola solo
      // sirve para reintentar ventas que aún no han subido.
      cola = [];
    }
    // Los contadores del banner (pendientes / conflictos) viven en el contexto.
    try {
      await refreshSync();
    } catch {
      // Son un extra informativo: si fallan, la lista de arriba es correcta
      // igualmente y no hay por qué avisar de nada.
    }
    setSales(mergeSales(delServidor, cola));
    setCargandoVentas(false);
  }, [online, refreshSync]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingOffline = offlineSales.filter((s) => s.status === 'pending' || s.status === 'syncing');
  const conflictOffline = offlineSales.filter((s) => s.status === 'conflict');

  const handleManualSync = async () => {
    setSyncMsg('');
    const r = await syncNow(true);
    if (r.error) setSyncMsg(r.error);
    else if (r.attempted === 0) setSyncMsg('No hay ventas pendientes por sincronizar');
    else {
      const parts = [`${r.synced} venta(s) sincronizada(s)`];
      if (r.conflicts) parts.push(`${r.conflicts} conflicto(s) de stock`);
      // Sin resultado del servidor NO se pierde la venta: queda pendiente.
      if (r.unknown) parts.push(`${r.unknown} sin respuesta (se reintentará)`);
      setSyncMsg(parts.join(' · '));
      load();
    }
  };

  const filtered = sales.filter(s =>
    (s.invoiceNumber || s.id || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.clientName || s.client || '').toLowerCase().includes(search.toLowerCase()),
  );

  const openEdit = (s: MergedSaleRow) => {
    setEditForm({
      clientName: s.clientName || s.client || '',
      clientNit: s.clientNit || '',
      clientPhone: s.clientPhone || '',
      payMethod: s.payments?.length === 1 ? s.payments[0].method : '',
    });
    setEditModal(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await SalesAPI.update(viewInv!.id, editForm);
      showToast('Factura actualizada', 'success');
      setEditModal(false);
      setViewInv(null);
      load();
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const voidSale = async (id: string) => {
    if (!(await showConfirm('La devolución se registrará con la fecha original de la venta y el recálculo ajustará las fotos posteriores. ¿Anular esta factura?'))) return;
    try {
      await SalesAPI.voidSale(id);
      showToast('Factura anulada. El inventario se recalculará desde la fecha original.', 'success');
      setViewInv(null);
      load();
    } catch (e) {
      showError((e as Error).message);
    };
  };

  const pend = offlineSales.filter((s) => s.status === 'pending').length;
  const conf = offlineSales.filter((s) => s.status === 'conflict').length;

  // El esqueleto de la lista replica la fila real de `styles.row` —columna
  // izquierda con nº de factura, cliente y la tira de fecha + badge; columna
  // derecha con importe, badge y el ojo— para que la lista entre por debajo de
  // donde estaba sin empujar el buscador ni el header. Solo se usa mientras la
  // lista sigue vacía: con facturas en pantalla la shimmer no pinta nada.
  // `syncing` es del contexto y mide la cola offline, no esta petición: con
  // `syncing` nada más, una cuenta sin facturas muestra "no hay facturas" y
  // un instante después las tiene. Un esqueleto que se equivoca de fase es peor
  // que un spinner, porque hace dudar del saldo.
  const loadingSales = (syncing || cargandoVentas) && sales.length === 0;

  return (
    <View style={styles.wrap}>
      <ErrorBanner message={error} />

      {/* Header — igual que la web: título + contador emitidas + botones */}
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title}>Facturas</Text>
          <Text style={styles.subtitle}>
            {sales.filter((s) => s.status === 'emitida').length} emitidas
            {pend > 0 ? `  · ${pend} offline` : ''}
            {conf > 0 ? `  · ${conf} conflicto${conf !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn variant="secondary" icon="refresh" label="Actualizar" onPress={load} />
          <Btn variant="secondary" icon="doc" label="CSV" onPress={() => shareCSV('ventas', sales as any, [
            { key: 'invoiceNumber', label: 'Factura' }, { key: 'date', label: 'Fecha' }, { key: 'clientName', label: 'Cliente' },
            { key: 'subtotal', label: 'Subtotal' }, { key: 'discountTotal', label: 'Descuento' }, { key: 'tax', label: 'Impuesto' },
            { key: 'total', label: 'Total' }, { key: 'currency', label: 'Moneda' }, { key: 'payMethod', label: 'Método' },
            { key: 'status', label: 'Estado' },
          ])} />
        </View>
      </View>

      {/* Ventas offline — caja naranja como la web */}
      {(pendingOffline.length > 0 || conflictOffline.length > 0 || syncMsg) && (
        <View style={styles.offlineBox}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="zap" size={15} color={colors.warning} />
          <Text style={styles.offlineTitle}>Ventas offline</Text>
        </View>
          </View>
          {syncMsg ? <Text style={styles.syncMsg}>{syncMsg}</Text> : null}
          {pendingOffline.map((s: OfflineSale) => (
            <View key={s.localId}>
              <View style={styles.offlineRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={12} color={colors.textMuted} />
                    <Text style={styles.offlineId}>{s.localId}</Text>
                  </View>
                <Text style={styles.offlineAmt}>${fmt(Number(s.total))}</Text>
              </View>
              {/* Por qué sigue pendiente: sin respuesta del servidor o sin
                  conexión. La venta NO se perdió: se reintenta sola. */}
              {s.lastError ? <Text style={styles.offlineHint}>{s.lastError}</Text> : null}
            </View>
          ))}
          {conflictOffline.map((s: OfflineSale) => (
            <View key={s.localId} style={styles.offlineRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Icon name="alert" size={12} color={colors.danger} />
                      <Text style={styles.offlineConflict}>{s.localId} — {s.conflictReason || 'Conflicto de stock'}</Text>
                    </View>
              <Text style={styles.offlineAmt}>${fmt(Number(s.total))}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
            onPress={handleManualSync}
            disabled={syncing || !online}
          >
            <Text style={styles.syncBtnText}>
              {syncing ? 'Sincronizando...' : '⟳ Sincronizar ahora'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Buscador con icono — igual que la web */}
      <View style={{ justifyContent: 'center', marginBottom: 12 }}>
        <View style={{ position: 'absolute', left: 10, zIndex: 1 }}>
          <Icon name="search" size={15} color={colors.textMuted} />
        </View>
        <Inp
          style={{ paddingLeft: 34 }}
          placeholder="Buscar por No. factura o cliente..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          loadingSales ? (
            <View>
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={styles.row}>
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <Skeleton w="38%" h={13} />
                    <Skeleton w={`${52 + (i * 8) % 30}%`} h={13} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Skeleton w={72} h={11} r={5} />
                      <Skeleton w={64} h={18} r={10} />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Skeleton w={64} h={15} r={6} />
                    <Skeleton w={58} h={18} r={10} />
                    <Skeleton w={14} h={14} r={4} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState text={online ? 'No hay facturas' : 'Sin conexión — mostrando solo ventas locales'} />
          )
        }
        renderItem={({ item: s }) => (
          <TouchableOpacity style={[styles.row, s.status === 'anulada' && { opacity: 0.5 }]} onPress={() => setViewInv(s)}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.invoice}>{s.esOffline ? s.localId : (s.invoiceNumber || s.id)}</Text>
              <Text style={styles.client}>{s.clientName || s.client}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Text style={styles.date}>{(s.date || s.createdAt || '').split('T')[0]}</Text>
                <Badge label={PAY_METHODS.find((p) => p.id === s.payMethod)?.label || s.payMethod} color={colors.primary} />
                {/* Una venta sin sincronizar no se puede anular ni editar: aún
                    no existe en el servidor, así que cualquier acción sobre su
                    id local sería un 404. Se marca y se explica en su lugar. */}
                {s.esOffline && (
                  <Badge
                    label={s.estadoOffline === 'conflict' ? 'Conflicto' : 'Sin sincronizar'}
                    color={s.estadoOffline === 'conflict' ? colors.warningText : colors.warning}
                  />
                )}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.amount}>{CURRENCY_SYMBOLS[s.currency] || '$'}{fmt(Number(s.total))}</Text>
              <Badge
                label={s.status === 'emitida' ? 'Emitida' : 'Anulada'}
                color={s.status === 'emitida' ? colors.success : colors.primary}
              />
              <Icon name="eye" size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Modal detalle */}
      {viewInv && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setViewInv(null)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {viewInv.esOffline ? `Venta ${viewInv.localId}` : `Factura ${viewInv.invoiceNumber || viewInv.id}`}
              </Text>
              {viewInv.esOffline && (
                // Se dice sin rodeos que esta venta aún no está en el servidor.
                // Un cajero que ve "LOCAL-0004" y nada más no sabe si se perdió
                // o si solo está esperando.
                <Text style={styles.note}>
                  Cobrada sin conexión, todavía sin sincronizar.
                  {viewInv.offlineHint ? ` ${viewInv.offlineHint}` : ''}
                </Text>
              )}
              <ScrollView>
                <View style={styles.receipt}>
                  <Text style={styles.receiptCenter}>{user?.company?.name || 'Mi Negocio'}</Text>
                  <Text style={styles.receiptCenter}>FACTURA</Text>
                  <Text style={styles.receiptLine}>No. {viewInv.invoiceNumber || viewInv.id}</Text>
                  {viewInv.status === 'anulada' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Icon name="alert" size={13} color={colors.danger} />
                      <Text style={[styles.receiptCenter, { color: colors.danger, fontWeight: '800' }]}>ANULADA</Text>
                    </View>
                  )}
                  <Text style={styles.receiptLine}>Fecha: {(viewInv.date || viewInv.createdAt || '').split('T')[0]}</Text>
                  <Text style={styles.receiptLine}>Cliente: {viewInv.clientName || viewInv.client}</Text>
                  {viewInv.clientNit && viewInv.clientNit !== '00000000000' && <Text style={styles.receiptLine}>Carnet: {viewInv.clientNit}</Text>}
                  {viewInv.clientPhone && <Text style={styles.receiptLine}>Tel: {viewInv.clientPhone}</Text>}
                  {viewInv.payments?.length ? <>
                    <Text style={styles.receiptLine}>Pagos:</Text>
                    {viewInv.payments.map((payment: any, index: number) => (
                      <Text key={index} style={styles.receiptLine}>
                        {PAY_METHODS.find(p => p.id === payment.method)?.label || payment.method} · {payment.currency} {CURRENCY_SYMBOLS[payment.currency] || ''}{fmt(Number(payment.amount))}
                        {payment.exchangeRate ? ` · tasa ${payment.exchangeRate} (${payment.rateSource === 'automatic' ? 'automática' : 'manual'})` : ''}
                      </Text>
                    ))}
                  </> : <Text style={styles.receiptLine}>Método: {PAY_METHODS.find(p => p.id === viewInv.payMethod)?.label || viewInv.payMethod}</Text>}
                  <Text style={styles.receiptDivider}>─────────────────────</Text>
                  {(viewInv.items || (viewInv as any).SaleItems || []).map((item: any, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.receiptLine}>{item.qty}x {item.name}</Text>
                      <Text style={styles.receiptLine}>{CURRENCY_SYMBOLS[viewInv.currency] || '$'}{fmt(Number(item.total) || item.price * item.qty)}</Text>
                    </View>
                  ))}
                  {Number(viewInv.tax || 0) > 0 && <Text style={styles.receiptLine}>Impuesto: {CURRENCY_SYMBOLS[viewInv.currency] || '$'}{fmt(Number(viewInv.tax))}</Text>}
                  <Text style={styles.receiptDivider}>─────────────────────</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.receiptLine, { fontWeight: '800' }]}>TOTAL:</Text>
                    <Text style={[styles.receiptLine, { fontWeight: '800' }]}>{CURRENCY_SYMBOLS[viewInv.currency] || '$'}{fmt(Number(viewInv.total))} {viewInv.currency || 'CUP'}</Text>
                  </View>
                  <Text style={[styles.receiptCenter, { fontSize: 10, color: colors.textMuted, marginTop: 6 }]}>Hecho con CubaGest</Text>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                {viewInv.status === 'emitida' && !viewInv.esOffline && (
                  <>
                    <TouchableOpacity style={styles.btnDanger} onPress={() => voidSale(viewInv.id)}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Anular</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnSecondary} onPress={() => openEdit(viewInv)}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>Editar datos</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setViewInv(null)}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal editar */}
      {editModal && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Editar datos de factura</Text>
              <Text style={styles.note}>Solo se pueden editar los datos del cliente. Para corregir un pago o producto, anula la factura y regístrala de nuevo; el inventario se ajustará desde la fecha original.</Text>
              <Inp style={{ marginBottom: 10 }} value={editForm.clientName} onChangeText={v => setEditForm(f => ({ ...f, clientName: v }))} placeholder="Nombre del cliente" />
              <Inp style={{ marginBottom: 10 }} value={editForm.clientNit} onChangeText={v => setEditForm(f => ({ ...f, clientNit: v }))} placeholder="Carnet" keyboardType="numeric" maxLength={11} />
              <Inp style={{ marginBottom: 10 }} value={editForm.clientPhone} onChangeText={v => setEditForm(f => ({ ...f, clientPhone: v }))} placeholder="Teléfono" keyboardType="phone-pad" />
              {viewInv?.payments?.length === 1 && <Sel
                style={{ marginBottom: 12 }}
                value={editForm.payMethod}
                onValueChange={(v: string) => setEditForm(f => ({ ...f, payMethod: v }))}
                items={PAY_METHODS.map(m => ({ label: m.label, value: m.id }))}
              />}
              {(viewInv?.payments?.length || 0) > 1 && <Text style={styles.note}>Esta factura tiene pagos divididos; para corregirlos, anúlala y regístrala de nuevo.</Text>}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setEditModal(false)}>
                  <Text style={{ fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Guardando...' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  offlineBox: { backgroundColor: 'rgba(249,115,22,0.08)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(249,115,22,0.30)', padding: 16, marginBottom: 12 },
  offlineTitle: { fontSize: 14, fontWeight: '700', color: colors.warningText },
  offlineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  offlineId: { fontSize: 12, fontWeight: '700', color: colors.primary, fontFamily: 'monospace' },
  offlineConflict: { fontSize: 11, fontWeight: '600', color: colors.warningText, flex: 1, marginRight: 8 },
  offlineHint: { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  offlineAmt: { fontSize: 12, fontWeight: '700', color: colors.text },
  syncMsg: { fontSize: 12, fontWeight: '600', color: colors.warningText, marginBottom: 6 },
  syncBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 6 },
  syncBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.bgCard, marginBottom: 12, fontSize: 14, color: colors.text },
  row: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  invoice: { fontWeight: '700', fontSize: 13, color: colors.primary, fontFamily: 'monospace' },
  client: { fontSize: 13, color: colors.text, marginTop: 2 },
  date: { fontSize: 11, color: colors.textMuted },
  amount: { fontWeight: '800', fontSize: 15, color: colors.text },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgCard, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%' },
  modalTitle: { fontWeight: '800', fontSize: 16, marginBottom: 14, color: colors.text },
  receipt: { backgroundColor: colors.bg, borderRadius: 12, padding: 14, marginBottom: 16 },
  receiptCenter: { textAlign: 'center', fontWeight: '700', fontSize: 13, color: colors.text, marginBottom: 2, fontFamily: 'monospace' },
  receiptLine: { fontSize: 12, color: colors.text, fontFamily: 'monospace', marginBottom: 2 },
  receiptDivider: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', marginVertical: 4 },
  modalActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 8 },
  btnPrimary: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  btnSecondary: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnDanger: { backgroundColor: colors.danger, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  note: { fontSize: 12, color: colors.warningTextDark, backgroundColor: colors.warningBg, borderRadius: 8, padding: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: colors.bg, marginBottom: 10, color: colors.text },
  payRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  payBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  payBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  payBtnText: { fontSize: 12, fontWeight: '600', color: colors.text },
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
