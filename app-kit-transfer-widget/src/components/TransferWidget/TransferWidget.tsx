/**
 * Copyright (c) 2026, Circle Internet Group, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useState, type ReactNode } from "react";
import { getErrorMessage, type ChainDefinition } from "@circle-fin/app-kit";
import "./TransferWidget.css";
import { getChainMeta } from "./chains";
import {
  detectTransferMethod,
  estimateTransfer,
  executeTransfer,
  getSupportedChains,
  usesForwarder,
  type ChainId,
  type TransferEstimate,
  type TransferResult,
} from "./transfer";
import {
  connectBrowserWallet,
  discoverInjectedEvmWallets,
  hasSolanaWallet,
  type BrowserWalletDetail,
  type ConnectedWallet,
} from "./wallet";

type Screen =
  | "connect"
  | "wallets"
  | "form"
  | "review"
  | "submitting"
  | "success";

type FormState = {
  fromChain: ChainId | "";
  toChain: ChainId | "";
  recipient: string;
  amount: string;
};

type ChainSelectProps = {
  chains: ChainDefinition[];
  value: ChainId | "";
  onChange: (chain: ChainId | "") => void;
};

const emptyForm: FormState = {
  fromChain: "",
  toChain: "",
  recipient: "",
  amount: "",
};

function TransferWidget() {
  const [initialChainState] = useState(() => {
    try {
      return {
        supportedChains: getSupportedChains(),
        error: null as string | null,
      };
    } catch (chainError) {
      return {
        supportedChains: [] as ChainDefinition[],
        error: getErrorMessage(chainError) ?? "Unable to load supported chains",
      };
    }
  });
  const [screen, setScreen] = useState<Screen>("connect");
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [evmWallets, setEvmWallets] = useState<BrowserWalletDetail[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [review, setReview] = useState<TransferEstimate | null>(null);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Processing transfer transaction...",
  );
  const [supportedChains] = useState<ChainDefinition[]>(
    initialChainState.supportedChains,
  );
  const [error, setError] = useState<string | null>(initialChainState.error);
  const [busyAction, setBusyAction] = useState<
    "wallet" | "review" | "submit" | null
  >(null);

  const chainMap = new Map(
    supportedChains.map((chain) => [chain.chain, chain] as const),
  );
  const sourceChain = form.fromChain
    ? (chainMap.get(form.fromChain) ?? null)
    : null;
  const destinationChain = form.toChain
    ? (chainMap.get(form.toChain) ?? null)
    : null;
  const availableSourceChains = wallet
    ? supportedChains.filter((chain) => chain.type === wallet.kind)
    : [];
  const canUseDirectMint = (chain: ChainDefinition) =>
    wallet?.kind === "evm" && chain.type === "evm";
  const availableDestinationChains = wallet
    ? supportedChains.filter(
        (chain) => usesForwarder(chain) || canUseDirectMint(chain),
      )
    : [];
  const canUseConnectedAddress = Boolean(
    wallet && destinationChain && wallet.kind === destinationChain.type,
  );
  const selectedMethod =
    sourceChain && destinationChain
      ? detectTransferMethod(sourceChain, destinationChain)
      : null;
  const selectedMethodLabel = destinationChain
    ? getTransferMethodLabel(selectedMethod, usesForwarder(destinationChain))
    : null;
  const canSwapRoute = Boolean(
    wallet &&
    sourceChain &&
    destinationChain &&
    destinationChain.type === wallet.kind,
  );

  useEffect(() => {
    if (!wallet || !sourceChain) {
      return;
    }

    let cancelled = false;

    const syncBalance = async () => {
      try {
        if (!cancelled) {
          setBalanceUnavailable(false);
        }

        const request = await wallet.adapter.prepareAction(
          "usdc.balanceOf",
          {},
          { chain: sourceChain },
        );
        const value = await request.execute();

        if (!cancelled) {
          setBalance(formatUsdcBalance(value));
        }
      } catch {
        if (!cancelled) {
          setBalance("Unavailable");
          setBalanceUnavailable(true);
        }
      }
    };

    void syncBalance();

    return () => {
      cancelled = true;
    };
  }, [wallet, sourceChain]);

  async function openWalletChooser() {
    setError(null);

    try {
      const discoveredWallets = await discoverInjectedEvmWallets();
      setEvmWallets(discoveredWallets);
    } catch (discoveryError) {
      setError(getErrorMessage(discoveryError) ?? "Unknown error");
    }

    setScreen("wallets");
  }

  async function handleConnectWallet(
    walletChoice: BrowserWalletDetail | "solana",
  ) {
    setBusyAction("wallet");
    setError(null);

    try {
      const connectedWallet = await connectBrowserWallet(walletChoice);

      setWallet(connectedWallet);
      clearTransferState("form");
    } catch (connectionError) {
      setError(getErrorMessage(connectionError) ?? "Unknown error");
    } finally {
      setBusyAction(null);
    }
  }

  function disconnectWallet() {
    setWallet(null);
    clearTransferState("connect");
  }

  async function handleReviewTransfer() {
    if (!wallet || !sourceChain || !destinationChain) {
      setError("Connect a wallet and choose a valid route first");
      return;
    }

    if (!form.recipient.trim()) {
      setError("Recipient address is required");
      return;
    }

    const amount = Number.parseFloat(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid USDC amount");
      return;
    }

    setBusyAction("review");
    setError(null);

    try {
      const estimate = await estimateTransfer(
        wallet,
        sourceChain,
        destinationChain,
        form.amount,
        form.recipient,
      );
      setReview(estimate);
      setScreen("review");
    } catch (reviewError) {
      setError(getErrorMessage(reviewError) ?? "Unknown error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitTransfer() {
    if (!wallet || !sourceChain || !destinationChain || !review) {
      setError("Review the transfer before submitting");
      return;
    }

    setBusyAction("submit");
    setError(null);
    setStatusMessage(
      review.method === "send"
        ? "Processing send transaction..."
        : "Processing bridge transaction...",
    );
    setScreen("submitting");

    try {
      const transferResult = await executeTransfer(
        wallet,
        sourceChain,
        destinationChain,
        form.recipient,
        review,
        () => setStatusMessage("Retrying bridge after an initial failure..."),
      );

      if (transferResult.state === "error") {
        const failedStep = transferResult.steps.find(
          (step) => step.state === "error" && step.errorMessage,
        );
        setResult(transferResult);
        setError(failedStep?.errorMessage ?? "Transfer failed");
        setScreen("review");
        return;
      }

      setResult(transferResult);
      setScreen("success");
    } catch (submitError) {
      setError(getErrorMessage(submitError) ?? "Unknown error");
      setScreen("review");
    } finally {
      setBusyAction(null);
    }
  }

  function clearTransferState(nextScreen: Screen) {
    setReview(null);
    setResult(null);
    setError(null);
    setBalance(null);
    setBalanceUnavailable(false);
    setStatusMessage("Processing transfer transaction...");
    setForm(emptyForm);
    setScreen(nextScreen);
  }

  function renderConnectScreen() {
    return (
      <div className="wallet-disconnected">
        <h2>Arc Transfer</h2>
        <p>Send or bridge USDC across chains</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => void openWalletChooser()}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  function renderWalletChooser() {
    return (
      <div className="wallet-disconnected">
        <h2>Arc Transfer</h2>
        <p>Select a wallet</p>
        <div className="wallet-list">
          {evmWallets.length > 0 ? (
            evmWallets.map((evmWallet) => (
              <button
                key={evmWallet.info.uuid}
                type="button"
                className="wallet-row"
                onClick={() => void handleConnectWallet(evmWallet)}
                disabled={busyAction === "wallet"}
              >
                <span className="wallet-badge wallet-badge-evm">
                  {evmWallet.info.name.slice(0, 1).toUpperCase()}
                </span>
                <span>{evmWallet.info.name}</span>
              </button>
            ))
          ) : (
            <p className="support-copy">No EVM wallet detected.</p>
          )}

          {hasSolanaWallet() ? (
            <button
              type="button"
              className="wallet-row"
              onClick={() => void handleConnectWallet("solana")}
              disabled={busyAction === "wallet"}
            >
              <span className="wallet-badge wallet-badge-solana">S</span>
              <span>Solana Wallet</span>
            </button>
          ) : (
            <p className="support-copy">No Solana wallet detected.</p>
          )}
        </div>
      </div>
    );
  }

  function renderReviewScreen() {
    if (!sourceChain || !destinationChain || !review) {
      return null;
    }

    const sourceMeta = getChainMeta(sourceChain.name);
    const destinationMeta = getChainMeta(destinationChain.name);

    return (
      <div className="wallet-connected">
        <button
          type="button"
          className="back-link"
          onClick={() => setScreen("form")}
        >
          Back
        </button>
        <h2 className="panel-title">Review Transfer</h2>

        <div className="route-summary">
          <div className="route-chain">
            <img className="chain-icon" src={sourceMeta.icon} alt="" />
            <span>{sourceMeta.displayName}</span>
          </div>
          <span className="route-arrow">→</span>
          <div className="route-chain">
            <img className="chain-icon" src={destinationMeta.icon} alt="" />
            <span>{destinationMeta.displayName}</span>
          </div>
        </div>

        <dl className="review-grid">
          <dt>You receive</dt>
          <dd>{formatDisplayAmount(review.destinationAmount)} USDC</dd>
          <dt>Estimated fee</dt>
          <dd>{formatFee(review)}</dd>
          <dt>Total from source</dt>
          <dd>{formatDisplayAmount(review.totalSourceAmount)} USDC</dd>
          <dt>Recipient</dt>
          <dd>{shortAddress(form.recipient, 6, 4)}</dd>
          <dt>Method</dt>
          <dd>
            {getTransferMethodLabel(
              review.method,
              Boolean(review.useForwarder),
            )}
          </dd>
        </dl>

        <button
          type="button"
          className="primary-button"
          onClick={() => void handleSubmitTransfer()}
          disabled={busyAction === "submit"}
        >
          {busyAction === "submit" ? "Submitting..." : "Confirm & Sign"}
        </button>
      </div>
    );
  }

  function renderSubmittingScreen() {
    if (!sourceChain || !destinationChain || !review) {
      return null;
    }

    return (
      <div className="wallet-connected status-panel">
        <div className="spinner" aria-hidden="true"></div>
        <h2 className="panel-title">
          {review.method === "send" ? "Sending" : "Bridging"}{" "}
          {formatDisplayAmount(review.destinationAmount)} USDC
        </h2>
        <p className="processing-route">
          {sourceChain.name}
          <span>→</span>
          {destinationChain.name}
        </p>
        <p>{statusMessage}</p>
      </div>
    );
  }

  function renderSuccessScreen() {
    if (!sourceChain || !destinationChain || !result) {
      return null;
    }

    return (
      <div className="wallet-connected status-panel">
        <div className="success-badge" aria-hidden="true">
          ✓
        </div>
        <h2 className="panel-title">Transfer Complete</h2>
        <p className="success-copy">
          {result.method === "send"
            ? `${formatDisplayAmount(result.amount)} USDC sent on ${sourceChain.name}`
            : `${formatDisplayAmount(result.amount)} USDC from ${sourceChain.name} to ${destinationChain.name}`}
        </p>
        <div className="step-links">
          {result.steps
            .filter((step) => step.explorerUrl)
            .map((step) => (
              <a
                key={`${step.name}-${step.txHash ?? step.explorerUrl}`}
                className="step-chip"
                href={step.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span className={`step-state step-state-${step.state}`}>✓</span>
                {step.name} View →
              </a>
            ))}
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => clearTransferState("form")}
        >
          New Transfer
        </button>
      </div>
    );
  }

  function renderTransferForm() {
    return (
      <div className="wallet-connected">
        <div className="panel-header">
          <h2 className="panel-title">Arc Transfer</h2>
          {wallet ? (
            <div className="wallet-pill">
              {shortAddress(wallet.address)}
              <button
                type="button"
                className="wallet-pill-dismiss"
                aria-label="Disconnect wallet"
                onClick={disconnectWallet}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="route-block">
          <div className="field-block">
            <span className="field-label">From</span>
            <ChainSelect
              chains={availableSourceChains}
              value={form.fromChain}
              onChange={(nextFromChain) => {
                setBalance(null);
                setBalanceUnavailable(false);
                setForm((currentForm) => ({
                  ...currentForm,
                  fromChain: nextFromChain,
                }));
              }}
            />
          </div>
          <button
            type="button"
            className="swap-button"
            aria-label="Swap route"
            onClick={() => {
              setBalance(null);
              setBalanceUnavailable(false);
              setForm((currentForm) => ({
                ...currentForm,
                fromChain: currentForm.toChain,
                toChain: currentForm.fromChain,
              }));
            }}
            disabled={!canSwapRoute}
          >
            ↔
          </button>

          <div className="field-block">
            <span className="field-label">To</span>
            <ChainSelect
              chains={availableDestinationChains}
              value={form.toChain}
              onChange={(nextToChain) => {
                setForm((currentForm) => ({
                  ...currentForm,
                  toChain: nextToChain,
                }));
              }}
            />
          </div>
        </div>

        <label className="field-block">
          <span className="field-label">Recipient Address</span>
          <div className="inline-field">
            <input
              value={form.recipient}
              onChange={(event) => {
                setForm((currentForm) => ({
                  ...currentForm,
                  recipient: event.target.value,
                }));
              }}
              className="text-input"
              placeholder={
                destinationChain?.type === "solana"
                  ? "Destination Solana address"
                  : "0x..."
              }
            />
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => {
                if (!wallet || !canUseConnectedAddress) {
                  return;
                }

                setForm((currentForm) => ({
                  ...currentForm,
                  recipient: wallet.address,
                }));
              }}
              disabled={!canUseConnectedAddress}
            >
              Use Mine
            </button>
          </div>
        </label>

        <label className="field-block">
          <span className="field-label">Amount (USDC)</span>
          <input
            type="number"
            placeholder="0.00"
            value={form.amount}
            onChange={(event) => {
              setForm((currentForm) => ({
                ...currentForm,
                amount: event.target.value,
              }));
            }}
            className="text-input amount-input"
            inputMode="decimal"
          />

          {balance ? (
            <p className="support-copy">
              {balanceUnavailable
                ? "Balance unavailable"
                : `Balance: ${balance} USDC`}
            </p>
          ) : null}
        </label>

        {selectedMethodLabel ? (
          <div className="status-banner">Method: {selectedMethodLabel}</div>
        ) : null}

        <button
          type="button"
          className="primary-button"
          onClick={() => void handleReviewTransfer()}
          disabled={busyAction === "review"}
        >
          {busyAction === "review" ? "Estimating..." : "Review Transfer"}
        </button>
      </div>
    );
  }

  let content: ReactNode = renderTransferForm();

  if (screen === "connect") {
    content = renderConnectScreen();
  } else if (screen === "wallets") {
    content = renderWalletChooser();
  } else if (screen === "review") {
    content = renderReviewScreen() ?? renderTransferForm();
  } else if (screen === "submitting") {
    content = renderSubmittingScreen() ?? renderTransferForm();
  } else if (screen === "success") {
    content = renderSuccessScreen() ?? renderTransferForm();
  }

  return (
    <section className="widget-card" aria-label="Arc transfer widget">
      {content}
      {error ? <p className="error-banner">{error}</p> : null}
    </section>
  );
}

function ChainSelect({ chains, value, onChange }: ChainSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedChain = chains.find((chain) => chain.chain === value) ?? null;
  const selectedMeta = selectedChain ? getChainMeta(selectedChain.name) : null;
  const searchTerm = search.trim().toLowerCase();
  const filteredChains = searchTerm
    ? chains.filter((chain) => {
        const meta = getChainMeta(chain.name);
        return (
          meta.displayName.toLowerCase().includes(searchTerm) ||
          chain.name.toLowerCase().includes(searchTerm)
        );
      })
    : chains;

  return (
    <div className="chain-select">
      <button
        type="button"
        className="chain-select-toggle"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedMeta ? (
          <>
            <img className="chain-icon" src={selectedMeta.icon} alt="" />
            <span className="chain-name">{selectedMeta.displayName}</span>
          </>
        ) : (
          <span className="chain-name">Select chain</span>
        )}
        <span className="chain-select-arrow" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen ? (
        <div className="chain-dropdown">
          <input
            name="chain-search"
            className="text-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chains..."
            autoFocus
          />
          <div className="chain-list" role="listbox">
            {filteredChains.length === 0 ? (
              <div className="support-copy">No chains found</div>
            ) : null}
            {filteredChains.map((chain) => {
              const meta = getChainMeta(chain.name);
              const isSelected = chain.chain === value;

              return (
                <button
                  key={chain.chain}
                  type="button"
                  className="chain-row"
                  onClick={() => {
                    onChange(chain.chain);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  <img className="chain-icon" src={meta.icon} alt="" />
                  <span>{meta.displayName}</span>
                  {isSelected ? <span aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatUsdcBalance(value: unknown): string {
  const bigintValue =
    typeof value === "bigint"
      ? value
      : BigInt(typeof value === "string" ? value : String(value));
  const whole = bigintValue / 1_000_000n;
  const decimals = (bigintValue % 1_000_000n).toString().padStart(6, "0");
  const trimmedDecimals = decimals.replace(/0+$/, "");

  return trimmedDecimals
    ? `${whole.toString()}.${trimmedDecimals}`
    : whole.toString();
}

function formatDisplayAmount(value: string): string {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount.toFixed(2).replace(/\.00$/, "") : "0";
}

function formatFee(review: TransferEstimate): string {
  return review.feeAmount === "0"
    ? "No fee"
    : `${review.feeAmount} ${review.feeToken}`;
}

function getTransferMethodLabel(
  method: TransferEstimate["method"] | null,
  useForwarder: boolean,
): string | null {
  if (!method) {
    return null;
  }

  if (method === "send") {
    return "Send";
  }

  return useForwarder ? "CCTP + Forwarder" : "CCTP Direct Mint";
}

function shortAddress(value: string, head = 4, tail = 4): string {
  if (value.length <= head + tail + 3) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export default TransferWidget;
