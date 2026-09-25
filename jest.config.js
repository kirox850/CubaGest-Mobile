// Configuración de tests. El preset de Expo (jest-expo) NO se puede usar en
// este checkout: su setup importa `expo-modules-core`, que no está instalado
// (y no se puede instalar sin red). Por eso usamos el preset oficial de React
// Native (@react-native/jest-preset, incluido en las dependencias) y el mismo
// babel-preset-expo del proyecto para transpilar TS/TSX.
module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
};
