import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import { colors } from "./src/config/theme";

function Root() {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = React.useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (user) return <AppNavigator />;

  return showRegister
    ? <RegisterScreen onBackToLogin={() => setShowRegister(false)} />
    : <LoginScreen onGoToRegister={() => setShowRegister(true)} />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});
