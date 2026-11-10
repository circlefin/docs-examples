import assert from 'node:assert/strict';
import test from 'node:test';
import { BaseError, HttpRequestError, RpcRequestError } from 'viem';
import { isDefiniteOperationRejection, normalizeNativeSignature, normalizePublicKey, parseTransfer } from '../src/wallet-input.ts';

const recipient = '0x1111111111111111111111111111111111111111';
const generator =
  '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' +
  '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
const spki = '3059301306072a8648ce3d020106082a8648ce3d03010703420004';
const cose = `a5010203262001215820${generator.slice(0, 64)}225820${generator.slice(64)}`;

test('USDC transfers preserve exact six-decimal units', () => {
  assert.deepEqual(parseTransfer(` ${recipient} `, ' 1.234567 '), {
    to: recipient,
    value: 1234567n,
  });
  assert.equal(parseTransfer(recipient, '0.000001').value, 1n);
  assert.equal(parseTransfer(recipient, '9007199254.740993').value, 9007199254740993n);
  for (const amount of ['0', '0.000000', '-1', '1e6', '1.0000001', 'NaN', '', '01', '1,000']) {
    assert.throws(() => parseTransfer(recipient, amount), Error, amount);
  }
  assert.throws(() => parseTransfer(recipient, (2n ** 256n).toString()));
  for (const address of ['', 'not-an-address', '0x1234', `0x${'0'.repeat(40)}`]) {
    assert.throws(() => parseTransfer(address, '1'), Error, address);
  }
});

test('passkey keys accept only valid P-256 points in supported envelopes', () => {
  for (const value of [generator, `0x${generator.toUpperCase()}`, `04${generator}`, `${spki}${generator}`, cose]) {
    assert.equal(normalizePublicKey(value), `0x${generator}`);
  }
  for (const value of [
    '',
    '0xnot-hex',
    generator.slice(1),
    '00'.repeat(64),
    `${generator.slice(0, -1)}4`,
    `${'ff'.repeat(32)}${generator.slice(64)}`,
    `${spki.replace('030107', '030108')}${generator}`,
    cose.replace('225820', '225821'),
    `05${generator}`,
  ]) {
    assert.throws(() => normalizePublicKey(value), Error, value);
  }
});

test('native signatures normalize DER and compact scalars to low-S', () => {
  const r = '1'.padStart(64, '0');
  const s = '2'.padStart(64, '0');
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  assert.equal(normalizeNativeSignature('3006020101020102'), `0x${r}${s}`);
  assert.equal(normalizeNativeSignature(`0x${r}${s}`), `0x${r}${s}`);
  assert.equal(normalizeNativeSignature(`${r}${(order - 2n).toString(16)}`), `0x${r}${s}`);
  for (const value of [
    '30050201010201',
    '3006020100020101',
    '3006020101020100',
    `${order.toString(16)}${s}`,
    '00'.repeat(64),
    'not-hex',
  ]) {
    assert.throws(() => normalizeNativeSignature(value), Error, value);
  }
});

test('only definite bundler rejections permit another transfer submission', () => {
  const rpcError = (code: number, message: string) => new RpcRequestError({
    body: { method: 'eth_sendUserOperation', params: [] },
    error: { code, message },
    url: 'https://rpc.example.com',
  });
  assert.equal(isDefiniteOperationRejection(rpcError(-32602, 'Invalid operation parameters')), true);
  assert.equal(isDefiniteOperationRejection(rpcError(-32500, 'Account validation failed')), true);
  assert.equal(isDefiniteOperationRejection(rpcError(-32501, 'Paymaster validation failed')), true);
  assert.equal(isDefiniteOperationRejection(rpcError(-32508, 'Paymaster balance too low')), true);
  assert.equal(isDefiniteOperationRejection(new BaseError('Could not send operation', {
    cause: rpcError(-32501, 'Paymaster rejected operation'),
  })), true);
  assert.equal(isDefiniteOperationRejection(new HttpRequestError({
    url: 'https://rpc.example.com',
    cause: new Error('Request timed out'),
  })), false);
  for (const code of [-32000, -32509, -32499]) {
    assert.equal(isDefiniteOperationRejection(rpcError(code, 'RPC failure')), false);
  }
  for (const message of ['Already known', 'Already pending', 'Already submitted', 'AA25', 'Invalid nonce', 'Nonce too low']) {
    assert.equal(isDefiniteOperationRejection(rpcError(-32500, message)), false, message);
  }
});
