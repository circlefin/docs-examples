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

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import "./index.css";

if (!("Buffer" in globalThis)) {
  Object.assign(globalThis, { Buffer });
}

// App Kit currently expects Buffer to exist before its modules evaluate.
const { default: TransferWidget } = await import(
  "./components/TransferWidget"
);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TransferWidget />
  </StrictMode>,
);
