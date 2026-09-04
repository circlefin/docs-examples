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

import { describe, expect, it, vi } from "vitest";
import { connectEvmProvider, connectSolanaProvider } from "./connect.ts";
import type {
  BrowserWalletProvider,
  SolanaWalletProvider,
} from "./connect.ts";

describe("connectEvmProvider", () => {
  it("prefers accounts returned by eth_requestAccounts", async () => {
    const provider = {
      request: vi
        .fn()
        .mockResolvedValueOnce(["0x1111111111111111111111111111111111111111"]),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).resolves.toEqual({
      provider,
      account: "0x1111111111111111111111111111111111111111",
    });
    expect(provider.request).toHaveBeenCalledTimes(1);
  });

  it("throws when no account is available so callers stay disconnected", async () => {
    const provider = {
      request: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).rejects.toThrow(
      "No wallet account available",
    );
  });
});

describe("connectSolanaProvider", () => {
  it("returns the connected address when present", async () => {
    const provider = {
      connect: vi.fn().mockResolvedValue({
        publicKey: { toString: () => "So11111111111111111111111111111111111111112" },
      }),
      publicKey: null,
    } as unknown as SolanaWalletProvider;

    await expect(connectSolanaProvider(provider)).resolves.toEqual({
      provider,
      address: "So11111111111111111111111111111111111111112",
    });
  });

  it("throws when address is missing so callers stay disconnected", async () => {
    const provider = {
      connect: vi.fn().mockResolvedValue({ publicKey: null }),
      publicKey: null,
    } as unknown as SolanaWalletProvider;

    await expect(connectSolanaProvider(provider)).rejects.toThrow(
      "No Solana wallet address available",
    );
  });
});
