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

import {
  AppKit,
  type BridgeResult,
  type BridgeStep,
  type ChainDefinition,
  type EstimatedGas,
} from "@circle-fin/app-kit";
import type { ConnectedWallet } from "./wallet";

export type ChainId = ChainDefinition["chain"];
export type TransferMethod = "send" | "bridge";

export type TransferEstimate = {
  method: TransferMethod;
  destinationAmount: string;
  totalSourceAmount: string;
  feeAmount: string;
  feeToken: string;
  useForwarder?: boolean;
};

export type TransferResult = {
  method: TransferMethod;
  amount: string;
  state: "success" | "error";
  steps: BridgeStep[];
  useForwarder?: boolean;
};

let cachedKit: AppKit | null = null;
let cachedSupportedChains: ChainDefinition[] | null = null;
let hasRegisteredDebugLogging = false;

type BridgeTransferParams = Parameters<AppKit["bridge"]>[0];
type BridgeTransferChain = BridgeTransferParams["from"]["chain"];
type BridgeDestination = BridgeTransferParams["to"];
type MicroUsdc = bigint;

const USDC_DECIMALS = 6;
const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

function getKit(): AppKit {
  if (!cachedKit) {
    cachedKit = new AppKit();
  }

  if (import.meta.env.DEV && !hasRegisteredDebugLogging) {
    cachedKit.on("*", (payload) => {
      console.log("[AppKit event]", payload);
    });
    hasRegisteredDebugLogging = true;
  }

  return cachedKit;
}

export function getSupportedChains(): ChainDefinition[] {
  if (!cachedSupportedChains) {
    cachedSupportedChains = getKit()
      .getSupportedChains("bridge")
      .filter((chain) => chain.isTestnet);
  }

  return cachedSupportedChains;
}

export function detectTransferMethod(
  sourceChain: ChainDefinition,
  destinationChain: ChainDefinition,
): TransferMethod {
  return sourceChain.chain === destinationChain.chain ? "send" : "bridge";
}

export function usesForwarder(destinationChain: ChainDefinition): boolean {
  return Boolean(destinationChain.cctp?.forwarderSupported.destination);
}

function getBridgeDestination(
  wallet: ConnectedWallet,
  destinationChain: ChainDefinition,
  recipient: string,
  useForwarder: boolean,
): BridgeDestination {
  if (useForwarder) {
    return {
      chain: destinationChain.chain as BridgeTransferChain,
      recipientAddress: recipient.trim(),
      useForwarder: true,
    };
  }

  return {
    adapter: wallet.adapter,
    chain: destinationChain.chain as BridgeTransferChain,
    recipientAddress: recipient.trim(),
  };
}

function parseUsdcAmount(value: string, allowZero = false): MicroUsdc {
  const trimmedValue = value.trim();
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(trimmedValue);

  if (!match) {
    throw new Error("Enter a valid USDC amount with up to 6 decimal places");
  }

  const [, whole, fraction = ""] = match;
  const parsedAmount =
    BigInt(whole) * USDC_SCALE +
    BigInt(fraction.padEnd(USDC_DECIMALS, "0"));

  if (parsedAmount < 0n || (!allowZero && parsedAmount === 0n)) {
    throw new Error("Enter a valid USDC amount");
  }

  return parsedAmount;
}

function formatUsdcAmount(value: MicroUsdc): string {
  const whole = value / USDC_SCALE;
  const fraction = (value % USDC_SCALE)
    .toString()
    .padStart(USDC_DECIMALS, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function formatSmallestUnitFee(value: string, decimals: number): string {
  try {
    const bigintValue = BigInt(value);
    const whole = bigintValue / 10n ** BigInt(decimals);
    const fraction = (bigintValue % 10n ** BigInt(decimals))
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "");

    return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
  } catch {
    return value;
  }
}

function getFeeDisplay(chain: ChainDefinition, estimatedGas: EstimatedGas): string {
  if (chain.type === "solana") {
    return formatSmallestUnitFee(estimatedGas.fee, 9);
  }

  if (chain.name.includes("Arc")) {
    return formatSmallestUnitFee(estimatedGas.fee, 18);
  }

  return formatSmallestUnitFee(estimatedGas.fee, 18);
}

export async function estimateTransfer(
  wallet: ConnectedWallet,
  sourceChain: ChainDefinition,
  destinationChain: ChainDefinition,
  amount: string,
  recipient: string,
): Promise<TransferEstimate> {
  const requestedAmount = parseUsdcAmount(amount);
  const normalizedAmount = formatUsdcAmount(requestedAmount);
  const method = detectTransferMethod(sourceChain, destinationChain);
  const kit = getKit();

  if (method === "send") {
    const estimatedGas = await kit.estimateSend({
      from: { adapter: wallet.adapter, chain: sourceChain.chain },
      to: recipient.trim(),
      amount: normalizedAmount,
      token: "USDC",
    });

    return {
      method,
      destinationAmount: normalizedAmount,
      totalSourceAmount: normalizedAmount,
      feeAmount: getFeeDisplay(sourceChain, estimatedGas),
      feeToken:
        sourceChain.type === "solana"
          ? "SOL"
          : sourceChain.name.includes("Arc")
            ? "USDC"
            : "native gas token",
      useForwarder: false,
    };
  }

  const useForwarder = usesForwarder(destinationChain);
  const bridgeEstimate = await kit.estimateBridge({
    from: {
      adapter: wallet.adapter,
      chain: sourceChain.chain as BridgeTransferChain,
    },
    to: getBridgeDestination(wallet, destinationChain, recipient, useForwarder),
    amount: normalizedAmount,
    token: "USDC",
  });

  const bridgeFee = bridgeEstimate.fees.reduce<MicroUsdc>(
    (sum, fee) =>
      sum + (fee.amount ? parseUsdcAmount(fee.amount, true) : 0n),
    0n,
  );
  const feeAmount = formatUsdcAmount(bridgeFee);
  const totalSourceAmount = formatUsdcAmount(requestedAmount + bridgeFee);

  return {
    method,
    destinationAmount: normalizedAmount,
    totalSourceAmount,
    feeAmount,
    feeToken: "USDC",
    useForwarder,
  };
}

export async function executeTransfer(
  wallet: ConnectedWallet,
  sourceChain: ChainDefinition,
  destinationChain: ChainDefinition,
  recipient: string,
  estimate: TransferEstimate,
  onRetryBridge?: () => void,
): Promise<TransferResult> {
  const kit = getKit();

  if (estimate.method === "send") {
    const step = await kit.send({
      from: { adapter: wallet.adapter, chain: sourceChain.chain },
      to: recipient.trim(),
      amount: estimate.destinationAmount,
      token: "USDC",
    });

    return {
      method: "send",
      amount: estimate.destinationAmount,
      state: step.state === "success" ? "success" : "error",
      steps: [step],
      useForwarder: false,
    };
  }

  let bridgeResult: BridgeResult = await kit.bridge({
    from: {
      adapter: wallet.adapter,
      chain: sourceChain.chain as BridgeTransferChain,
    },
    to: getBridgeDestination(
      wallet,
      destinationChain,
      recipient,
      Boolean(estimate.useForwarder),
    ),
    amount: estimate.destinationAmount,
    token: "USDC",
  });

  if (bridgeResult.state === "error") {
    onRetryBridge?.();
    bridgeResult = await kit.retryBridge(bridgeResult, {
      from: wallet.adapter,
      to: estimate.useForwarder ? undefined : wallet.adapter,
    });
  }

  return {
    method: "bridge",
    amount: estimate.destinationAmount,
    state: bridgeResult.state === "success" ? "success" : "error",
    steps: bridgeResult.steps,
    useForwarder: estimate.useForwarder,
  };
}
