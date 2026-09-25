import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AuthAPI } from '../api/endpoints';
import { colors, radius, shadow, card3d, NAVY } from '../config/theme';
import RegisterScreen from './RegisterScreen';

// ─── LOGIN (paridad visual con la web) ───────────────────────────────────────
// Fondo navy de marca con el hero del Brand Kit difuminado detrás (como el
// aside de la web) + tarjeta blanca SÓLIDA con sombras en capas (el panel 3D
// de la web). La lógica de sesión vive en AuthContext y no se toca.
//
// Errores CLAROS: el backend dice "Correo o contraseña incorrectos" o
// "Demasiados intentos..." — los mostramos tal cual. Solo cuando la falla es
// de red (AbortError → mensaje del cliente) decimos "Sin conexión", nunca
// para un 401 de credenciales.

const friendlyLoginError = (raw: string): string => {
  const msg = (raw || '').toLowerCase();
  if (msg.includes('incorrect') || msg.includes('inválid') || msg.includes('invalid')) {
    return 'Correo o contraseña incorrectos. Vuelve a intentarlo.';
  }
  if (msg.includes('demasiados') || msg.includes('too many') || msg.includes('rate')) {
    return 'Demasiados intentos fallidos. Espera unos minutos y prueba de nuevo.';
  }
  if (msg.includes('conexión') || msg.includes('conexion') || msg.includes('network') || msg.includes('abort')) {
    return 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }
  return raw || 'Error al iniciar sesión';
};

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
    } catch {
      // Por privacidad el backend responde igual exista o no el correo;
      // si falló la red mostramos lo mismo — no revelamos nada.
      setForgotSent(true);
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!email || !password) { setError('Ingrese correo y contraseña'); return; }
    setError(''); setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(friendlyLoginError((err as Error).message));
    } finally { setLoading(false); }
  };

  if (showRegister) {
    return <RegisterScreen onBackToLogin={() => setShowRegister(false)} />;
  }

  return (
    <ImageBackground
      source={require('../../assets/images/login-splash.jpg')}
      style={styles.bg}
      resizeMode="cover"
      blurRadius={6}
    >
      {/* Velo navy: mantiene el contraste del contenido sobre la imagen */}
      <View style={styles.veil} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

            {/* Logo + nombre (el logo real del Brand Kit) */}
            <View style={styles.logoWrap}>
              <ImageBackground
                source={require('../../assets/images/icon.png')}
                style={styles.logoImg}
                resizeMode="cover"
              />
              <Text style={styles.title}>CubaGest</Text>
              <Text style={styles.subtitle}>Gestión empresarial para tu negocio</Text>
            </View>

            {/* Tarjeta blanca 3D (equivalente del panel de la web) */}
            <View style={[styles.card, card3d]}>
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠ {error}</Text>
                </View>
              ) : null}

              {mode === 'login' ? (
                <>
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

            <Text style={styles.trialNote}>30 días gratis del plan Empresarial · Sin tarjeta</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: NAVY },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,18,32,0.72)' },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logoImg: {
    width: 68, height: 68, borderRadius: 16, overflow: 'hidden', marginBottom: 14,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 },
  // Tarjeta blanca SÓLIDA — colores fijos para máximo contraste en ambos
  // temas (no cambia con el modo oscuro, igual que en la web).
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: colors.bgCard,
    borderRadius: 22, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)' },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, backgroundColor: colors.bg, color: '#0F172A',
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
  okBox: { backgroundColor: colors.successBg, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  okText: { color: '#065F46', fontSize: 13, lineHeight: 18 },
  trialNote: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 22, textAlign: 'center' },
});
