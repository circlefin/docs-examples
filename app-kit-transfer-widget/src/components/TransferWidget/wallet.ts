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

import type { AdapterContext } from "@circle-fin/app-kit";
import type { CreateSolanaAdapterFromProviderParams } from "@circle-fin/adapter-solana";
import type { CreateViemAdapterFromProviderParams } from "@circle-fin/adapter-viem-v2";

export type BridgeAdapter = AdapterContext["adapter"];
export type EvmProvider = CreateViemAdapterFromProviderParams["provider"];
export type SolanaProvider = CreateSolanaAdapterFromProviderParams["provider"];
export type WalletKind = "evm" | "solana";

export type BrowserWalletDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EvmProvider;
};

export type ConnectedWallet = {
  kind: WalletKind;
  label: string;
  address: string;
  adapter: BridgeAdapter;
};

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<BrowserWalletDetail>;
  }

  interface Window {
    solana?: SolanaProvider;
  }
}

export function hasSolanaWallet(): boolean {
  return Boolean(window.solana);
}

export async function discoverInjectedEvmWallets(): Promise<BrowserWalletDetail[]> {
  const providers = new Map<string, BrowserWalletDetail>();

  const onAnnounce = ((event: CustomEvent<BrowserWalletDetail>) => {
    providers.set(event.detail.info.uuid, event.detail);
  }) as EventListener;

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => {
    window.setTimeout(resolve, 250);
  });
  window.removeEventListener("eip6963:announceProvider", onAnnounce);

  return [...providers.values()];
}

async function connectEvmWallet(walletChoice: BrowserWalletDetail): Promise<ConnectedWallet> {
  const { provider } = walletChoice;

  await provider.request({
    method: "eth_requestAccounts",
    params: undefined,
  });

  const accounts = await provider.request({
    method: "eth_accounts",
    params: undefined,
  });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";

  if (!address) {
    throw new Error("Wallet connected, but no account address was returned");
  }

  const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
  const adapter = await createViemAdapterFromProvider({ provider });

  return {
    kind: "evm",
    label: walletChoice.info.name,
    address,
    adapter,
  };
}

async function connectSolanaWallet(): Promise<ConnectedWallet> {
  const provider = window.solana;

  if (!provider) {
    throw new Error("No Solana browser wallet found");
  }

  const connection = await provider.connect();
  const address = connection.publicKey?.toString() ?? provider.publicKey?.toString() ?? "";

  if (!address) {
    throw new Error("Wallet connected, but no public key was returned");
  }

  const { createSolanaAdapterFromProvider } = await import("@circle-fin/adapter-solana");
  const adapter = await createSolanaAdapterFromProvider({ provider });

  return {
    kind: "solana",
    label: "Solana Wallet",
    address,
    adapter,
  };
}

export async function connectBrowserWallet(walletChoice: BrowserWalletDetail | "solana"): Promise<ConnectedWallet> {
  return walletChoice === "solana" ? connectSolanaWallet() : connectEvmWallet(walletChoice);
}
