import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Modal, Alert, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ProductsAPI, LocationsAPI } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, themeRef } from '../config/theme';
import { CAN_MANAGE_INVENTORY, CATEGORIES } from '../config/roles';
import { Badge, EmptyState, ErrorBanner, Btn, Inp, Sel } from '../components/UI';
import Icon from '../components/Icon';
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
  const [filterCat, setFilterCat] = useState('Todas');
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
      (filterCat === 'Todas' || p.category === filterCat) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        String((p as any).barcode || '').toLowerCase().includes(search.toLowerCase())),
  );
  const cats = ['Todas', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

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

  const reactivateProduct = async (id: string) => {
    try {
      // El backend expone POST /products/:id/reactivate
      await ProductsAPI.reactivate(id);
      load();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  };

  const confirmDelete = (p: Product) => {
    Alert.alert(
      'Desactivar producto',
      `¿Desactivar "${p.name}"? No se eliminará, solo se ocultará del inventario.`,
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
      {/* Header — igual que la web: título 22/800 + contador + botones */}
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title}>Inventario</Text>
          <Text style={styles.subtitle}>
            {products.filter((p: any) => p.active !== false).length} productos
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" icon="refresh" label="Actualizar" onPress={load} />
          <Btn variant="secondary" icon="doc" label="CSV" onPress={() => shareCSV('inventario', products as any, [
            { key: 'code', label: 'Código' }, { key: 'name', label: 'Producto' }, { key: 'category', label: 'Categoría' },
            { key: 'unit', label: 'Unidad' }, { key: 'price', label: 'Precio' }, { key: 'currency', label: 'Moneda' },
            { key: 'stock', label: 'Stock' }, { key: 'minStock', label: 'Mínimo' },
          ])} />
          {canManage && <Btn icon="plus" label="Nuevo Producto" onPress={openCreate} />}
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

      {/* Buscador con icono + filtro de categoría (igual que la web) */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <View style={{ flex: 1, minWidth: 200, justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: 10, zIndex: 1 }}>
            <Icon name="search" size={15} color={colors.textMuted} />
          </View>
          <Inp
            style={{ paddingLeft: 34 }}
            placeholder="Buscar por nombre, código o código de barras..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Sel
          style={{ width: 150 }}
          value={filterCat}
          onValueChange={setFilterCat}
          items={cats.map((c) => ({ label: c, value: c }))}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text={loading ? 'Cargando...' : 'No hay productos'} />}
        renderItem={({ item }) => {
          const low = Number(item.stock) <= Number(item.minStock);
          const p = item as any;
          return (
            <View style={[styles.row, { opacity: p.active === false ? 0.5 : 1 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>
                  {item.name} <Text style={styles.unit}>/{item.unit}</Text>
                </Text>
                <Text style={styles.code}>{item.code} · {item.category}</Text>
                <Text style={styles.price}>
                  {(p.currency === 'EUR' ? '€' : '$')}{Number(item.price).toFixed(2)}
                  <Text style={styles.unit}> {(p.currency || 'CUP')}</Text>
                  {'  '}Stock: <Text style={{ color: low ? '#F97316' : '#10B981', fontWeight: '700' }}>{item.stock}</Text>
                  {low ? ' ⚠ BAJO' : ''}
                </Text>
                {canManage && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <Btn variant="ghost" label="± Ajustar" onPress={() => openAdjust(item)} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />
                    <Btn variant="ghost" label="Editar" onPress={() => openEdit(item as any)} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />
                    {p.active !== false
                      ? <Btn variant="danger" label="Desactivar" onPress={() => confirmDelete(item as any)} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />
                      : <Btn variant="secondary" label="Activar" onPress={() => reactivateProduct(item.id)} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />}
                  </View>
                )}
              </View>
              <Badge label={p.active !== false ? 'Activo' : 'Inactivo'} color={p.active !== false ? '#10B981' : '#888'} />
            </View>
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

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  locRow: { flexDirection: 'row', gap: 8 },
  locChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.bgCard,
  },
  locChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  locChipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  locLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 8, fontWeight: '600' },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.bgCard,
    marginBottom: 12,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  name: { fontWeight: '700', fontSize: 14, color: colors.text },
  code: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  unit: { fontSize: 11, color: colors.textMuted, fontWeight: '400' },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  price: { fontWeight: '700', color: colors.text, marginBottom: 4 },
  deleteLink: { fontSize: 11, color: colors.danger, marginTop: 6 },

  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 8,
    color: colors.text,
  },
  modalSub: { fontSize: 12, color: colors.primary, fontWeight: '600', marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeBtnText: { color: colors.text, fontWeight: '600' },
  typeBtnTextActive: { color: '#fff' },
  qtyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    fontSize: 16,
    marginBottom: 16,
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: {
    backgroundColor: colors.primary,
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
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
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

