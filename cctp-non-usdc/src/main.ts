import "./style.css";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import {
  BridgeKit,
  CCTPXBridgingProvider,
  type CCTPXRouteToken,
  type EVMChainDefinition,
} from "@circle-fin/bridge-kit";
import {
  startTransferUi,
  type ConnectedWallet,
  type TransferChain,
} from "./ui";

/** Rewrite Iris SDK URL strings through the local Vite testnet proxy. */
async function irisProxyFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // CCTPXBridgingProvider always passes a string URL into fetch(url, init).
  const { pathname, search } = new URL(String(input));
  return fetch(`/iris/testnet${pathname}${search}`, init);
}

const cctpxProvider = new CCTPXBridgingProvider({ fetchImpl: irisProxyFetch });
const supportedChains = cctpxProvider
  .getSupportedChains()
  .filter(
    (chain) =>
      chain.type === "evm" &&
      chain.cctp &&
      chain.cctpx?.serviceAddress &&
      chain.isTestnet,
  )
  .sort((a, b) => a.name.localeCompare(b.name)) as TransferChain[];

const kit = new BridgeKit();
const kitCctpxProviderIndex = kit.providers.findIndex(
  (provider) => provider.name === "CCTPXBridgingProvider",
);
if (kitCctpxProviderIndex !== -1) {
  kit.providers[kitCctpxProviderIndex] = cctpxProvider;
}

/** Bridge EURC / cirBTC / custom CCTPx tokens with Bridge Kit. */
async function bridgeWithKit(args: {
  sourceChain: TransferChain;
  destinationChain: TransferChain;
  tokenId: `0x${string}`;
  amount: string;
  recipient: `0x${string}`;
  wallet: ConnectedWallet;
  onStatus: (message: string) => void;
}): Promise<void> {
  // Same objects from supportedChains (full Bridge Kit EVM defs) — safe to cast.
  const source = args.sourceChain as EVMChainDefinition;
  const destination = args.destinationChain as EVMChainDefinition;

  const decimals = await cctpxProvider.getTokenDecimals(
    args.tokenId as CCTPXRouteToken,
    source,
  );
  if (decimals === undefined) {
    throw new Error("Token decimals were not found in the CCTPx registry.");
  }
  const fractionalDigits = args.amount.split(".")[1]?.length ?? 0;
  if (fractionalDigits > decimals) {
    throw new Error(`This token supports at most ${decimals} decimal places.`);
  }

  const adapter = await createViemAdapterFromProvider({
    provider: args.wallet.provider,
  });
  const result = await kit.bridge({
    from: { adapter, chain: source },
    to: {
      adapter,
      chain: destination,
      recipientAddress: args.recipient,
    },
    amount: args.amount,
    token: args.tokenId,
  });
  if (result.state !== "success") {
    throw new Error(`Bridge Kit transfer ended in state: ${result.state}`);
  }
  for (const step of result.steps) {
    if (step.txHash) args.onStatus(`${step.name}: ${step.txHash}`);
  }
  args.onStatus(`Transfer complete: ${args.amount} tokens delivered.`);
}

const { appendStatus } = startTransferUi({
  chains: supportedChains,
  transfer: bridgeWithKit,
});

kit.on("*", (payload) => {
  appendStatus(payload.method);
});
