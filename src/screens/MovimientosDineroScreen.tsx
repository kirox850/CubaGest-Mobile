// ─── ENTRADAS Y SALIDAS DE DINERO ────────────────────────────────────────────
//
// Cuando alguien saca plata de la caja, el cierre la ve como faltante y avisa de
// un robo que no ocurrió. Esta pantalla es la que rompe esa ambigüedad: si el
// dueño retiró y se anotó, el cierre lo sabe y no marca un descuadre.
//
// Es también la cola de trabajo del admin y el contador: cada salida queda
// `pendiente` y alguien tiene que decidir. Y el backend avisa por push a quien
// registró, así que si le rechazan un retiro lo sabe en el momento en vez de
// descubrirlo en el cierre de la noche (cashMovements.ts:202-212).
//
// El botón de aprobar solo se enseña a quien puede: el backend es
// requireRole("admin", "contador"). Y el filtro de "nadie aprueba lo que él
// mismo registró" NO se puede hacer aquí: `GET /cash-movements` devuelve el
// NOMBRE de quien registró, no su id, así que el cliente no puede saberlo. Ese
// filtro lo aplica el servidor con un 403, y el mensaje se muestra tal cual.

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CashMovementsAPI, LocationsAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useShift } from '../hooks/useShift';
import { colors, themeRef } from '../config/theme';
import { CURRENCY_SYMBOLS } from '../config/roles';
import { validarMovimiento, puedeAprobar, sePuedeDecidir, type TipoMovimiento } from '../config/movimientoDinero';
import { Badge, Btn, EmptyState, ErrorBanner, Inp, Sel, PageHeader, SkeletonRows, SectionCard, showToast } from '../components/UI';
import { showConfirm, showError } from '../components/dialogs';
import Icon from '../components/Icon';
import type { CashMovement, Location } from '../types';
import {
  cacheMovements, getOfflineMovements,
  cacheLocations, getOfflineLocations,
} from '../offline/offlineStore';

const fmt = (n: number) => (Number(n) || 0).toFixed(2);
const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleString('es-CU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

type Modo = 'list' | 'new' | 'pending';

const ESTADO_COLOR: Record<string, string> = {
  pendiente: colors.warning,
  aprobada: colors.success,
  rechazada: colors.danger,
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export default function MovimientosDineroScreen() {
  const { user } = useAuth();
  const { shift } = useShift(user?.id);

  const [modo, setModo] = useState<Modo>('list');
  const [todos, setTodos] = useState<CashMovement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Formulario de nuevo movimiento
  const [tipo, setTipo] = useState<TipoMovimiento>('salida');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [moneda, setMoneda] = useState('CUP');
  const [cajaId, setCajaId] = useState('');

  const cargar = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const lista = await CashMovementsAPI.list();
      setTodos(lista);
      void cacheMovements(lista).catch(() => {});
    } catch (e) {
      // Sin red se muestran los movimientos ya registrados. El saldo de la caja
      // no se inventa: se enseña lo que el servidor confirmó la última vez que
      // hubo conexión, y se dice que viene de la copia local.
      const local = await getOfflineMovements();
      if (local.length > 0) {
        setTodos(local);
        setError('Sin conexión con el servidor — mostrando los movimientos guardados en este dispositivo');
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void cargar();
    LocationsAPI.list()
      .then((locs) => {
        setLocations(locs);
        setCajaId((prev) => prev || locs.find((l) => l.type === 'caja' && l.active !== false)?.id || '');
        void cacheLocations(locs).catch(() => {});
      })
      .catch(async () => {
        const local = await getOfflineLocations();
        if (local.length > 0) {
          setLocations(local);
          setCajaId((prev) => prev || local.find((l) => l.type === 'caja' && l.active !== false)?.id || '');
        }
      });
  }, [cargar]));

  // La caja por defecto es la del turno: registrar un retiro en otra caja por
  // la que se está trabajando es casi siempre un error de dedo.
  React.useEffect(() => {
    if (shift?.locationId) setCajaId(shift.locationId);
  }, [shift?.locationId]);

  const registrar = async () => {
    const v = validarMovimiento({
      tipo, monto, motivo, hayTurno: !!shift, role: user?.role || '',
    });
    if (!v.ok) {
      showError(v.error);
      return;
    }
    if (!cajaId) {
      showError('Falta la caja: ' + 'Elige en qué caja entra o sale el dinero.');
      return;
    }
    try {
      setSaving(true);
      await CashMovementsAPI.create({
        locationId: cajaId,
        type: tipo,
        amount: Number(String(monto).replace(',', '.')),
        currency: moneda,
        reason: tipo === 'salida' ? motivo.trim() : motivo.trim() || undefined,
      });
      showToast(tipo === 'salida' ? 'Salida registrada. Queda pendiente de aprobación.' : 'Entrada registrada.', 'success');
      setMonto('');
      setMotivo('');
      setModo('list');
      await cargar();
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const decidir = async (m: CashMovement, decision: 'aprobar' | 'rechazar') => {
    const ok = await showConfirm(
      decision === 'aprobar'
        ? `¿Apruebas la salida de ${fmt(m.amount)} ${m.currency}?`
        : `¿Rechazas la salida de ${fmt(m.amount)} ${m.currency}? Se le avisará a quien la registró.`,
    );
    if (!ok) return;
    try {
      await CashMovementsAPI.decide(m.id, decision);
      await cargar();
    } catch (e) {
      showError((e as Error).message);
    };
  };

  const pendientes = todos.filter((m) => m.status === 'pendiente');
  const visibles = modo === 'pending' ? pendientes : todos;

  if (modo === 'new') {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.back} onPress={() => setModo('list')}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <PageHeader title="Registrar movimiento" />
        <ErrorBanner message={error} />

        <SectionCard title="Tipo de movimiento">
          <View style={styles.tipoRow}>
            {(['entrada', 'salida'] as TipoMovimiento[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTipo(t)}
                style={[styles.tipo, tipo === t && styles.tipoActivo]}
              >
                <Icon name={t === 'entrada' ? 'plus' : 'minus'} size={16} color={tipo === t ? '#fff' : colors.textMuted} />
                <Text style={[styles.tipoText, tipo === t && { color: '#fff' }]}>
                  {t === 'entrada' ? 'Entrada' : 'Salida'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {tipo === 'entrada'
              ? 'Dinero que entra en la caja: cambio devuelto, reposición de un faltante.'
              : 'Dinero que sale de la caja. Necesita motivo: sin él, el cierre lo verá como un faltante.'}
          </Text>
        </SectionCard>

        <SectionCard title="Importe">
          <View style={styles.filaImporte}>
            <Inp
              style={{ flex: 1, fontSize: 20, fontWeight: '700' }}
              value={monto}
              onChangeText={setMonto}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <View style={{ width: 110 }}>
              <Sel
                value={moneda}
                onValueChange={setMoneda}
                items={Object.keys(CURRENCY_SYMBOLS).map((c) => ({ label: c, value: c }))}
              />
            </View>
          </View>
        </SectionCard>

        <SectionCard title="Caja">
          <Sel
            value={cajaId}
            onValueChange={setCajaId}
            items={[
              { label: 'Seleccione...', value: '' },
              ...locations.filter((l) => l.active !== false).map((l) => ({ label: l.name, value: l.id })),
            ]}
          />
          {!shift && tipo === 'salida' && user?.role !== 'admin' && (
            <Text style={styles.aviso}>
              ⚠ No tienes turno abierto. Una salida necesita un turno: el backend la rechazará
              con «Abre tu turno antes de registrar una salida de dinero».
            </Text>
          )}
        </SectionCard>

        <SectionCard title="Motivo">
          <Inp
            value={motivo}
            onChangeText={setMotivo}
            placeholder={tipo === 'salida' ? 'El dueño retiró para pagar el agua' : 'Opcional'}
          />
          {tipo === 'salida' && (
            <Text style={styles.hint}>
              Sin motivo no se puede registrar. Es la diferencia entre un retiro anotado y un robo
              sin explicar.
            </Text>
          )}
        </SectionCard>

        <Btn label={saving ? 'Guardando…' : 'Registrar'} onPress={registrar} disabled={saving} />
        <Btn variant="ghost" label="Cancelar" onPress={() => setModo('list')} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <PageHeader
        title="Entradas y salidas"
        subtitle="Dinero que entra y sale de la caja. Sin esto, una salida aparece como faltante en el cierre."
      />
      <ErrorBanner message={error} />

      <View style={styles.acciones}>
        <Btn label="Registrar movimiento" icon="cash" onPress={() => setModo('new')} />
        {pendientes.length > 0 && (
          <Btn
            variant={modo === 'pending' ? 'primary' : 'secondary'}
            label={`Pendientes (${pendientes.length})`}
            onPress={() => setModo(modo === 'pending' ? 'list' : 'pending')}
          />
        )}
      </View>

      {/* Un movimiento de dinero es un importe y un concepto. Un spinner los
          esconde y además recentra la pantalla, así que al llegar la lista el
          contenido salta de golpe: es peor que esperar. El esqueleto mantiene
          la forma y la posición. */}
      {loading ? <SkeletonRows n={6} h={62} /> : (
        <FlatList
          data={visibles}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingBottom: 32, gap: 8 }}
          ListEmptyComponent={
            <EmptyState
              icon="cash"
              text={modo === 'pending' ? 'No hay salidas esperando aprobación' : 'Todavía no hay movimientos de dinero'}
            />
          }
          renderItem={({ item: m }) => (
            <View style={styles.row}>
              <View style={[styles.signo, m.type === 'entrada' ? styles.entrada : styles.salida]}>
                <Icon name={m.type === 'entrada' ? 'plus' : 'minus'} size={14} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.monto}>
                  {m.type === 'entrada' ? '+' : '−'}{CURRENCY_SYMBOLS[m.currency] || ''}{fmt(m.amount)} {m.currency}
                </Text>
                {m.reason ? <Text style={styles.motivo}>{m.reason}</Text> : null}
                <Text style={styles.meta}>
                  {m.locationName || '—'} · {m.userName} · {fmtDate(m.createdAt)}
                </Text>
                {m.decisionNote ? <Text style={styles.meta}>Nota: {m.decisionNote}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Badge
                  label={ESTADO_LABEL[m.status] || m.status}
                  color={ESTADO_COLOR[m.status] || colors.primary}
                />
                {sePuedeDecidir(m.status) && puedeAprobar(user?.role, undefined, user?.id) && (
                  <View style={styles.decidir}>
                    <Btn variant="success" label="Aprobar" onPress={() => decidir(m, 'aprobar')} />
                    <Btn variant="danger" label="Rechazar" onPress={() => decidir(m, 'rechazar')} />
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 4 },
  back: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 8 },
  backText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  acciones: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  tipoRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tipo: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  tipoActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoText: { fontSize: 13, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 6 },
  aviso: { fontSize: 12, color: colors.warningTextDark, backgroundColor: colors.warningBg, borderRadius: 10, padding: 8, marginTop: 8, lineHeight: 17 },
  filaImporte: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 },
  signo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  entrada: { backgroundColor: colors.success },
  salida: { backgroundColor: colors.warning },
  monto: { fontSize: 14, fontWeight: '800', color: colors.text },
  motivo: { fontSize: 12, color: colors.text, marginTop: 2 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  decidir: { gap: 6, alignItems: 'stretch' },
});

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
