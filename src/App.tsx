import React from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import LoginScreen from './screens/LoginScreen';
import AppNavigator from './navigation/AppNavigator';

const PRIMARY = '#8B1A1A';

function Root() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }
  return user ? <AppNavigator /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* SyncProvider queda dentro de AuthProvider porque depende del usuario
            y del estado online para disparar la sincronización automática. */}
        <SyncProvider>
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
          <Root />
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
