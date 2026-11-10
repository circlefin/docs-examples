# Non-USDC Crosschain Transfer Sample

This sample application shows how to transfer non-USDC assets with CCTP, using EURC, cirBTC, or a registered custom token. The recommended path is `@circle-fin/bridge-kit` in `src/main.ts`. If Bridge Kit is not an option, swap to `src/direct.ts` for the same UI against a direct CCTP flow: approve, Iris quote, `crossChainTransfer`, and destination forwarding.

Developer documentation at: https://developers.circle.com/cctp/expanded-assets

## Run

```bash
bun install
bun run dev
```

Connect an injected EVM testnet wallet and choose a token. **EURC** and **cirBTC** load source chains from the Iris registry for that token; destinations are the other chains from that same result (one registry read per token). **Custom token ID** waits for a valid bytes32 ID, then loads sources the same way. Source and destination are always different chains. Leave **Recipient** blank to mint to the connected wallet, or enter another EVM address.

The app submits transactions only after the user presses **Transfer** and approves the wallet prompts. Use a testnet wallet and test tokens while exploring the example.

## Structure

```text
src/
  main.ts                 # Bridge Kit entrypoint
  direct.ts               # Direct CCTPx entrypoint (no Bridge Kit)
  chains.ts               # Hardcoded CCTPx testnet catalog (direct path)
  ui.ts                   # Shared form / wallet / Iris registry helper
  style.css
vite.config.ts             # Local testnet IRIS proxy
```

`main.ts` takes its chain list from the CCTPx provider. `direct.ts` uses the hardcoded catalog in `chains.ts` (domain + CCTS + `viem/chains`). Both rely on `ui.ts` for Iris token→chain filtering and destination derivation.

Swap implementations in `index.html`:

```html
<script type="module" src="/src/main.ts"></script>
<!-- or -->
<script type="module" src="/src/direct.ts"></script>
```

The testnet Iris proxy is for local development. A deployed app needs an equivalent same-origin `/iris/testnet` proxy.
