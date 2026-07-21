import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../config/theme";
import { ErrorBanner } from "../components/UI";

export default function RegisterScreen({ onBackToLogin }) {
  const { register } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [companyNit, setCompanyNit] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!companyName || !name || !email || !password) {
      setError("Complete al menos: nombre del negocio, su nombre, correo y contraseña");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register({ companyName, companyNit, name, email, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Crear mi negocio</Text>
        <Text style={styles.subtitle}>Esto crea tu empresa real en el sistema, con tu usuario como administrador</Text>

        <View style={styles.form}>
          <ErrorBanner message={error} />

          <Text style={styles.label}>Nombre del negocio</Text>
          <TextInput style={styles.input} value={companyName} onChangeText={setCompanyName} placeholder="Ej. Bodega El Progreso" />

          <Text style={styles.label}>NIT del negocio (opcional)</Text>
          <TextInput style={styles.input} value={companyNit} onChangeText={setCompanyNit} placeholder="00000000000" keyboardType="number-pad" />

          <Text style={styles.label}>Su nombre completo</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej. Juan Pérez" />

          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="usted@negocio.cu" autoCapitalize="none" keyboardType="email-address" />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" secureTextEntry />

          <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Crear negocio</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={onBackToLogin}>
            <Text style={styles.linkText}>Ya tengo cuenta, iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.primaryDark },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800", marginBottom: 4, textAlign: "center" },
  subtitle: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginBottom: 22, textAlign: "center", maxWidth: 320 },
  form: { width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: colors.bg },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 13, alignItems: "center", marginTop: 22 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkBtn: { marginTop: 14, alignItems: "center" },
  linkText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
});
