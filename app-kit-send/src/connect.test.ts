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
  it("returns the provider only after permission and account lookup succeed", async () => {
    const provider = {
      request: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(["0x1111111111111111111111111111111111111111"]),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).resolves.toEqual({
      provider,
      account: "0x1111111111111111111111111111111111111111",
    });
    expect(provider.request).toHaveBeenNthCalledWith(1, {
      method: "eth_requestAccounts",
      params: undefined,
    });
    expect(provider.request).toHaveBeenNthCalledWith(2, {
      method: "eth_accounts",
      params: undefined,
    });
  });

  it("does not return a connected provider when permission is rejected", async () => {
    const rejection = new Error("User rejected the request");
    const provider = {
      request: vi.fn().mockRejectedValue(rejection),
    } as unknown as BrowserWalletProvider;

    await expect(connectEvmProvider(provider)).rejects.toBe(rejection);
    expect(provider.request).toHaveBeenCalledTimes(1);
  });
});
