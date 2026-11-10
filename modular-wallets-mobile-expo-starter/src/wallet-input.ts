import { p256 } from '@noble/curves/p256';
import { BaseError, RpcRequestError, getAddress, isAddress, parseUnits, zeroAddress, type Address, type Hex } from 'viem';

export function isDefiniteOperationRejection(cause: unknown): boolean {
  if (!(cause instanceof BaseError)) return false;
  const rpc = cause.walk(error => error instanceof RpcRequestError);
  if (!(rpc instanceof RpcRequestError)) return false;
  if (/already known|already pending|already submitted|AA25|invalid nonce|nonce too low/i.test(rpc.details ?? '')) return false;
  return rpc.code === -32602 || (rpc.code >= -32508 && rpc.code <= -32500);
}

export function parseTransfer(recipient: string, amount: string): { to: Address; value: bigint } {
  const to = recipient.trim();
  if (!isAddress(to, { strict: true }) || to.toLowerCase() === zeroAddress) {
    throw new Error('Enter a valid recipient wallet address.');
  }
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount.trim())) {
    throw new Error('Enter a USDC amount with up to 6 decimal places.');
  }
  const value = parseUnits(amount.trim(), 6);
  if (value <= 0n || value >= 2n ** 256n) throw new Error('Enter a positive USDC amount.');
  return { to: getAddress(to), value };
}

// Accept raw P-256 and the pinned SDKs' SPKI / COSE envelopes. No browser SubtleCrypto.
export function normalizePublicKey(value: string): Hex {
  let hex = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) throw new Error('Invalid passkey public key.');
  const spkiPrefix = '3059301306072a8648ce3d020106082a8648ce3d03010703420004';
  if (hex.length === 154 && hex.startsWith('a5010203262001215820') && hex.slice(84, 90) === '225820') {
    hex = hex.slice(20, 84) + hex.slice(90);
  } else if (hex.length === 182 && hex.startsWith(spkiPrefix)) hex = hex.slice(spkiPrefix.length);
  else if (hex.length === 130 && hex.startsWith('04')) hex = hex.slice(2);
  if (hex.length !== 128) throw new Error('Unsupported passkey public key format.');
  try { p256.ProjectivePoint.fromHex(`04${hex}`).assertValidity(); }
  catch { throw new Error('Invalid P-256 passkey public key.'); }
  return `0x${hex}`;
}

export function normalizeNativeSignature(value: string): Hex {
  const hex = value.replace(/^0x/, '');
  try {
    const signature = hex.length === 128 ? p256.Signature.fromCompact(hex) : p256.Signature.fromDER(hex);
    return `0x${signature.normalizeS().toCompactHex()}`;
  } catch { throw new Error('Invalid native passkey signature.'); }
}
