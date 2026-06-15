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

// widget/chains.ts - Testnet chain metadata for the embedded transfer widget.
// App Kit owns chain availability; this file only decorates SDK chains for the UI.

import { CHAIN_ICONS, PLACEHOLDER_ICON } from "./icons";

export type ChainMeta = {
  name: string;
  displayName: string;
  icon: string;
};

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "Apothem Network": "XDC Apothem",
};

export function getChainMeta(chainName: string): ChainMeta {
  return {
    name: chainName,
    displayName: DISPLAY_NAME_OVERRIDES[chainName] ?? chainName,
    icon: CHAIN_ICONS[chainName] ?? PLACEHOLDER_ICON,
  };
}
