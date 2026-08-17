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

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

const client = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
})

const app = new Hono()
app.use('/api/*', cors())

// Device + email → tokens the Web SDK needs before verifyOtp
app.post('/api/email/token', async (c) => {
  const { deviceId, email } = await c.req.json()
  const { data } = await client.createDeviceTokenForEmailLogin({
    deviceId,
    email,
  })
  return c.json(data)
})

// No high-level SDK helper for initialize — call REST directly.
// Returns challengeId on first login; 155106 if already initialized.
app.post('/api/email/initialize', async (c) => {
  const { userToken } = await c.req.json()

  const res = await fetch('https://api.circle.com/v1/w3s/user/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CIRCLE_API_KEY!}`,
      'Content-Type': 'application/json',
      'X-User-Token': userToken,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      accountType: 'SCA',
      blockchains: ['ARC-TESTNET'],
    }),
  })

  const body = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify(body), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return c.json(body.data)
})

app.post('/api/wallets/list', async (c) => {
  const { userToken } = await c.req.json()
  const { data } = await client.listWallets({ userToken })
  return c.json(data)
})

app.post('/api/wallets/balances', async (c) => {
  const { userToken, walletId } = await c.req.json()
  const { data } = await client.getWalletTokenBalance({
    userToken,
    walletId,
  })
  return c.json(data)
})

const port = Number(process.env.PORT) || 8787
console.log(`UCW Email API listening on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
