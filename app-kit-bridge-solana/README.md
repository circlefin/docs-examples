# Bridge USDC from Solana to EVM

Use [`@circle-fin/app-kit`](https://www.npmjs.com/package/@circle-fin/app-kit)
to bridge USDC from Solana Devnet to Arc Testnet with Solana and EVM browser
wallets.

This Vite + TypeScript page connects a Solana wallet for the source and an
EIP-6963 EVM wallet for the destination, creates Circle adapters for both, then
calls `bridge()` and `retryBridge()` when needed.

## Prerequisites

- [Node.js 22 or later](https://nodejs.org/)
- An EIP-6963 EVM browser wallet such as MetaMask
- A Solana browser wallet such as Phantom (`window.solana`) or Solflare
  (`window.solflare`)
- Testnet USDC on Solana Devnet
- Native gas tokens for both wallets

This project does not require environment variables or API keys.

## Install and run

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser with both wallets installed.

```bash
npm run build
```

## What this example does

1. Connects an EIP-6963 EVM wallet for the Arc Testnet destination.
2. Connects a Solana browser wallet for the Solana Devnet source.
3. Creates viem and Solana adapters from the connected providers.
4. Bridges 1 USDC from `Solana_Devnet` to `Arc_Testnet` with `kit.bridge()`.
5. Retries with `kit.retryBridge()` if the result state is `"error"`.
6. Streams App Kit action events into the on-page output panel.

## Key file

- `src/main.ts` — wallet connect, adapter creation, bridge, and retry.
  Change `from` / `to` `chain` and `amount` in the bridge call for different
  chains or amounts.
