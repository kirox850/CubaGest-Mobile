/**
 * Entry point de Expo — registerRootComponent se encarga del registro en
 * Expo Go y en builds nativas (equivalente a AppRegistry.registerComponent).
 */
import { registerRootComponent } from 'expo';

import App from './src/App';

registerRootComponent(App);
