/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
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

import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import './style.css'

const appId = import.meta.env.VITE_CIRCLE_APP_ID

const sdk = new W3SSdk({
  appSettings: { appId },
})

// ── Key integration ────────────────────────────────────────────────

/** Server creates a PIN+wallet challenge; browser execute completes it. */
async function createWallet() {
  const userId = readUserId()
  if (!userId) return

  log(`Creating wallet for ${userId}...`)
  const session = await postJson('/api/pin/setup', { userId })
  await executeChallenge(session)
  await showWallet(session.userToken)
}

/** Fresh userToken for an existing userId — no challenge, no PIN UI. */
async function continueWithPin() {
  const userId = readUserId()
  if (!userId) return

  log(`Fetching userToken for ${userId} (no challenge)...`)
  const session = await postJson('/api/pin/token', { userId })
  await showWallet(session.userToken)
}

/** Challenge to change a PIN the user still knows. */
async function resetPin() {
  const userId = readUserId()
  if (!userId) return

  log(`Starting PIN reset for ${userId}...`)
  const session = await postJson('/api/pin/reset', { userId })
  await executeChallenge(session)
  await showWallet(session.userToken)
}

/** Challenge to restore access when the PIN is forgotten. */
async function recoverPin() {
  const userId = readUserId()
  if (!userId) return

  log(`Starting PIN recovery for ${userId}...`)
  const session = await postJson('/api/pin/recover', { userId })
  await executeChallenge(session)
  await showWallet(session.userToken)
}

/** Auth the Web SDK, then open Circle’s UI for the pending challenge. */
function executeChallenge(session: {
  userToken: string
  encryptionKey: string
  challengeId: string
}) {
  sdk.setAuthentication({
    userToken: session.userToken,
    encryptionKey: session.encryptionKey,
  })

  return new Promise<void>((resolve, reject) => {
    sdk.execute(session.challengeId, (error, result) => {
      if (error) {
        log(`Challenge failed: ${formatError(error)}`)
        reject(error)
        return
      }
      log(`Challenge complete: ${JSON.stringify(result)}`)
      resolve()
    })
  })
}

// ── Supporting ─────────────────────────────────────────────────────
async function showWallet(userToken: string) {
  const { wallets = [] } = await postJson('/api/wallets/list', { userToken })

  const el = document.getElementById('walletStatus')!
  const list = el.querySelector('ul')!
  el.hidden = false

  if (wallets.length === 0) {
    list.replaceChildren()
    list.textContent = 'No wallets yet.'
    return
  }

  const items = []
  for (const w of wallets) {
    const { tokenBalances = [] } = await postJson('/api/wallets/balances', {
      userToken,
      walletId: w.id,
    })
    // Arc lists USDC twice (native gas + ERC-20); keep one row per symbol.
    const seen = new Set<string>()
    const parts: string[] = []
    for (const b of tokenBalances) {
      const label = b.token.symbol ?? b.token.name ?? '?'
      if (seen.has(label)) continue
      seen.add(label)
      parts.push(`${label} ${b.amount}`)
    }
    items.push(
      Object.assign(document.createElement('li'), {
        textContent: `${w.blockchain} · ${w.address} · ${parts.join(', ') || 'no balances'}`,
      }),
    )
  }
  list.replaceChildren(...items)
}

// ── Utilities ──────────────────────────────────────────────────────
async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error(
      `Non-JSON from ${path} (${res.status}): ${text.slice(0, 120)}`,
    )
  }
  if (!res.ok) throw new Error(data?.message ?? text)
  return data
}

function readUserId() {
  const userId = (
    document.getElementById('userId') as HTMLInputElement
  ).value.trim()
  if (userId.length < 5) {
    log('User ID must be at least 5 characters.')
    return null
  }
  return userId
}

let clearedPlaceholder = false

function log(message: string) {
  const logEl = document.getElementById('log')!
  if (!clearedPlaceholder) {
    logEl.textContent = ''
    clearedPlaceholder = true
  }
  logEl.textContent += message + '\n'
  console.log(message)
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as { code?: unknown; message: unknown }
    return e.code != null ? `[${e.code}] ${e.message}` : String(e.message)
  }
  return String(error)
}

// ── Initialization ─────────────────────────────────────────────────
document.getElementById('create')!.addEventListener('click', () => {
  void createWallet().catch((e) => log(formatError(e)))
})
document.getElementById('continuePin')!.addEventListener('click', () => {
  void continueWithPin().catch((e) => log(formatError(e)))
})
document.getElementById('resetPin')!.addEventListener('click', () => {
  void resetPin().catch((e) => log(formatError(e)))
})
document.getElementById('recoverPin')!.addEventListener('click', () => {
  void recoverPin().catch((e) => log(formatError(e)))
})
