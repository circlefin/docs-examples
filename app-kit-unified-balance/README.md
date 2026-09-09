# Deposit and spend a unified USDC balance

Use [`@circle-fin/app-kit`](https://www.npmjs.com/package/@circle-fin/app-kit)
to deposit USDC into a unified balance across chains, read that balance, and
spend it to a recipient on Arc Testnet.

This Vite + TypeScript page connects EVM and Solana browser wallets, creates
Circle adapters with the chains this demo uses, then calls
`unifiedBalance.deposit()`, `unifiedBalance.getBalances()`, and
`unifiedBalance.spend()`.

## Prerequisites

- [Node.js 22 or later](https://nodejs.org/)
- An EIP-6963 EVM browser wallet such as MetaMask
- A Solana browser wallet on `window.solana` such as Phantom
- Testnet USDC on Avalanche Fuji and Solana Devnet
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

1. Connects an EVM wallet and builds a viem adapter for Avalanche Fuji and Arc
   Testnet.
2. Connects a Solana wallet and builds a Solana adapter for Solana Devnet.
3. Deposits 2 USDC from Avalanche Fuji with `kit.unifiedBalance.deposit()`.
4. Deposits 1 USDC from Solana Devnet with `kit.unifiedBalance.deposit()`.
5. Reads the unified balance with `kit.unifiedBalance.getBalances()`.
6. Spends 2.50 USDC to a recipient on Arc Testnet with
   `kit.unifiedBalance.spend()`.

## Spend signing (EVM + Solana)

This demo deposits on Avalanche Fuji (2 USDC) and Solana Devnet (1 USDC), then
spends 2.50 USDC. Auto-allocation therefore draws from **both** wallets.

EVM burn intents can share one EIP-712 `BurnIntentSet` signature. Solana uses a
separate Ed25519 signature and cannot join that set. Expect **two wallet
prompts** on Spend: one in your EVM wallet, then one in your Solana wallet.
Both signed intents still go in a single Gateway transfer.

## Key file

- `src/main.ts` — wallet connect, adapters, deposit, balance, and spend.
  Change `chain`, `amount`, and `token` on the deposit and spend calls (and
  `supportedChains` on the adapters) for different chains or amounts.
