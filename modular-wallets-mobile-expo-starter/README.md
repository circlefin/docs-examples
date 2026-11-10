# Expo Passkey Wallet

A small, single-screen wallet for iOS and Android built from our native Expo implementation. Create or reconnect a passkey, unlock the app with Face ID / Touch ID / Android biometrics, receive test USDC, and review and approve a transfer.

**Avalanche Fuji only. Test funds only.** The first successful transfer deploys the smart account. This app uses public Circle SDK capabilities and contains no proprietary treasury, multisig, or agent-wallet integration.

## Run it

```sh
npm install
cp .env.example .env.local
# Fill in your own restricted Circle testnet client key and passkey domain.
npm run ios       # a signed native iOS development build
npm run android   # Android SDK package credentials required below
npm start
```

This requires a native development build; Expo Go does not include the Circle bridge and cannot test Face ID. Use Node 22.18+ for the test command. The Expo / React Native versions and package lock are included.

## Configure your app identity

1. In `app.config.ts`, replace the example iOS bundle ID and Android package with your own. The domain comes from `EXPO_PUBLIC_WEBAUTHN_RP_ID`.
2. Create a **testnet Client Key** in Circle Console, restricted to your passkey domain and native app identities. Configure the iOS bundle ID, Android package, and Android signing certificate fingerprint there. Use the public client key, never a server API key.
3. Serve the supplied `domain/.well-known` templates on your HTTPS passkey domain at the exact `.well-known` paths, without authentication. Replace the Apple Team ID, bundle ID, Android package, and signing fingerprints. Register your release certificate as well as your development certificate when shipping.
4. Android's SDK download requires your own GitHub Packages read credential in the build environment:
   ```sh
   export MWSDK_MAVEN_USERNAME=your_github_username
   export MWSDK_MAVEN_PASSWORD=your_package_read_token
   ```
   Alternatively, put `mwsdk.maven.username` and `mwsdk.maven.password` in private `~/.gradle/gradle.properties`. Keep these out of `EXPO_PUBLIC_*`, app config, and Git. For EAS, store them as build secrets and use the included development profile.
5. Enable Circle Gas Station sponsorship for Fuji test transfers and obtain test USDC from [Circle's faucet](https://faucet.circle.com/). Fund the address shown in the app before sending.

Circle native SDK versions: iOS **1.5.0**, Android **1.5.3**. Native changes require a rebuild. Passkeys need normal iOS signing/entitlements; do not disable code signing or manually re-sign the built app.

## How security works

- **App unlock:** Expo Local Authentication uses the device's biometric prompt, with OS passcode fallback. The app covers its content on app switching and locks on backgrounding; native approval dialogs are exempt from relocking themselves.
- **Transfer approval:** the official Circle native SDK asks the passkey provider to sign the operation. A Face ID success from app unlock is never treated as a wallet signature. The OS chooses the passkey prompt and any permitted verification fallback.
- **Storage:** SecureStore holds only credential ID, public key, domain, wallet address, and any pending operation hash. The private passkey stays with the device's passkey provider. Device-only metadata is not a wallet recovery mechanism; keep access to your passkey provider.
- **Reconnect:** cold starts require the saved wallet's passkey. A mismatched domain or credential is rejected. “I already have a passkey” also reconnects after installing the app on a new device with access to that passkey.
- **Submission:** recipient and exact six-decimal USDC amounts are validated. Each send has an explicit review. The exact signed operation's hash is saved **before broadcast**; a storage failure prevents submission. A definite validation rejection clears the pending hash. A network timeout or ambiguous response retains it and blocks another send. Confirmed onchain failure clears it; confirmed success checks deployed bytecode.

An ambiguous submission can remain pending even if it never reached the bundler. The screen shows the saved hash for investigation; this minimal demo deliberately has no force-reset or automatic resend that could duplicate a transfer.

## Small source map

- `App.tsx`: one wallet screen, biometric unlock, local persistence, review and pending state.
- `src/wallet.ts`: native-aware HTTP transport, Fuji smart account, balance and transfers.
- `src/native-passkey.ts`: official native owner adapter; no browser passkey API.
- `src/wallet-input.ts`: exact amounts, raw/SPKI/iOS COSE P-256 public keys, and native DER/compact signatures. No browser SubtleCrypto shim.
- `modules/circle-modular-wallets`: local Expo module wrapping Circle's public Swift/Kotlin APIs. `rpcHeaders()` supplies actual native app identifiers and Android signing fingerprint; no fake browser identity.

## Checks

```sh
npm run check          # TypeScript, input/crypto regression checks, source boundary scan
npm run export:verify  # iOS and Android Metro/Hermes bundles
```

Before using real funds, complete signed **physical-device** checks on both platforms: create, cancel, cold-restart reconnect, wrong-passkey refusal, biometric failure, background lock, receipt timeout/retry, sponsorship denial, and a successful funded transfer. Bundle/type checks do not prove the native device flow. This starter stays testnet-only.

## Public references

- [Circle public smart-account example](https://github.com/circlefin/modularwallets-web-sdk/tree/master/examples/circle-smart-account)
- [Circle iOS SDK](https://github.com/circlefin/modularwallets-ios-sdk) · [Circle Android SDK](https://github.com/circlefin/modularwallets-android-sdk)
- [Expo Local Authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/) · [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo local native modules](https://docs.expo.dev/modules/get-started/)

Apache 2.0; see [LICENSE](./LICENSE). Third-party SDKs retain their licenses.
