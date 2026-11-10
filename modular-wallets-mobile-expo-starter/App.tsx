import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { isAddress, type Address, type Hex } from 'viem';
import { resolveCircleModularWalletsNativeModule, type CircleModularWalletsNativeModule } from './modules/circle-modular-wallets';
import { registerOfficialCircleNativeCredential, loginOfficialCircleNativeCredential, reconnectOfficialCircleNativeCredential, type OfficialCircleNativeCredential } from './src/native-passkey';
import { createWalletSession, network, walletConfig, type WalletSession } from './src/wallet';
import { normalizePublicKey, parseTransfer } from './src/wallet-input';

function isBackgrounded() { return AppState.currentState === 'background'; }
const storageKey = 'passkey-wallet-v1';
type SavedWallet = { credential: OfficialCircleNativeCredential; address?: Address; pending?: Hex };
const colors = { purple: '#6951ce', ink: '#352575', pale: '#f6f2ff', line: '#e4d8ff', mint: '#aeffea' };

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && styles.dim]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}

function WalletScreen() {
  const [saved, setSaved] = useState<SavedWallet | null>(null);
  const savedRef = useRef<SavedWallet | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [locked, setLocked] = useState(true);
  const lockedRef = useRef(true);
  const [covered, setCovered] = useState(false);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const nativePrompt = useRef(false);
  const epoch = useRef(0);
  const [authLabel, setAuthLabel] = useState('Biometrics');
  const [balance, setBalance] = useState('—');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [transaction, setTransaction] = useState<Hex>();

  function lock() {
    epoch.current += 1;
    lockedRef.current = true;
    setLocked(true); setSession(null); setBalance('—');
    setRecipient(''); setAmount(''); setNotice(''); setTransaction(undefined); setError('');
  }

  useEffect(() => {
    async function load() {
      try {
        const encoded = await SecureStore.getItemAsync(storageKey);
        if (encoded) {
          const record = JSON.parse(encoded) as SavedWallet;
          if (!record.credential?.id || !record.credential.rpId || (record.address && !isAddress(record.address))
            || (record.pending && !/^0x[0-9a-f]{64}$/i.test(record.pending))) throw new Error('Saved wallet data is invalid. Do not reset it; check your device backup.');
          record.credential.publicKey = normalizePublicKey(record.credential.publicKey);
          savedRef.current = record; setSaved(record);
        }
        setLoaded(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        setAuthLabel(Platform.OS === 'ios'
          ? types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'Face ID' : 'Touch ID'
          : 'Biometrics');
      } catch { setError('Unable to load your saved wallet. Close and reopen the app; your passkey has not been removed.'); }
    }
    void load();
    const listener = AppState.addEventListener('change', state => {
      // Hide immediately during app switching, including the OS passkey prompt.
      setCovered(state !== 'active');
      if (state === 'background' && !nativePrompt.current) lock();
    });
    return () => listener.remove();
  }, []);

  async function save(record: SavedWallet) {
    await SecureStore.setItemAsync(storageKey, JSON.stringify(record), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    savedRef.current = record; setSaved(record);
  }

  async function prompt<T>(work: () => Promise<T>) {
    if (AppState.currentState !== 'active') throw new Error('Return to the app to approve.');
    nativePrompt.current = true;
    try { return await work(); }
    finally { nativePrompt.current = false; if (isBackgrounded()) lock(); }
  }

  function moduleWithPrompt(): CircleModularWalletsNativeModule {
    const native = resolveCircleModularWalletsNativeModule();
    if (!native) throw new Error('This requires a native development build. Expo Go is not supported.');
    return {
      register: (...args) => prompt(() => native.register(...args)),
      login: (...args) => prompt(() => native.login(...args)),
      sign: (...args) => {
        if (lockedRef.current) throw new Error('Unlock your wallet before approving.');
        return prompt(() => native.sign(...args));
      },
      rpcHeaders: () => native.rpcHeaders(),
    };
  }

  async function run(label: string, work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError('');
    try { await work(); }
    catch (cause) {
      if (lockedRef.current && label !== 'Connecting your passkey…' && label !== 'Reconnecting…') return;
      const key = process.env.EXPO_PUBLIC_CIRCLE_CLIENT_KEY || '';
      const message = cause instanceof Error ? cause.message : 'Something went wrong. Please retry.';
      setError(key ? message.split(key).join('[redacted]') : message);
    } finally { busyRef.current = false; setBusy(''); }
  }

  async function connect(create: boolean) {
    const config = walletConfig();
    const native = moduleWithPrompt();
    const currentEpoch = epoch.current;
    if (create && savedRef.current) throw new Error('Reconnect your existing wallet instead.');
    if (!await LocalAuthentication.hasHardwareAsync() || !await LocalAuthentication.isEnrolledAsync()) {
      throw new Error('Set up Face ID, Touch ID, or fingerprint unlock in your device settings first.');
    }
    const authentication = await prompt(() => LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your wallet', cancelLabel: 'Cancel', disableDeviceFallback: false, biometricsSecurityLevel: 'strong',
    }));
    if (!authentication.success) throw new Error('Unlock canceled. Your wallet stays locked.');
    if (epoch.current !== currentEpoch) return;
    const stored = savedRef.current;
    const credential = create
      ? await registerOfficialCircleNativeCredential({ ...config, userName: 'My Wallet' }, native)
      : stored
        ? await reconnectOfficialCircleNativeCredential({ ...config, expectedCredentialId: stored.credential.id }, native)
        : await loginOfficialCircleNativeCredential(config, native);
    if (stored && normalizePublicKey(stored.credential.publicKey) !== credential.publicKey) throw new Error('The selected passkey public key does not match your saved wallet.');
    // Retain the new credential even if address creation or the RPC fails. Retry reconnects it.
    if (!stored) await save({ credential: { id: credential.id, publicKey: credential.publicKey, rpId: credential.rpId } });
    if (epoch.current !== currentEpoch) return;
    const next = await createWalletSession(credential, stored?.address, native);
    if (stored?.address && next.account.address.toLowerCase() !== stored.address.toLowerCase()) throw new Error('The connected passkey belongs to a different wallet.');
    await save({ credential: { id: credential.id, publicKey: credential.publicKey, rpId: credential.rpId }, address: next.account.address, ...(stored?.pending ? { pending: stored.pending } : {}) });
    if (epoch.current !== currentEpoch || AppState.currentState !== 'active') return;
    lockedRef.current = false; setLocked(false); setSession(next);
    setNotice(stored?.pending ? 'A transfer is awaiting confirmation. Check its status before sending again.' : 'Your passkey is connected.');
    const initialBalance = await next.balance();
    if (!lockedRef.current && epoch.current === currentEpoch) setBalance(initialBalance);
  }

  async function checkTransfer(next: WalletSession, record: SavedWallet) {
    if (!record.pending) return;
    const receiptEpoch = epoch.current;
    const receipt = await next.receipt(record.pending);
    await save({ credential: record.credential, address: record.address });
    if (!receipt.success) throw new Error('The transfer failed onchain. No successful transfer was recorded; you can review and retry.');
    if (!lockedRef.current && epoch.current === receiptEpoch) {
      setTransaction(receipt.hash); setNotice('Transfer confirmed.');
      const refreshed = await next.balance();
      if (!lockedRef.current && epoch.current === receiptEpoch) setBalance(refreshed);
    }
  }

  function review() {
    try {
      const transfer = parseTransfer(recipient, amount);
      Alert.alert('Review transfer', `Send ${amount.trim()} test USDC\n\nTo ${transfer.to}\n\nAvalanche Fuji • test funds only`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve with passkey', onPress: () => void run('Waiting for your approval…', async () => {
          if (lockedRef.current || !session || !savedRef.current || savedRef.current.pending) throw new Error('Unlock the wallet and check any pending transfer first.');
          const sendingEpoch = epoch.current;
          const activeSession = session;
          const hash = await activeSession.send(recipient, amount, async hash => {
            if (lockedRef.current || epoch.current !== sendingEpoch) throw new Error('Wallet locked. Review the transfer again.');
            const record = { ...savedRef.current!, pending: hash };
            await save(record);
            if (lockedRef.current || epoch.current !== sendingEpoch) {
              await save({ credential: record.credential, address: record.address });
              throw new Error('Wallet locked before submission. Review the transfer again.');
            }
            setNotice('Operation prepared. Waiting for submission and confirmation…');
          }, async hash => {
            const record = savedRef.current;
            if (record?.pending === hash) await save({ credential: record.credential, address: record.address });
            if (!lockedRef.current) setNotice('Transfer rejected before submission. Review the error and retry.');
          });
          if (!lockedRef.current) setNotice('Transfer submitted. Waiting for confirmation…');
          await checkTransfer(activeSession, { ...savedRef.current!, pending: hash });
          setAmount(''); setRecipient('');
        }) },
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the recipient and amount.'); }
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" />
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.top}><Text style={styles.brand}>Passkey Wallet</Text><Text style={styles.pill}>TESTNET</Text></View>
        {locked ? <View style={styles.card}>
          <Text style={styles.symbol}>◎</Text><Text style={styles.title}>{saved ? 'Welcome back.' : 'Your wallet. Your passkey.'}</Text>
          <Text style={styles.body}>Unlock with {authLabel}. Approve transfers with your device’s secure passkey prompt.</Text>
          <Button title={saved ? `Unlock with ${authLabel}` : 'Create my wallet'} disabled={!loaded || !!busy} onPress={() => void run('Connecting your passkey…', () => connect(!saved))} />
          {!saved && <Button secondary title="I already have a passkey" disabled={!loaded || !!busy} onPress={() => void run('Reconnecting…', () => connect(false))} />}
          {!saved && <Text style={styles.small}>Creating a wallet saves a passkey in your device’s passkey provider. Keep access to that provider; this demo has no recovery service.</Text>}
        </View> : <>
          <View style={styles.card}>
            <Text style={styles.label}>YOUR BALANCE</Text><Text style={styles.balance}>{balance} <Text style={styles.unit}>USDC</Text></Text>
            <Text style={styles.small}>{network.name} • test funds only</Text>
            <View style={styles.divider} /><Text style={styles.label}>RECEIVE AT THIS ADDRESS</Text>
            <Text selectable style={styles.address}>{saved?.address}</Text>
            <Button secondary title="Refresh balance" disabled={!!busy} onPress={() => void run('Refreshing…', async () => { if (session) { const refreshEpoch = epoch.current; const value = await session.balance(); if (!lockedRef.current && epoch.current === refreshEpoch) setBalance(value); } })} />
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>Send test USDC</Text>
            <Text style={styles.label}>RECIPIENT</Text><TextInput accessibilityLabel="Recipient wallet address" style={styles.input} value={recipient} onChangeText={setRecipient} autoCapitalize="none" autoCorrect={false} placeholder="0x…" editable={!busy && !saved?.pending} />
            <Text style={styles.label}>AMOUNT</Text><TextInput accessibilityLabel="Amount in test USDC" style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" editable={!busy && !saved?.pending} />
            <Button title={saved?.pending ? 'Transfer awaiting confirmation' : 'Review transfer'} disabled={!!busy || !!saved?.pending || !recipient || !amount} onPress={review} />
            {saved?.pending && <Button secondary title="Check transfer status" disabled={!!busy} onPress={() => void run('Checking confirmation…', async () => { if (session && savedRef.current) await checkTransfer(session, savedRef.current); })} />}
            {saved?.pending && <Text selectable style={styles.small}>Pending operation: {saved.pending}</Text>}
            <Text style={styles.small}>Circle Gas Station must sponsor your testnet transfers. The first successful transfer deploys the wallet.</Text>
          </View>
          <Button secondary title="Lock wallet" disabled={!!busy} onPress={lock} />
        </>}
        {!!busy && <View style={styles.loading} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.purple} /><Text style={styles.body}>{busy}</Text></View>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!!transaction && <Button secondary title="View confirmed transfer ↗" onPress={() => void Linking.openURL(`https://testnet.snowtrace.io/tx/${transaction}`)} />}
        <Text style={styles.footer}>No seed phrase in the app. No private key in JavaScript.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    {covered && <View style={styles.cover}><Text style={styles.brand}>Passkey Wallet</Text><Text style={styles.body}>Your wallet is hidden.</Text></View>}
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><WalletScreen /></SafeAreaProvider>; }
const styles = StyleSheet.create({
  fill: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.pale }, scroll: { padding: 20, gap: 16, width: '100%', maxWidth: 520, alignSelf: 'center', paddingBottom: 40 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 }, brand: { fontSize: 21, fontWeight: '700', color: colors.ink },
  pill: { backgroundColor: colors.mint, color: colors.ink, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontSize: 11, fontWeight: '700' },
  card: { backgroundColor: '#ffffff', borderRadius: 24, padding: 24, gap: 16, borderWidth: 1, borderColor: colors.line }, symbol: { fontSize: 56, color: colors.purple },
  title: { fontSize: 32, fontWeight: '700', color: colors.ink }, heading: { fontSize: 22, fontWeight: '700', color: colors.ink }, body: { fontSize: 16, lineHeight: 24, color: colors.ink, flexShrink: 1 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.purple }, balance: { fontSize: 36, fontWeight: '700', color: colors.ink }, unit: { fontSize: 18 },
  small: { fontSize: 13, lineHeight: 20, color: '#6c628b' }, address: { fontSize: 14, lineHeight: 22, color: colors.ink }, divider: { height: 1, backgroundColor: colors.line },
  button: { backgroundColor: colors.purple, minHeight: 52, borderRadius: 16, padding: 14, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  secondary: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: colors.line }, secondaryText: { color: colors.purple }, dim: { opacity: 0.5 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pale, borderRadius: 14, padding: 16, fontSize: 16, color: colors.ink }, loading: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  notice: { backgroundColor: colors.mint, borderRadius: 14, padding: 16, lineHeight: 22, color: colors.ink }, error: { color: '#a12841', lineHeight: 22, padding: 12 }, footer: { textAlign: 'center', fontSize: 12, lineHeight: 18, color: '#6c628b' },
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.pale, justifyContent: 'center', alignItems: 'center', gap: 12 },
});
