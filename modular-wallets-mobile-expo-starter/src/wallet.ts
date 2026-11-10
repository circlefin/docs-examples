import { ContractAddress, encodeTransfer, toCircleSmartAccount } from '@circle-fin/modular-wallets-core';
import { createPublicClient, erc20Abi, formatUnits, http, type Address, type Hex } from 'viem';
import { createBundlerClient, getUserOperationHash } from 'viem/account-abstraction';
import { avalancheFuji } from 'viem/chains';
import { resolveCircleModularWalletsNativeModule, type CircleModularWalletsNativeModule } from '../modules/circle-modular-wallets';
import { createOfficialCircleNativeWebAuthnAccount, type OfficialCircleNativeCredential } from './native-passkey';
import { isDefiniteOperationRejection, parseTransfer } from './wallet-input';

export const network = avalancheFuji;
export const usdc = ContractAddress.AvalancheFuji_USDC;
const clientUrl = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';

export function walletConfig() {
  const clientKey = process.env.EXPO_PUBLIC_CIRCLE_CLIENT_KEY?.trim();
  const expectedRpId = process.env.EXPO_PUBLIC_WEBAUTHN_RP_ID?.trim();
  if (!clientKey || clientKey.startsWith('YOUR_') || !expectedRpId || expectedRpId === 'wallet.example.com') {
    throw new Error('Add your Circle testnet client key and passkey domain to .env.local, then restart Expo.');
  }
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(expectedRpId)) {
    throw new Error('The passkey domain must be a hostname, without https:// or a path.');
  }
  return { clientKey, clientUrl, expectedRpId };
}

export async function createWalletSession(credential: OfficialCircleNativeCredential, address?: Address, nativeModule = resolveCircleModularWalletsNativeModule()) {
  const { clientKey } = walletConfig();
  const native: CircleModularWalletsNativeModule | null = nativeModule;
  if (!native) throw new Error('Build the native app first. This example cannot run in Expo Go.');
  const headers = await native.rpcHeaders();
  const transport = http(`${clientUrl}/avalancheFuji`, {
    key: 'Modular wallets transport', timeout: 20_000, retryCount: 0,
    fetchOptions: { headers: { ...headers, Authorization: `Bearer ${clientKey}` } },
  });
  const publicClient = createPublicClient({ chain: network, transport });
  if (await publicClient.getChainId() !== network.id) throw new Error('The RPC returned a different network.');
  const account = await toCircleSmartAccount({
    client: publicClient, owner: createOfficialCircleNativeWebAuthnAccount(credential, native),
    name: 'Expo Passkey Wallet',
  });
  if (address && account.address.toLowerCase() !== address.toLowerCase()) throw new Error('The saved wallet address does not match this passkey.');
  const bundlerClient = createBundlerClient({ chain: network, transport,
    userOperation: { estimateFeesPerGas: async () => {
      const fees = await publicClient.request({ method: 'circle_getUserOperationGasPrice', params: [] } as never) as unknown as {
        medium?: { maxFeePerGas?: string; maxPriorityFeePerGas?: string };
      };
      if (!fees.medium?.maxFeePerGas || !fees.medium.maxPriorityFeePerGas) throw new Error('Gas estimation unavailable. Please retry.');
      const maxFeePerGas = BigInt(fees.medium.maxFeePerGas);
      const maxPriorityFeePerGas = BigInt(fees.medium.maxPriorityFeePerGas);
      if (maxFeePerGas <= 0n || maxPriorityFeePerGas < 0n || maxFeePerGas < maxPriorityFeePerGas) throw new Error('Invalid gas estimate.');
      return { maxFeePerGas, maxPriorityFeePerGas };
    } },
  });
  return {
    account,
    async balance() {
      const value = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
      return formatUnits(value, 6);
    },
    async send(recipient: string, amount: string, beforeBroadcast: (hash: Hex) => Promise<void>, onRejected: (hash: Hex) => Promise<void>) {
      const transfer = parseTransfer(recipient, amount);
      const available = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
      if (available < transfer.value) throw new Error('Not enough test USDC. Add test funds first.');
      const request = await bundlerClient.prepareUserOperation({ account, calls: [encodeTransfer(transfer.to, usdc, transfer.value)], paymaster: true });
      const signature = await account.signUserOperation(request);
      const hash = getUserOperationHash({ userOperation: { ...request, signature }, chainId: network.id,
        entryPointAddress: account.entryPoint.address, entryPointVersion: account.entryPoint.version });
      // Save the exact hash BEFORE the network can accept this operation.
      await beforeBroadcast(hash);
      let returnedHash: Hex;
      try {
        returnedHash = await bundlerClient.sendUserOperation({ ...request, account: undefined, signature, entryPointAddress: account.entryPoint.address });
      } catch (cause) {
        if (isDefiniteOperationRejection(cause)) await onRejected(hash);
        throw cause;
      }
      if (returnedHash !== hash) throw new Error('The bundler returned a different operation hash. Verify the saved operation before retrying.');
      return hash;
    },
    async receipt(hash: Hex) {
      const result = await bundlerClient.waitForUserOperationReceipt({ hash, timeout: 60_000 });
      if (!result.success || result.receipt.status !== 'success') return { success: false, hash: result.receipt.transactionHash };
      const code = await publicClient.getCode({ address: account.address });
      if (!code || code === '0x') throw new Error('Wallet deployment is not verified yet.');
      return { success: true, hash: result.receipt.transactionHash };
    },
  };
}
export type WalletSession = Awaited<ReturnType<typeof createWalletSession>>;
