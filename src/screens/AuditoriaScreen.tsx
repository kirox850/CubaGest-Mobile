import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AuditAPI } from '../api/endpoints';
import { colors } from '../config/theme';
import { Badge, EmptyState, ErrorBanner } from '../components/UI';
import type { AuditLog } from '../types';

// Mapeo de acciones a etiquetas legibles — igual que la web.
const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'auth.login': { label: '🔐 Login', color: '#3B82F6' },
  'auth.register': { label: '🏢 Registro', color: '#8B5CF6' },
  'product.create': { label: '➕ Producto', color: '#10B981' },
  'product.update': { label: '✏️ Producto', color: '#3B82F6' },
  'product.delete': { label: '🗑 Producto', color: '#EF4444' },
  'sale.create': { label: '🧾 Venta', color: '#10B981' },
  'sale.void': { label: '🚫 Anulación', color: '#EF4444' },
  'expense.create': { label: '💸 Egreso', color: '#F97316' },
  'expense.delete': { label: '🗑 Egreso', color: '#EF4444' },
  'user.create': { label: '➕ Usuario', color: '#10B981' },
  'user.update': { label: '✏️ Usuario', color: '#3B82F6' },
  'user.delete': { label: '🗑 Usuario', color: '#EF4444' },
  'transfer.create': { label: '🚚 Envío', color: '#8B5CF6' },
  'transfer.approve': { label: '✅ Envío ok', color: '#10B981' },
  'transfer.reject': { label: '❌ Envío rech.', color: '#EF4444' },
  'location.adjust_stock': { label: '📦 Ajuste stock', color: '#F97316' },
  'closing.take_reading': { label: '📸 Lectura', color: '#3B82F6' },
  'closing.confirm': { label: '🧮 Cierre', color: '#10B981' },
  'subscription.payment': { label: '💳 Pago', color: '#10B981' },
};

const ENTITY_FILTERS = [
  { id: '', label: 'Todo' },
  { id: 'sale', label: 'Ventas' },
  { id: 'product', label: 'Productos' },
  { id: 'expense', label: 'Egresos' },
  { id: 'user', label: 'Usuarios' },
  { id: 'stock_transfer', label: 'Envíos' },
  { id: 'location_stock', label: 'Stock' },
  { id: 'cash_closing', label: 'Cierres' },
  { id: 'inventory_reading', label: 'Lecturas' },
];

export default function AuditoriaScreen() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const params: Record<string, string> = { limit: '150' };
      if (entity) params.entity = entity;
      const list = await AuditAPI.list(params);
      setRows(list);
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, [entity]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const detailText = (d: unknown): string => {
    if (!d) return '';
    if (typeof d === 'string') return d;
    try {
      const obj = typeof d === 'object' ? (d as Record<string, unknown>) : {};
      const parts: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
        parts.push(`${k}: ${val}`);
      }
      return parts.join(' · ');
    } catch {
      return String(d);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Auditoría</Text>
      <Text style={styles.subtitle}>Registro de actividad de la empresa</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <View style={styles.filterRow}>
          {ENTITY_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, entity === f.id && styles.filterChipActive]}
              onPress={() => setEntity(f.id)}
            >
              <Text style={[styles.filterText, entity === f.id && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ErrorBanner message={error} />

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          loading
            ? <EmptyState icon="⏳" text="Cargando..." />
            : <EmptyState icon="🕵️" text="No hay registros de auditoría" />
        }
        renderItem={({ item: r }) => {
          const meta = ACTION_LABELS[r.action] || { label: r.action, color: '#64748B' };
          const detail = detailText(r.detail);
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.action}>{meta.label}</Text>
                  <Badge label={r.entity} color={meta.color} />
                </View>
                <Text style={styles.userName}>👤 {r.userName}</Text>
                {detail ? (
                  <Text style={styles.detail} numberOfLines={3}>{detail}</Text>
                ) : null}
                <Text style={styles.date}>
                  {new Date(r.createdAt).toLocaleString('es-CU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC', padding: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 10 },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff',
  },
  filterChipActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  row: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#E2E8F0', padding: 12, marginBottom: 8,
  },
  action: { fontWeight: '700', fontSize: 13, color: '#1E293B' },
  userName: { fontSize: 11, color: '#475569', marginTop: 4, fontWeight: '600' },
  detail: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  date: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
});
