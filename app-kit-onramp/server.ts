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

import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import {
  createAppServerKit,
  createSessionRouteHandler,
} from "@circle-fin/app-kit/server";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  throw new Error("Set CIRCLE_API_KEY in .env before starting the server");
}

const serverKit = createAppServerKit({
  onramp: {
    apiKey,
    // Hostname only — required when embedding the widget in an iframe.
    referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN ?? "localhost",
    baseUrl: process.env.ONRAMP_API_BASE_URL,
    widgetBaseUrl: process.env.ONRAMP_WIDGET_BASE_URL,
  },
});

const handleOnrampSession = createSessionRouteHandler(serverKit.onramp);

const port = Number(process.env.PORT ?? 3001);

createServer(async (req, res) => {
  const host = req.headers.host ?? `localhost:${port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);

  if (url.pathname !== "/api/onramp/sessions") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Not found" }));
    return;
  }

  const request = await toWebRequest(req, url);
  const response = await handleOnrampSession(request);

  res.writeHead(
    response.status,
    Object.fromEntries(response.headers.entries()),
  );
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => {
  console.log(`Onramp session server on http://localhost:${port}`);
});

/** Adapt Node's IncomingMessage into a Fetch API Request. */
async function toWebRequest(
  req: IncomingMessage,
  url: URL,
): Promise<Request> {
  const method = req.method ?? "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }
    headers.set(key, value);
  }

  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return new Request(url, {
    method,
    headers,
    body: Buffer.concat(chunks),
  });
}
