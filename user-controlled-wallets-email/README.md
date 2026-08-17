# Create a user-controlled wallet with email OTP

Use [`@circle-fin/user-controlled-wallets`](https://www.npmjs.com/package/@circle-fin/user-controlled-wallets)
on the server and
[`@circle-fin/w3s-pw-web-sdk`](https://www.npmjs.com/package/@circle-fin/w3s-pw-web-sdk)
in the browser to authenticate with email OTP, initialize a user-controlled
wallet, and list it.

## What a challenge is

In user-controlled wallets, privileged actions (initialize wallets, sign
transactions, and similar) do not complete on the server alone. Circle returns
a **challenge**: an authorization request the end user must complete in the
browser.

Flow for this sample:

1. **Email OTP** (login rail): server issues device/OTP tokens; the Web SDK
   verifies the code and returns a `userToken` and `encryptionKey`.
2. **Server** calls initialize with that `userToken`. On first login, Circle
   returns a `challengeId` to create the wallet.
3. **Browser** calls `sdk.setAuthentication({ userToken, encryptionKey })`,
   then `sdk.execute(challengeId, …)`. When `execute` succeeds, the wallet
   exists; this sample then lists it.

A challenge is **not** an on-chain transaction by itself. It is Circle’s way of
requiring end-user approval before a sensitive wallet operation finishes.

OTP login is **not** the challenge. Login only produces session credentials.
The challenge runs afterward on **first** initialize. If the user is already
initialized (`155106`), this sample lists wallets and does **not** run
`execute`.

## What this sample does

| Step | What happens | Challenge? |
| --- | --- | --- |
| Send OTP | `createDeviceTokenForEmailLogin` → configure SDK | No |
| Verify OTP | `sdk.verifyOtp()` → `userToken` / `encryptionKey` | No |
| Initialize (first time) | `POST /user/initialize` → `challengeId` → `execute` | Yes — create wallet |
| Initialize (again) | `155106` already initialized → list wallets | No |

This sample creates an SCA wallet on Arc Testnet.

## Prerequisites

- [Node.js 22+](https://nodejs.org/)
- A [Circle Console](https://console.circle.com/) app with:
  - API key → `CIRCLE_API_KEY`
  - App ID → `VITE_CIRCLE_APP_ID`
- A reachable inbox for the OTP (or Mailtrap / similar in Console)

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

Open the Vite URL, enter an email, **Send OTP**, then **Verify OTP**. On first
login, complete the challenge UI when it appears.

## Project layout

| File | Role |
| --- | --- |
| `server.ts` | API key; device/OTP tokens; initialize (REST); list wallets |
| `src/main.ts` | Web SDK: OTP login, `execute` challenge, list wallets |
| `index.html` | Minimal UI for the email path |
