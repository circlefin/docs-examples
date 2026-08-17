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

/** userToken + encryptionKey for API calls and sdk.execute. */
async function createUserSession(userId: string) {
  const { data } = await client.createUserToken({ userId })
  if (!data?.userToken || !data.encryptionKey) {
    throw new Error('createUserToken returned no credentials')
  }
  return data
}

function isAlreadyExists(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 155101
  )
}

const app = new Hono()
app.use('/api/*', cors())

// createUser → userToken → challenge to set PIN and create wallets
app.post('/api/pin/setup', async (c) => {
  const { userId } = await c.req.json()

  try {
    await client.createUser({ userId })
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
  }

  const { userToken, encryptionKey } = await createUserSession(userId)
  const { data: pin } = await client.createUserPinWithWallets({
    userToken,
    accountType: 'SCA',
    blockchains: ['ARC-TESTNET'],
  })

  return c.json({ userToken, encryptionKey, challengeId: pin?.challengeId })
})

// Existing user: new userToken only (browser lists wallets; no challenge)
app.post('/api/pin/token', async (c) => {
  const { userId } = await c.req.json()
  const { userToken, encryptionKey } = await createUserSession(userId)
  return c.json({ userToken, encryptionKey })
})

// Challenge to change PIN (user knows the current one)
app.post('/api/pin/reset', async (c) => {
  const { userId } = await c.req.json()
  const { userToken, encryptionKey } = await createUserSession(userId)
  const { data: pin } = await client.updateUserPin({ userToken })
  return c.json({ userToken, encryptionKey, challengeId: pin?.challengeId })
})

// Challenge to recover PIN (user forgot it)
app.post('/api/pin/recover', async (c) => {
  const { userId } = await c.req.json()
  const { userToken, encryptionKey } = await createUserSession(userId)
  const { data: pin } = await client.restoreUserPin({ userToken })
  return c.json({ userToken, encryptionKey, challengeId: pin?.challengeId })
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
console.log(`UCW PIN API listening on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
