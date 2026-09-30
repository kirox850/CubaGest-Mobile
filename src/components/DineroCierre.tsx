// ─── EL DINERO DEL CIERRE ────────────────────────────────────────────────────
//
// POR QUÉ EXISTE. El cierre anterior solo contaba productos. Esta es la parte que
// responde a la pregunta que de verdad importa al final del día: ¿entró lo que
// tenía que entrar? El backend ya sabe contestarla —concilia fondo, efectivo,
// entradas y salidas, y guarda el descuadre por moneda— pero el móvil nunca le
// mandaba el dinero contado. Todos los cierres hechos desde el teléfono han sido
// ciegos al dinero, y eso no es una carencia: es un bug.
//
// La cuenta se muestra EN PIE, como una caja:
//
//   fondo + ventas en efectivo + entradas − salidas = lo que debería haber
//
// Y CADA MONEDA POR SEPARADO. Si la caja tiene 100 CUP y 2 USD, se compara 100
// contra los CUP y 2 contra los USD. Sumarlos daría "102" contra un total en
// pesos, que no significa absolutamente nada: por eso `esperado` es un
// `Record<string, number>` y no un número.
//
// UNA DECISIÓN QUE PARTE DE AQUÍ. Solo se envía al servidor lo que el cajero
// CONTÓ de verdad. La cuenta arranca vacía y una moneda entra en ella cuando se
// escribe algo en su campo. Si nadie cuenta, `countedCash` se manda vacío y el
// cierre se comporta exactamente como antes. La razón es concreta: mandar
// ceros a propósito crearía un descuadre inventado del 100% en cada moneda con
// saldo, y convertiría este arreglo en un generador de falsas alarmas para
// quien viene contando solo mercancía.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, themeRef } from '../config/theme';
import Icon from '../components/Icon';
import { CURRENCY_SYMBOLS } from '../config/roles';
import {
  TOLERANCIA_CENTAVOS, countedCashDe, diffDe, esCero, hayConteo,
  monedasAContar, sinContar,
  type Cajas, type ContadoTexto,
} from '../config/cierreDinero';
import { Inp } from './UI';
import type { ClosingCashPreview } from '../types';

// Las reglas puras viven en src/config/cierreDinero.ts y se reexportan aquí
// para quien las importaba desde el componente.
export { TOLERANCIA_CENTAVOS, countedCashDe, hayConteo };
export type { Cajas, ContadoTexto };

const simboloDe = (cur: string) => CURRENCY_SYMBOLS[cur] || '';

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const Linea = ({ k, valor, signo, fuerte }: { k: string; valor: number; signo?: 1 | -1; fuerte?: boolean }) => (
  <View style={styles.linea}>
    <Text style={[styles.lineaKey, fuerte && styles.lineaKeyFuerte]}>{k}</Text>
    <Text
      style={[
        styles.lineaVal,
        fuerte && styles.lineaValFuerte,
        signo === 1 && { color: colors.success },
        signo === -1 && { color: colors.danger },
      ]}
    >
      {signo === -1 ? '−' : ''}
      {n(Math.abs(valor)).toFixed(2)}
    </Text>
  </View>
);

export default function DineroCierre({
  preview, contado, onChange, baseCash,
}: {
  preview: ClosingCashPreview | undefined;
  contado: ContadoTexto;
  onChange: (next: ContadoTexto) => void;
  baseCash?: Cajas;
}) {
  const esperado = preview?.esperado || {};
  const ventas = preview?.ventas || {};
  const entradas = preview?.entradas || {};
  const salidas = preview?.salidas || {};

  // Las del esperado y las que el cajero ya escribió: si puso una moneda que no
  // se esperaba, se conserva (puede estar contando ese dinero de verdad).
  const monedas = monedasAContar(esperado, contado);

  if (monedas.length === 0) {
    return (
      <View style={styles.vacio}>
        <Text style={styles.vacioText}>
          Este turno no movió dinero: no hubo ventas en efectivo ni movimientos en la caja.
          {'\n'}Si estás contando dinero y no aparece aquí, revisa que las ventas se hayan
          registrado en esta caja.
        </Text>
      </View>
    );
  }

  // Una moneda esperada por la que el cajero NO escribió. No es un error (el
  // conteo es opcional), pero sí conviene avisar: es la diferencia entre
  // "cerré sin mirar" y "miré y no había".
  const pendientes = sinContar(esperado, contado);

  return (
    <View style={styles.wrap}>
      {monedas.map((k) => {
        const e = n(esperado[k]);
        const escrito = k in contado;
        const d = diffDe(e, contado[k]);
        const descuadra = escrito && !esCero(d);
        return (
          <View key={k} style={styles.moneda}>
            <Text style={styles.monedaTitle}>{k} {simboloDe(k)}</Text>

            <View style={{ marginBottom: 10 }}>
              <Linea k="Fondo al abrir turno" valor={n(baseCash?.[k])} />
              <Linea k="Ventas en efectivo" valor={n(ventas[k])} signo={1} />
              {entradas[k] ? <Linea k="Entradas" valor={entradas[k]} signo={1} /> : null}
              {salidas[k] ? <Linea k="Salidas" valor={salidas[k]} signo={-1} /> : null}
              <View style={styles.totalLine}>
                <Linea k="Debería haber" valor={e} fuerte />
              </View>
            </View>

            <Text style={styles.inputLabel}>¿Cuánto hay contados?</Text>
            <Inp
              style={styles.input}
              value={contado[k] ?? ''}
              onChangeText={(v) => onChange({ ...contado, [k]: v })}
              keyboardType="decimal-pad"
              placeholder="0"
            />

            {descuadra && (
              <View style={[styles.dif, d < 0 ? styles.difFalta : styles.difSobra]}>
                <Text style={[styles.difText, { color: d < 0 ? colors.dangerText : colors.successText }]}>
                  {d < 0 ? `Faltan ${Math.abs(d).toFixed(2)} ${k}` : `Sobran ${Math.abs(d).toFixed(2)} ${k}`}
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {pendientes.length > 0 && (
        <Text style={styles.aviso}>
          ⚠ Sin contar: {pendientes.join(', ')}. Si de verdad no había, escribe 0.
        </Text>
      )}

      <TouchableOpacity
        style={styles.another}
        onPress={() => {
          const usadas = new Set(monedas);
          let extra = 'USD';
          let intento = 1;
          while (usadas.has(extra)) extra = `OTRA${intento++}`;
          onChange({ ...contado, [extra]: '' });
        }}
      >
        <Icon name="plus" size={13} color={colors.primary} />
        <Text style={styles.anotherText}>Contar en otra moneda</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { gap: 12 },
  vacio: { backgroundColor: colors.inputBg, borderRadius: 12, padding: 14 },
  vacioText: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  moneda: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, backgroundColor: colors.bgCard },
  monedaTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 9 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 2 },
  lineaKey: { fontSize: 12, color: colors.textMuted, flex: 1, minWidth: 0 },
  lineaKeyFuerte: { color: colors.text, fontWeight: '700' },
  lineaVal: { fontSize: 12, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  lineaValFuerte: { fontSize: 15, fontWeight: '800' },
  totalLine: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 5 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 5 },
  input: { fontSize: 17, fontWeight: '700' },
  dif: { marginTop: 9, padding: 9, borderRadius: 10 },
  difFalta: { backgroundColor: 'rgba(220,38,38,0.07)' },
  difSobra: { backgroundColor: 'rgba(16,185,129,0.10)' },
  difText: { fontSize: 12, fontWeight: '700' },
  aviso: { fontSize: 12, color: colors.warningTextDark, backgroundColor: colors.warningBg, borderRadius: 10, padding: 8 },
  another: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  anotherText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
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
