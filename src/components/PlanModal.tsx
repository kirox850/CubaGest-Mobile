import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { colors, radius, themeRef } from '../config/theme';
import Icon from '../components/Icon';
import { PlanAPI, SubscriptionAPI } from '../api/endpoints';
import { showToast } from './UI';
import { showAlert, showConfirm, showError } from './dialogs';
import type { User, PlanInfo, SubscriptionStatus } from '../types';

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
  /** Se ignora cuando `embedded`: la visibilidad la lleva la pestaña. */
  visible?: boolean;
  onClose: () => void;
  user: User | null;
  /** Montada dentro de la pestaña "Mi plan" de Configuración: sin `Modal` propio. */
  embedded?: boolean;
}

export default function PlanModal({ visible, onClose, user, embedded = false }: PlanModalProps) {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [estado, setEstado] = useState<SubscriptionStatus | null>(null);

  const load = () => PlanAPI.get().then(setPlanInfo).catch(() => {});
  // El estado de la suscripción NO se deduce de `user.company`. Ese objeto
  // viene de la sesión cacheada en el dispositivo y se refresca al revalidar
  // al arrancar, así que puede llevar horas diciendo que no hay nada cancelado
  // después de que el dueño cancelara desde el navegador. `GET
  // /subscription/status` es la verdad y se pide cada vez que se abre el modal:
  // es una petición barata y la respuesta decide si se ofrece cancelar.
  const loadEstado = () => SubscriptionAPI.status().then(setEstado).catch(() => {});

  useEffect(() => {
    if (visible) { load(); loadEstado(); }
  }, [visible]);

  const effectivePlan = planInfo?.plan || user?.company?.plan || 'free';
  const subStatus = planInfo?.subscriptionStatus || estado?.subscriptionStatus || user?.company?.subscriptionStatus;
  const isTrial = estado?.isTrial ?? subStatus === 'trial';
  const isFailed = subStatus === 'failed';
  const isCancelled = estado?.isCancelled ?? subStatus === 'cancelled';
  const planExpiry = estado?.planExpiry ?? user?.company?.planExpiry;
  const daysLeft = estado?.daysLeft ?? (planExpiry
    ? Math.max(0, Math.ceil((new Date(planExpiry).getTime() - Date.now()) / 86400000))
    : null);
  // Solo se ofrece cancelar si HAY un plan de pago vivo. Con un plan free, o
  // con uno ya cancelado, el botón sería un 400 del servidor garantizado.
  const sePuedeCancelar =
    user?.role === 'admin' && !isTrial && !isCancelled && effectivePlan !== 'free' && !!daysLeft;

  const handleQvaPay = async (planKey: string) => {
    try {
      setLoading(true);
      setSelectedPlan(planKey);
      const data = await SubscriptionAPI.authorizeQvapay(planKey);
      if (data?.url) {
        const supported = await Linking.canOpenURL(data.url);
        if (supported) await Linking.openURL(data.url);
        else showError('No se pudo abrir el enlace de pago de QvaPay.');
      }
    } catch (e) {
      const err = e as Error;
      showError('No se pudo conectar con QvaPay: ' + (err.message || ''));
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  const handleCancelar = async () => {
    // El botón tiene que decir qué pasa ANTES de cancelar, no después. Quien
    // ve "Cancelar suscripción" sin más imagina que mañana pierde el acceso, y
    // la verdad es lo contrario: sigue teniendo el plan hasta que termina el
    // periodo que ya pagó.
    const ok = await showConfirm(
      'Vas a seguir teniendo el plan ' + effectivePlan.toUpperCase() + ' hasta el ' +
        (planExpiry ? new Date(planExpiry).toLocaleDateString('es-CU', { day: 'numeric', month: 'long' }) : 'fin del periodo pagado') +
        '. Después de esa fecha vuelves al plan Free automáticamente, sin que se te cobre nada más.',
    );
    if (!ok) return;
    setCancelando(true);
    try {
      const r = await SubscriptionAPI.cancel();
      await loadEstado();
      await load();
      if (r.alreadyCancelled) {
        showAlert('Esta empresa ya tenía cancelada la suscripción.', 'Ya estaba cancelada');
        onClose();
        return;
      }
      showToast('Suscripción cancelada', 'success');
      onClose();
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setCancelando(false);
    };
  };

  const handleWhatsApp = (planKey: string, priceUSD: number) => {
    const p = PLANS.find(x => x.key === planKey);
    const company = user?.company?.name || 'mi empresa';
    const email = user?.email || '';
    const msg = encodeURIComponent(
      `Hola, quiero activar el plan *${p?.label}* de CubaGest.\n\n` +
      `Empresa: ${company}\n` +
      `Correo: ${email}\n` +
      `Plan: ${p?.label} — $${priceUSD} USD/mes\n\n` +
      `Por favor indícame cómo proceder con el pago.`
    );
    Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`);
  };

  // `embedded` solo cambia la ENVOLVENTURA: el contenido es el mismo. En la
  // pestaña de Configuración el `Modal` propio sería un modal dentro de un
  // modal, que en Android es exactamente el caso que se rompe.
  const contenido = (
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Planes — CubaGest</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {isTrial && daysLeft !== null && (
              <View style={[styles.banner, { backgroundColor: daysLeft <= 7 ? colors.warningBg : colors.primaryTint, borderColor: daysLeft <= 7 ? colors.warningBorder : colors.primaryTintB }]}>
                <Text style={[styles.bannerTitle, { color: daysLeft <= 7 ? colors.warningText : colors.primaryText }]}>
                  <Icon name={daysLeft <= 7 ? 'alert' : 'gift'} size={15} color={daysLeft <= 7 ? colors.warningText : colors.primary} />
                  Período de prueba — {daysLeft} día{daysLeft !== 1 ? 's' : ''} restante{daysLeft !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.bannerSub}>Estás usando el plan Empresarial gratis. Al vencer pasarás automáticamente al plan Free.</Text>
              </View>
            )}

            {isFailed && (
              <View style={[styles.banner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerLight }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="alert" size={15} color={colors.danger} />
                <Text style={[styles.bannerTitle, { color: colors.danger }]}>Pago fallido</Text>
              </View>
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
                      <Icon name="check" size={13} color={colors.primary} />
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
                          : <>                <Icon name="credit_card" size={15} color="#fff" />
                                <Text style={styles.payBtnText}>Pagar con QvaPay</Text>
                              </>}
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.payBtn, styles.payBtnWhatsapp]} onPress={() => handleWhatsApp(p.key, p.priceUSD)}>
                        <>
                          <Icon name="message" size={15} color={colors.primary} />
                          <Text style={[styles.payBtnText, { color: colors.primary }]}>Pagar por WhatsApp</Text>
                        </>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Cancelado: se dice CUÁNTO le queda, no solo que se canceló. */}
            {isCancelled && (
              <View style={[styles.banner, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
                <Text style={[styles.bannerTitle, { color: colors.warningText }]}>Suscripción cancelada</Text>
                <Text style={styles.bannerSub}>
                  {daysLeft !== null && daysLeft > 0
                    ? `No se renueva. Te quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''} con el plan actual, hasta el ${planExpiry ? new Date(planExpiry).toLocaleDateString('es-CU', { day: 'numeric', month: 'long' }) : 'fin del periodo pagado'}.`
                    : 'No se renueva. La próxima vez que se abra el negocio, vuelves al plan Free.'}
                </Text>
              </View>
            )}

            <Text style={styles.footNote}>Los pagos por QvaPay se renuevan automáticamente cada 30 días. Puedes cancelar en cualquier momento.</Text>

            {sePuedeCancelar && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelar}
                disabled={cancelando}
              >
                {cancelando
                  ? <ActivityIndicator color={colors.dangerText} size="small" />
                  : <Text style={styles.cancelBtnText}>Cancelar suscripción</Text>}
              </TouchableOpacity>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );

    if (embedded) return <View>{contenido}</View>;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>

      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Planes — CubaGest</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {isTrial && daysLeft !== null && (
              <View style={[styles.banner, { backgroundColor: daysLeft <= 7 ? colors.warningBg : colors.primaryTint, borderColor: daysLeft <= 7 ? colors.warningBorder : colors.primaryTintB }]}>
                <Text style={[styles.bannerTitle, { color: daysLeft <= 7 ? colors.warningText : colors.primaryText }]}>
                  <Icon name={daysLeft <= 7 ? 'alert' : 'gift'} size={15} color={daysLeft <= 7 ? colors.warningText : colors.primary} />
                  Período de prueba — {daysLeft} día{daysLeft !== 1 ? 's' : ''} restante{daysLeft !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.bannerSub}>Estás usando el plan Empresarial gratis. Al vencer pasarás automáticamente al plan Free.</Text>
              </View>
            )}

            {isFailed && (
              <View style={[styles.banner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerLight }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="alert" size={15} color={colors.danger} />
                <Text style={[styles.bannerTitle, { color: colors.danger }]}>Pago fallido</Text>
              </View>
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
                      <Icon name="check" size={13} color={colors.primary} />
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
                          : <>                <Icon name="credit_card" size={15} color="#fff" />
                                <Text style={styles.payBtnText}>Pagar con QvaPay</Text>
                              </>}
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.payBtn, styles.payBtnWhatsapp]} onPress={() => handleWhatsApp(p.key, p.priceUSD)}>
                        <>
                          <Icon name="message" size={15} color={colors.primary} />
                          <Text style={[styles.payBtnText, { color: colors.primary }]}>Pagar por WhatsApp</Text>
                        </>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Cancelado: se dice CUÁNTO le queda, no solo que se canceló. */}
            {isCancelled && (
              <View style={[styles.banner, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
                <Text style={[styles.bannerTitle, { color: colors.warningText }]}>Suscripción cancelada</Text>
                <Text style={styles.bannerSub}>
                  {daysLeft !== null && daysLeft > 0
                    ? `No se renueva. Te quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''} con el plan actual, hasta el ${planExpiry ? new Date(planExpiry).toLocaleDateString('es-CU', { day: 'numeric', month: 'long' }) : 'fin del periodo pagado'}.`
                    : 'No se renueva. La próxima vez que se abra el negocio, vuelves al plan Free.'}
                </Text>
              </View>
            )}

            <Text style={styles.footNote}>Los pagos por QvaPay se renuevan automáticamente cada 30 días. Puedes cancelar en cualquier momento.</Text>

            {sePuedeCancelar && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelar}
                disabled={cancelando}
              >
                {cancelando
                  ? <ActivityIndicator color={colors.dangerText} size="small" />
                  : <Text style={styles.cancelBtnText}>Cancelar suscripción</Text>}
              </TouchableOpacity>
            )}
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
  card: { backgroundColor: colors.bgCard, borderRadius: radius.xl, width: '100%', maxHeight: '88%', overflow: 'hidden' },
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

  planCard: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.xl, padding: 16, marginBottom: 12, position: 'relative' },
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

  cancelBtn: {
    borderWidth: 1, borderColor: colors.danger, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginTop: 10,
  },
  cancelBtnText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
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

