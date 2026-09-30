// ─── CAJAS Y REPARTO (solo admin) ───────────────────────────────────────────
//
// Tres cosas que antes solo se podían hacer desde un navegador y que son
// precisamente las que hacen falta en un mostrador:
//
//  1. CREAR una caja. Un negocio con dos mostradores no puede tener dos cajas
//     sin acceso a la web, y sin cajas no hay turnos ni cierres.
//  2. ASIGNAR cajas a un cajero. Con cajas compartidas, "la caja de cada uno"
//     no existe: se puede llevar la caja de otro en otro momento, y por eso hay
//     que saber a quién se le puede abrir turno en cada una.
//
//     Y aquí está la trampa: `PUT /shift/assignments/:userId` es REEMPLAZO
//     TOTAL del juego de cajas, no un toggle. Quitar una caja es quitarla de
//     verdad. Si se dibujara como "tildar" sin avisar, el siguiente guardado
//     borraría asignaciones que el dueño creía haber dejado como estaban.
//
//  3. La TOLERANCIA de descuadre NO está aquí: vive en su propia pantalla,
//     `components/CajaSettings.tsx`, sin filtro de rol. `PUT /settings` no es
//     requireRole("admin") como `POST /locations` y
//     `PUT /shift/assignments/:userId`, y en la web son dos pestañas con gates
//     distintos. Juntas, un cajero se quedaba sin poder ajustar el margen de SU
//     caja, que es el dato que más le afecta.

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LocationsAPI, ShiftAPI, UsersAPI } from '../api/endpoints';
import { colors, themeRef } from '../config/theme';
import { Badge, Btn, EmptyState, ErrorBanner, Inp, SectionCard, Sel, Skeleton, SkeletonText, Spinner, showToast } from '../components/UI';
import Icon from '../components/Icon';
import type { Location, User } from '../types';
import { showError } from '../components/dialogs';

type Vista = 'cajas' | 'asignar';

export default function CajasAdminScreen({ embedded = false }: { embedded?: boolean }) {
  const [vista, setVista] = useState<Vista>('cajas');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Cajas ────────────────────────────────────────────────────────────────
  const [locations, setLocations] = useState<Location[]>([]);
  const [nuevaCaja, setNuevaCaja] = useState('');

  // ── Asignaciones ─────────────────────────────────────────────────────────
  const [cajeros, setCajeros] = useState<User[]>([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [asignadas, setAsignadas] = useState<Record<string, string[]>>({});
  const [editando, setEditando] = useState(false);


  const cargar = useCallback(async () => {
    setError('');
    try {
      setLocations(await LocationsAPI.list());
    } catch (e) {
      setError((e as Error).message);
    }
    try {
      setCajeros((await UsersAPI.list()).filter((u) => u.role === 'cajero'));
    } catch {
      // La lista de cajeros es necesaria solo para el reparto de cajas; si
      // falla, el resto de la pantalla sigue sirviendo.
    }    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const cajas = locations.filter((l) => l.type === 'caja');
  const cajero = cajeros.find((u) => u.id === usuarioId);

  const crearCaja = async () => {
    const nombre = nuevaCaja.trim();
    if (nombre.length < 2) {
      showError('Nombre demasiado corto: ' + 'Ponle un nombre reconocible a la caja.');
      return;
    }
    try {
      setSaving(true);
      await LocationsAPI.create({ name: nombre, type: 'caja' });
      setNuevaCaja('');
      await cargar();
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const abrirAsignar = async (u: User) => {
    setUsuarioId(u.id);
    setEditando(false);
    try {
      // El backend devuelve `{id, name, type, active}`, no solo id y name.
      setAsignadas({ ...asignadas, [u.id]: (await ShiftAPI.assignments(u.id)).map((c) => c.id) });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const alternarCaja = (cajaId: string) => {
    if (!editando) return;
    const actual = asignadas[usuarioId] || [];
    setAsignadas({
      ...asignadas,
      [usuarioId]: actual.includes(cajaId) ? actual.filter((x) => x !== cajaId) : [...actual, cajaId],
    });
  };

  const guardarAsignaciones = async () => {
    try {
      setSaving(true);
      await ShiftAPI.setAssignments(usuarioId, asignadas[usuarioId] || []);
      setEditando(false);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Cajas devuelve `<Spinner/>` a pantalla completa, y aquí el contenido es
  // formulario, no lista: el spinner borra la pantalla entera para luego
  // reconstruirla. El esqueleto deja ver la estructura del formulario mientras
  // llegan los datos, que es justo lo que se lee de reojo mientras se carga.
  if (loading) {
    return (
      <View style={styles.wrap}>
        <Skeleton w="70%" h={20} />
        <SkeletonText lines={2} w="85%" />
        <Skeleton w="100%" h={132} r={14} style={{ marginTop: 16 }} />
        <Skeleton w="100%" h={86} r={14} style={{ marginTop: 12 }} />
        <Skeleton w="100%" h={86} r={14} style={{ marginTop: 12 }} />
      </View>
    );
  }

  // ── Asignación de cajas a un cajero ─────────────────────────────────────
  if (vista === 'asignar' && cajero) {
    const suyas = asignadas[usuarioId] || [];
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.back} onPress={() => setVista('cajas')}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Cajas de {cajero.name}</Text>
        <Text style={styles.subtitle}>
          Las cajas con las que este cajero puede abrir turno. Con varias, la app le preguntará
          cuál usar al empezar.
        </Text>
        <ErrorBanner message={error} />

        {cajas.length === 0 ? (
          <EmptyState icon="pos" text="Primero crea una caja" />
        ) : (
          cajas.map((c) => {
            const marcada = suyas.includes(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => alternarCaja(c.id)}
                style={[styles.caja, marcada && styles.cajaMarcada, !editando && styles.cajaFija]}
              >
                <View style={[styles.check, marcada && styles.checkMarcado]}>
                  {marcada && <Icon name="check" size={12} color="#fff" />}
                </View>
                <Text style={styles.cajaNombre}>{c.name}</Text>
              </Pressable>
            );
          })
        )}

        {editando && (
          <View style={styles.aviso}>
            <Text style={styles.avisoText}>
              ⚠ Guardar reemplaza TODAS las cajas de {cajero.name}. Si le quitas una aquí, deja de
              poder abrir turno en ella — no es una casilla que se pueda dejar "a medias".
            </Text>
          </View>
        )}

        {!editando
          ? <Btn label="Cambiar cajas" icon="edit" onPress={() => setEditando(true)} />
          : (
            <View style={{ gap: 8 }}>
              <Btn label={saving ? 'Guardando…' : 'Guardar cajas'} onPress={guardarAsignaciones} disabled={saving} />
              <Btn
                variant="ghost"
                label="Cancelar"
                onPress={() => { setEditando(false); void abrirAsignar(cajero); }}
              />
            </View>
          )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
{!embedded && <Text style={styles.title}>Cajas</Text>}
      <Text style={styles.subtitle}>
        Los puntos donde se cobra. El almacén central es automático y no se gestiona aquí.
      </Text>
      <ErrorBanner message={error} />

      <SectionCard title="Crear una caja">
        <View style={{ gap: 8 }}>
          <Inp
            value={nuevaCaja}
            onChangeText={setNuevaCaja}
            placeholder="Caja del mostrador 1"
          />
          <Btn
            label={saving ? 'Creando…' : 'Crear caja'}
            icon="plus"
            onPress={crearCaja}
            disabled={saving || nuevaCaja.trim().length < 2}
          />
          <Text style={styles.hint}>
            Crear la caja es el primer paso, pero no alcanza: para vender en ella hay que abrir
            turno, y para eso hace falta que el backend tenga las tablas de turnos.
          </Text>
        </View>
      </SectionCard>

      <Text style={styles.seccion}>CAJAS EXISTENTES</Text>
      {cajas.length === 0 ? (
        <EmptyState icon="pos" text="No hay ninguna caja todavía" />
      ) : (
        cajas.map((c) => {
          const suya = c.ownerUserId;
          return (
            <View key={c.id} style={styles.row}>
              <Icon name="pos" size={20} color={colors.textMuted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cajaNombre}>{c.name}</Text>
                {suya ? (
                  <Text style={styles.hint}>Caja propia de un cajero (del modelo antiguo)</Text>
                ) : (
                  <Text style={styles.hint}>Se abre por TURNO, no por dueño</Text>
                )}
              </View>
              {c.active === false && <Badge label="Inactiva" color={colors.textMuted} />}
            </View>
          );
        })
      )}

      <Text style={styles.seccion}>REPARTO DE CAJAS</Text>
      {cajeros.length === 0 ? (
        <EmptyState icon="usuarios" text="No hay cajeros en esta empresa" />
      ) : (
        cajeros.map((u) => {
          const suyas = asignadas[u.id];
          return (
            <TouchableOpacity key={u.id} style={styles.row} onPress={() => { void abrirAsignar(u); }}>
              <Icon name="usuarios" size={18} color={colors.textMuted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cajaNombre}>{u.name}</Text>
                <Text style={styles.hint}>
                  {suyas === undefined
                    ? 'Toca para ver sus cajas'
                    : suyas.length === 0
                      ? 'Sin cajas asignadas — no puede abrir turno'
                      : `${suyas.length} caja${suyas.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
              <Icon name="x" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 4 },
  back: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 8 },
  backText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 14, lineHeight: 19 },
  seccion: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted, marginTop: 18, marginBottom: 8 },
  acciones: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  caja: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.bgCard },
  cajaMarcada: { borderColor: colors.primary, backgroundColor: colors.inputBg },
  cajaFija: { opacity: 0.9 },
  cajaNombre: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkMarcado: { borderColor: colors.primary, backgroundColor: colors.primary },
  tipo: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.inputBg },
  tipoActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoText: { fontSize: 14, fontWeight: '700', color: colors.text },
  tipoHint: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  aviso: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 10, padding: 10, marginTop: 10 },
  avisoText: { fontSize: 12, color: colors.warningTextDark, lineHeight: 17 },
  avisoTexto: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 6 },
  error: { fontSize: 12, color: colors.danger, lineHeight: 17, marginTop: 6 },
  toggle: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
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
