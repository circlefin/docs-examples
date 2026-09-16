# Embed Arc Onramp in a browser app

Use [`@circle-fin/app-kit`](https://www.npmjs.com/package/@circle-fin/app-kit)
to mint an onramp session on your server, then embed Circle's hosted Arc
Onramp widget with `kit.onramp.fetchSession()`, `mountIframe()`, and
`openWindow()`.

Unlike the other App Kit samples, onramp is a **widget embed**: the long-lived
`apiKey` stays on the server (`@circle-fin/app-kit/server`), and the browser
only receives a short-lived session. Any Fetch-compatible host can expose the
session route (for example Next.js, Hono, or Workers); this sample uses a
small Node `http` server only to keep the demo self-contained.

## Prerequisites

- [Node.js 22 or later](https://nodejs.org/)
- A Circle API key that can mint onramp sessions
- A destination wallet address that should receive purchased funds

## Configure

```bash
cp .env.example .env
```

Set `CIRCLE_API_KEY` in `.env`. Keep `ONRAMP_REFERRER_DOMAIN=localhost` when
you open the Vite app on `http://localhost:5173` (hostname only — no scheme
or port). The example defaults to sandbox hosts (`api-test.circle.com` /
`onramp-sandbox.arc.io`); comment those out for production defaults.

## Install and run

```bash
npm install
```

Start the session server (terminal 1):

```bash
npm run server
```

Start the Vite client (terminal 2):

```bash
npm run dev
```

Open the local Vite URL. Vite proxies `/api/*` to the session server on
port `3001`.

```bash
npm run build
```

## What this example does

1. `server.ts` creates `createAppServerKit` with your `apiKey` and exposes
   `POST /api/onramp/sessions` via `createSessionRouteHandler`.
2. The client calls `kit.onramp.fetchSession()` against that route.
3. **Mount iframe** embeds the hosted widget with `kit.onramp.mountIframe()`.
4. **Open popup** launches `kit.onramp.openWindow()` synchronously from the
   click handler (session must already be prepared so the user gesture is
   preserved).
5. Widget lifecycle events are printed in the output panel.

## Key files

- `server.ts` — session minting route (`apiKey` never reaches the browser).
- `src/main.ts` — prepare session, mount iframe, open popup.
- `vite.config.ts` — proxies `/api` to the local session server.

## Production notes

- Pass an `authorize` hook to `createSessionRouteHandler` so anonymous
  callers cannot mint sessions with attacker-chosen destination addresses.
- Set `referrerDomain` to the real hostname that embeds the iframe.
- Allow `frame-src https://onramp.arc.io` (or your staging widget host) in
  the embedding page CSP.
