import type { Hex } from 'viem';
import { hashMessage, hashTypedData } from 'viem';
import type { WebAuthnAccount } from 'viem/account-abstraction';
import { normalizePublicKey, normalizeNativeSignature } from './wallet-input';

import {
  type CircleModularWalletsNativeModule,
  type CircleNativeCredential,
  type CircleNativeRegistrationCredential,
  type CircleNativeSignResult,
  resolveCircleModularWalletsNativeModule,
} from '../modules/circle-modular-wallets';

type CircleNativeConnectionInput = {
  clientKey: string;
  clientUrl: string;
  expectedRpId: string;
};

type CircleNativeRegisterInput = CircleNativeConnectionInput & {
  userName: string;
};

type CircleNativeReconnectInput = CircleNativeConnectionInput & {
  expectedCredentialId: string;
};

export type OfficialCircleNativeCredential = {
  id: string;
  publicKey: Hex;
  rpId: string;
  registration?: CircleNativeRegistrationCredential;
};

function requireNativeModule(
  nativeModule: CircleModularWalletsNativeModule | null
): CircleModularWalletsNativeModule {
  if (!nativeModule) {
    throw new Error(
      'The official Circle Modular Wallets native module is not installed in this development build. Rebuild the Expo dev client before using wallets.'
    );
  }
  return nativeModule;
}

function messageFromCause(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) {
    return cause.message.trim();
  }
  return 'Unknown native SDK failure';
}

function redactSensitiveValues(message: string, sensitiveValues: readonly string[]): string {
  return sensitiveValues.reduce(
    (sanitized, value) => (value ? sanitized.split(value).join('[redacted]') : sanitized),
    message
  );
}

async function callNative<T>(
  operation: string,
  run: () => Promise<T>,
  sensitiveValues: readonly string[] = []
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    // Native networking errors are outside our control and may echo request
    // metadata. Never attach the original exception when it could contain the
    // public-but-sensitive Client Key: error reporters recursively serialize
    // `cause`, which would undo a redacted top-level message.
    const sanitizedCause = redactSensitiveValues(messageFromCause(cause), sensitiveValues);
    throw new Error(`Circle native ${operation} failed: ${sanitizedCause}`, {
      cause: new Error(sanitizedCause),
    });
  }
}

function assertExpectedRpId(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `Circle Client Key passkey domain mismatch: the native SDK returned ${actual}, but this app requires ${expected}. Update the Client Key Web/passkey domain in Circle Console; no credential or UserOp was accepted.`
    );
  }
}

function ensureHex(value: string, label: string): Hex {
  const hex = value.startsWith('0x') ? value : `0x${value}`;
  if (!/^0x[0-9a-f]+$/i.test(hex)) {
    throw new Error(`Circle native SDK returned an invalid ${label}`);
  }
  return hex as Hex;
}

async function normalizeCredential(
  credential: CircleNativeCredential,
  expectedRpId: string
): Promise<OfficialCircleNativeCredential> {
  assertExpectedRpId(credential.rpId, expectedRpId);
  return {
    id: credential.id,
    publicKey: await normalizePublicKey(credential.publicKey),
    rpId: credential.rpId,
    ...(credential.registration ? { registration: credential.registration } : {}),
  };
}

export async function registerOfficialCircleNativeCredential(
  input: CircleNativeRegisterInput,
  nativeModule = resolveCircleModularWalletsNativeModule()
): Promise<OfficialCircleNativeCredential> {
  const module = requireNativeModule(nativeModule);
  const credential = await callNative(
    'passkey registration',
    () => module.register(input.clientKey, input.clientUrl, input.userName),
    [input.clientKey]
  );
  return normalizeCredential(credential, input.expectedRpId);
}

export async function loginOfficialCircleNativeCredential(
  input: CircleNativeConnectionInput,
  nativeModule = resolveCircleModularWalletsNativeModule()
): Promise<OfficialCircleNativeCredential> {
  const module = requireNativeModule(nativeModule);
  const credential = await callNative('passkey reconnect', () => module.login(input.clientKey, input.clientUrl), [input.clientKey]);
  return normalizeCredential(credential, input.expectedRpId);
}

export async function reconnectOfficialCircleNativeCredential(
  input: CircleNativeReconnectInput,
  nativeModule = resolveCircleModularWalletsNativeModule()
): Promise<OfficialCircleNativeCredential> {
  const module = requireNativeModule(nativeModule);
  const credential = await callNative(
    'passkey reconnect',
    () => module.login(input.clientKey, input.clientUrl),
    [input.clientKey]
  );
  const normalized = await normalizeCredential(credential, input.expectedRpId);
  if (normalized.id !== input.expectedCredentialId) {
    throw new Error(
      `Circle native passkey reconnect selected credential ${normalized.id}, but this wallet is owned by ${input.expectedCredentialId}. Select the wallet owner passkey and retry.`
    );
  }
  return normalized;
}

function decodeBase64Url(value: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes: number[] = [];

  for (let index = 0; index < padded.length; index += 4) {
    const chunk = padded.slice(index, index + 4);
    const values = [...chunk].map(character =>
      character === '=' ? 0 : alphabet.indexOf(character)
    );
    if (values.some(value => value < 0)) {
      throw new Error('Circle native SDK returned invalid base64url assertion data');
    }
    const packed = (values[0]! << 18) | (values[1]! << 12) | (values[2]! << 6) | values[3]!;
    bytes.push((packed >> 16) & 0xff);
    if (chunk[2] !== '=') bytes.push((packed >> 8) & 0xff);
    if (chunk[3] !== '=') bytes.push(packed & 0xff);
  }

  return Uint8Array.from(bytes).buffer;
}

function toRawCredential(result: CircleNativeSignResult) {
  return {
    id: result.raw.id,
    rawId: decodeBase64Url(result.raw.rawId),
    type: 'public-key' as const,
    authenticatorAttachment: result.raw.authenticatorAttachment ?? null,
    response: {
      clientDataJSON: decodeBase64Url(result.raw.response.clientDataJSON),
      authenticatorData: decodeBase64Url(result.raw.response.authenticatorData),
      signature: decodeBase64Url(result.raw.response.signature),
      userHandle: result.raw.response.userHandle
        ? decodeBase64Url(result.raw.response.userHandle)
        : null,
    },
    getClientExtensionResults: () => ({}),
  };
}

export function createOfficialCircleNativeWebAuthnAccount(
  credential: Pick<OfficialCircleNativeCredential, 'id' | 'publicKey'>,
  nativeModule = resolveCircleModularWalletsNativeModule()
): WebAuthnAccount {
  const module = requireNativeModule(nativeModule);
  const sign: WebAuthnAccount['sign'] = async ({ hash }) => {
    const result = await callNative('passkey signing', () => module.sign(hash));
    if (result.raw.id !== credential.id) throw new Error('A different passkey was selected. Reconnect your wallet.');
    if (!result.webauthn.userVerificationRequired) throw new Error('The passkey signature requires user verification.');
    return {
      signature: normalizeNativeSignature(result.signature),
      webauthn: {
        ...result.webauthn,
        authenticatorData: ensureHex(result.webauthn.authenticatorData, 'authenticator data'),
      },
      raw: toRawCredential(result),
    };
  };

  return {
    id: credential.id,
    publicKey: credential.publicKey,
    sign,
    signMessage: ({ message }) => sign({ hash: hashMessage(message) }),
    signTypedData: parameters => sign({ hash: hashTypedData(parameters) }),
    type: 'webAuthn',
  };
}
