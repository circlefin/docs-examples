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

import type { CreateSolanaAdapterFromProviderParams } from "@circle-fin/adapter-solana";
import type { CreateViemAdapterFromProviderParams } from "@circle-fin/adapter-viem-v2";

export type BrowserWalletProvider =
  CreateViemAdapterFromProviderParams["provider"];
export type SolanaWalletProvider =
  CreateSolanaAdapterFromProviderParams["provider"];

export async function connectEvmProvider(provider: BrowserWalletProvider) {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
    params: undefined,
  })) as string[];
  const account = accounts[0];
  if (!account) {
    throw new Error("No account returned after wallet permission");
  }

  return { provider, account };
}

export async function connectSolanaProvider(provider: SolanaWalletProvider) {
  const connection = await provider.connect();
  const address =
    connection.publicKey?.toString() ?? provider.publicKey?.toString();
  if (!address) {
    throw new Error("No address returned after wallet connection");
  }

  return { provider, address };
}
