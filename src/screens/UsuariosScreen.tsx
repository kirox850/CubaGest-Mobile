import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { UsersAPI } from '../api/endpoints';
import { ROLES } from '../config/roles';
import { colors, themeRef } from '../config/theme';
import { Badge, EmptyState, ErrorBanner } from '../components/UI';
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
      <View style={styles.header}>
        <Text style={styles.title}>Usuarios</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>+ Usuario</Text>
        </TouchableOpacity>
      </View>
      <ErrorBanner message={error} />

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState text="No hay usuarios" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openEdit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.name}
                {item.pending ? ' ⚠' : ''}
              </Text>
              <Text style={styles.email}>{item.email}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Badge label={ROLES[item.role]?.label || item.role} color={ROLES[item.role]?.color} />
              {item.pending && (
                <TouchableOpacity onPress={() => resendLink(item)} disabled={resendingId === item.id}>
                  <Text style={styles.resendLink}>{resendingId === item.id ? 'Enviando...' : 'Reenviar link'}</Text>
                </TouchableOpacity>
              )}
              {item.active && !item.pending && (
                <TouchableOpacity onPress={() => deactivate(item)}>
                  <Text style={styles.deactivateLink}>Desactivar</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Modal crear/editar */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editTarget ? 'Editar usuario' : 'Nuevo usuario'}</Text>
            {!editTarget && (
              <Text style={styles.hint}>
                El usuario recibirá un link para establecer su contraseña. También puedes definir una inicial.
              </Text>
            )}
            <TextInput style={styles.input} placeholder="Nombre completo" value={name} onChangeText={setName} placeholderTextColor={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Correo electronico"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!editTarget}
              placeholderTextColor={colors.textMuted}
            />
            {!editTarget && (
              <TextInput style={styles.input} placeholder="Contrasena inicial (opcional)" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={colors.textMuted} />
            )}
            <View style={styles.chipsRow}>
              {Object.entries(ROLES).map(([key, r]) => (
                <TouchableOpacity key={key} onPress={() => setRole(key as User['role'])} style={[styles.chip, role === key && { backgroundColor: r.color, borderColor: r.color }]}>
                  <Text style={[styles.chipText, role === key && styles.chipTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                <Text style={{ color: colors.textMuted }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </TouchableOpacity>
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
              <TouchableOpacity style={styles.saveBtn} onPress={() => setLinkInfo(null)}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  addBtn: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  name: { fontWeight: '700', fontSize: 14, color: colors.text },
  email: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  resendLink: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  deactivateLink: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 20 },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 8, color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, fontSize: 14, marginBottom: 10, color: colors.text, backgroundColor: colors.bg },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
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

