// ─── RESOLVER UN CIERRE PROVISIONAL ──────────────────────────────────────────
//
// Cuando un cierre no cuadra no se archiva: queda `provisional` con un plazo,
// y hay dos acciones DISTINTAS que lo cierran. Confundirlas es el error de
// diseño más caro de esta pantalla:
//
//  · EXPLICAR un DESCUADRE DE DINERO. Sí resuelve. La cantidad tiene que
//    coincidir con la diferencia EXACTA: si el cierre dice que faltan 300 y
//    alguien pone 297, el servidor lo rechaza con 400. No es un redondeo
//    permisivo: un cierre de caja existe justamente para que las cuentas
//    cuadren al peso, y aceptar importes aproximados dejaría que cualquier
//    descuadre se declare resuelto con un número redondo.
//
//  · ANOTAR una línea de MERCADERÍA. NO resuelve nada. Dice por qué faltó. Vive
//    en otra tabla (`closing_notes`) precisamente para que no se confunda con
//    la anterior. Un cierre con faltante de mercancía no se resuelve escribiendo
//    por qué: se resuelve cuando la mercancía cuadre.
//
// Aquí se separa de forma visible: una sección es de dinero y dice que resuelve,
// la otra es de notas y lo dice en mayúsculas en su encabezado.

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, themeRef } from '../config/theme';
import Icon from '../components/Icon';
import { CURRENCY_SYMBOLS } from '../config/roles';
import { Btn, Inp } from './UI';
import { showAlert, showError } from './dialogs';
import { sePuedeExplicar, textoVentana } from '../config/ventanaCierre';
import type { Closing } from '../types';

const fmt = (n: number) => (Number(n) || 0).toFixed(2);

function DineroDeCierre({
  diff, explicados, onExplicar,
}: {
  diff: Record<string, number>;
  explicados: { currency: string; amount: number; note: string; autor: string; createdAt: string }[];
  onExplicar: (currency: string, amount: number, note: string) => Promise<void>;
}) {
  const pendientes = Object.entries(diff || {}).filter(([, v]) => Math.abs(Number(v)) > 0.005);
  const [cur, setCur] = useState(pendientes[0]?.[0] || 'CUP');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (pendientes.length === 0) {
    return (
      <View style={s.ok}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="check" size={14} color={colors.success} />
        <Text style={s.okText}>El dinero de este cierre cuadra.</Text>
      </View>
      </View>
    );
  }

  const explained = (c: string) => explicados.filter((e) => e.currency === c);

  return (
    <View style={s.dinero}>
      {pendientes.map(([k, v]) => {
        const hecho = explained(k);
        const yaResuelto = hecho.length > 0;
        return (
          <View key={k} style={s.bloque}>
            <View style={s.bloqueHead}>
              <Text style={s.moneda}>{k} {CURRENCY_SYMBOLS[k] || ''}</Text>
              <Text style={[s.dif, v < 0 ? s.falta : s.sobra]}>
                {v < 0 ? `Faltan ${fmt(Math.abs(v))}` : `Sobran ${fmt(Math.abs(v))}`}
              </Text>
            </View>

            {hecho.map((e, i) => (
              <View key={i} style={s.hecha}>
                <Text style={s.hechaText}>“{e.note}” — {e.autor}</Text>
              </View>
            ))}

            {!yaResuelto && (
              <>
                <Text style={s.inputLabel}>
                  ¿Cuánto se explica? <Text style={s.exacto}>Debe ser {fmt(Math.abs(v))} {k}</Text>
                </Text>
                <Inp
                  value={monto}
                  onChangeText={setMonto}
                  keyboardType="decimal-pad"
                  placeholder={fmt(Math.abs(v))}
                />
                <Text style={s.inputLabel} >¿Y por qué?</Text>
                <Inp
                  value={nota}
                  onChangeText={setNota}
                  placeholder="El dueño retiró el dinero para pagar el agua"
                />
                <Btn
                  variant="success"
                  label="Enviar explicación"
                  onPress={async () => {
                    const n = Number(monto);
                    if (!Number.isFinite(n) || n <= 0) {
                      showError('Falta el importe: ' + 'Escribe cuánto se explica.');
                      return;
                    }
                    if (Math.abs(n - Math.abs(v)) >= 0.005) {
                      // Se avisa ANTES de gastar un request, y con el número al
                      // lado: el 400 del servidor llega tarde y sin contexto.
                      showAlert(`El descuadre es de ${fmt(Math.abs(v))} ${k}. Para resolverlo hay que explicar exactamente esa cantidad, no una aproximada.`, 'El importe no cuadra');
                      return;
                    }
                    if (!nota.trim()) {
                      showError('Falta el motivo: ' + 'Escribe por qué se explica esa cantidad.');
                      return;
                    }
                    try {
                      setGuardando(true);
                      await onExplicar(k, Math.abs(n), nota.trim());
                      setMonto('');
                      setNota('');
                    } finally {
                      setGuardando(false);
                    }
                  }}
                  disabled={guardando}
                />
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

function NotasDeMercaderia({
  pendientes, onAnotar,
}: {
  pendientes: { productId: string; productName: string; unit: string; shortage: number }[];
  onAnotar: (productId: string, note: string) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState('');

  if (pendientes.length === 0) return null;

  return (
    <View style={s.dinero}>
      {pendientes.map((l) => {
        const nota = abierta[l.productId] || '';
        const guardandoEsta = guardando === l.productId;
        return (
          <View key={l.productId} style={s.bloque}>
            <View style={s.bloqueHead}>
              <Text style={s.producto} numberOfLines={1}>{l.productName}</Text>
              <Text style={[s.dif, l.shortage < 0 ? s.falta : s.sobra]}>
                {l.shortage < 0 ? `Faltan ${fmt(Math.abs(l.shortage))}` : `Sobran ${fmt(l.shortage)}`} {l.unit}
              </Text>
            </View>
            <Inp
              value={nota}
              onChangeText={(v) => setAbierta({ ...abierta, [l.productId]: v })}
              placeholder="Anotar qué pasó con esta línea"
            />
            <Btn
              variant="secondary"
              label="Anotar"
              onPress={async () => {
                if (!nota.trim()) {
                  showError('Falta la nota: ' + 'Escribe qué pasó con esta línea.');
                  return;
                }
                try {
                  setGuardando(l.productId);
                  await onAnotar(l.productId, nota.trim());
                  setAbierta({ ...abierta, [l.productId]: '' });
                } finally {
                  setGuardando('');
                }
              }}
              disabled={guardandoEsta}
            />
          </View>
        );
      })}
    </View>
  );
}

export default function ClosingResolve({
  closing, onExplicar, onAnotar,
}: {
  closing: Closing;
  onExplicar: (currency: string, amount: number, note: string) => Promise<void>;
  onAnotar: (productId: string, note: string) => Promise<void>;
}) {
  const ahora = Date.now();
  const puede = sePuedeExplicar(closing.provisionalUntil, ahora);
  const diff = closing.cashDiff || {};
  const mercaderia = closing.pendientes?.mercaderia || [];
  // Lo que el servidor dice que sigue abierto. NO se deduce aquí: el servidor
  // ya descuenta lo explicado, y recalcularlo en el cliente es la forma
  // garantizada de discrepar con él.
  const pendientesDinero = closing.pendientes?.dinero || {};

  return (
    <View style={s.wrap}>
      <View style={[s.banner, puede ? s.bannerAbierto : s.bannerCerrado]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={puede ? 'clock' : 'lock'} size={14} color={colors.warningTextDark} />
          <Text style={[s.bannerText, { flex: 1 }]}>
          {textoVentana(closing.provisionalUntil, ahora)}
          </Text>
        </View>
      </View>

      <Text style={s.seccion}>DINERO — esto SÍ resuelve el descuadre</Text>
      <DineroDeCierre
        diff={pendientesDinero}
        explicados={closing.explicaciones || []}
        onExplicar={onExplicar}
      />

      {mercaderia.length > 0 && (
        <>
          <Text style={[s.seccion, s.seccionAviso]}>
            MERCADERÍA — anotar NO resuelve: el cierre seguirá abierto hasta que la mercancía cuadre
          </Text>
          <NotasDeMercaderia pendientes={mercaderia} onAnotar={onAnotar} />
        </>
      )}

      {Object.keys(diff).length > 0 && mercaderia.length === 0 && !puede && (
        <Text style={s.notaPie}>
          El descuadre de dinero ({fmt(Math.abs(Object.values(diff)[0]))}) quedó sin explicar. Ya
          no hay plazo: se dio por cerrado y se le avisó al dueño.
        </Text>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { gap: 12 },
  banner: { borderRadius: 12, padding: 12, borderWidth: 1 },
  bannerAbierto: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  bannerCerrado: { backgroundColor: colors.bgSecondary, borderColor: colors.border },
  bannerText: { fontSize: 12, color: colors.text, fontWeight: '600', lineHeight: 18 },
  seccion: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted, marginTop: 4 },
  seccionAviso: { color: colors.warningTextDark },
  ok: { backgroundColor: colors.successBg, borderRadius: 10, padding: 12 },
  okText: { color: colors.successText, fontSize: 13, fontWeight: '700' },
  dinero: { gap: 10 },
  bloque: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, gap: 8, backgroundColor: colors.bgCard },
  bloqueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  moneda: { fontSize: 13, fontWeight: '800', color: colors.text },
  producto: { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1, minWidth: 0 },
  dif: { fontSize: 12, fontWeight: '800' },
  falta: { color: colors.dangerText },
  sobra: { color: colors.successText },
  hecha: { backgroundColor: colors.successBg, borderRadius: 8, padding: 8 },
  hechaText: { fontSize: 12, color: colors.successText },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  exacto: { color: colors.primary, fontWeight: '600' },
  notaPie: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});

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
