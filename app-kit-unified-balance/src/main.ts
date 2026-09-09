/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
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
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppKit } from "@circle-fin/app-kit";
import { ArcTestnet, AvalancheFuji, SolanaDevnet } from "@circle-fin/app-kit/chains";
import { createSolanaAdapterFromProvider } from "@circle-fin/adapter-solana";
import type {
  CreateSolanaAdapterFromProviderParams,
  SolanaAdapter,
} from "@circle-fin/adapter-solana";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type {
  CreateViemAdapterFromProviderParams,
  ViemAdapter,
} from "@circle-fin/adapter-viem-v2";

type EvmWalletProvider = CreateViemAdapterFromProviderParams["provider"];
type SolanaWalletProvider = CreateSolanaAdapterFromProviderParams["provider"];

type EIP6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EvmWalletProvider;
};

declare global {
  interface Window {
    solana?: SolanaWalletProvider;
    solflare?: SolanaWalletProvider;
  }

  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<EIP6963ProviderDetail>;
  }
}

const kit = new AppKit();
let evmAdapter: ViemAdapter | null = null;
let solanaAdapter: SolanaAdapter | null = null;

/** Discover an EIP-6963 browser wallet (prefers MetaMask). */
async function getEvmProvider(): Promise<EvmWalletProvider> {
  const providers = new Map<string, EIP6963ProviderDetail>();

  const onAnnounce = ((event: CustomEvent<EIP6963ProviderDetail>) => {
    providers.set(event.detail.info.uuid, event.detail);
  }) as EventListener;

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);

  const selectedProvider =
    [...providers.values()].find(
      ({ info }) => info.rdns === "io.metamask" || info.name === "MetaMask",
    )?.provider ?? [...providers.values()][0]?.provider;

  if (!selectedProvider) {
    throw new Error("No EIP-6963 browser wallet found");
  }

  return selectedProvider;
}

/** Connect the EVM wallet and build an adapter for Avalanche Fuji + Arc Testnet. */
async function handleEvmConnect() {
  try {
    connectEvmButton.disabled = true;

    const provider = await getEvmProvider();
    await provider.request({
      method: "eth_requestAccounts",
      params: undefined,
    });
    const accounts = (await provider.request({
      method: "eth_accounts",
      params: undefined,
    })) as string[];

    // Create the adapter once at connect time with the chains this demo uses
    evmAdapter = await createViemAdapterFromProvider({
      provider,
      capabilities: {
        supportedChains: [AvalancheFuji, ArcTestnet],
      },
    });
    evmWalletInfo.textContent = accounts[0] ?? "Connected";
    output.textContent = "";
  } catch (error) {
    evmAdapter = null;
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    connectEvmButton.disabled = Boolean(evmAdapter);
    updateActionButtons();
  }
}

/** Connect the Solana wallet and build an adapter for Solana Devnet. */
async function handleSolanaConnect() {
  try {
    connectSolanaButton.disabled = true;

    // Prefer Solflare when present; fall back to window.solana (e.g. Phantom).
    const provider = window.solflare ?? window.solana;
    if (!provider) {
      throw new Error("No Solana browser wallet found");
    }

    const connection = await provider.connect();
    const connectedAddress =
      connection.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;

    // Create the adapter once at connect time for Solana Devnet
    solanaAdapter = await createSolanaAdapterFromProvider({
      provider,
      capabilities: {
        supportedChains: [SolanaDevnet],
      },
    });
    solanaWalletInfo.textContent = connectedAddress ?? "Connected";
    output.textContent = "";
  } catch (error) {
    solanaAdapter = null;
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    connectSolanaButton.disabled = Boolean(solanaAdapter);
    updateActionButtons();
  }
}

/** Deposit 2 USDC from Avalanche Fuji into the unified balance. */
async function handleDepositFuji() {
  try {
    if (!evmAdapter) {
      throw new Error("Connect an EVM wallet first");
    }

    depositFujiButton.disabled = true;

    // Switch the wallet to Avalanche Fuji before depositing
    await evmAdapter.ensureChain(AvalancheFuji);

    const result = await kit.unifiedBalance.deposit({
      from: { adapter: evmAdapter, chain: "Avalanche_Fuji" },
      amount: "2.00",
      token: "USDC",
    });

    render(result);
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    updateActionButtons();
  }
}

/** Deposit 1 USDC from Solana Devnet into the unified balance. */
async function handleDepositSolana() {
  try {
    if (!solanaAdapter) {
      throw new Error("Connect a Solana wallet first");
    }

    depositSolanaButton.disabled = true;

    const result = await kit.unifiedBalance.deposit({
      from: { adapter: solanaAdapter, chain: "Solana_Devnet" },
      amount: "1.00",
      token: "USDC",
    });

    render(result);
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    updateActionButtons();
  }
}

/** Read the unified USDC balance across connected wallets. */
async function handleCheckBalance() {
  try {
    checkBalanceButton.disabled = true;

    // Include every connected adapter as a balance source
    const sources = [
      ...(evmAdapter ? [{ adapter: evmAdapter }] : []),
      ...(solanaAdapter ? [{ adapter: solanaAdapter }] : []),
    ];

    const balances = await kit.unifiedBalance.getBalances({
      sources,
      networkType: "testnet",
      includePending: true,
    });

    render(balances);
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    updateActionButtons();
  }
}

/** Spend 2.50 USDC from the unified balance to a recipient on Arc Testnet. */
async function handleSpend(event: SubmitEvent) {
  event.preventDefault();

  try {
    if (!evmAdapter || !solanaAdapter) {
      throw new Error("Connect both wallets first");
    }

    spendButton.disabled = true;

    const recipientAddress = recipientAddressInput.value.trim();

    // Pull liquidity from both chains and deliver on Arc Testnet
    const result = await kit.unifiedBalance.spend({
      amount: "2.50",
      token: "USDC",
      from: [{ adapter: evmAdapter }, { adapter: solanaAdapter }],
      to: {
        adapter: evmAdapter,
        chain: "Arc_Testnet",
        recipientAddress,
      },
    });

    render(result);
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    updateActionButtons();
  }
}

/** Enable deposit / balance / spend actions based on which wallets are connected. */
function updateActionButtons() {
  const hasEvmAdapter = Boolean(evmAdapter);
  const hasSolanaAdapter = Boolean(solanaAdapter);

  depositFujiButton.disabled = !hasEvmAdapter;
  depositSolanaButton.disabled = !hasSolanaAdapter;
  checkBalanceButton.disabled = !hasEvmAdapter && !hasSolanaAdapter;
  spendButton.disabled = !(hasEvmAdapter && hasSolanaAdapter);
}

/** Pretty-print a value into the output panel. */
function render(value: unknown) {
  output.textContent = JSON.stringify(
    value,
    (_key, currentValue) =>
      typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
    2,
  );
  output.scrollTop = 0;
}

const connectEvmButton = document.querySelector<HTMLButtonElement>("#connectEvm")!;
const connectSolanaButton =
  document.querySelector<HTMLButtonElement>("#connectSolana")!;
const depositFujiButton =
  document.querySelector<HTMLButtonElement>("#depositFuji")!;
const depositSolanaButton =
  document.querySelector<HTMLButtonElement>("#depositSolana")!;
const checkBalanceButton =
  document.querySelector<HTMLButtonElement>("#checkBalance")!;
const spendForm = document.querySelector<HTMLFormElement>("form")!;
const spendButton = document.querySelector<HTMLButtonElement>("#spend")!;
const recipientAddressInput =
  document.querySelector<HTMLInputElement>("#recipientAddress")!;
const evmWalletInfo = document.querySelector<HTMLParagraphElement>("#evmWalletInfo")!;
const solanaWalletInfo =
  document.querySelector<HTMLParagraphElement>("#solanaWalletInfo")!;
const output = document.querySelector<HTMLPreElement>("#output")!;

connectEvmButton.addEventListener("click", handleEvmConnect);
connectSolanaButton.addEventListener("click", handleSolanaConnect);
depositFujiButton.addEventListener("click", handleDepositFuji);
depositSolanaButton.addEventListener("click", handleDepositSolana);
checkBalanceButton.addEventListener("click", handleCheckBalance);
spendForm.addEventListener("submit", handleSpend);
updateActionButtons();
