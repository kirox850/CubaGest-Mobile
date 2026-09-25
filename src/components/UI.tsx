// ─── PRIMITIVAS DE UI (paridad 1:1 con web/src/components/shared/primitives) ─
// Mismas métricas que la web: inputs padding 9/12 radius 12 fontSize 14,
// botones padding 9/18 radius 12, Field con label uppercase 12/600,
// modal radius 16 con header 20/24 y título 17/700, StatCard 22/24 radius 16.
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, Pressable, ScrollView,
} from 'react-native';
import Icon from './Icon';
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

// ─── SELECT TIPO DROPDOWN (menú desplegable, como el <select> de la web) ────
// El Picker de react-native en iOS SIEMPRE muestra la rueda giratoria
// (216pt) — se ve mal y el texto se desborda. Este dropdown abre un MENÚ de
// opciones (lista con check en la seleccionada), igual que los menús de
// selección de la web, y funciona idéntico en iOS y Android.
export const Sel = ({ items, value, onValueChange, style, placeholder }: {
  items: { label: string; value: string }[];
  value: string;
  onValueChange: (v: string) => void;
  style?: object;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const current = items.find((i) => i.value === value);
  return (
    <View style={style}>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingVertical: 9, paddingHorizontal: 12,
          borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12,
          backgroundColor: colors.inputBg, minHeight: 38,
        }}
      >
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, color: colors.text }}>
          {current?.label || placeholder || '—'}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: -2 }}>▼</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', padding: 32, justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
              maxHeight: '70%', width: '100%', maxWidth: 340, overflow: 'hidden',
              shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12,
            }}
          >
            <ScrollView bounces={false}>
              {items.map((it) => {
                const on = it.value === value;
                return (
                  <TouchableOpacity
                    key={it.value}
                    onPress={() => { onValueChange(it.value); setOpen(false); }}
                    activeOpacity={0.6}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 13, paddingHorizontal: 16,
                      borderBottomWidth: 1, borderBottomColor: colors.borderLight,
                      backgroundColor: on ? colors.primaryTint : 'transparent',
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 14.5, color: on ? colors.primary : colors.text, fontWeight: on ? '700' : '400' }}>
                      {it.label}
                    </Text>
                    {on && <Icon name="check" size={15} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// ─── BUTTON (equiv. btn() de la web: padding 9/18, radius 12, 14px w600) ─────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export const Btn = ({ label, onPress, variant = 'primary', icon, style, disabled, children }: {
  label?: string;
  onPress: () => void;
  variant?: BtnVariant;
  icon?: string;
  style?: object;
  disabled?: boolean;
  children?: React.ReactNode;
}) => {
  const v = {
    primary:   { bg: colors.primary, fg: '#ffffff', bd: 'transparent' },
    secondary: { bg: colors.inputBg, fg: colors.text, bd: colors.inputBorder },
    ghost:     { bg: 'transparent', fg: colors.primary, bd: 'transparent' },
    danger:    { bg: 'rgba(220,38,38,0.10)', fg: '#DC2626', bd: 'rgba(220,38,38,0.35)' },
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
export const Badge = ({ label, color, bg }: { label: string; color?: string; bg?: string }) => {
  const c = color || colors.primary;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20, backgroundColor: bg || c + '20', alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: c, letterSpacing: 0.3 }}>{label}</Text>
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
let __toastClose: (() => void) | null = null;
export const showToastGlobal: ((msg: string, type?: string) => void) | null = null;

export const Toast = ({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, []);
  const palette: Record<string, string> = { success: '#10B981', error: '#DC2626', info: colors.primary, warning: '#C2410C' };
  return (
    <View style={{ position: 'absolute', bottom: 88, left: 24, right: 24, zIndex: 9999, backgroundColor: palette[type] || palette.info, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow.md }}>
      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '500', flex: 1 }}>{msg}</Text>
      <TouchableOpacity onPress={onClose} hitSlop={8}>
        <Icon name="close" size={14} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
};

// ─── OFFLINE BANNER (port 1:1 de la web: franja fina bajo el header) ─────────
export const OfflineBanner = ({ online, syncing, pending, conflicts }: {
  online: boolean; syncing: boolean; pending: number; conflicts: number;
}) => {
  if (online && !syncing && pending === 0 && conflicts === 0) return null;
  const bg = !online ? '#8B1A1A' : syncing ? '#1A5C8B' : conflicts > 0 ? '#c17a00' : '#1A7A3C';
  const msg = !online
    ? `Sin conexión — modo offline${pending > 0 ? ` · ${pending} ventas en cola` : ''}`
    : syncing
      ? 'Sincronizando ventas...'
      : conflicts > 0
        ? `${conflicts} venta(s) con conflicto — revisa en Facturas`
        : `✓ ${pending === 0 ? 'Todo sincronizado' : `${pending} pendientes`}`;
  return (
    <View style={{ backgroundColor: bg, paddingVertical: 8, paddingHorizontal: 16 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{msg}</Text>
    </View>
  );
};

// ─── STATCARD (idéntico a la web del dashboard: 22/24, radius 16, caja 42) ───
export const StatCard = ({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: string;
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
    {error ? <Text style={{ fontSize: 12, color: '#F97316' }}>⚡ {error}</Text> : null}
  </View>
);

// ─── UI ATOMS (existentes, mismas métricas web) ──────────────────────────────
export const ErrorBanner = ({ message }: { message: string }) => {
  if (!message) return null;
  return (
    <View style={{ backgroundColor: colors.dangerBg, borderLeftWidth: 3, borderLeftColor: colors.danger, padding: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 12 }}>
      <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>⚠ {message}</Text>
    </View>
  );
};

export const EmptyState = ({ text, icon }: { text: string; icon?: string }) => (
  <View style={{ alignItems: 'center', padding: 40, gap: 12 }}>
    {icon ? <Icon name={icon} size={40} color={colors.textMuted} /> : <Text style={{ fontSize: 40 }}>📭</Text>}
    <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>{text}</Text>
  </View>
);

export const Spinner = ({ size = 'large' }: { size?: 'large' | 'small' }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
    <ActivityIndicator size={size} color={colors.primary} />
  </View>
);

export const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <View style={[{ backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }, shadow.sm, style]}>
    {children}
  </View>
);

export const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>{title}</Text>
    {subtitle ? <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{subtitle}</Text> : null}
  </View>
);
