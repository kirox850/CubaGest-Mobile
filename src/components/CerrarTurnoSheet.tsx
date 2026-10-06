import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable, TouchableOpacity } from 'react-native';
import { colors } from '../config/theme';
import { Btn, Inp, showToast } from './UI';
import { ClosingAPI } from '../api/endpoints';
import { isOfflineError } from '../api/client';
import { getOfflineProducts } from '../offline/offlineStore';

/**
 * Contar y cerrar el turno.
 *
 * La otra mitad de la cadena: abrir turno cuenta la apertura, cerrar turno cuenta
 * el cierre. Los dos son obligatorios y los dos son libres de rellenar —se puede
 * aceptar todo tal cual—, porque un cierre sin foto deja un hueco que hereda el
 * turno siguiente como si fuera descuadre suyo.
 *
 * Manda el conteo a /shift/end, que es el MISMO handler que la pantalla de
 * cierres: una sola manera de cerrar un periodo, o una de las dos se queda sin
 * conciliar.
 */
export default function CerrarTurnoSheet({
  visible, openingReadingId, locationName, baseCash, onConfirm, onCerrar, onCancel,
}: {
  visible: boolean;
  openingReadingId: string;
  locationName: string;
  baseCash?: Record<string, number>;
  onConfirm: (payload: { items: any[]; countedCash: Record<string, number>; notes?: string; countedAt: string }) => Promise<void>;
  onCerrar: () => void;
  onCancel: () => void;
}) {
  const [conteo, setConteo] = useState<{ productId: string; productName: string; esperado: number; contado: number }[]>([]);
  const [monedas, setMonedas] = useState<{ cur: string; valor: string }[]>([{ cur: 'CUP', valor: '' }]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // El esperado del cierre ya descuenta lo vendido. Lo calcula el backend: pedirlo
  // aquí evita tener dos fórmulas de "cuánto debería haber" en dos sitios.
  useEffect(() => {
    if (!visible || !openingReadingId) return;
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const r: any = await ClosingAPI.preview(openingReadingId);
        if (!vivo) return;
        const filas: any[] = r?.stock || r?.items || [];
        setConteo(filas.map((i: any) => ({
          productId: i.productId,
          productName: i.productName || i.productCode || '',
          esperado: Number(i.stockExpected ?? 0),
          contado: Number(i.stockExpected ?? 0),
        })));
        const base: any = r?.baseCash || {};
        setMonedas(Object.keys(base).length
          ? Object.keys(base).map((k) => ({ cur: k, valor: String(base[k] ?? '') }))
          : [{ cur: 'CUP', valor: '' }]);
      } catch (e) {
        if (isOfflineError(e)) {
          const cached = await getOfflineProducts();
          if (vivo && cached.length) {
            setConteo(cached.map((p) => ({ productId: p.id, productName: p.name, esperado: Number(p.localStock) || 0, contado: Number(p.localStock) || 0 })));
            const base = baseCash || {};
            setMonedas(Object.keys(base).length
              ? Object.keys(base).map((k) => ({ cur: k, valor: String(base[k] ?? '') }))
              : [{ cur: 'CUP', valor: '' }]);
          } else if (vivo) showToast('No hay productos guardados para contar esta caja.', 'error');
        } else showToast('No se pudo cargar la caja: ' + (e as Error).message, 'error');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [visible, openingReadingId, baseCash]);

  if (!visible) return null;

  const confirmar = async () => {
    const countedCash: Record<string, number> = {};
    for (const m of monedas) {
      const n = Number(String(m.valor).replace(',', '.'));
      if (m.cur && Number.isFinite(n) && n >= 0) countedCash[m.cur] = n;
    }
    setGuardando(true);
    try {
      await onConfirm({
        items: conteo.map((x) => ({ productId: x.productId, stockValidated: Number(x.contado) || 0 })),
        countedCash,
        countedAt: new Date().toISOString(),
      });
      onCerrar();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo cerrar el turno', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onCancel}>
        <Pressable style={{ flex: 1, backgroundColor: colors.bgCard, marginTop: 60, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} onPress={() => {}}>
          <View style={{ padding: 20, paddingBottom: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Cerrar {locationName}</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 1.5 }}>
              Cuenta la mercadería y el dinero. El esperado ya descuenta lo que vendiste
              en el turno. Puedes aceptarlo tal cual si está bien.
            </Text>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 }}>¿Cuánto dinero hay en la caja?</Text>
            {monedas.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Inp value={m.cur} onChangeText={(t: string) => setMonedas(monedas.map((x, j) => j === i ? { ...x, cur: t.toUpperCase().slice(0, 8) } : x))} style={{ width: 90 }} />
                <Inp
                  value={m.valor}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  onChangeText={(t: string) => setMonedas(monedas.map((x, j) => j === i ? { ...x, valor: t } : x))}
                  style={{ flex: 1 }}
                />
              </View>
            ))}

            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 14, marginBottom: 8 }}>Cuenta la mercadería</Text>
            {cargando && <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cargando la caja…</Text>}
            {conteo.map((r) => {
              const d = Math.round(((Number(r.contado) || 0) - Number(r.esperado)) * 1000) / 1000;
              const cambia = Math.abs(d) > 0.001;
              return (
                <View key={r.productId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1, color: colors.text, fontSize: 13 }} numberOfLines={1}>{r.productName}</Text>
                  <Text style={{ width: 50, textAlign: 'right', color: colors.textMuted, fontSize: 12 }}>{r.esperado}</Text>
                  <Inp
                    value={String(r.contado)}
                    keyboardType="decimal-pad"
                    onChangeText={(t: string) => setConteo(prev => prev.map((x) => (x.productId === r.productId ? { ...x, contado: t === '' ? 0 : Number(t) } : x)))}
                    style={{ width: 82, textAlign: 'right' } as any}
                  />
                  <Text style={{ width: 48, textAlign: 'right', fontWeight: '700', fontSize: 12, color: !cambia ? colors.success : (d < 0 ? colors.danger : colors.warning) }}>
                    {!cambia ? 'OK' : (d < 0 ? `-${Math.abs(d)}` : `+${d}`)}
                  </Text>
                </View>
              );
            })}
            {!cargando && conteo.length === 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                Esta caja no tiene productos que contar.
              </Text>
            )}
          </ScrollView>

          <View style={{ padding: 20, gap: 8 }}>
            <Btn label={guardando ? 'Cerrando…' : 'Contar y cerrar el turno'} onPress={confirmar} disabled={guardando || cargando} />
            <Btn variant="ghost" label="Cancelar" onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
