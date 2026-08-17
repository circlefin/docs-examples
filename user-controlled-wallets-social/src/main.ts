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
import { SocialLoginProvider } from '@circle-fin/w3s-pw-web-sdk/dist/src/types'
import './style.css'

const appId = import.meta.env.VITE_CIRCLE_APP_ID
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

const DEVICE_TOKEN_KEY = 'ucw.social.deviceToken'
const DEVICE_ENC_KEY = 'ucw.social.deviceEncryptionKey'

// Second arg: runs after Google OAuth returns (or fails).
const sdk = new W3SSdk(
  {
    appSettings: { appId },
    loginConfigs: {
      deviceToken: localStorage.getItem(DEVICE_TOKEN_KEY) ?? '',
      deviceEncryptionKey: localStorage.getItem(DEVICE_ENC_KEY) ?? '',
      google: {
        clientId: googleClientId,
        redirectUri: window.location.origin,
        selectAccountPrompt: true,
      },
    },
  },
  (error, result) => {
    void handleSocialLogin(error, result)
  },
)

// ── Key integration ────────────────────────────────────────────────

/** Device token, then redirect to Google; login callback continues the flow. */
async function loginWithGoogle() {
  if (!googleClientId) {
    log('Set VITE_GOOGLE_CLIENT_ID in .env')
    return
  }

  log('Creating device token...')
  const deviceId = await sdk.getDeviceId()
  const tokens = await postJson('/api/social/device-token', { deviceId })
  persistDeviceTokens(tokens.deviceToken, tokens.deviceEncryptionKey)

  log('Redirecting to Google...')
  await sdk.performLogin(SocialLoginProvider.GOOGLE)
}

/** Login callback → initialize (challenge on first time) → wallet. */
async function handleSocialLogin(
  error: unknown,
  result: { userToken?: string; encryptionKey?: string } | undefined,
) {
  if (error) {
    log(`Login failed: ${formatError(error)}`)
    return
  }
  if (!result?.userToken || !result.encryptionKey) {
    log('Login failed: missing userToken/encryptionKey from Google callback')
    return
  }

  try {
    await afterGoogleLogin(result.userToken, result.encryptionKey)
  } catch (error) {
    log(formatError(error))
  }
}

async function afterGoogleLogin(userToken: string, encryptionKey: string) {
  log('Login OK. Initializing user...')
  const res = await fetch('/api/social/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userToken }),
  })
  const data = await res.json()

  // 155106 = already initialized — just load the wallet.
  if (data.code === 155106) {
    log('User already initialized — loading wallet...')
    await showWallet(userToken)
    return
  }

  if (!res.ok || !data.challengeId) {
    throw new Error(data.message ?? JSON.stringify(data))
  }

  log(`challengeId ${data.challengeId} — execute challenge...`)
  await executeChallenge({
    userToken,
    encryptionKey,
    challengeId: data.challengeId,
  })
  await showWallet(userToken)
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

/** Persist device tokens so OAuth redirect can resume the SDK session. */
function persistDeviceTokens(deviceToken: string, deviceEncryptionKey: string) {
  localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken)
  localStorage.setItem(DEVICE_ENC_KEY, deviceEncryptionKey)
  sdk.updateConfigs({
    appSettings: { appId },
    loginConfigs: {
      deviceToken,
      deviceEncryptionKey,
      google: {
        clientId: googleClientId,
        redirectUri: window.location.origin,
        selectAccountPrompt: true,
      },
    },
  })
}

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
document.getElementById('loginGoogle')!.addEventListener('click', () => {
  void loginWithGoogle().catch((error) => log(formatError(error)))
})
