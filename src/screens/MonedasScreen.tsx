import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SettingsAPI } from '../api/endpoints';
import { colors, themeRef } from '../config/theme';
import { ErrorBanner, Skeleton, showToast } from '../components/UI';
import Icon from '../components/Icon';
import { showError } from '../components/dialogs';

const CURRENCY_OPTIONS = ['CUP', 'USD', 'EUR', 'MLC'];

// ─── Esqueleto de Monedas ────────────────────────────────────────────────────
// Esta pantalla no tenía spinner: pintaba el formulario entero con los valores
// por defecto (solo CUP, tasas vacías) y los corregía en silencio al llegar la
// respuesta. Durante ese rato el negocio parecía tener una moneda y ninguna
// tasa. El esqueleto conserva la altura real de cada tarjeta —cuatro filas de
// moneda, dos modos, tres campos de tasa, botón— para que al cargar los datos
// no se mueva nada bajo el dedo.
const MonedasEsqMonedas = () => (
  <View style={styles.card}>
    {CURRENCY_OPTIONS.map((m, i) => (
      <View key={m} style={styles.curRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton w={44} h={15} />
          {i === 0 && <Skeleton w={150} h={11} />}
        </View>
        <Skeleton w={44} h={26} r={13} />
      </View>
    ))}
  </View>
);

const MonedasEsqTasas = () => (
  <View>
    <View style={styles.card}>
      {[0, 1].map((i) => (
        <View key={i} style={styles.modeRow}>
          <Skeleton w={14} h={14} r={7} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton w={i === 0 ? 62 : 130} h={14} />
            <Skeleton w="80%" h={11} />
          </View>
        </View>
      ))}
    </View>
    <View style={styles.card}>
      <View style={styles.ratesHint}>
        <Skeleton w="65%" h={12} />
      </View>
      {['USD', 'EUR', 'MLC'].map((m) => (
        <View key={m} style={styles.rateRow}>
          <Skeleton w={44} h={14} />
          <Skeleton style={{ flex: 1, height: 34, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }} />
        </View>
      ))}
    </View>
    <Skeleton w="100%" h={46} r={12} style={{ marginTop: 4 }} />
  </View>
);

export default function MonedasScreen({ embedded = false }: { embedded?: boolean }) {
  const [currencies, setCurrencies] = useState<string[]>(['CUP']);
  const [rateMode, setRateMode] = useState<'manual' | 'eltoque'>('manual');
  const [manualRates, setManualRates] = useState<Record<string, string>>({ USD: '', EUR: '', MLC: '' });
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await SettingsAPI.get();
      if (s?.currencies?.length) setCurrencies(s.currencies);
      if (s?.rateMode) setRateMode(s.rateMode);
      const mr = s?.manualRates || {};
      setManualRates({ USD: String(mr.USD || ''), EUR: String(mr.EUR || ''), MLC: String(mr.MLC || '') });
      setRates(s?.rates || {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleCurrency = (m: string) => {
    if (m === 'CUP') return; // moneda base, siempre activa
    setCurrencies((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const save = async () => {
    if (currencies.length === 0) {
      showError('Configuración inválida: ' + 'Debe haber al menos una moneda (CUP).');
      return;
    }
    setSaving(true);
    try {
      const mr: Record<string, number> = {};
      for (const [k, v] of Object.entries(manualRates)) {
        const n = Number(v);
        if (v && !isNaN(n) && n > 0) mr[k] = n;
      }
      await SettingsAPI.update({ currencies, rateMode, manualRates: mr });
      showToast('La configuración de monedas se actualizó', 'success');
      load();
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
      <ErrorBanner message={error} />

{!embedded && <Text style={styles.title}>Monedas del negocio</Text>}
      <Text style={styles.hint}>
        Selecciona las monedas en las que opera tu negocio. Estarán disponibles
        para registrar productos y vender. CUP es la moneda base y siempre está activa.
      </Text>

      {loading ? <MonedasEsqMonedas /> : (
      <View style={styles.card}>
        {CURRENCY_OPTIONS.map((m) => {
          const locked = m === 'CUP';
          const on = currencies.includes(m);
          return (
            <View key={m} style={styles.curRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.curName, locked && { color: colors.textMuted }]}>{m}</Text>
                {locked && <Text style={styles.curHint}>moneda base — siempre activa</Text>}
              </View>
              <Switch value={on} disabled={locked} onValueChange={() => toggleCurrency(m)} thumbColor={on ? colors.primary : colors.textSecondary} trackColor={{ true: colors.primaryLight, false: colors.border }} />
            </View>
          );
        })}
      </View>)}

      <Text style={styles.title}>Tasa de cambio</Text>
      {loading ? <MonedasEsqTasas /> : (<>
      <View style={styles.card}>
        <TouchableOpacity style={styles.modeRow} onPress={() => setRateMode('manual')}>
          <Text style={[styles.modeDot, rateMode === 'manual' && styles.modeDotOn]}>●</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeName}>Manual</Text>
            <Text style={styles.modeHint}>Tú fijas la tasa y la actualizas cuando quieras.</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modeRow} onPress={() => setRateMode('eltoque')}>
          <Text style={[styles.modeDot, rateMode === 'eltoque' && styles.modeDotOn]}>●</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeName}>elToque (automática)</Text>
            <Text style={styles.modeHint}>Se sincroniza sola cada 5 minutos desde el servidor.</Text>
          </View>
        </TouchableOpacity>
      </View>

      {rateMode === 'manual' ? (
        <View style={styles.card}>
          <Text style={styles.ratesHint}>Cuántos CUP vale 1 unidad de cada moneda:</Text>
          {['USD', 'EUR', 'MLC'].map((m) => (
            <View key={m} style={styles.rateRow}>
              <Text style={styles.rateLabel}>{m}</Text>
              <TextInput
                style={styles.rateInput}
                value={manualRates[m]}
                onChangeText={(v) => setManualRates((r) => ({ ...r, [m]: v }))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.ratesHint}>Tasas actuales (elToque):</Text>
          {Object.keys(rates).length > 0 ? (
            Object.entries(rates).map(([k, v]) => (
              <Text key={k} style={styles.rateValue}>{k} = {v} CUP</Text>
            ))
          ) : (
            <Text style={styles.rateValue}>Aún no se han cargado — se obtendrán automáticamente.</Text>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        onPress={save}
        disabled={saving || loading}
      >
        <Text style={styles.saveText}>{saving ? 'Guardando...' : 'Guardar configuración'}</Text>
      </TouchableOpacity>
      </>)}
    </ScrollView>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 17 },
  card: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 6, marginBottom: 12 },
  curRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  curName: { fontSize: 15, fontWeight: '700', color: colors.text },
  curHint: { fontSize: 11, color: colors.textMuted },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  modeDot: { fontSize: 16, color: colors.textSecondary },
  modeDotOn: { color: colors.primary },
  modeName: { fontSize: 14, fontWeight: '700', color: colors.text },
  modeHint: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  ratesHint: { fontSize: 12, color: colors.textMuted, padding: 10, paddingBottom: 4 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6 },
  rateLabel: { width: 44, fontSize: 14, fontWeight: '700', color: colors.text },
  rateInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.bg, color: colors.text, fontSize: 14 },
  rateValue: { fontSize: 13, color: colors.text, paddingHorizontal: 12, paddingVertical: 3 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
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

