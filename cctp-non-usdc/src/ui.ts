import { isAddress, type EIP1193Provider } from "viem";

/** Chain fields the form needs — Bridge Kit defs and the direct catalog both fit. */
export interface TransferChain {
  name: string;
  chainId: number;
  cctp: { domain: number };
  cctpx: { serviceAddress: string };
}

export interface ConnectedWallet {
  provider: EIP1193Provider;
  address: `0x${string}`;
}

export const knownTokenIds = {
  EURC: "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd",
  cirBTC: "0x7c27b7b6485f3ea49b7d1a439e288d3c3116f533302afabb7e372dfc0770cc7d",
} as const satisfies Record<string, `0x${string}`>;

export type TokenKind = keyof typeof knownTokenIds | "custom";

/** Intersect a chain catalog with Iris CCTPx deployments for a token ID. */
export async function chainsWithTokenDeployment<
  T extends { cctp: { domain: number } },
>(chains: readonly T[], tokenId: `0x${string}`): Promise<T[]> {
  const response = await fetch(
    `/iris/testnet/v2/cctpx/tokens?tokenid=${encodeURIComponent(tokenId)}`,
  );
  if (!response.ok) {
    throw new Error(
      `Token registry lookup failed (${response.status}): ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    data?: Array<{
      deployments?: Array<{ domainId: number; enabled?: boolean }>;
    }>;
  };
  const deployments = body.data?.[0]?.deployments ?? [];
  const domains = new Set(
    deployments
      .filter((deployment) => deployment.enabled !== false)
      .map((deployment) => deployment.domainId),
  );
  return chains.filter((chain) => domains.has(chain.cctp.domain));
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/**
 * Wire the shared HTML form. Entrypoints supply the chain catalog + transfer.
 * One Iris registry read per token → source options; destinations are that
 * same deployment set minus the selected source (no second Iris call).
 */
export function startTransferUi(options: {
  chains: TransferChain[];
  transfer: (args: {
    sourceChain: TransferChain;
    destinationChain: TransferChain;
    tokenId: `0x${string}`;
    amount: string;
    recipient: `0x${string}`;
    wallet: ConnectedWallet;
    onStatus: (message: string) => void;
  }) => Promise<void>;
}): {
  appendStatus: (message: string) => void;
} {
  const { chains, transfer } = options;

  const connectButton = document.querySelector<HTMLButtonElement>("#connect-wallet")!;
  const sourceSelect = document.querySelector<HTMLSelectElement>("#source-chain")!;
  const destinationSelect = document.querySelector<HTMLSelectElement>("#destination-chain")!;
  const tokenSelect = document.querySelector<HTMLSelectElement>("#token-kind")!;
  const tokenIdInput = document.querySelector<HTMLInputElement>("#token-id")!;
  const amountInput = document.querySelector<HTMLInputElement>("#amount")!;
  const recipientInput = document.querySelector<HTMLInputElement>("#recipient")!;
  const transferButton = document.querySelector<HTMLButtonElement>("#transfer-button")!;
  const form = document.querySelector<HTMLFormElement>("#transfer-form")!;
  const status = document.querySelector<HTMLPreElement>("#transfer-status")!;
  const recipientPlaceholder = recipientInput.placeholder;

  const chainsById = new Map(
    chains.map((chain) => [String(chain.chainId), chain] as const),
  );

  let wallet: ConnectedWallet | null = null;
  /** Last Iris deployment set for the current token — destinations filter this. */
  let configuredForToken: TransferChain[] = [];
  let transferInProgress = false;
  let lookupTimeout: ReturnType<typeof setTimeout> | undefined;
  let previousTokenKind = tokenSelect.value;

  function appendStatus(message: string) {
    const time = new Date().toLocaleTimeString();
    status.textContent = `${status.textContent?.trim() ? `${status.textContent.trim()}\n` : ""}[${time}] ${message}`;
    status.scrollTop = status.scrollHeight;
  }

  function isBytes32(value: string): value is `0x${string}` {
    return /^0x[0-9a-fA-F]{64}$/.test(value);
  }

  function getTokenKind(): TokenKind {
    if (tokenSelect.value === "EURC" || tokenSelect.value === "cirBTC") {
      return tokenSelect.value;
    }
    return "custom";
  }

  function getTokenId(): `0x${string}` | undefined {
    const tokenId = tokenIdInput.value.trim();
    return isBytes32(tokenId) ? tokenId : undefined;
  }

  /** Empty input → connected wallet; otherwise a validated EVM address. */
  function getRecipient(): `0x${string}` | undefined {
    const value = recipientInput.value.trim();
    if (!value) return wallet?.address;
    return isAddress(value) ? value : undefined;
  }

  function isValidAmount(value: string): boolean {
    const amount = value.trim();
    return /^\d+(?:\.\d+)?$/.test(amount) && /[1-9]/.test(amount);
  }

  function updateTokenId() {
    const kind = getTokenKind();
    const isCustom = kind === "custom";
    tokenIdInput.readOnly = !isCustom;
    tokenIdInput.required = isCustom;

    if (isCustom) {
      if (previousTokenKind !== "custom") tokenIdInput.value = "";
      tokenIdInput.placeholder = "Enter bytes32 token ID (0x…)";
      previousTokenKind = tokenSelect.value;
      return;
    }

    tokenIdInput.value = knownTokenIds[kind];
    tokenIdInput.placeholder = "";
    previousTokenKind = tokenSelect.value;
  }

  function updateTransferButton() {
    transferButton.disabled =
      transferInProgress ||
      !wallet ||
      !sourceSelect.value ||
      !destinationSelect.value ||
      !getTokenId() ||
      !getRecipient() ||
      !isValidAmount(amountInput.value);
  }

  function fillSelect(
    select: HTMLSelectElement,
    placeholder: string,
    items: TransferChain[],
  ) {
    select.replaceChildren(new Option(placeholder, ""));
    for (const chain of items) {
      select.add(new Option(chain.name, String(chain.chainId)));
    }
  }

  function refreshDestinations() {
    const sourceId = sourceSelect.value;
    if (!sourceId) {
      fillSelect(destinationSelect, "Choose a destination", []);
      updateTransferButton();
      return;
    }

    const destinations = configuredForToken.filter(
      (chain) => String(chain.chainId) !== sourceId,
    );
    const previousDestination = destinationSelect.value;
    fillSelect(destinationSelect, "Choose a destination", destinations);
    if (
      previousDestination &&
      destinations.some((chain) => String(chain.chainId) === previousDestination)
    ) {
      destinationSelect.value = previousDestination;
    }
    updateTransferButton();
  }

  async function refreshSourceChains() {
    const kind = getTokenKind();
    const tokenId = getTokenId();
    const previousSource = sourceSelect.value;
    configuredForToken = [];
    fillSelect(destinationSelect, "Choose a destination", []);
    updateTransferButton();

    // Custom tokens: wait for a valid bytes32 id before asking Iris for chains.
    if (kind === "custom" && !tokenId) {
      fillSelect(sourceSelect, "Enter a token ID first", []);
      appendStatus("Enter a bytes32 token ID to load configured chains.");
      updateTransferButton();
      return;
    }

    // Known tokens always have a tokenId from updateTokenId(); custom is gated above.
    if (!tokenId) {
      fillSelect(sourceSelect, "Choose a source", []);
      updateTransferButton();
      return;
    }

    fillSelect(sourceSelect, "Loading…", []);
    try {
      configuredForToken = await chainsWithTokenDeployment(chains, tokenId);
      fillSelect(sourceSelect, "Choose a source", configuredForToken);
      if (
        previousSource &&
        configuredForToken.some((chain) => String(chain.chainId) === previousSource)
      ) {
        sourceSelect.value = previousSource;
      }
      appendStatus(
        configuredForToken.length
          ? `${configuredForToken.length} source chain(s) for ${kind === "custom" ? "this token" : kind}.`
          : `No source chains for ${kind === "custom" ? "this token" : kind}.`,
      );
      refreshDestinations();
    } catch (error) {
      configuredForToken = [];
      fillSelect(sourceSelect, "Chain lookup failed", []);
      appendStatus(error instanceof Error ? error.message : String(error));
    }
    updateTransferButton();
  }

  function setDisconnected() {
    wallet = null;
    recipientInput.placeholder = recipientPlaceholder;
    connectButton.textContent = "Connect wallet";
    updateTransferButton();
  }

  async function handleWalletButton() {
    if (wallet) {
      setDisconnected();
      appendStatus("Wallet disconnected.");
      return;
    }

    connectButton.disabled = true;
    try {
      const provider = window.ethereum;
      if (!provider) throw new Error("No injected EVM wallet was found.");

      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
        throw new Error("The wallet did not return an account.");
      }
      const address = accounts[0] as `0x${string}`;
      wallet = { provider, address };
      recipientInput.placeholder = address;
      connectButton.textContent = `Disconnect ${address.slice(0, 6)}…${address.slice(-4)}`;
      appendStatus(`Wallet connected: ${address}`);
    } catch (error) {
      appendStatus(error instanceof Error ? error.message : String(error));
    } finally {
      connectButton.disabled = false;
      updateTransferButton();
    }
  }

  async function handleTransfer(event: SubmitEvent) {
    event.preventDefault();
    if (!form.reportValidity() || !wallet) return;

    const sourceChain = chainsById.get(sourceSelect.value);
    const destinationChain = chainsById.get(destinationSelect.value);
    const tokenId = getTokenId();
    const recipient = getRecipient();
    if (
      !sourceChain ||
      !destinationChain ||
      !tokenId ||
      !recipient ||
      !isValidAmount(amountInput.value)
    ) {
      appendStatus("Select a supported route and token before transferring.");
      return;
    }
    if (sourceChain.chainId === destinationChain.chainId) {
      appendStatus("Source and destination must be different chains.");
      return;
    }

    transferInProgress = true;
    updateTransferButton();
    try {
      const amount = amountInput.value.trim();
      const tokenLabel =
        tokenSelect.value === "custom" ? "custom token" : tokenSelect.value;
      appendStatus(`Starting ${amount} ${tokenLabel} transfer…`);
      await transfer({
        sourceChain,
        destinationChain,
        tokenId,
        amount,
        recipient,
        wallet,
        onStatus: appendStatus,
      });
    } catch (error) {
      appendStatus(error instanceof Error ? error.message : String(error));
    } finally {
      transferInProgress = false;
      updateTransferButton();
    }
  }

  connectButton.addEventListener("click", () => void handleWalletButton());
  sourceSelect.addEventListener("change", refreshDestinations);
  tokenSelect.addEventListener("change", () => {
    updateTokenId();
    void refreshSourceChains();
  });
  tokenIdInput.addEventListener("input", () => {
    updateTransferButton();
    if (getTokenKind() !== "custom") return;
    clearTimeout(lookupTimeout);
    lookupTimeout = setTimeout(() => {
      void refreshSourceChains();
    }, 350);
  });
  destinationSelect.addEventListener("change", updateTransferButton);
  amountInput.addEventListener("input", updateTransferButton);
  recipientInput.addEventListener("input", updateTransferButton);
  form.addEventListener("submit", (event) => void handleTransfer(event));

  appendStatus(
    chains.length
      ? "Testnet only. Connect a wallet, choose a token and route, then Transfer."
      : "No CCTPx testnet chains were found.",
  );

  updateTokenId();
  void refreshSourceChains();
  updateTransferButton();

  return { appendStatus };
}
