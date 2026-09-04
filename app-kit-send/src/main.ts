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
import type { SendParams } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { connectEvmProvider } from "./connect.ts";
import type { BrowserWalletProvider } from "./connect.ts";

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

/** Connect the wallet and enable sending. */
async function handleWalletConnect() {
  try {
    connectWalletButton.disabled = true;

    const connection = await connectEvmProvider(await getProvider());
    walletProvider = connection.provider;

    walletInfo.textContent = connection.account;
    sendButton.disabled = false;
  } catch (error) {
    walletProvider = null;
    sendButton.disabled = true;
    render({ error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    connectWalletButton.disabled = Boolean(walletProvider);
  }
}

/** Estimate and send 1 USDC on Arc Testnet to the recipient. */
async function handleSend(event: Event) {
  event.preventDefault();

  try {
    if (!walletProvider) {
      throw new Error("Connect a wallet first");
    }

    sendButton.disabled = true;

    const recipientAddress = recipientAddressInput.value.trim();
    if (!recipientAddress) {
      throw new Error("Enter a recipient address");
    }

    const adapter = await createViemAdapterFromProvider({
      provider: walletProvider,
    });

    const sendParams: SendParams = {
      from: { adapter, chain: "Arc_Testnet" },
      to: recipientAddress,
      amount: "1.00",
      token: "USDC",
    };

    const estimate = await kit.estimateSend(sendParams);
    const result = await kit.send(sendParams);

    render({ estimate, result });
  } catch (error) {
    render({ error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    sendButton.disabled = false;
  }
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
const recipientAddressInput =
  document.querySelector<HTMLInputElement>("#recipientAddress")!;
const sendButton = document.querySelector<HTMLButtonElement>("#send")!;
const walletInfo = document.querySelector<HTMLParagraphElement>("#walletInfo")!;
const output = document.querySelector<HTMLPreElement>("#output")!;

connectWalletButton.addEventListener("click", handleWalletConnect);
sendButton.addEventListener("click", handleSend);
