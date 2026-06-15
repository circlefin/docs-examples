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

const connectEvmButton = document.querySelector<HTMLButtonElement>("#connectEvm")!;
const bridgeButton = document.querySelector<HTMLButtonElement>("#bridge")!;
const walletInfo = document.querySelector<HTMLParagraphElement>("#evmWalletInfo")!;
const output = document.querySelector<HTMLPreElement>("#output")!;

const kit = new AppKit();
let evmProvider: BrowserWalletProvider | null = null;

function render(value: unknown) {
  output.textContent = JSON.stringify(
    value,
    (_key, currentValue) =>
      typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
    2,
  );
  output.scrollTop = 0;
}

kit.on("*", (payload) => {
  output.textContent += `Action: ${JSON.stringify(
    payload,
    (_key, currentValue) =>
      typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
    2,
  )}\n`;
  output.scrollTop = output.scrollHeight;
});

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

async function handleEvmConnect() {
  try {
    connectEvmButton.disabled = true;

    evmProvider = await getProvider();
    await evmProvider.request({
      method: "eth_requestAccounts",
      params: undefined,
    });
    const accounts = (await evmProvider.request({
      method: "eth_accounts",
      params: undefined,
    })) as string[];

    walletInfo.textContent = accounts[0] ?? "Connected";
    bridgeButton.disabled = !evmProvider;
  } catch (error) {
    render({ error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    connectEvmButton.disabled = Boolean(evmProvider);
  }
}

async function handleBridge() {
  try {
    if (!evmProvider) {
      throw new Error("Connect an EVM wallet first");
    }

    bridgeButton.disabled = true;

    const evmAdapter = await createViemAdapterFromProvider({
      provider: evmProvider,
    });

    let result = await kit.bridge({
      from: { adapter: evmAdapter, chain: "Ethereum_Sepolia" },
      to: { adapter: evmAdapter, chain: "Arc_Testnet" },
      amount: "1.00",
    });

    if (result.state === "error") {
      result = await kit.retryBridge(result, {
        from: evmAdapter,
        to: evmAdapter,
      });
    }

    render(result);
  } catch (error) {
    render({ error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    bridgeButton.disabled = false;
  }
}

connectEvmButton.addEventListener("click", handleEvmConnect);
bridgeButton.addEventListener("click", handleBridge);
