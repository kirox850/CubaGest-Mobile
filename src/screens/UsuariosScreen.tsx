import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { UsersAPI } from '../api/endpoints';
import { ROLES } from '../config/roles';
import { colors, themeRef } from '../config/theme';
import { Badge, EmptyState, ErrorBanner, Btn, Inp, Sel } from '../components/UI';
import Icon from '../components/Icon';
import type { User } from '../types';

export default function UsuariosScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal crear/editar
  const [modal, setModal] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('cajero');

  // Modal link de activación
  const [linkInfo, setLinkInfo] = useState<{ name: string; link?: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const list = await UsersAPI.list();
      setUsers(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setEditTarget(null);
    setName(''); setEmail(''); setPassword(''); setRole('cajero');
    setModal(true);
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    setName(u.name);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setModal(true);
  };

  const save = async () => {
    if (!name || !email) return Alert.alert('Faltan datos', 'Complete nombre y correo');
    if (!editTarget && !password) return Alert.alert('Faltan datos', 'Defina una contraseña inicial');
    setSaving(true);
    try {
      if (editTarget) {
        await UsersAPI.update(editTarget.id, { name, role });
        Alert.alert('✓', 'Usuario actualizado');
      } else {
        await UsersAPI.create({ name, email, password, role });
        Alert.alert('✓', 'Usuario creado');
      }
      setModal(false);
      load();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resendLink = async (u: User) => {
    setResendingId(u.id);
    try {
      const res = await UsersAPI.resendSetPassword(u.id);
      setLinkInfo({ name: u.name, link: (res as any)?.link });
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setResendingId(null);
    }
  };

  const deactivate = (u: User) => {
    Alert.alert('Desactivar usuario', `Desactivar a ${u.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar', style: 'destructive', onPress: async () => {
          try { await UsersAPI.remove(u.id); load(); }
          catch (err) { Alert.alert('Error', (err as Error).message); }
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      {/* Header — igual que la web: título + botón Nuevo Usuario */}
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title}>Usuarios</Text>
          <Text style={styles.subtitle}>{users.length} usuarios</Text>
        </View>
        <Btn icon="plus" label="Nuevo Usuario" onPress={openNew} />
      </View>
      <ErrorBanner message={error} />

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text="No hay usuarios" />}
        renderItem={({ item }) => (
          <View style={[styles.row, { opacity: item.active === false ? 0.6 : 1 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.email}>{item.email}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Badge label={ROLES[item.role]?.label || item.role} color={ROLES[item.role]?.color} />
                {item.active === false ? (
                  <Badge label="Inactivo (baja)" color="#DC2626" />
                ) : item.pending ? (
                  <Badge label="Pendiente de activar" color="#F97316" />
                ) : (
                  <Badge label="Activo" color="#10B981" />
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn variant="ghost" label="Editar" onPress={() => openEdit(item)} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />
                <Btn variant="ghost" label={resendingId === item.id ? '...' : '🔗 Link'} onPress={() => resendLink(item)} disabled={resendingId === item.id} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />
                {item.active !== false && (
                  <Btn variant="danger" label="Dar de baja" onPress={() => deactivate(item)} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />
                )}
              </View>
            </View>
          </View>
        )}
      />

      {/* Modal crear/editar — mismos campos que la web */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editTarget ? 'Editar Usuario' : 'Nuevo Usuario'}</Text>
            {!editTarget && (
              <Text style={styles.hint}>
                No se pide contraseña acá — apenas crees la cuenta, le llega un correo al usuario para que la elija él mismo.
              </Text>
            )}
            <Inp style={{ marginBottom: 10 }} placeholder="Nombre completo" value={name} onChangeText={setName} />
            <Inp
              style={{ marginBottom: 10 }}
              placeholder="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!editTarget}
            />
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.fieldLabel}>Rol del sistema</Text>
              <Sel
                value={role as string}
                onValueChange={(v: string) => setRole(v as User['role'])}
                items={Object.entries(ROLES).map(([k, v]) => ({ label: v.label, value: k }))}
              />
            </View>
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>
                <Text style={{ fontWeight: '700' }}>Permisos del rol {ROLES[role as string]?.label}:</Text> {ROLES[role as string]?.perms.join(', ')}
              </Text>
            </View>
            <View style={styles.modalActions}>
              <Btn variant="secondary" label="Cancelar" onPress={() => setModal(false)} />
              <Btn label={saving ? 'Guardando...' : editTarget ? 'Actualizar' : 'Crear Usuario'} onPress={save} disabled={saving} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal link para establecer contraseña */}
      <Modal visible={!!linkInfo} transparent animationType="fade" onRequestClose={() => setLinkInfo(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Link para {linkInfo?.name}</Text>
            <Text style={styles.hint}>
              Se envió un link al correo del usuario para que establezca su contraseña.
            </Text>
            {linkInfo?.link ? (
              <Text style={styles.linkBox} selectable>{linkInfo.link}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Btn variant="secondary" label="Cerrar" onPress={() => setLinkInfo(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  name: { fontWeight: '700', fontSize: 14, color: colors.text },
  email: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 20 },
  modalTitle: { fontWeight: '700', fontSize: 17, marginBottom: 8, color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  hintBox: { backgroundColor: colors.inputBg, borderRadius: 12, padding: 12, marginBottom: 10 },
  hintText: { fontSize: 12, color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  linkBox: { fontSize: 12, color: colors.primary, backgroundColor: colors.primaryTint, borderRadius: 8, padding: 10, marginBottom: 8 },
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

