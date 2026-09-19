import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AuthAPI } from '../api/endpoints';
import { colors, radius, shadow } from '../config/theme';
import RegisterScreen from './RegisterScreen';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const handleForgot = async () => {
    if (!forgotEmail) { setError('Ingrese su correo'); return; }
    setError(''); setLoading(true);
    try {
      await AuthAPI.forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!email || !password) { setError('Ingrese correo y contraseña'); return; }
    setError(''); setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      const e = err as Error;
      setError(e.message || 'Error al iniciar sesión');
    } finally { setLoading(false); }
  };

  if (showRegister) {
    return <RegisterScreen onBackToLogin={() => setShowRegister(false)} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>CG</Text>
            </View>
            <Text style={styles.title}>CubaGest</Text>
            <Text style={styles.subtitle}>Sistema de Gestion Empresarial</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="usuario@empresa.cu"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            {mode === 'login' ? (
              <>
                <Text style={styles.label}>Contraseña</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />

                <TouchableOpacity
                  style={[styles.btn, loading && { opacity: 0.65 }]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Iniciar sesión</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkBtn} onPress={() => { setMode('forgot'); setError(''); }}>
                  <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkBtn} onPress={() => setShowRegister(true)}>
                  <Text style={styles.linkText}>Crear mi negocio (primera vez)</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {forgotSent ? (
                  <View style={styles.okBox}>
                    <Text style={styles.okText}>
                      Si ese correo existe en nuestro sistema, te llegará un link para restablecer tu contraseña. Revisa también spam.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.label}>Correo de recuperación</Text>
                    <TextInput
                      style={styles.input}
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      placeholder="usuario@empresa.cu"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <TouchableOpacity
                      style={[styles.btn, loading && { opacity: 0.65 }]}
                      onPress={handleForgot}
                      disabled={loading}
                    >
                      {loading
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.btnText}>Enviar link de recuperación</Text>}
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={styles.linkBtn} onPress={() => { setMode('login'); setForgotSent(false); setError(''); }}>
                  <Text style={styles.linkText}>← Volver al inicio de sesión</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    ...shadow.lg,
  },
  logoText: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20, padding: 24,
    ...shadow.lg,
  },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, backgroundColor: colors.bg, color: colors.text,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 22,
    ...shadow.md,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  linkText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  okBox: { backgroundColor: colors.successBg, borderRadius: 10, padding: 12, marginBottom: 14 },
  okText: { color: '#065F46', fontSize: 13, lineHeight: 18 },
});
