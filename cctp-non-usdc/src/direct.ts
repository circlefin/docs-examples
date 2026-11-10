/* Direct CCTP for non-USDC flow:
 * 1. Resolve token + manager addresses on both chains
 * 2. Approve the token manager
 * 3. Request an Iris FORWARD quote
 * 4. Submit CCTS crossChainTransfer
 * 5. Poll Iris /v2/messages until forwardTxHash is present
 */
import "./style.css";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodePacked,
  formatUnits,
  http,
  parseUnits,
  zeroAddress,
  zeroHash,
  type Chain,
  type Hex,
} from "viem";
import { CCTPX_TESTNET_CHAINS, type CCTPXChain } from "./chains";
import {
  startTransferUi,
  type ConnectedWallet,
  type TransferChain,
} from "./ui";

const crossChainTokenServiceAbi = [
  {
    name: "resolveTokenAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "resolveTokenManager",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "crossChainTransfer",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "destinationAddress", type: "bytes" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "minFinalityThreshold", type: "uint32" },
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "signedQuote", type: "bytes" },
          { name: "refundAddress", type: "address" },
        ],
      },
      { name: "autoExecuteHookData", type: "bool" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const FINALITY_THRESHOLD = 2000;
const DESTINATION_TIMEOUT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 10_000;

const supportedChains = [...CCTPX_TESTNET_CHAINS];

/**
 * Approve, quote, crossChainTransfer, and wait for destination forwarding
 * without Bridge Kit. Read top to bottom — each step is inline.
 */
async function executeDirectTransfer(args: {
  sourceChain: TransferChain;
  destinationChain: TransferChain;
  tokenId: `0x${string}`;
  amount: string;
  recipient: `0x${string}`;
  wallet: ConnectedWallet;
  onStatus: (message: string) => void;
}): Promise<void> {
  // Same objects from CCTPX_TESTNET_CHAINS (includes viemChain) — safe to cast.
  const sourceChain = args.sourceChain as CCTPXChain;
  const destinationChain = args.destinationChain as CCTPXChain;
  const { tokenId, amount, recipient, wallet, onStatus } = args;
  const account = wallet.address;

  const sourceClient = createPublicClient({
    chain: sourceChain.viemChain,
    transport: http(),
  });
  const destinationClient = createPublicClient({
    chain: destinationChain.viemChain,
    transport: http(),
  });

  // === Step 1: Resolve token deployments and manager ===
  onStatus("Resolving token deployments and manager…");
  const sourceToken = await sourceClient.readContract({
    address: sourceChain.cctpx.serviceAddress,
    abi: crossChainTokenServiceAbi,
    functionName: "resolveTokenAddress",
    args: [tokenId],
  });
  const manager = await sourceClient.readContract({
    address: sourceChain.cctpx.serviceAddress,
    abi: crossChainTokenServiceAbi,
    functionName: "resolveTokenManager",
    args: [tokenId],
  });
  const destinationToken = await destinationClient.readContract({
    address: destinationChain.cctpx.serviceAddress,
    abi: crossChainTokenServiceAbi,
    functionName: "resolveTokenAddress",
    args: [tokenId],
  });
  if (
    sourceToken === zeroAddress ||
    manager === zeroAddress ||
    destinationToken === zeroAddress
  ) {
    throw new Error("The selected token is not deployed on both chains in this route.");
  }

  const decimals = await sourceClient.readContract({
    address: sourceToken,
    abi: erc20Abi,
    functionName: "decimals",
  });
  const fractionalDigits = amount.split(".")[1]?.length ?? 0;
  if (fractionalDigits > decimals) {
    throw new Error(`This token supports at most ${decimals} decimal places.`);
  }
  const parsedAmount = parseUnits(amount, decimals);
  if (parsedAmount <= 0n) throw new Error("Enter an amount greater than zero.");

  await ensureWalletChain(wallet.provider, sourceChain.viemChain);
  const walletClient = createWalletClient({
    account,
    chain: sourceChain.viemChain,
    transport: custom(wallet.provider),
  });

  // === Step 2: Approve the token manager ===
  onStatus("Approve the token manager…");
  const approveTx = await walletClient.writeContract({
    address: sourceToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [manager, parsedAmount],
    chain: sourceChain.viemChain,
    account,
  });
  await sourceClient.waitForTransactionReceipt({ hash: approveTx });
  onStatus(`Approval confirmed: ${approveTx}`);

  // === Step 3: Request an Iris FORWARD quote ===
  onStatus("Request an Iris FORWARD quote…");
  const quoteResponse = await fetch(
    `/iris/testnet/v2/quote/cctpx/${tokenId}/${sourceChain.cctp.domain}/${destinationChain.cctp.domain}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parsedAmount.toString(),
        feeToken: zeroAddress,
        requests: [
          {
            type: "FORWARD",
            params: { msgType: "TransferMessage", destinationAddress: recipient },
          },
        ],
      }),
    },
  );
  if (!quoteResponse.ok) {
    throw new Error(
      `Iris quote failed (${quoteResponse.status}): ${await quoteResponse.text()}`,
    );
  }
  const quote = (await quoteResponse.json()) as {
    signedQuote?: Hex;
    feeTotalAmount?: string;
  };
  if (!quote.signedQuote || !quote.feeTotalAmount) {
    throw new Error("Iris returned an incomplete CCTPx quote.");
  }

  // === Step 4: Submit CCTS crossChainTransfer ===
  onStatus("Submit CCTS crossChainTransfer…");
  const transferTx = await walletClient.writeContract({
    address: sourceChain.cctpx.serviceAddress,
    abi: crossChainTokenServiceAbi,
    functionName: "crossChainTransfer",
    args: [
      tokenId,
      parsedAmount,
      destinationChain.cctp.domain,
      encodePacked(["address"], [recipient]),
      zeroHash,
      FINALITY_THRESHOLD,
      { signedQuote: quote.signedQuote, refundAddress: zeroAddress },
      false,
      "0x",
    ],
    value: BigInt(quote.feeTotalAmount),
    chain: sourceChain.viemChain,
    account,
  });
  await sourceClient.waitForTransactionReceipt({ hash: transferTx });
  onStatus(`Source transfer confirmed: ${transferTx}`);

  // === Step 5: Poll Iris until the destination forward tx is reported ===
  const deadline = Date.now() + DESTINATION_TIMEOUT_MS;
  onStatus("Waiting for Iris attestation and destination forwarding…");
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const messagesResponse = await fetch(
      `/iris/testnet/v2/messages/${sourceChain.cctp.domain}?transactionHash=${transferTx}`,
    );
    if (!messagesResponse.ok) continue;

    const body = (await messagesResponse.json()) as {
      messages?: Array<{
        forwardState?: string | null;
        forwardTxHash?: string | null;
      }>;
    };
    const message = body.messages?.[0];
    if (message?.forwardState === "FAILED") {
      throw new Error("Iris destination forwarding failed.");
    }
    if (
      (message?.forwardState === "CONFIRMED" ||
        message?.forwardState === "COMPLETE") &&
      message.forwardTxHash
    ) {
      onStatus(
        `Destination received ${formatUnits(parsedAmount, decimals)} tokens: ${message.forwardTxHash}`,
      );
      return;
    }
    onStatus(`Forward state: ${message?.forwardState ?? "pending"}…`);
  }
  throw new Error("Timed out waiting for the destination forwarding transaction.");
}

// === Supporting: wallet chain switch ===
async function ensureWalletChain(
  provider: ConnectedWallet["provider"],
  chain: Chain,
) {
  const chainId = `0x${chain.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers?.default.url
            ? [chain.blockExplorers.default.url]
            : undefined,
        },
      ],
    });
  }
}

// === Init ===
startTransferUi({
  chains: supportedChains,
  transfer: executeDirectTransfer,
});
