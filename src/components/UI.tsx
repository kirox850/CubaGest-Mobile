// ─── PRIMITIVAS DE UI (paridad 1:1 con web/src/components/shared/primitives) ─
// Mismas métricas que la web: inputs padding 9/12 radius 12 fontSize 14,
// botones padding 9/18 radius 12, Field con label uppercase 12/600,
// modal radius 16 con header 20/24 y título 17/700, StatCard 22/24 radius 16.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator, AccessibilityInfo, Easing, Animated,
  TouchableOpacity, Modal, Pressable, ScrollView, BackHandler, useWindowDimensions,
} from 'react-native';
import Icon, { type IconName } from './Icon';
import { colors, radius, shadow, NAVY, themeRef } from '../config/theme';

// ─── INPUT (equiv. `inp` de la web: padding 9px 12px, radius 12, fontSize 14) ─
export const inp = {
  paddingVertical: 9,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: colors.inputBorder,
  borderRadius: 12,
  fontSize: 14,
  color: colors.text,
  backgroundColor: colors.inputBg,
} as const;

export const Inp = (props: React.ComponentProps<typeof TextInput>) => (
  <TextInput
    placeholderTextColor={colors.textMuted}
    {...props}
    style={[inp, { textAlignVertical: 'center' } as any, props.style]}
  />
);

// ─── SELECT: lista en una capa raíz, no dentro del campo que la dispara ───────
// El menú inline podía quedar recortado o detrás de tarjetas. Esta capa es una
// hermana de la pantalla completa; los formularios que ya viven en un Modal
// nativo montan otro provider dentro de ese Modal y conservan el mismo patrón.
type SelItem = { label: string; value: string };
type SelRequest = { items: SelItem[]; value: string; onValueChange: (value: string) => void };
const SelectOverlayContext = createContext<((request: SelRequest) => void) | null>(null);
let activeSelectCloser: (() => void) | null = null;

/** Permite que un Modal nativo cierre primero su lista flotante al pulsar atrás. */
export function closeSelectOverlayIfOpen(): boolean {
  if (!activeSelectCloser) return false;
  activeSelectCloser();
  return true;
}

export function SelectOverlayProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<SelRequest | null>(null);
  const { height } = useWindowDimensions();
  const open = useCallback((next: SelRequest) => setRequest(next), []);
  const close = useCallback(() => {
    activeSelectCloser = null;
    setRequest(null);
  }, []);

  useEffect(() => {
    if (!request) return;
    activeSelectCloser = close;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => {
      subscription.remove();
      if (activeSelectCloser === close) activeSelectCloser = null;
    };
  }, [request, close]);

  return (
    <SelectOverlayContext.Provider value={open}>
      <View style={{ flex: 1 }}>
        {children}
        {request && (
          <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 10000, elevation: 10000, justifyContent: 'center', padding: 24 }]}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)' }]}
              accessibilityLabel="Cerrar la lista"
              onPress={close}
            />
            <View style={{
              alignSelf: 'center', width: '100%', maxWidth: 420, maxHeight: Math.min(height * 0.72, 560),
              backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
              overflow: 'hidden', ...shadow.md,
            }}>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                {request.items.length > 0 ? request.items.map((item) => {
                  const selected = item.value === request.value;
                  return (
                    <TouchableOpacity
                      key={item.value || '__empty'}
                      onPress={() => {
                        const select = request.onValueChange;
                        close();
                        select(item.value);
                      }}
                      activeOpacity={0.65}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 12, paddingHorizontal: 16,
                        borderBottomWidth: 1, borderBottomColor: colors.borderLight,
                        backgroundColor: selected ? colors.primaryTint : colors.bgCard,
                      }}
                    >
                      <Text style={{ flex: 1, fontSize: 15, color: selected ? colors.primary : colors.text, fontWeight: selected ? '700' : '400' }}>
                        {item.label}
                      </Text>
                      {selected && <Icon name="check" size={15} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                }) : (
                  <Text style={{ padding: 18, color: colors.textMuted, textAlign: 'center' }}>No hay opciones disponibles</Text>
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </SelectOverlayContext.Provider>
  );
}

export const Sel = ({ items, value, onValueChange, style, placeholder }: {
  items: { label: string; value: string }[];
  value: string;
  onValueChange: (v: string) => void;
  style?: object;
  placeholder?: string;
}) => {
  const openMenu = useContext(SelectOverlayContext);
  const current = items.find((i) => i.value === value);

  return (
    <View style={style}>
      <TouchableOpacity
        onPress={() => openMenu?.({ items, value, onValueChange })}
        disabled={items.length === 0}
        activeOpacity={0.7}
        accessibilityRole="combobox"
        accessibilityState={{ expanded: false, disabled: items.length === 0 }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingVertical: 9, paddingHorizontal: 12,
          borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12,
          backgroundColor: colors.inputBg, minHeight: 38, opacity: items.length === 0 ? 0.55 : 1,
        }}
      >
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, color: colors.text }}>
          {current?.label || placeholder || '—'}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: -2 }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── BUTTON (equiv. btn() de la web: padding 9/18, radius 12, 14px w600) ─────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export const Btn = ({ label, onPress, variant = 'primary', icon, style, disabled, children }: {
  label?: string;
  onPress: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  style?: object;
  disabled?: boolean;
  children?: React.ReactNode;
}) => {
  const v = {
    primary:   { bg: colors.primary, fg: '#ffffff', bd: 'transparent' },
    secondary: { bg: colors.inputBg, fg: colors.text, bd: colors.inputBorder },
    ghost:     { bg: 'transparent', fg: colors.primary, bd: 'transparent' },
    // Lee del tema, como los otros cuatro. Ver el comentario sobre la web.
    danger:    { bg: colors.dangerBg, fg: colors.danger, bd: colors.dangerLight },
    success:   { bg: colors.success, fg: '#ffffff', bd: 'transparent' },
  }[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 7, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 12,
        backgroundColor: v.bg, borderWidth: v.bd === 'transparent' ? 0 : 1, borderColor: v.bd,
        opacity: disabled ? 0.5 : 1,
      }, style]}
    >
      {icon ? <Icon name={icon} size={15} color={v.fg} /> : null}
      {children}
      {label ? <Text style={{ color: v.fg, fontSize: 14, fontWeight: '600' }}>{label}</Text> : null}
    </TouchableOpacity>
  );
};

// ─── FIELD (equiv. Field web: label uppercase 12/600 muted, gap 5) ───────────
export const Field = ({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) => (
  <View style={{ gap: 5 }}>
    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {label}{required ? <Text style={{ color: colors.primary }}> *</Text> : null}
    </Text>
    {children}
  </View>
);

// ─── BADGE (idéntico a la web: padding 2/10, radius 20, 12px w600, bg +20) ───
/**
 * ¿Se puede derivar un fondo translúcido a partir de este color?
 *
 * Solo con un hex de 6 dígitos: `#DC2626` + '20' = `#DC262620`, que es un hex
 * de 8 con alfa. Con un `rgba(220,38,38,0.14)` —el token del tema oscuro— el
 * mismo truco daría `rgba(...)20`, que no es un color y React Native descarta en
 * silencio. Por eso, si el color no es un hex de 6, el fondo tiene que venir
 * explícito: es mejor un badge sin tinte que un badge con fondo invisible.
 */
const esHexDe6 = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

// `label` es ReactNode, igual que en la web (primitives.tsx:78). Con `string`
// no había forma de poner un icono dentro de un badge sin inventarse un
// `<Text>` con un emoji dentro, que es justo lo que la fase U1 quita.
export const Badge = ({ label, color, bg, icon }: {
  label: React.ReactNode; color?: string; bg?: string; icon?: IconName;
}) => {
  const c = color || colors.primary;
  // Se evalúa en render, no al montar: `colors` cambia con el tema y un fondo
  // calculado una vez se quedaría con el tinte del tema anterior.
  const fondo = bg ?? (esHexDe6(c) ? c + '20' : 'transparent');
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20, backgroundColor: fondo, alignSelf: 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon ? <Icon name={icon} size={12} color={c} /> : null}
        <Text style={{ fontSize: 12, fontWeight: '600', color: c, letterSpacing: 0.3 }}>{label}</Text>
      </View>
    </View>
  );
};

// ─── MODAL (idéntico a la web: radius 16, header 20/24, título 17/700) ───────
export const AppModal = ({ title, onClose, children, width = 560 }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: number;
}) => (
  <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }} onPress={onClose}>
      <Pressable onPress={() => {}} style={[{ backgroundColor: colors.bgCard, borderRadius: 16, width: '100%', maxWidth: width, maxHeight: '90%', overflow: 'hidden' }, shadow.lg]} onPressIn={() => {}}>
        <View style={{ paddingVertical: 20, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgCard, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 }}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
            <Icon name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={{ padding: 24 }}>{children}</View>
      </Pressable>
    </Pressable>
  </Modal>
);

// ─── TOAST (idéntico a la web: fondo sólido, radius 12, 12/20) ────────────────
//
// El `showToastGlobal` era un `null` permanente: la variable existía, se
// importaba en ninguna parte y `Toast` no se montaba en ningún sitio. Es decir,
// el "éxito" de la app se anunciaba con un Alert cuyo título era un check, que es un
// diálogo modal del sistema para informar de algo que ya pasó y que se ha
// resuelto solo. El usuario tiene que tocar "OK" para volver al POS.
//
// Ahora hay un handle real. La clave de la sustitución de estado es lo que
// reinicia el temporizador: dos toasts seguidos en 3 s no comparten el primero
// de 3.2 s, que es el error clásico de un `setTimeout` en un `useEffect` con
// `[]` de dependencias.
let setToastGlobal: ((t: { msg: string; type: string; key: number } | null) => void) | null = null;

export function showToast(msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
  setToastGlobal?.({ msg, type, key: Date.now() });
}

export const Toast = ({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  // Lee del tema: la paleta del Toast estaba en hex del modo claro, igual que
  // el `danger` de `Btn`, y por eso en oscuro un toast de error salía rojo
  // apagado sobre fondo oscuro.
  const palette: Record<string, string> = {
    success: colors.success,
    error: colors.danger,
    info: colors.primary,
    warning: colors.warning,
  };
  return (
    <View style={{ position: 'absolute', bottom: 88, left: 24, right: 24, zIndex: 9999, backgroundColor: palette[type] || palette.info, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow.md }}>
      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '500', flex: 1 }}>{msg}</Text>
      <TouchableOpacity onPress={onClose} hitSlop={8}>
        <Icon name="close" size={14} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
};

/** Se monta UNA vez, junto al DialogHost. */
export function ToastHost() {
  const [toast, setToast] = useState<{ msg: string; type: string; key: number } | null>(null);
  useEffect(() => {
    setToastGlobal = setToast;
    return () => { setToastGlobal = null; };
  }, []);
  if (!toast) return null;
  // `key` fuerza el remount y con él el reinicio del temporizador de 3.2 s.
  return <Toast key={toast.key} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />;
}


// ─── OFFLINE BANNER (port 1:1 de la web: franja fina bajo el header) ─────────
export const OfflineBanner = ({ online, syncing, pending, conflicts }: {
  online: boolean; syncing: boolean; pending: number; conflicts: number;
}) => {
  if (online && !syncing && pending === 0 && conflicts === 0) return null;
  const bg = !online ? colors.syncError : syncing ? colors.syncBusy : conflicts > 0 ? colors.syncWarn : colors.syncOk;
  const msg = !online
    ? `Sin conexión — modo offline${pending > 0 ? ` · ${pending} ventas en cola` : ''}`
    : syncing
      ? 'Sincronizando ventas...'
      : conflicts > 0
        ? `${conflicts} venta(s) con conflicto — revisa en Facturas`
        : `${pending === 0 ? 'Todo sincronizado' : `${pending} pendientes`}`;
  return (
    <View style={{ backgroundColor: bg, paddingVertical: 8, paddingHorizontal: 16 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{msg}</Text>
    </View>
  );
};

// ─── STATCARD (idéntico a la web del dashboard: 22/24, radius 16, caja 42) ───
export const StatCard = ({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: IconName;
}) => {
  const c = color || colors.primary;
  return (
    <View style={[{ backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 22, paddingHorizontal: 24, gap: 8, flexShrink: 0 }, shadow.sm]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
          <Text style={{ marginTop: 6, fontSize: 24, fontWeight: '800', color: c, letterSpacing: -0.5 }}>{value}</Text>
        </View>
        <View style={{ width: 42, height: 42, backgroundColor: c + '15', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon || 'dashboard'} size={20} color={c} />
        </View>
      </View>
      {sub ? <Text style={{ fontSize: 12, color: colors.textMuted }}>{sub}</Text> : null}
    </View>
  );
};

// ─── SECTION CARD (equiv. div radius 16 + border + padding 20 de la web) ─────
export const SectionCard = ({ title, children, style }: {
  title?: string; children: React.ReactNode; style?: object;
}) => (
  <View style={[{ backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 }, shadow.sm, style]}>
    {title ? <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 }}>{title}</Text> : null}
    {children}
  </View>
);

// ─── PAGE HEADER (equiv. h2 22/800 + sub 14 de la web) ────────────────────────
export const PageHeader = ({ title, subtitle, error }: { title: string; subtitle?: string; error?: string }) => (
  <View style={{ gap: 4 }}>
    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{title}</Text>
    {subtitle ? <Text style={{ fontSize: 14, color: colors.textMuted }}>{subtitle}</Text> : null}
    {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="zap" size={12} color={colors.warning} />
          <Text style={{ fontSize: 12, color: colors.warning }}>{error}</Text>
        </View>
      ) : null}
  </View>
);

// ─── UI ATOMS (existentes, mismas métricas web) ──────────────────────────────
export const ErrorBanner = ({ message }: { message: string }) => {
  if (!message) return null;
  return (
    <View style={{ backgroundColor: colors.dangerBg, borderLeftWidth: 3, borderLeftColor: colors.danger, padding: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="alert" size={14} color={colors.danger} />
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>{message}</Text>
      </View>
    </View>
  );
};

export const EmptyState = ({ text, icon }: { text: string; icon?: IconName }) => (
  <View style={{ alignItems: 'center', padding: 40, gap: 12 }}>
    <Icon name={icon || 'doc'} size={40} color={colors.textMuted} />
    <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>{text}</Text>
  </View>
);

export const Spinner = ({ size = 'large' }: { size?: 'large' | 'small' }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
    <ActivityIndicator size={size} color={colors.primary} />
  </View>
);

export const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>{title}</Text>
    {subtitle ? <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{subtitle}</Text> : null}
  </View>
);

// ─── Skeletons ───────────────────────────────────────────────────────────────
// El plan los pedía para el POS y las pantallas de carga lenta, y la razón es
// concreta: una pantalla en blanco durante dos segundos no parece una pantalla
// cargando, parece rota. En un móvil con datos móviles eso pasa en cada carga,
// y en el POS es donde más molesta, porque es la que se usa con una cola
// delante.
//
// La diferencia con `Spinner` es que el spinner se CENTRA y ocupa la pantalla
// entera: mueve el foco a una sola cosa. El esqueleto conserva la FORMA de lo
// que va a aparecer, así que cuando llega el dato nada se recoloca y la pantalla
// no "salta". Es la diferencia entre esperar y quedarse mirando.
//
// La shimmer es un degradado que se desplaza con `useNativeDriver`, de modo que
// corre en el hilo de la UI y no compite con el de la red. Y si el sistema pide
// menos animación, no se anima: en `AccessibilityInfo.isReduceMotionEnabled`
// el bloque se queda estático.

export const Skeleton = ({ w, h = 14, r = 8, style }: {
  w?: number | `${number}%`; h?: number; r?: number; style?: any;
}) => {
  const v = useRef(new Animated.Value(0)).current;
  const [mover, setMover] = useState(true);

  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (vivo) setMover(!r); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!mover) return;
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [mover, v]);

  const op = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 0.85, 0.45] });

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando"
      style={[
        { width: w, height: h, borderRadius: r, backgroundColor: colors.inputBg, opacity: mover ? op : 0.6 },
        style,
      ]}
    />
  );
};

/** Varias líneas de esqueleto, la última más corta: es lo que espera el ojo. */
export const SkeletonText = ({ lines = 3, w }: { lines?: number; w?: number | `${number}%` }) => (
  <View style={{ gap: 8 }}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} w={i === lines - 1 ? '60%' : w} h={12} />
    ))}
  </View>
);

/** Las filas de una tabla/lista: la forma que se repite en la app. */
export const SkeletonRows = ({ n = 5, h = 62 }: { n?: number; h?: number }) => (
  <View style={{ gap: 8, padding: 16 }}>
    {Array.from({ length: n }).map((_, i) => (
      <View key={i} style={[{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 9 }, i === n - 1 && { opacity: 0.5 }]}>
        <Skeleton w={`${55 + (i * 7) % 30}%`} h={13} />
        <Skeleton w="35%" h={11} />
        {h > 60 && <Skeleton w="22%" h={11} />}
      </View>
    ))}
  </View>
);
