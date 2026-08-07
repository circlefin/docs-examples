# docs-examples

Code samples referenced from the [Circle](https://developers.circle.com/) and
[Arc](https://developers.arc.network/) developer documentation.

Each subdirectory is a self-contained example with its own `package.json`. Clone
the repo, change into the example you want to run, install dependencies, and
follow the instructions in that example's documentation page or local README.

## Examples

### [`app-kit-bridge-evm`](./app-kit-bridge-evm)

Browser app that bridges USDC from Ethereum Sepolia to Arc Testnet using
[App Kit](https://www.npmjs.com/package/@circle-fin/app-kit) with the viem
adapter. Connects to any EIP-6963 browser wallet (e.g., MetaMask).

Run with `npm install && npm run dev`.

### [`app-kit-bridge-solana`](./app-kit-bridge-solana)

Browser app that bridges USDC from Solana Devnet to Arc Testnet using App Kit
with both the viem and Solana adapters. Connects an EVM wallet for the
destination and a Solana wallet for the source.

Run with `npm install && npm run dev`.

### [`app-kit-send`](./app-kit-send)

Browser app that estimates and sends USDC on Arc Testnet using
[App Kit](https://www.npmjs.com/package/@circle-fin/app-kit) with the viem
adapter. Connects to any EIP-6963 browser wallet (e.g., MetaMask).

Run with `npm install && npm run dev`.

### [`app-kit-transfer-widget`](./app-kit-transfer-widget)

React + Vite widget that lets a connected wallet send USDC same-chain or
bridge it crosschain using [App Kit](https://www.npmjs.com/package/@circle-fin/app-kit)'s
`send()`, `bridge()`, and `retryBridge()`. Connects to EIP-6963 EVM wallets
and Solana browser wallets. No environment variables or API keys required.

Run with `npm install && npm run dev`.

### [`entity-secret-setup`](./entity-secret-setup)

Node.js script that generates a new entity secret, registers it with Circle,
writes the recovery file to disk, and adds `CIRCLE_ENTITY_SECRET` to `.env`.
Intended for first-time setup of
[developer-controlled wallets](https://developers.circle.com/w3s/developer-controlled-create-your-first-wallet).
See [`entity-secret-setup/README.md`](./entity-secret-setup/README.md) for
prerequisites and security notes.

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md).
