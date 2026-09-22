import React from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { colors, NAVY } from './config/theme';
import LoginScreen from './screens/LoginScreen';
import AppNavigator from './navigation/AppNavigator';

function Root() {
  const { user, loading } = useAuth();
  const { mode } = useTheme();
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return user ? <AppNavigator /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          {/* SyncProvider queda dentro de AuthProvider porque depende del usuario
              y del estado online para disparar la sincronización automática. */}
          <SyncProvider>
            <StatusBar barStyle="light-content" backgroundColor={NAVY} />
            <Root />
          </SyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: NAVY },
});
