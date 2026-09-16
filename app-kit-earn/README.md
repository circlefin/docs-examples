# Deposit and withdraw USDC in an earn vault

Use [`@circle-fin/app-kit`](https://www.npmjs.com/package/@circle-fin/app-kit)
to discover earn vaults on Arc Testnet, deposit USDC, check a position, and
withdraw with a browser wallet and the viem adapter.

This Vite + TypeScript page connects an EIP-6963 wallet (for example MetaMask),
creates a Circle adapter from the provider, then calls `earn.exploreVaults()`,
`earn.getDepositQuote()`, `earn.deposit()`, `earn.getPosition()`,
`earn.getWithdrawalQuote()`, and `earn.withdraw()`.

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
2. Lists active vaults on `Arc_Testnet` with `kit.earn.exploreVaults()`.
3. Creates a viem adapter with `createViemAdapterFromProvider()`.
4. Previews and deposits 1 USDC with `kit.earn.getDepositQuote()` and
   `kit.earn.deposit()`.
5. Reads the position with `kit.earn.getPosition()`.
6. Previews and withdraws 1 USDC with `kit.earn.getWithdrawalQuote()` and
   `kit.earn.withdraw()`.

## Key file

- `src/main.ts` — wallet connect, vault discovery, quotes, deposit, position,
  and withdraw. Change `chain`, `amount`, and the selected vault for a
  different chain, amount, or opportunity.

## Deposit from another chain

This sample deposits on the same chain as the vault (`Arc_Testnet`). To deposit
USDC from a wallet on another blockchain into that vault, pass a different
`from.chain` and a `to` destination on the same `kit.earn.deposit()` call in
`src/main.ts` — for example Ethereum Sepolia → Arc Testnet:

```typescript
const result = await kit.earn.deposit({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: {
    chain: "Arc_Testnet",
    recipientAddress, // position owner on the vault chain
  },
  vaultAddress,
  amount: "1",
  transferSpeed: "FAST", // optional: "FAST" | "SLOW"
});
```

Fund the source wallet with USDC and gas on the source chain (not Arc). Testnet
sources are Ethereum Sepolia, Arbitrum Sepolia, and Base Sepolia; the vault
destination is Arc Testnet.

A crosschain deposit returns when the bridge submit succeeds
(`result.kind === "cross-chain"`), not when the vault position is funded. Use
`kit.earn.getCrossChainDepositStatus()` or
`kit.earn.waitForCrossChainDeposit()` with `result.execId` to track settlement.
Preview fees with the same `from` / `to` shape on `kit.earn.getDepositQuote()`.

See
[Deposit crosschain into an Earn vault](https://docs.arc.io/app-kit/tutorials/earn/crosschain-deposit)
for routes, fees, and status tracking.
