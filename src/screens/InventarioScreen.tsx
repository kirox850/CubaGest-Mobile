import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Modal, Alert, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ProductsAPI, LocationsAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors } from '../config/theme';
import { CAN_MANAGE_INVENTORY } from '../config/roles';
import { Badge, EmptyState, ErrorBanner } from '../components/UI';
import { shareCSV } from '../utils/csv';
import { cacheProducts } from '../offline/offlineStore';
import type { Location, LocationStockItem, Product } from '../types';

const EMPTY_PRODUCT = {
  code: '',
  barcode: '',
  currency: 'CUP',
  name: '',
  category: '',
  unit: 'ud',
  price: '',
  cost: '',
  stock: '',
  minStock: '',
};

export default function InventarioScreen() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE_INVENTORY.includes(user?.role || '');
  const isAdmin = user?.role === 'admin';

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocId, setSelectedLocId] = useState<string>('');
  const [products, setProducts] = useState<LocationStockItem[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<LocationStockItem | null>(null);
  const [qty, setQty] = useState('');
  const [type, setType] = useState<'entrada' | 'salida'>('entrada');

  const [productModal, setProductModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  const selectedLocName = locations.find((l) => l.id === selectedLocId)?.name || '';
  const myLabel = !isAdmin && selectedLocName ? `Ubicación: ${selectedLocName}` : '';

  const loadLocations = useCallback(async () => {
    try {
      const locs = await LocationsAPI.list();
      setLocations(locs);
      setSelectedLocId((prev) => {
        if (prev) return prev;
        if (user?.role === 'almacenista') {
          return locs.find((l) => l.type === 'almacen')?.id || '';
        }
        if (user?.role === 'cajero') {
          return locs.find((l) => l.type === 'caja' && l.ownerUserId === user.id)?.id || '';
        }
        return locs.find((l) => l.type === 'almacen')?.id || locs[0]?.id || '';
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [user?.id, user?.role]);

  const load = useCallback(async () => {
    if (!selectedLocId) { setLoading(false); return; }
    try {
      setError('');
      setLoading(true);
      const { items } = await LocationsAPI.stock(selectedLocId);
      setProducts(items);
      // Cache offline: guardamos el stock de la ubicación operativa del
      // usuario (cajero/almacenista), igual que hace la web para el POS.
      if (user?.role !== 'admin') await cacheProducts(items);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, [selectedLocId, user?.role]);

  useFocusEffect(
    useCallback(() => {
      loadLocations();
    }, [loadLocations]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()),
  );

  const openAdjust = (p: LocationStockItem) => {
    setSelected(p);
    setQty('');
    setType('entrada');
  };

  const saveAdjust = async () => {
    const n = Number(qty);
    if (!n || n <= 0)
      return Alert.alert('Cantidad invalida', 'Ingrese una cantidad mayor a 0');
    try {
      // Endpoint real del backend: POST /locations/:id/adjust — el viejo
      // /products/:id/adjust-stock ya no existe.
      await LocationsAPI.adjust(selectedLocId, {
        productId: selected!.id,
        type,
        qty: n,
        reason: 'Ajuste desde app movil',
      });
      setSelected(null);
      load();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PRODUCT);
    setProductModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      code: p.code,
      barcode: (p as any).barcode || '',
      currency: (p as any).currency || 'CUP',
      name: p.name,
      category: p.category || '',
      unit: p.unit || 'ud',
      price: String(p.price),
      cost: String(p.cost || ''),
      stock: '',
      minStock: String(p.minStock || ''),
    });
    setProductModal(true);
  };

  const saveProduct = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.price) {
      Alert.alert('Campos requeridos', 'Codigo, nombre y precio son obligatorios.');
      return;
    }
    const price = Number(form.price);
    if (isNaN(price) || price < 0) {
      Alert.alert('Precio invalido', 'Ingrese un precio valido mayor o igual a 0.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        barcode: (form.barcode || '').trim() || undefined,
        currency: form.currency || 'CUP',
        name: form.name.trim(),
        category: form.category.trim(),
        unit: form.unit.trim() || 'ud',
        price,
        cost: Number(form.cost) || 0,
        ...(editing ? {} : { stock: Number(form.stock) || 0 }),
        minStock: Number(form.minStock) || 0,
      };

      if (editing) {
        await ProductsAPI.update(editing.id, payload);
      } else {
        await ProductsAPI.create(payload);
      }

      setProductModal(false);
      load();
    } catch (err) {
      Alert.alert('Error al guardar', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (p: Product) => {
    Alert.alert(
      'Desactivar producto',
      `Desea desactivar "${p.name}"? No se eliminara, solo se ocultara del inventario activo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await ProductsAPI.remove(p.id);
              load();
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            }
          },
        },
      ],
    );
  };

  const Field = ({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) => (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={colors.textMuted} {...props} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventario</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#F1F5F9' }]}
            onPress={() => shareCSV('inventario', products as any, [
              { key: 'code', label: 'Código' }, { key: 'name', label: 'Producto' }, { key: 'category', label: 'Categoría' },
              { key: 'unit', label: 'Unidad' }, { key: 'price', label: 'Precio' }, { key: 'currency', label: 'Moneda' },
              { key: 'stock', label: 'Stock' }, { key: 'minStock', label: 'Mínimo' },
            ])}
          >
            <Text style={[styles.addBtnText, { color: '#475569' }]}>CSV</Text>
          </TouchableOpacity>
          {canManage && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
              <Text style={styles.addBtnText}>+ Nuevo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Selector de ubicación (solo admin; el resto ve su ubicación fija) */}
      {isAdmin && locations.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={styles.locRow}>
            {locations.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.locChip, selectedLocId === l.id && styles.locChipActive]}
                onPress={() => setSelectedLocId(l.id)}
              >
                <Text style={[styles.locChipText, selectedLocId === l.id && { color: '#fff' }]}>
                  {l.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {myLabel ? <Text style={styles.locLabel}>{myLabel}</Text> : null}

      <ErrorBanner message={error} />

      <TextInput
        style={styles.search}
        placeholder="Buscar por nombre o codigo..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text={loading ? 'Cargando...' : 'No hay productos'} />}
        renderItem={({ item }) => {
          const low = Number(item.stock) <= Number(item.minStock);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => canManage && openAdjust(item)}
              onLongPress={() => canManage && openEdit(item)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.code}>
                  {item.code} · {item.category}
                </Text>
                {canManage && (
                  <Text style={styles.hint}>Toca para ajustar stock · Mantén para editar</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.price}>${Number(item.price).toFixed(2)}</Text>
                <Badge
                  label={`${item.stock} ${item.unit}`}
                  color={low ? '#F97316' : '#10B981'}
                />
                {canManage && (
                  <TouchableOpacity
                    onPress={() => confirmDelete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.deleteLink}>Desactivar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Modal: Ajuste de stock en la ubicación seleccionada */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Ajustar stock — {selected?.name}
            </Text>
            {selectedLocName ? (
              <Text style={styles.modalSub}>Ubicación: {selectedLocName}</Text>
            ) : null}
            <View style={styles.typeRow}>
              {(['entrada', 'salida'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      type === t && styles.typeBtnTextActive,
                    ]}
                  >
                    {t === 'entrada' ? 'Entrada (+)' : 'Salida (-)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.qtyInput}
              placeholder="Cantidad"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={qty}
              onChangeText={setQty}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSelected(null)}
              >
                <Text style={{ color: colors.textMuted }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAdjust}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Crear / Editar producto */}
      <Modal
        visible={productModal}
        transparent
        animationType="slide"
        onRequestClose={() => setProductModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { maxHeight: '90%' }]}>
              <Text style={styles.modalTitle}>
                {editing ? 'Editar producto' : 'Nuevo producto'}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Field
                  label="Codigo *"
                  value={form.code}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, code: v }))}
                  placeholder="Ej: P001"
                  autoCapitalize="characters"
                  editable={!editing}
                />
                <Field
                  label="Codigo de barras"
                  value={form.barcode}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, barcode: v }))}
                  placeholder="Escanea o digita (opcional)"
                />
                <Field
                  label="Nombre *"
                  value={form.name}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="Nombre del producto"
                />
                <Field
                  label="Categoria"
                  value={form.category}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, category: v }))}
                  placeholder="Ej: Alimentos"
                />
                <Field
                  label="Unidad de medida"
                  value={form.unit}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, unit: v }))}
                  placeholder="ud / kg / litro..."
                />
                <Field
                  label={`Precio de venta (${form.currency || 'CUP'}) *`}
                  value={form.price}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, price: v }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Costo (CUP)"
                  value={form.cost}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, cost: v }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                {!editing && (
                  <Field
                    label="Stock inicial"
                    value={form.stock}
                    onChangeText={(v: string) => setForm((f) => ({ ...f, stock: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                )}
                <Field
                  label="Stock minimo (alerta)"
                  value={form.minStock}
                  onChangeText={(v: string) => setForm((f) => ({ ...f, minStock: v }))}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </ScrollView>

              <View style={[styles.modalActions, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setProductModal(false)}
                  disabled={saving}
                >
                  <Text style={{ color: colors.textMuted }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={saveProduct}
                  disabled={saving}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
  addBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  locRow: { flexDirection: 'row', gap: 8 },
  locChip: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  locChipActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  locChipText: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  locLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 8, fontWeight: '600' },
  search: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#fff',
    marginBottom: 12,
    color: '#1E293B',
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  name: { fontWeight: '700', fontSize: 14, color: '#1E293B' },
  code: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  price: { fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  deleteLink: { fontSize: 11, color: '#EF4444', marginTop: 6 },

  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 8,
    color: '#1E293B',
  },
  modalSub: { fontSize: 12, color: '#3B82F6', fontWeight: '600', marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  typeBtnText: { color: '#1E293B', fontWeight: '600' },
  typeBtnTextActive: { color: '#fff' },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    fontSize: 16,
    marginBottom: 16,
    color: '#1E293B',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
});
