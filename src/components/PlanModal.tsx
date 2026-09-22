import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Linking, Alert, ActivityIndicator } from 'react-native';
import { colors, radius, themeRef } from '../config/theme';
import { PlanAPI, SubscriptionAPI } from '../api/endpoints';
import type { User, PlanInfo } from '../types';

const PLANS = [
  {
    key: 'free', label: 'Free', priceUSD: 0,
    features: ['1 usuario', 'Hasta 10 productos', '100 ventas al mes', 'Historial de 30 días', 'Reportes básicos', 'Soporte por email (48-72 h)'],
    payable: false,
  },
  {
    key: 'pro', label: 'Pro', priceUSD: 5,
    features: ['3 usuarios', 'Hasta 50 productos', '1.000 ventas al mes', 'Historial de 12 meses', 'Reportes avanzados + PDF', 'Cierre de caja e inventario', 'Notificaciones y alertas', 'Soporte prioritario (24-48 h)', '48 h de onboarding incluidas'],
    payable: true,
  },
  {
    key: 'empresarial', label: 'Empresarial', priceUSD: 10,
    features: ['Usuarios ilimitados', 'Productos ilimitados', 'Ventas ilimitadas', 'Historial ilimitado', 'Roles y permisos avanzados', 'Backup automático y exportación', 'Soporte prioritario (< 12 h)', 'Onboarding personalizado'],
    payable: true,
  },
];

const WHATSAPP_NUMBER = '5354801057';

interface PlanModalProps {
  visible: boolean;
  onClose: () => void;
  user: User | null;
}

export default function PlanModal({ visible, onClose, user }: PlanModalProps) {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const load = () => PlanAPI.get().then(setPlanInfo).catch(() => {});

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const effectivePlan = planInfo?.plan || user?.company?.plan || 'free';
  const subStatus = planInfo?.subscriptionStatus || user?.company?.subscriptionStatus;
  const isTrial = subStatus === 'trial';
  const isFailed = subStatus === 'failed';
  const planExpiry = user?.company?.planExpiry;
  const daysLeft = planExpiry
    ? Math.max(0, Math.ceil((new Date(planExpiry).getTime() - Date.now()) / 86400000))
    : null;

  const handleQvaPay = async (planKey: string) => {
    try {
      setLoading(true);
      setSelectedPlan(planKey);
      const data = await SubscriptionAPI.authorizeQvapay(planKey);
      if (data?.url) {
        const supported = await Linking.canOpenURL(data.url);
        if (supported) await Linking.openURL(data.url);
        else Alert.alert('Error', 'No se pudo abrir el enlace de pago de QvaPay.');
      }
    } catch (e) {
      const err = e as Error;
      Alert.alert('Error', 'No se pudo conectar con QvaPay: ' + (err.message || ''));
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  const handleWhatsApp = (planKey: string, priceUSD: number) => {
    const p = PLANS.find(x => x.key === planKey);
    const company = user?.company?.name || 'mi empresa';
    const email = user?.email || '';
    const msg = encodeURIComponent(
      `Hola, quiero activar el plan *${p?.label}* de CubaGest.\n\n` +
      `🏢 Empresa: ${company}\n` +
      `📧 Correo: ${email}\n` +
      `💳 Plan: ${p?.label} — $${priceUSD} USD/mes\n\n` +
      `Por favor indícame cómo proceder con el pago.`
    );
    Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Planes — CubaGest</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {isTrial && daysLeft !== null && (
              <View style={[styles.banner, { backgroundColor: daysLeft <= 7 ? colors.warningBg : colors.primaryTint, borderColor: daysLeft <= 7 ? colors.warningBorder : colors.primaryTintB }]}>
                <Text style={[styles.bannerTitle, { color: daysLeft <= 7 ? '#C2410C' : '#1E40AF' }]}>
                  {daysLeft <= 7 ? '⚠ ' : '🎁 '}Período de prueba — {daysLeft} día{daysLeft !== 1 ? 's' : ''} restante{daysLeft !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.bannerSub}>Estás usando el plan Empresarial gratis. Al vencer pasarás automáticamente al plan Free.</Text>
              </View>
            )}

            {isFailed && (
              <View style={[styles.banner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Text style={[styles.bannerTitle, { color: '#DC2626' }]}>⚠ Pago fallido</Text>
                <Text style={styles.bannerSub}>No pudimos cobrar tu suscripción. Asegúrate de tener saldo en QvaPay o contacta por WhatsApp para pagar manualmente.</Text>
              </View>
            )}

            {planInfo && (
              <View style={styles.usageBox}>
                <Text style={styles.usageTitle}>USO ESTE MES</Text>
                {[
                  { l: 'Usuarios', v: planInfo.usage.users, max: planInfo.limits.maxUsers },
                  { l: 'Productos', v: planInfo.usage.products, max: planInfo.limits.maxProducts },
                  { l: 'Ventas', v: planInfo.usage.salesThisMonth, max: planInfo.limits.maxSalesMonth },
                ].map(u => {
                  const pct = u.max ? Math.min(100, Math.round((u.v / u.max) * 100)) : 0;
                  const warn = u.max && pct >= 80;
                  const barColor = pct >= 100 ? colors.danger : pct >= 80 ? colors.warning : colors.primary;
                  return (
                    <View key={u.l} style={styles.usageRow}>
                      <View style={styles.usageLabelRow}>
                        <Text style={styles.usageLabel}>{u.l}</Text>
                        <Text style={[styles.usageValue, { color: warn ? colors.warning : colors.text }]}>
                          {u.v}{u.max ? ` / ${u.max}` : ''}
                        </Text>
                      </View>
                      {!!u.max && (
                        <View style={styles.usageBarBg}>
                          <View style={[styles.usageBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {PLANS.map(p => {
              const isCurrent = p.key === effectivePlan;
              const isLoadingThis = loading && selectedPlan === p.key;
              return (
                <View key={p.key} style={[styles.planCard, isCurrent && styles.planCardCurrent]}>
                  {isCurrent && (
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>{isTrial && p.key === 'empresarial' ? 'PRUEBA GRATIS' : 'PLAN ACTUAL'}</Text>
                    </View>
                  )}
                  <Text style={styles.planLabel}>{p.label}</Text>
                  <Text style={[styles.planPrice, { color: p.priceUSD === 0 ? colors.success : colors.primary }]}>
                    {p.priceUSD === 0 ? 'Gratis' : `$${p.priceUSD} USD/mes`}
                  </Text>
                  {p.features.map(f => (
                    <View key={f} style={styles.featureRow}>
                      <Text style={styles.featureCheck}>✓</Text>
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}

                  {p.payable && (!isCurrent || isTrial || isFailed) && user?.role === 'admin' && (
                    <View style={styles.payRow}>
                      <TouchableOpacity
                        style={[styles.payBtn, styles.payBtnDark, loading && { opacity: 0.6 }]}
                        onPress={() => handleQvaPay(p.key)}
                        disabled={loading}
                      >
                        {isLoadingThis
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.payBtnText}>💳 Pagar con QvaPay</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.payBtn, styles.payBtnWhatsapp]} onPress={() => handleWhatsApp(p.key, p.priceUSD)}>
                        <Text style={styles.payBtnText}>💬 Pagar por WhatsApp</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            <Text style={styles.footNote}>Los pagos por QvaPay se renuevan automáticamente cada 30 días. Puedes cancelar en cualquier momento.</Text>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, width: '100%', maxHeight: '88%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  closeIcon: { fontSize: 18, color: colors.textMuted },
  body: { paddingHorizontal: 16, paddingVertical: 14 },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  closeBtn: { backgroundColor: colors.bgSecondary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },

  banner: { borderWidth: 1, borderRadius: radius.md, padding: 14, marginBottom: 12 },
  bannerTitle: { fontWeight: '700', fontSize: 14 },
  bannerSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },

  usageBox: { backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  usageTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 10, letterSpacing: 0.5 },
  usageRow: { marginBottom: 10 },
  usageLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  usageLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  usageValue: { fontSize: 12, fontWeight: '700' },
  usageBarBg: { height: 6, backgroundColor: colors.border, borderRadius: 99 },
  usageBarFill: { height: 6, borderRadius: 99 },

  planCard: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: 16, marginBottom: 12, position: 'relative' },
  planCardCurrent: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  planBadge: { position: 'absolute', top: -10, left: 12, backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  planBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  planLabel: { fontWeight: '800', fontSize: 15, color: colors.text, marginTop: 4 },
  planPrice: { fontWeight: '700', fontSize: 18, marginBottom: 8, marginTop: 2 },
  featureRow: { flexDirection: 'row', gap: 6, marginBottom: 5, alignItems: 'flex-start' },
  featureCheck: { color: colors.success, fontSize: 12, fontWeight: '800' },
  featureText: { fontSize: 12, color: colors.textSecondary, flex: 1 },

  payRow: { marginTop: 10, gap: 8 },
  payBtn: { borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  payBtnDark: { backgroundColor: colors.text },
  payBtnWhatsapp: { backgroundColor: '#25D366' },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  footNote: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 4 },
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

