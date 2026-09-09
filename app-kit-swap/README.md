# Swap USDC on Arc Testnet

Use [`@circle-fin/app-kit`](https://www.npmjs.com/package/@circle-fin/app-kit)
to swap USDC for EURC on Arc Testnet with a browser wallet and the viem
adapter.

This Vite + TypeScript page connects an EIP-6963 wallet (for example MetaMask),
creates a Circle adapter from the provider, then calls `swap()`.

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
3. Swaps 1 USDC for EURC on `Arc_Testnet` with `kit.swap()`.

## Troubleshooting

### Thin liquidity on Arc Testnet

Arc Testnet pools are often thin or imbalanced. Failures here are usually the
environment, not your integration.

- **No route available** — no quote for that pair/amount; try a smaller
  `amountIn`, flip the direction (`EURC` → `USDC` often has more depth), or
  retry later.
- **On-chain simulation failed** — quote existed but slippage/minimum output
  could not be met; lower `amountIn` or raise `config.slippageBps` above the
  default `300` (3%).

### Wallet stuck on “Pending” / approve never confirms

Browser swaps need the wallet to broadcast approve (if needed) then the swap
tx. If MetaMask (or another wallet) shows **Pending** forever and the tx hash
is **not** on [Arcscan](https://testnet.arcscan.app):

1. The wallet’s Arc Testnet RPC likely failed to broadcast — fix or replace
   the network RPC in the wallet settings.
2. Clear stuck local activity (MetaMask: Settings → Advanced → Clear activity
   tab data / Reset account) so a phantom pending does not block the next
   prompt.
3. Confirm you are on **Arc Testnet** with USDC/EURC and native gas, then
   retry. Another EIP-6963 wallet can work if one wallet’s RPC is bad; this
   example prefers MetaMask when both are installed.

A custodial / Circle Wallets script can succeed while a browser wallet stalls
for the same route — that points at wallet RPC/queue, not App Kit.

## Key file

- `src/main.ts` — wallet connect, adapter creation, and swap.
  Change `chain`, `tokenIn` / `tokenOut`, and `amountIn` in the swap params
  for a different chain, pair, or amount.
