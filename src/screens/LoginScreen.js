import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../config/theme";
import { ErrorBanner } from "../components/UI";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Ingrese correo y contraseña");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>CG</Text>
        </View>
        <Text style={styles.title}>CubaGest</Text>
        <Text style={styles.subtitle}>Sistema de Gestión Empresarial</Text>

        <View style={styles.form}>
          <ErrorBanner message={error} />
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="usuario@empresa.cu"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Iniciar sesión</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.primaryDark },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  logo: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  title: { color: "#fff", fontSize: 26, fontWeight: "800", marginBottom: 4 },
  subtitle: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 28 },
  form: { width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: colors.bg },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 13, alignItems: "center", marginTop: 22 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
