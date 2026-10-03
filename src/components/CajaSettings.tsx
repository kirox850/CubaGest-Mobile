// ─── CAJA (configuración) — cuánto descuadre se tolera ───────────────────────
//
// Esta pantalla es la que evita el falso positivo que más damage hace en un
// mostrador: un negocio con billetes sueltos da "faltan 63 pesos" todas las
// noches, y un aviso que salta siempre deja de mirarse, que es peor que no
// avisar.
//
// POR QUÉ ESTÁ SEPARADA DE `CajasAdmin` y no en la misma pantalla:
//
//   · `POST /locations` y `PUT /shift/assignments/:userId` son requireRole
//     ("admin"). `PUT /settings` NO lo es. En la web son dos pestañas con dos
//     gates distintos: "Cajas" es de admin y "Cierre de caja" —que es esta— es
//     de cualquiera. Juntas en una pantalla admin, un cajero se queda sin donde
//     fijar la tolerancia de SU caja, que es el dato que más le afecta.
//
//   · Se separan también porque se usan en momentos distintos: el dueño ajusta
//     la tolerancia una vez; el reparto de cajas, cada vez que contrata.
//
// El aviso antes de guardar NO es un detalle de cortesía. El backend recalcula
// los cierres que siguen abiertos de esa caja cuando cambia la tolerancia, y
// eso puede dejar de avisar de un descuadre que ya se le notificó a alguien
// (cashMovements.ts). Guardar sin decirlo sería hacer desaparecer un aviso sin
// que nadie se entere.

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { RecargaAlMontar, RecargaAlEnfocar } from './Recarga';
import { SettingsAPI } from '../api/endpoints';
import { colors, themeRef } from '../config/theme';
import { enRango, errorDeRango, valorDeTolerancia, avisoTolerancia, type ToleranciaModo } from '../config/tolerancia';
import { Btn, ErrorBanner, Inp, SectionCard, Spinner, showToast } from './UI';
import { showError } from './dialogs';
import Icon from './Icon';
import type { CashToleranceMode } from '../types';

const HAY_VARIAS_MONEDAS = true;

export default function CajaSettings({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<ToleranciaModo>('absoluto');
  const [valor, setValor] = useState('');
  const [requiereAprobacion, setRequiereAprobacion] = useState(true);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const s = await SettingsAPI.get();
      setModo((s.cashToleranceMode || 'absoluto') as ToleranciaModo);
      setValor(String(s.cashToleranceValue ?? 0));
      setRequiereAprobacion(s.cashRequireApproval !== false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const guardar = async () => {
    const v = valorDeTolerancia(valor, modo);
    if (v === null) {
      showError('Valor no válido: ' + errorDeRango(valor, modo) || 'Revisa el número.');
      return;
    }
    try {
      setSaving(true);
      await SettingsAPI.update({
        cashToleranceMode: modo as CashToleranceMode,
        cashToleranceValue: v,
        cashRequireApproval: requiereAprobacion,
      });
      await cargar();
      showToast('Tolerancia guardada', 'success');
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // El `return` de carga tiene que montar la recarga TAMBIÉN. Si se deja solo en
  // la rama de abajo, nunca monta: en el primer render `loading` es true, así que
  // se va por aquí, y el hijo que dispara la carga vive en una rama que no se
  // llega a pintar. El esqueleto se queda para siempre.
  const recarga = embedded
    ? <RecargaAlMontar fn={cargar} />
    : <RecargaAlEnfocar fn={cargar} />;

  if (loading) return <View style={styles.wrap}>{recarga}<Spinner /></View>;
  const numero = Number(valor.replace(',', '.')) || 0;

  return (
    <View style={styles.wrap}>
      {recarga}
      {!embedded && (
        <TouchableOpacity style={styles.back} onPress={() => {}}>
          <Text style={styles.backText}>Caja</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.subtitle}>
        Cuánto puede tolerar el cajero antes de que el cierre avise. Por debajo de este margen el
        descuadre se guarda pero no se notifica.
      </Text>
      <ErrorBanner message={error} />

      <SectionCard title="Cómo se mide">
        <View style={{ gap: 8, marginBottom: 12 }}>
          {(['porcentaje', 'absoluto'] as ToleranciaModo[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => { setModo(m); setValor(''); }}
              style={[styles.tipo, modo === m && styles.tipoActivo]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Icon name={m === 'porcentaje' ? 'trend_up' : 'cash'} size={15} color={modo === m ? '#fff' : colors.textMuted} />
                <Text style={[styles.tipoText, modo === m && { color: '#fff' }]}>
                  {m === 'porcentaje' ? 'Porcentaje' : 'Cantidad fija'}
                </Text>
              </View>
              <Text style={[styles.tipoHint, modo === m && { color: '#fff' }]}>
                {m === 'porcentaje'
                  ? 'Del total esperado. Ej: 2% de 10 000 = 200 de margen.'
                  : 'Una cantidad fija, en la moneda base de la caja.'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Inp
          value={valor}
          onChangeText={setValor}
          keyboardType="decimal-pad"
          placeholder={modo === 'porcentaje' ? '0' : '0.00'}
        />
        {!enRango(valor, modo) ? (
          <Text style={styles.error}>{errorDeRango(valor, modo)}</Text>
        ) : (
          <Text style={styles.avisoTexto}>
            {numero === 0
              ? 'Sin tolerancia: cualquier descuadre, por pequeño que sea, avisa.'
              : modo === 'porcentaje'
                ? `Avisará a partir de ${numero}% de diferencia.`
                : `Avisará a partir de ${numero} de diferencia en la moneda base.`}
          </Text>
        )}

        {avisoTolerancia(modo, numero, HAY_VARIAS_MONEDAS) && (
          <View style={styles.aviso}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Icon name="alert" size={14} color={colors.warningTextDark} />
              <Text style={styles.avisoText}>{avisoTolerancia(modo, numero, HAY_VARIAS_MONEDAS)}</Text>
            </View>
          </View>
        )}
      </SectionCard>

      <SectionCard title="Aprobación de salidas">
        <Pressable onPress={() => setRequiereAprobacion(!requiereAprobacion)} style={styles.toggle}>
          <View style={[styles.check, requiereAprobacion && styles.checkMarcado]}>
            {requiereAprobacion && <Icon name="check" size={12} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipoText}>Pedir aprobación para sacar dinero</Text>
            <Text style={styles.tipoHint}>
              Con esto activado, cada salida queda pendiente hasta que un administrador o contador
              la apruebe. Sin ello, cualquiera puede vaciar la caja sin que nadie lo vea hasta el
              cierre.
            </Text>
          </View>
        </Pressable>
      </SectionCard>

      <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={guardar} disabled={saving} />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { gap: 4 },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 14 },
  tipo: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.inputBg },
  tipoActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoText: { fontSize: 14, fontWeight: '700', color: colors.text },
  tipoHint: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkMarcado: { borderColor: colors.primary, backgroundColor: colors.primary },
  aviso: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: 10, padding: 10, marginTop: 10 },
  avisoText: { fontSize: 12, color: colors.warningTextDark, lineHeight: 17, flex: 1 },
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
