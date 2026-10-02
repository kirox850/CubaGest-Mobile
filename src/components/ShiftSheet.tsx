// ─── ABRIR TURNO ─────────────────────────────────────────────────────────────
//
// El cajero elige con qué caja trabaja, de entre las que el admin le asignó. El
// POS, el inventario y el cierre salen de ahí: si el turno dice caja 2, todas
// las ventas van a la caja 2.
//
// DOS REGLAS QUE NO SON ESTÉTICAS:
//
// 1. La caja se SELECCIONA al tocar y el turno se ABRE al confirmar. Si el turno
//    abriera en el toque, un dedo en el sitio equivocado ya habría creado la
//    lectura de apertura — y no hay forma de volver atrás. La lectura de
//    apertura es el punto de partida del conteo: deshacerla no es un "cancelar".
//
// 2. Sin cajas asignadas se dice a QUIÉN pedirle una, con nombre y sin rodeos.
//    Una lista vacía sin explicación hace que el cajero piense que la app está
//    rota y que su turno no sirve para nada.
//
// El dinero con el que abre la caja se pregunta porque es el dato del que
// depende TODA la conciliación: sin él, cualquier faltante posterior es
// imposible de atribuir. "Cobraron de más" y "faltaba esto al abrir" se ven
// igual si el fondo no se registró.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { colors, themeRef, shadow } from '../config/theme';
import { Btn, Inp, showToast } from './UI';
import Icon from './Icon';
import { baseCashDe, type FilaMoneda } from '../config/cierreDinero';
import { ClosingAPI, ProductsAPI } from '../api/endpoints';

import type { AssignedCaja, Shift } from '../types';

export type MonedasBase = FilaMoneda[];

// La regla ("solo monedas con importe real") es pura y vive en config, con sus
// tests; aquí solo se reexporta para quien la importaba desde el componente.
export { baseCashDe };

export default function ShiftSheet({
  visible, cajas, offline, onClose, onAbrir,
}: {
  visible: boolean;
  cajas: AssignedCaja[];
  /** Falló la llamada al servidor: sin red no se puede abrir turno. */
  offline?: boolean;
  onClose: () => void;
  onAbrir: (locationId: string, baseCash: Record<string, number>, items?: { productId: string; contado: number }[]) => Promise<void>;
}) {
  const [elegida, setElegida] = useState<string | null>(null);
  const [monedas, setMonedas] = useState<MonedasBase>([{ cur: 'CUP', valor: '' }]);
  const [enviando, setEnviando] = useState(false);

  // ── El conteo de apertura ──
  // Abrir turno ES contar la caja. Antes el servidor copiaba el stock actual y lo
  // llamaba lectura: el sistema se verificaba a sí mismo y la caja quedaba sin
  // contar en cada cambio de turno.
  //
  // OBLIGATORIO pasar por aquí, LIBRE de rellenarlo: el cajero puede aceptar lo
  // que ve tal cual y seguir. Eso es firma, no error — si después hay faltante, es
  // de quien aceptó contar y no contó.
  //
  // Si el negocio tiene activa la apertura heredada, el paso se salta.
  const [paso, setPaso] = useState<'elegir' | 'contar'>('elegir');
  const [conteo, setConteo] = useState<{ productId: string; productName: string; unit: string; esperado: number; contado: number }[]>([]);
  const [cadena, setCadena] = useState<any>(null);
  const [cargandoConteo, setCargandoConteo] = useState(false);

  if (!visible) return null;

  /**
   * Pregunta al servidor el estado de la cadena de esa caja. El "esperado" tiene
   * que ser el que el backend va a usar de verdad: calcularlo en el teléfono
   * daría un número que, con ventas sin sincronizar, no coincidiría.
   */
  const irAContar = async (locationId: string) => {
    setCargandoConteo(true);
    try {
      const [chain, productos]: any[] = await Promise.all([
        ClosingAPI.chain(locationId),
        ProductsAPI.list(),
      ]);
      const esp = new Map<string, number>(
        (chain?.esperado?.items || []).map((x: any) => [String(x.productId), Number(x.diff || 0)]),
      );
      setConteo((productos || []).map((p: any) => {
        const e = esp.get(String(p.id)) ?? 0;
        return { productId: p.id, productName: p.name, unit: p.unit || 'u', esperado: e, contado: e };
      }));
      setCadena(chain);
      setPaso('contar');
    } catch (e) {
      showToast('No se pudo cargar la caja: ' + (e as Error).message, 'error');
    } finally {
      setCargandoConteo(false);
    }
  };

  const empezar = async () => {
    if (!elegida || enviando) return;
    try {
      setEnviando(true);
      await onAbrir(elegida, baseCashDe(monedas), conteo.map((r) => ({ productId: r.productId, contado: Number(r.contado) || 0 })));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.bg} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title}>Comenzar turno</Text>
            <Text style={s.subtitle}>
              Elige la caja en la que vas a trabajar hoy. Todo lo que vendas y cuentes irá a esa caja.
            </Text>
          </View>

          <ScrollView bounces={false} style={{ maxHeight: 400 }} contentContainerStyle={{ padding: 22, paddingTop: 0, gap: 10 }}>
            {cajas.length === 0 ? (
              <View style={s.sinCajas}>
                <Text style={s.sinCajasTitle}>No tienes ninguna caja asignada</Text>
                <Text style={s.sinCajasText}>
                  Pídele al administrador de tu negocio que te asigne una caja desde Configuración.
                  Te puede asignar varias si rotas entre varios mostradores.
                </Text>
              </View>
            ) : (
              <>
                {cajas.map((c) => {
                  const marcada = elegida === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => !enviando && setElegida(c.id)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: marcada }}
                      style={[
                        s.caja,
                        marcada && s.cajaElegida,
                        enviando && { opacity: 0.6 },
                      ]}
                    >
                      <View style={[s.radio, marcada && s.radioMarcado]}>
                        {marcada && <Icon name="check" size={12} color="#fff" />}
                      </View>
                      <Icon name="pos" size={20} color={marcada ? colors.primary : colors.textMuted} />
                      <Text style={s.cajaNombre}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}

                <View style={s.dinero}>
                  <Text style={s.dineroTitle}>¿Con cuánto dinero abres la caja?</Text>
                  <Text style={s.dineroText}>
                    Es el fondo con el que sales hoy. Al final del turno se compara con lo que haya
                    y con lo que se vendió, para saber si falta algo.
                  </Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {monedas.map((m, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <Inp
                          style={{ width: 92 }}
                          value={m.cur}
                          onChangeText={(v) => setMonedas(monedas.map((x, j) => (j === i ? { ...x, cur: v.toUpperCase().slice(0, 8) } : x)))}
                          autoCapitalize="characters"
                          placeholder="Moneda"
                        />
                        <Inp
                          style={{ flex: 1 }}
                          value={m.valor}
                          onChangeText={(v) => setMonedas(monedas.map((x, j) => (j === i ? { ...x, valor: v } : x)))}
                          keyboardType="decimal-pad"
                          placeholder="0"
                        />
                        {monedas.length > 1 && (
                          <TouchableOpacity
                            onPress={() => setMonedas(monedas.filter((_, j) => j !== i))}
                            style={s.quitar}
                            accessibilityLabel={`Quitar ${m.cur}`}
                          >
                            <Icon name="minus" size={14} color={colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    <Btn
                      variant="ghost"
                      icon="plus"
                      label="Añadir otra moneda"
                      onPress={() => setMonedas([...monedas, { cur: '', valor: '' }])}
                      style={{ alignSelf: 'flex-start' }}
                    />
                  </View>
                </View>
              </>
            )}

            {offline && (
              // Con red caída el turno no se puede abrir: la lectura de apertura
              // la crea el servidor y es el punto de partida del conteo. Ábrelo
              // con internet una vez.
              <Text style={s.offline}>Sin conexión no se puede abrir turno. Ábrelo con internet una vez.</Text>
            )}

            <View style={{ gap: 8, marginTop: 4 }}>
              {paso === 'contar' ? (
                <>
                  {cadena?.esperado?.faltaEslabon && (
                    <View style={s.sinCajas}>
                      <Text style={s.sinCajasTitle}>Falta un eslabón de esta caja</Text>
                      <Text style={s.sinCajasText}>
                        {cadena.esperado.eslabonFaltante || 'Falta el cierre anterior de esta caja'}.
                        {'\n'}Los faltantes que veas PUEDEN ser de un turno anterior, no de este.
                      </Text>
                    </View>
                  )}
                  <Text style={s.subtitle}>
                    Cuenta la caja. El esperado es lo que dejó el turno anterior.
                    Puedes aceptar todo tal cual si está bien: eso también vale.
                  </Text>
                  <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
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
                            onChangeText={(t: string) => setConteo(prev =>
                              prev.map((x) => (x.productId === r.productId ? { ...x, contado: t === '' ? 0 : Number(t) } : x)),
                            )}
                            style={{ width: 82, textAlign: 'right' } as any}
                          />
                          <Text style={{ width: 48, textAlign: 'right', fontWeight: '700', fontSize: 12, color: !cambia ? colors.success : (d < 0 ? colors.danger : colors.warning) }}>
                            {!cambia ? 'OK' : (d < 0 ? `-${Math.abs(d)}` : `+${d}`)}
                          </Text>
                        </View>
                      );
                    })}
                    {conteo.length === 0 && (
                      <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                        Esta caja no tiene productos que contar.
                      </Text>
                    )}
                  </ScrollView>
                  <Btn
                    label={enviando ? 'Abriendo turno…' : 'Abrir turno con este conteo'}
                    onPress={empezar}
                    disabled={!elegida || enviando}
                  />
                  <Btn variant="ghost" label="Volver atrás" onPress={() => setPaso('elegir')} />
                </>
              ) : (
                <>
                  <Btn
                    label={cargandoConteo ? 'Cargando la caja…' : (cadena?.aperturaHeredada ? 'Comenzar turno' : 'Continuar al conteo')}
                    onPress={() => elegida && (cadena?.aperturaHeredada ? empezar() : irAContar(elegida))}
                    disabled={!elegida || enviando || cargandoConteo}
                  />
                  {!cadena?.aperturaHeredada && (
                    <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>
                      Después vas a contar la caja. Puedes aceptarla tal cual si está bien.
                    </Text>
                  )}
                  <Btn variant="ghost" label="Ahora no" onPress={onClose} />
                </>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Banda de arriba del POS: en qué caja se está y cuánto lleva abierto. */
export function ShiftBadge({ shift, onTerminar }: { shift: Shift; onTerminar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const desde = new Date(shift.startedAt).getTime();
  const minutosTotales = Number.isFinite(desde) ? Math.max(0, Date.now() - desde) : 0;
  const horas = Math.floor(minutosTotales / 3_600_000);
  const mins = Math.floor((minutosTotales % 3_600_000) / 60_000);

  return (
    <View style={s.badge}>
      <View style={s.badgeLeft}>
        <View style={s.punto} />
        <Text style={s.badgeCaja} numberOfLines={1}>{shift.locationName}</Text>
        <Text style={s.badgeTiempo}>
          {horas > 0 ? `${horas}h ${mins}m` : `${mins} min`}
        </Text>
      </View>
      {!confirmando ? (
        <TouchableOpacity onPress={() => setConfirmando(true)} style={s.badgeBtn}>
          <Text style={s.badgeBtnText}>Terminar turno</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.badgeConf}>
          <Text style={s.badgeTiempo}>¿Seguro?</Text>
          <TouchableOpacity onPress={onTerminar} style={[s.badgeBtn, s.badgeBtnPrimario]}>
            <Text style={[s.badgeBtnText, { color: '#fff' }]}>Sí, terminar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setConfirmando(false)} style={s.badgeBtn}>
            <Text style={s.badgeBtnText}>No</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: colors.bgCard, borderRadius: 18, width: '100%', maxWidth: 440, overflow: 'hidden', ...shadow.lg },
  header: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  caja: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  cajaElegida: { borderColor: colors.primary, backgroundColor: colors.inputBg },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
  radioMarcado: { borderColor: colors.primary, backgroundColor: colors.primary },
  cajaNombre: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  sinCajas: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 12, padding: 14 },
  sinCajasTitle: { fontWeight: '700', color: colors.warningTextDark, marginBottom: 4, fontSize: 13 },
  sinCajasText: { fontSize: 13, color: colors.warningTextDark, lineHeight: 19 },
  dinero: { marginTop: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  dineroTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
  dineroText: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  quitar: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerBg },
  offline: { fontSize: 12, color: colors.warningTextDark, lineHeight: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.inputBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  badgeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  badgeCaja: { fontSize: 13, fontWeight: '700', color: colors.text, flexShrink: 1 },
  badgeTiempo: { fontSize: 12, color: colors.textMuted },
  badgeConf: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeBtnPrimario: { backgroundColor: colors.primary },
  badgeBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
});

// Estilos VIVOS: se reconstruyen cuando cambia el tema (dark mode).
let __stylesVersion = -1;
let __styles: ReturnType<typeof createStyles> | null = null;
export const s = new Proxy({} as ReturnType<typeof createStyles>, {
  get(_t, prop) {
    if (__stylesVersion !== themeRef.version || !__styles) {
      __styles = createStyles();
      __stylesVersion = themeRef.version;
    }
    return __styles[prop as keyof ReturnType<typeof createStyles>];
  },
});
