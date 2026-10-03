import type { ExpoConfig } from 'expo/config';

const rpId = process.env.EXPO_PUBLIC_WEBAUTHN_RP_ID || 'wallet.example.com';
const config: ExpoConfig = {
  name: 'Passkey Wallet', slug: 'modular-wallets-mobile-expo-starter', version: '0.2.0',
  orientation: 'portrait', userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.example.walletdemo', associatedDomains: [`webcredentials:${rpId}`] },
  android: { package: 'com.example.walletdemo' },
  plugins: [
    ['expo-local-authentication', { faceIDPermission: 'Unlock your wallet with Face ID.' }],
    'expo-secure-store',
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' }, android: { minSdkVersion: 26 } }],
  ],
};
export default config;
