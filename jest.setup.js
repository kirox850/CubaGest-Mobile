// Mocks globales para los tests. Solo lo que la app necesita en un test
// unitario de lógica: no hay red ni Keychain reales.

// AsyncStorage es una dependencia nativa: su mock oficial vive en el paquete.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo: sin red real en el test.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  },
}));

// fetch global: cada test define su comportamiento.
global.fetch = jest.fn(() =>
  Promise.reject(new Error('fetch no configurado en el test')),
);
