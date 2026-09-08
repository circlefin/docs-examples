# Send USDC on an EVM chain

Use [`@circle-fin/app-kit`](https://www.npmjs.com/package/@circle-fin/app-kit)
to send USDC on Arc Testnet with a browser wallet and the viem adapter.

This Vite + TypeScript page connects an EIP-6963 wallet (for example MetaMask),
creates a Circle adapter from the provider, then calls `send()`.

## Prerequisites

- [Node.js 22 or later](https://nodejs.org/)
- An EIP-6963 browser wallet such as MetaMask
- Testnet USDC on Arc Testnet
- Native gas token on Arc Testnet for the wallet transaction

This project does not require environment variables or API keys.

## Install and run

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser with your wallet installed.

```bash
npm run build
```

## What this example does

1. Discovers an EIP-6963 browser wallet and requests account access.
2. Creates a viem adapter with `createViemAdapterFromProvider()`.
3. Sends 1 USDC on `Arc_Testnet` to the entered recipient with `kit.send()`.

## Key file

- `src/main.ts` — wallet connect, adapter creation, and send.
  Change `chain`, `amount`, and `token` in the send params for a different
  chain, amount, or token.
