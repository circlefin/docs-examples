# Create a PIN-secured user-controlled wallet

Use [`@circle-fin/user-controlled-wallets`](https://www.npmjs.com/package/@circle-fin/user-controlled-wallets)
on the server and
[`@circle-fin/w3s-pw-web-sdk`](https://www.npmjs.com/package/@circle-fin/w3s-pw-web-sdk)
in the browser to create a PIN-secured user-controlled wallet, then list it and
manage the PIN.

## What a challenge is

In user-controlled wallets, privileged actions (create PIN and wallets, reset
PIN, recover PIN, sign transactions, and similar) do not complete on the server
alone. Circle returns a **challenge**: an authorization request the end user
must complete in the browser.

Flow:

1. **Server** calls the User Controlled Wallets API with your API key and a
   `userToken`. Circle creates the pending action and returns a `challengeId`
   (plus `userToken` / `encryptionKey` when you create a session).
2. **Browser** calls `sdk.setAuthentication({ userToken, encryptionKey })`,
   then `sdk.execute(challengeId, …)`. The Web SDK opens Circle’s UI so the
   user can set or enter their PIN (or complete recovery).
3. When `execute` succeeds, the action is done. This sample then lists wallets
   with that `userToken`.

A challenge is **not** an on-chain transaction by itself. It is Circle’s way of
requiring end-user approval before a sensitive wallet operation finishes.

**Create wallet**, **Reset PIN**, and **Recover PIN** each return a
`challengeId` and run `execute`. **Continue** does not: it only asks the
server for a fresh `userToken` (`createUserToken`) and lists wallets—no PIN UI.

## What this sample does

| UI action | Server | Challenge? |
| --- | --- | --- |
| Create wallet | `createUser` → `createUserToken` → `createUserPinWithWallets` | Yes — set PIN and create wallets |
| Continue | `createUserToken` | No — fresh `userToken`, then list wallets |
| Reset PIN | `createUserToken` → `updateUserPin` | Yes — change a PIN you know |
| Recover PIN | `createUserToken` → `restoreUserPin` | Yes — recover a forgotten PIN |

Your app owns the **User ID**. Circle owns the PIN ceremony and wallet crypto.
This sample creates an SCA wallet on Arc Testnet.

## Prerequisites

- [Node.js 22+](https://nodejs.org/)
- A [Circle Console](https://console.circle.com/) app with:
  - API key → `CIRCLE_API_KEY`
  - App ID → `VITE_CIRCLE_APP_ID`

## Setup

```bash
cp .env.example .env
# fill CIRCLE_API_KEY and VITE_CIRCLE_APP_ID
npm install
```

## Run

Two processes:

```bash
npm run server
```

```bash
npm run dev
```

Open the Vite URL, enter a User ID (min 5 characters), and click **Create
wallet**. Complete the PIN UI when the challenge runs, then use **Continue**,
**Reset PIN**, or **Recover PIN** as needed.

## Project layout

| File | Role |
| --- | --- |
| `server.ts` | API key + User Controlled Wallets client; issues sessions and challenges |
| `src/main.ts` | Web SDK: `execute` challenges, then list wallets |
| `index.html` | Minimal UI for the PIN path |
