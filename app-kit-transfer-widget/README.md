# Embed a USDC Transfer Widget

Build an embedded USDC transfer surface that lets a connected wallet send USDC
on one chain or bridge USDC across chains through App Kit.

This React + Vite project demonstrates a practical transfer flow for apps that
want to hide low-level routing decisions from users. The widget discovers a
browser wallet, creates the right Circle adapter, estimates the route, and then
uses:

- `send()` for same-chain USDC transfers
- `bridge()` for crosschain USDC transfers through either CCTP Forwarder or
  direct mint routes
- `retryBridge()` when a bridge attempt returns an error state

The entered amount is treated as the amount the recipient should receive. For a
crosschain bridge, the review screen also shows the estimated total source cost.

## What You Will Build

- A wallet connection flow for injected EVM wallets and Solana browser wallets
- App Kit adapter creation from the connected browser wallet
- Chain options derived from App Kit support rather than hardcoded lists
- Same-chain USDC transfer execution with `send()`
- Crosschain USDC bridge execution through CCTP Forwarder or direct mint routes
- Transfer review that shows destination amount, estimated fee, total source
  amount, recipient, and method
- Basic bridge retry handling for recoverable bridge error states

## How The Widget Works

```text
Connect wallet
  -> create Circle adapter
  -> choose source chain, destination chain, recipient, and amount
  -> estimate transfer
  -> review amount and fees
  -> sign and submit
  -> show explorer links for completed steps
```

The widget chooses the transfer method from the selected route:

| Route | App Kit method | Behavior |
| --- | --- | --- |
| Same source and destination chain | `send()` | Transfers USDC on the connected chain. |
| Different source and destination chains, destination supports Forwarder | `bridge()` with `useForwarder: true` | Bridges USDC crosschain and sends to the entered recipient address. |
| Different source and destination chains, EVM direct mint route | `bridge()` with a destination adapter | Bridges USDC crosschain using the connected EVM wallet as the destination adapter. |

## Prerequisites

- [Node.js v22+](https://nodejs.org/)
- A supported injected EVM wallet, Solana browser wallet, or both
  - EVM wallet discovery uses EIP-6963 provider announcements.
  - Solana wallet detection expects a browser wallet on `window.solana`.
- Testnet USDC on the source chain you want to use
- Native gas token on the source chain for the wallet transaction
- Familiarity with [App Kit](https://developers.circle.com/arc/app-kit)

This project does not require environment variables or API keys.

## Set Up

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local Vite URL in a browser with a supported wallet installed.

Build the production bundle:

```bash
npm run build
```

## Run A Transfer

1. Connect an EVM or Solana wallet.
2. Select a source chain supported by the connected wallet type.
3. Select a destination chain.
4. Enter a recipient address.
5. Enter the USDC amount the recipient should receive.
6. Review the estimated fee and total source amount.
7. Confirm and sign in your wallet.

For crosschain bridges, the widget sends the entered amount to `bridge()` and
shows the entered amount plus estimated USDC bridge fees as the total source
amount during review.

When the transfer completes, the widget shows explorer links for any App Kit
steps that returned an explorer URL.

## Project Structure

```text
src/
  components/
    TransferWidget/
      TransferWidget.tsx   # UI state, screens, and user actions
      transfer.ts          # App Kit setup, estimation, send, bridge, retry
      wallet.ts            # Wallet discovery, connection, adapter creation
      TransferWidget.css
      index.ts
  main.tsx                 # Browser Buffer setup and widget mount
  index.css
```

## Key Implementation Files

- `src/components/TransferWidget/wallet.ts` discovers EIP-6963 EVM wallets,
  detects Solana wallets, connects the selected wallet, and creates the matching
  Circle adapter.
- `src/components/TransferWidget/transfer.ts` creates the App Kit instance,
  fetches supported testnet chains, estimates send and bridge routes, executes
  transfers, and retries bridge flows when needed.
- `src/components/TransferWidget/TransferWidget.tsx` owns the widget screens:
  connect, wallet selection, transfer form, review, submitting, and success.

## App Kit Runtime Note

App Kit currently expects `Buffer` to exist before its browser modules evaluate.
This project sets the browser polyfill in `src/main.tsx` before importing the
widget:

```ts
import { Buffer } from "buffer";

if (!("Buffer" in globalThis)) {
  Object.assign(globalThis, { Buffer });
}

const { default: TransferWidget } = await import("./components/TransferWidget");
```

Keep this setup if you move the widget into another Vite app.

## Copying Into Another App

This repository is a runnable app, not a packaged component library. If you copy
`src/components/TransferWidget/` into another React app, also copy or recreate
the setup in `src/main.tsx` so `Buffer` exists before the widget imports App Kit.

The copied widget expects these runtime dependencies:

- `@circle-fin/app-kit`
- `@circle-fin/adapter-viem-v2`
- `@circle-fin/adapter-solana`
- `buffer`
- `react`
- `react-dom`
- `viem`

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the local Vite development server. |
| `npm run build` | Runs TypeScript and creates a production build. |
| `npm run lint` | Runs ESLint. |
| `npm run preview` | Serves the production build locally. |

## Production Considerations

Before adapting this pattern for a live app:

- Validate recipient addresses for the selected destination chain.
- Handle unsupported wallet, chain, and route states explicitly.
- Decide whether to support only testnets, only mainnets, or both.
- Add stronger transaction status handling and user-facing recovery paths.
- Persist transfer attempts if users may close the browser mid-flow.
- Keep route support derived from App Kit where possible so chain support does
  not drift from the SDK.

## Reuse Boundary

This repository does not currently publish a stable package API, package
exports, or a library build.
