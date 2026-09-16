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
import type { OnrampSession, OnrampWidget } from "@circle-fin/app-kit";

const SESSION_URL = "/api/onramp/sessions";

const kit = new AppKit({
  onramp: import.meta.env.VITE_ONRAMP_WIDGET_BASE_URL
    ? { widgetBaseUrl: import.meta.env.VITE_ONRAMP_WIDGET_BASE_URL }
    : undefined,
});

let session: OnrampSession | null = null;
let iframeWidget: OnrampWidget | null = null;

/** Mint a session from the local server route (keeps apiKey off the client). */
async function handlePrepareSession() {
  try {
    prepareSessionButton.disabled = true;
    setStatus("Preparing session…");

    session = await kit.onramp.fetchSession({
      url: SESSION_URL,
      body: getSessionBody(),
    });

    render({ sessionPrepared: true, widgetUrl: session.widgetUrl });
    setStatus("Session ready — mount the iframe or open a popup.");
    updateActionButtons();
  } catch (error) {
    session = null;
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
    setStatus("Session failed.");
    updateActionButtons();
  } finally {
    prepareSessionButton.disabled = false;
  }
}

/** Embed the hosted onramp widget inline (no user-gesture requirement). */
async function handleMountIframe() {
  try {
    if (!session) {
      throw new Error("Prepare a session first");
    }

    mountIframeButton.disabled = true;
    iframeWidget?.close();

    iframeWidget = kit.onramp.mountIframe({
      session,
      container: widgetContainer,
      onDepositSettled: (envelope) => {
        render(envelope);
      },
      onDepositNotCompleted: (envelope) => {
        render(envelope);
      },
      onSessionExpired: async () => {
        setStatus("Session expired — preparing a fresh one…");
        await handlePrepareSession();
        if (session) {
          iframeWidget = kit.onramp.mountIframe({
            session,
            container: widgetContainer,
          });
          wireWidgetEvents(iframeWidget);
        }
      },
    });

    wireWidgetEvents(iframeWidget);
    setStatus("Iframe mounted.");
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
    setStatus("Mount failed.");
  } finally {
    updateActionButtons();
  }
}

/**
 * Open the widget in a popup. Must stay synchronous after a prepared session —
 * awaiting fetchSession inside this handler would consume the user gesture.
 */
function handleOpenWindow() {
  try {
    if (!session) {
      throw new Error("Prepare a session first");
    }

    const result = kit.onramp.openWindow({
      session,
      onDepositSettled: (envelope) => {
        render(envelope);
      },
      onDepositNotCompleted: (envelope) => {
        render(envelope);
      },
    });

    if (result.status === "blocked") {
      render({
        status: "blocked",
        reason: result.reason,
        errorMessage: result.errorMessage,
      });

      if (result.reason === "popup_blocked") {
        setStatus(result.errorMessage);
      } else {
        setStatus("Popup unavailable — falling back to iframe.");
        void handleMountIframe();
      }
      return;
    }

    wireWidgetEvents(result.widget);
    setStatus("Popup opened.");
  } catch (error) {
    render({
      error: (error as { message?: string })?.message ?? String(error),
    });
    setStatus("Popup failed.");
  }
}

/** Forward every widget envelope into the output panel. */
function wireWidgetEvents(widget: OnrampWidget) {
  widget.on("*", (envelope) => {
    render(envelope);
  });
}

function getSessionBody() {
  const appUserId = appUserIdInput.value.trim();
  const destinationAddress = destinationAddressInput.value.trim();

  if (!appUserId) {
    throw new Error("Enter an app user ID");
  }
  if (!destinationAddress) {
    throw new Error("Enter a destination address");
  }

  return { appUserId, destinationAddress };
}

function updateActionButtons() {
  const ready = session != null;
  mountIframeButton.disabled = !ready;
  openWindowButton.disabled = !ready;
}

function setStatus(message: string) {
  console.log(message);
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

const appUserIdInput =
  document.querySelector<HTMLInputElement>("#appUserId")!;
const destinationAddressInput =
  document.querySelector<HTMLInputElement>("#destinationAddress")!;
const prepareSessionButton =
  document.querySelector<HTMLButtonElement>("#prepareSession")!;
const mountIframeButton =
  document.querySelector<HTMLButtonElement>("#mountIframe")!;
const openWindowButton =
  document.querySelector<HTMLButtonElement>("#openWindow")!;
const widgetContainer =
  document.querySelector<HTMLDivElement>("#onramp-root")!;
const output = document.querySelector<HTMLPreElement>("#output")!;

prepareSessionButton.addEventListener("click", () => {
  void handlePrepareSession();
});
mountIframeButton.addEventListener("click", () => {
  void handleMountIframe();
});
openWindowButton.addEventListener("click", handleOpenWindow);

window.addEventListener("beforeunload", () => {
  iframeWidget?.close();
});
