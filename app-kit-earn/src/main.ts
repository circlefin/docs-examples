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
import type { EarnVaultInfo } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { CreateViemAdapterFromProviderParams } from "@circle-fin/adapter-viem-v2";

type BrowserWalletProvider = CreateViemAdapterFromProviderParams["provider"];

type EIP6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: BrowserWalletProvider;
};

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<EIP6963ProviderDetail>;
  }
}

const kit = new AppKit();
let walletProvider: BrowserWalletProvider | null = null;
let vaults: EarnVaultInfo[] = [];

/** Discover an EIP-6963 browser wallet (prefers MetaMask). */
async function getProvider(): Promise<BrowserWalletProvider> {
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

/** Connect the wallet and enable earn actions. */
async function handleWalletConnect() {
  try {
    connectWalletButton.disabled = true;

    walletProvider = await getProvider();
    await walletProvider.request({
      method: "eth_requestAccounts",
      params: undefined,
    });
    const accounts = (await walletProvider.request({
      method: "eth_accounts",
      params: undefined,
    })) as string[];

    walletInfo.textContent = accounts[0] ?? "Connected";
    output.textContent = "";
  } catch (error) {
    walletProvider = null;
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    connectWalletButton.disabled = Boolean(walletProvider);
    updateActionButtons();
  }
}

/** Load active earn vaults on Arc Testnet, sorted by APY. */
async function handleLoadVaults() {
  try {
    vaultSelect.disabled = true;

    const result = await kit.earn.exploreVaults({
      chain: "Arc_Testnet",
      sortBy: "apy",
    });

    vaults = [...result.vaults];

    vaultSelect.replaceChildren();
    vaultSelect.add(new Option("--Select vault--", "", true, true));
    vaultSelect.options[0]!.disabled = true;

    for (const vault of vaults) {
      if (vault.liquidityProfile?.status !== "active" || !vault.address) {
        continue;
      }

      const apyPercent = ((vault.apyProfile?.current ?? 0) * 100).toFixed(2);
      vaultSelect.add(
        new Option(`${vault.name} (${apyPercent}% APY)`, vault.address),
      );
    }
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    vaultSelect.disabled = false;
    updateActionButtons();
  }
}

/** Show the selected vault's metadata in the output panel. */
function handleVaultSelect() {
  const vault = vaults.find((entry) => entry.address === vaultSelect.value);
  if (vault) {
    render(vault);
  }
  updateActionButtons();
}

/** Preview depositing 1 USDC into the selected vault. */
async function handleDepositQuote() {
  try {
    if (!walletProvider) {
      throw new Error("Connect a wallet first");
    }

    const vaultAddress = vaultSelect.value;
    if (!vaultAddress) {
      throw new Error("Select a vault first");
    }

    depositQuoteButton.disabled = true;

    const adapter = await createViemAdapterFromProvider({
      provider: walletProvider,
    });

    const quote = await kit.earn.getDepositQuote({
      from: { adapter, chain: "Arc_Testnet" },
      vaultAddress,
      amount: "1",
    });

    render(quote);
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    updateActionButtons();
  }
}

/** Deposit 1 USDC into the selected vault on Arc Testnet. */
async function handleDeposit() {
  try {
    if (!walletProvider) {
      throw new Error("Connect a wallet first");
    }

    const vaultAddress = vaultSelect.value;
    if (!vaultAddress) {
      throw new Error("Select a vault first");
    }

    depositButton.disabled = true;

    const adapter = await createViemAdapterFromProvider({
      provider: walletProvider,
    });

    const result = await kit.earn.deposit({
      from: { adapter, chain: "Arc_Testnet" },
      vaultAddress,
      amount: "1",
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

/** Read the wallet's position in the selected vault. */
async function handleCheckPosition() {
  try {
    if (!walletProvider) {
      throw new Error("Connect a wallet first");
    }

    const vaultAddress = vaultSelect.value;
    if (!vaultAddress) {
      throw new Error("Select a vault first");
    }

    checkPositionButton.disabled = true;

    const adapter = await createViemAdapterFromProvider({
      provider: walletProvider,
    });

    const position = await kit.earn.getPosition({
      from: { adapter, chain: "Arc_Testnet" },
      vaultAddress,
    });

    render(position);
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    updateActionButtons();
  }
}

/** Preview withdrawing 1 USDC from the selected vault. */
async function handleWithdrawQuote() {
  try {
    if (!walletProvider) {
      throw new Error("Connect a wallet first");
    }

    const vaultAddress = vaultSelect.value;
    if (!vaultAddress) {
      throw new Error("Select a vault first");
    }

    withdrawQuoteButton.disabled = true;

    const adapter = await createViemAdapterFromProvider({
      provider: walletProvider,
    });

    const quote = await kit.earn.getWithdrawalQuote({
      from: { adapter, chain: "Arc_Testnet" },
      vaultAddress,
      amount: "1",
    });

    render(quote);
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
  } finally {
    updateActionButtons();
  }
}

/** Withdraw 1 USDC from the selected vault on Arc Testnet. */
async function handleWithdraw() {
  try {
    if (!walletProvider) {
      throw new Error("Connect a wallet first");
    }

    const vaultAddress = vaultSelect.value;
    if (!vaultAddress) {
      throw new Error("Select a vault first");
    }

    withdrawButton.disabled = true;

    const adapter = await createViemAdapterFromProvider({
      provider: walletProvider,
    });

    const result = await kit.earn.withdraw({
      from: { adapter, chain: "Arc_Testnet" },
      vaultAddress,
      amount: "1",
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

/** Enable quote / deposit / position / withdraw when wallet and vault are set. */
function updateActionButtons() {
  const enabled = Boolean(walletProvider) && vaultSelect.value !== "";
  depositQuoteButton.disabled = !enabled;
  depositButton.disabled = !enabled;
  checkPositionButton.disabled = !enabled;
  withdrawQuoteButton.disabled = !enabled;
  withdrawButton.disabled = !enabled;
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

const connectWalletButton =
  document.querySelector<HTMLButtonElement>("#connectWallet")!;
const vaultSelect = document.querySelector<HTMLSelectElement>("#vaults")!;
const depositQuoteButton =
  document.querySelector<HTMLButtonElement>("#depositQuote")!;
const depositButton = document.querySelector<HTMLButtonElement>("#deposit")!;
const checkPositionButton =
  document.querySelector<HTMLButtonElement>("#checkPosition")!;
const withdrawQuoteButton =
  document.querySelector<HTMLButtonElement>("#withdrawQuote")!;
const withdrawButton = document.querySelector<HTMLButtonElement>("#withdraw")!;
const walletInfo = document.querySelector<HTMLParagraphElement>("#walletInfo")!;
const output = document.querySelector<HTMLPreElement>("#output")!;

connectWalletButton.addEventListener("click", handleWalletConnect);
vaultSelect.addEventListener("change", handleVaultSelect);
depositQuoteButton.addEventListener("click", handleDepositQuote);
depositButton.addEventListener("click", handleDeposit);
checkPositionButton.addEventListener("click", handleCheckPosition);
withdrawQuoteButton.addEventListener("click", handleWithdrawQuote);
withdrawButton.addEventListener("click", handleWithdraw);
void handleLoadVaults();
updateActionButtons();
