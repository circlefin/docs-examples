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
import {
  connectEvmProvider,
  connectSolanaProvider,
} from "./connect.ts";
import type {
  BrowserWalletProvider,
  SolanaWalletProvider,
} from "./connect.ts";

describe("wallet connection", () => {
  it("returns the EVM provider only after account lookup succeeds", async () => {
    const account = "0x4444444444444444444444444444444444444444";
    const provider = {
      request: vi
        .fn()
        .mockResolvedValueOnce([account]),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).resolves.toEqual({
      provider,
      account,
    });
    expect(provider.request).toHaveBeenCalledTimes(1);
  });

  it("does not return an EVM provider when permission is rejected", async () => {
    const rejection = new Error("User rejected the request");
    const provider = {
      request: vi.fn().mockRejectedValue(rejection),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).rejects.toBe(rejection);
    expect(provider.request).toHaveBeenCalledTimes(1);
  });

  it("does not return an EVM provider when permission returns no account", async () => {
    const provider = {
      request: vi.fn().mockResolvedValue([]),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).rejects.toThrow(
      "No account returned after wallet permission",
    );
    expect(provider.request).toHaveBeenCalledTimes(1);
  });

  it("does not return a Solana provider when connection is rejected", async () => {
    const rejection = new Error("User rejected the request");
    const provider = {
      connect: vi.fn().mockRejectedValue(rejection),
    } as unknown as SolanaWalletProvider;

    await expect(connectSolanaProvider(provider)).rejects.toBe(rejection);
    expect(provider.connect).toHaveBeenCalledTimes(1);
  });

  it("returns the Solana provider only after connection succeeds", async () => {
    const publicKey = { toString: () => "solana-address" };
    const provider = {
      connect: vi.fn().mockResolvedValue({ publicKey }),
      publicKey: null,
    } as unknown as SolanaWalletProvider;

    await expect(connectSolanaProvider(provider)).resolves.toEqual({
      provider,
      address: "solana-address",
    });
  });

  it("does not return a Solana provider when connection returns no address", async () => {
    const provider = {
      connect: vi.fn().mockResolvedValue({}),
      publicKey: null,
    } as unknown as SolanaWalletProvider;

    await expect(connectSolanaProvider(provider)).rejects.toThrow(
      "No address returned after wallet connection",
    );
    expect(provider.connect).toHaveBeenCalledTimes(1);
  });
});
