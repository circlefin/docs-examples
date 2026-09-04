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
import { connectEvmProvider } from "./connect.ts";
import type { BrowserWalletProvider } from "./connect.ts";

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
    expect(provider.request).toHaveBeenCalledWith({
      method: "eth_requestAccounts",
      params: undefined,
    });
  });

  it("falls back to eth_accounts when requestAccounts returns empty", async () => {
    const provider = {
      request: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(["0x2222222222222222222222222222222222222222"]),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).resolves.toEqual({
      provider,
      account: "0x2222222222222222222222222222222222222222",
    });
    expect(provider.request).toHaveBeenNthCalledWith(2, {
      method: "eth_accounts",
      params: undefined,
    });
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
