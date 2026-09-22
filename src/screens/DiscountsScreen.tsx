import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { DiscountsAPI, LocationsAPI } from '../api/endpoints';
import { colors, radius, shadow, themeRef } from '../config/theme';
import { Badge, EmptyState, ErrorBanner, SectionHeader, PageHeader } from '../components/UI';

// ─── DESCUENTOS (admin) — paridad con DiscountsAdmin de la web ───────────────
// MISMO payload que la web: los enums del backend son EXACTOS
//   scope: "venta" | "producto"      type: "porcentaje" | "fijo"
//   locationScope: "todas" | "seleccion"
// Usar otros valores hace que el API responda "type inválido".

const emptyForm = {
  name: '', code: '', scope: 'venta', type: 'porcentaje', value: '',
  maxUses: '', locationScope: 'todas', locationIds: [] as string[], active: true,
};

export default function DiscountsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, l] = await Promise.all([DiscountsAPI.list(), LocationsAPI.list()]);
      setList(d || []);
      setLocs(l || []);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!form.name || !form.value) { setError('Nombre y valor son requeridos'); return; }
    if (form.type === 'porcentaje' && Number(form.value) > 100) { setError('El % no puede ser mayor a 100'); return; }
    if (form.locationScope === 'seleccion' && form.locationIds.length === 0) { setError('Selecciona al menos una ubicación'); return; }
    setSaving(true); setError('');
    try {
      await DiscountsAPI.create({
        name: form.name,
        code: form.code.trim() || undefined,
        scope: form.scope,
        type: form.type,
        value: Number(form.value),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        locationScope: form.locationScope,
        locationIds: form.locationScope === 'seleccion' ? form.locationIds : [],
        active: form.active,
      });
      setForm({ ...emptyForm });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  };

  const remove = (d: any) => {
    Alert.alert('Eliminar descuento', `¿Eliminar "${d.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try { await DiscountsAPI.remove(d.id); load(); }
          catch (e) { setError((e as Error).message); }
        },
      },
    ]);
  };

  const toggleActive = async (d: any) => {
    try {
      await DiscountsAPI.update(d.id, { active: !d.active });
      load();
    } catch (e) { setError((e as Error).message); }
  };

  const toggleLoc = (id: string) => {
    setForm((f) => ({
      ...f,
      locationIds: f.locationIds.includes(id)
        ? f.locationIds.filter((x) => x !== id)
        : [...f.locationIds, id],
    }));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.wrap}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <ErrorBanner message={error} />

        <PageHeader
          title="Descuentos"
          subtitle="Solo el administrador puede crearlos o eliminarlos. Los de tipo Venta se aplican al total en el POS."
        />

        {/* ── Formulario de creación ── */}
        <View style={styles.formCard}>
          <Text style={styles.label}>Nombre *</Text>
          <TextInput style={styles.input} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ej: Rebaja verano" placeholderTextColor={colors.textMuted} />

          <Text style={styles.label}>Código corto (opcional)</Text>
          <TextInput style={styles.input} value={form.code} onChangeText={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} placeholder="Ej: VERANO10" autoCapitalize="characters" placeholderTextColor={colors.textMuted} />

          <Text style={styles.label}>Aplica a</Text>
          <View style={styles.segRow}>
            {([['venta', 'Total de la venta'], ['producto', 'Por producto (línea)']] as const).map(([v, l]) => (
              <TouchableOpacity key={v} style={[styles.segBtn, form.scope === v && styles.segBtnOn]} onPress={() => setForm((f) => ({ ...f, scope: v }))}>
                <Text style={[styles.segText, form.scope === v && styles.segTextOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Tipo</Text>
          <View style={styles.segRow}>
            {([['porcentaje', 'Porcentaje (%)'], ['fijo', 'Monto fijo']] as const).map(([v, l]) => (
              <TouchableOpacity key={v} style={[styles.segBtn, form.type === v && styles.segBtnOn]} onPress={() => setForm((f) => ({ ...f, type: v }))}>
                <Text style={[styles.segText, form.type === v && styles.segTextOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{form.type === 'porcentaje' ? 'Valor (%) *' : 'Valor (monto) *'}</Text>
              <TextInput style={styles.input} value={form.value} onChangeText={(v) => setForm((f) => ({ ...f, value: v }))} keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Usos máximos</Text>
              <TextInput style={styles.input} value={form.maxUses} onChangeText={(v) => setForm((f) => ({ ...f, maxUses: v }))} keyboardType="number-pad" placeholder="∞" placeholderTextColor={colors.textMuted} />
            </View>
          </View>

          <Text style={styles.label}>Disponible en</Text>
          <View style={styles.segRow}>
            {([['todas', 'Todas las ubicaciones'], ['seleccion', 'Solo algunas']] as const).map(([v, l]) => (
              <TouchableOpacity key={v} style={[styles.segBtn, form.locationScope === v && styles.segBtnOn]} onPress={() => setForm((f) => ({ ...f, locationScope: v }))}>
                <Text style={[styles.segText, form.locationScope === v && styles.segTextOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {form.locationScope === 'seleccion' && (
            <View style={styles.locWrap}>
              {locs.length === 0 && <Text style={styles.locEmpty}>No hay ubicaciones registradas</Text>}
              {locs.map((l: any) => {
                const on = form.locationIds.includes(l.id);
                return (
                  <TouchableOpacity key={l.id} style={[styles.locChip, on && styles.locChipOn]} onPress={() => toggleLoc(l.id)}>
                    <Text style={[styles.locText, on && styles.locTextOn]}>{on ? '✓ ' : ''}{l.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TouchableOpacity style={[styles.btn, saving && { opacity: 0.65 }]} onPress={create} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Crear descuento</Text>}
          </TouchableOpacity>
        </View>

        {/* ── Lista existente ── */}
        <SectionHeader title={`Activos (${list.length})`} />
        {list.length === 0 && !loading && <EmptyState text="Aún no hay descuentos creados" icon="🏷️" />}
        {list.map((d: any) => (
          <View key={d.id} style={[styles.item, shadow.sm]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{d.name}{d.code ? ` · ${d.code}` : ''}</Text>
              <View style={styles.itemMetaRow}>
                <Badge
                  label={d.type === 'porcentaje' ? `${d.value}%` : `$${d.value}`}
                  color={colors.primary}
                />
                <Text style={styles.itemMeta}>
                  {d.scope === 'venta' ? 'Venta' : 'Producto'} · {d.locationScope === 'todas' ? 'Todas las ubicaciones' : `${(d.locationIds || []).length} ubicación(es)`}
                  {d.maxUses ? ` · máx ${d.maxUses}` : ' · ∞ usos'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.itemBtn, d.active ? styles.itemBtnOn : styles.itemBtnOff]} onPress={() => toggleActive(d)}>
              <Text style={[styles.itemBtnText, { color: d.active ? colors.success : colors.textMuted }]}>{d.active ? 'Activo' : 'Pausado'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.itemDel} onPress={() => remove(d)}>
              <Text style={styles.itemDelText}>🗑</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 12, paddingBottom: 40 },

  formCard: {
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14, marginBottom: 16,
  },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    backgroundColor: colors.bg, color: colors.text,
  },
  twoCols: { flexDirection: 'row', gap: 10 },

  segRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  segBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center', backgroundColor: colors.bg,
  },
  segBtnOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  segText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  segTextOn: { color: colors.primary, fontWeight: '800' },

  locWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  locChip: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.bg,
  },
  locChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  locText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  locTextOn: { color: colors.primary, fontWeight: '800' },
  locEmpty: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },

  btn: {
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginTop: 18, ...shadow.md,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 8,
  },
  itemName: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  itemMeta: { fontSize: 11.5, color: colors.textMuted, flex: 1 },
  itemBtn: {
    borderWidth: 1.5, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5,
  },
  itemBtnOn: { borderColor: colors.success, backgroundColor: colors.successBg },
  itemBtnOff: { borderColor: colors.border, backgroundColor: colors.bgSecondary },
  itemBtnText: { fontSize: 11, fontWeight: '800' },
  itemDel: { padding: 6 },
  itemDelText: { fontSize: 16 },
});

// Estilos VIVOS: se reconstruyen cuando cambia el tema (dark mode).
let __stylesVersion = -1;
let __styles: ReturnType<typeof createStyles> | null = null;
const styles = new Proxy({} as ReturnType<typeof createStyles>, {
  get(_t, prop) {
    if (__stylesVersion !== themeRef.version || !__styles) {
      __styles = createStyles();
      __stylesVersion = themeRef.version;
    }
    return __styles[prop as keyof ReturnType<typeof createStyles>];
  },
});

