import { getRandomValues } from 'expo-crypto';
import { registerRootComponent } from 'expo';
import App from './App';

// viem needs secure random bytes. Use the OS implementation, never Math.random.
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: {} });
if (!globalThis.crypto.getRandomValues) Object.defineProperty(globalThis.crypto, 'getRandomValues', { value: getRandomValues });
registerRootComponent(App);
