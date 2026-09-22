import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, themeRef } from '../config/theme';

const TOUR_KEY = 'cubagest_tour_done';

const STEPS = [
  { emoji: '👋', title: '¡Bienvenido a CubaGest!', text: 'Este es tu panel de gestión. Te mostramos lo esencial en 5 pasos.' },
  { emoji: '🖥️', title: 'Punto de Venta', text: 'Cobra desde la pestaña Vender. Funciona incluso SIN internet: las ventas se guardan y sincronizan solas al volver la conexión.' },
  { emoji: '📦', title: 'Inventario multi-ubicación', text: 'Tu stock vive en ubicaciones (Almacén Central, cajas). Desde la pestaña Envíos mandas mercancía entre ellas.' },
  { emoji: '🧾', title: 'Facturas y respaldo', text: 'Todas tus facturas quedan en Facturas, y puedes exportar CSV de inventario, ventas y gastos como respaldo.' },
  { emoji: '💱', title: 'Configura tu negocio', text: 'En el menú de tu perfil (arriba a la derecha): monedas que operas, tu plan y más.' },
];

/**
 * Tour de bienvenida — se muestra UNA sola vez por instalación y se puede
 * volver a ver desde el menú del perfil (paridad con la web).
 */
export default function WelcomeTour({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [autoOpen, setAutoOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY).then((v) => { if (!v) setAutoOpen(true); });
  }, []);

  const visible = forceOpen || autoOpen;

  const done = () => {
    AsyncStorage.setItem(TOUR_KEY, '1');
    setAutoOpen(false);
    setStep(0);
    onClose?.();
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={done}>
      <Pressable style={styles.overlay} onPress={last ? done : undefined}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.emoji}>{s.emoji}</Text>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.text}>{s.text}</Text>
          <Text style={styles.counter}>{step + 1}/{STEPS.length}</Text>
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.skipBtn} onPress={done}>
              <Text style={styles.skipText}>Saltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => (last ? done() : setStep(step + 1))}
            >
              <Text style={styles.nextText}>{last ? '¡Empezar!' : 'Siguiente'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'flex-end', padding: 20 },
  card: { backgroundColor: colors.bgCard, borderRadius: 18, padding: 22, width: '100%', maxWidth: 420 },
  emoji: { fontSize: 34, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  text: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 21, marginBottom: 12 },
  counter: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 12 },
  btnRow: { flexDirection: 'row', gap: 8 },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center' },
  skipText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  nextBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  nextText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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

