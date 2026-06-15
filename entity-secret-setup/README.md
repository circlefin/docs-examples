# Entity secret setup

This example generates a new entity secret, registers it with Circle, saves the
recovery file locally, and writes `CIRCLE_ENTITY_SECRET` to `.env`.

Use this script only for first-time setup. If `.env` already contains
`CIRCLE_ENTITY_SECRET`, the script exits without making changes.

## What this script does

When you run the script, it:

1. Reads `CIRCLE_API_KEY` from `.env` or your shell environment.
2. Generates a new 32-byte entity secret.
3. Registers the entity secret with Circle.
4. Saves the recovery file to `./output/recovery-file.dat`.
5. Writes `CIRCLE_ENTITY_SECRET` to `./.env`.

## Prerequisites

Before you run the script:

- Create an API key in [Circle Console](https://console.circle.com/).
- Install [Node.js 22 or later](https://nodejs.org/).
- Create a `.env` file with `CIRCLE_API_KEY=` or export it in your shell.
- Do not add `CIRCLE_ENTITY_SECRET` manually. The script writes it to `.env`.
- Make sure `.env` does not already contain `CIRCLE_ENTITY_SECRET`.

## Install dependencies

```bash
npm install
```

## Run the script

```bash
npx tsx index.ts
```

## Important security notes

- Store the entity secret securely. Do not commit it to version control.
- Store the recovery file separately from the entity secret.
- If you lose both the entity secret and the recovery file, you permanently lose
  access to your developer-controlled wallets.
- This script is for first-time registration only. Do not use it for rotation
  or recovery flows.

For the full entity secret lifecycle, see:

- [Entity secret and wallet set](../../circle-docs/wallets/dev-controlled/entity-secret-and-wallet-set.mdx)
- [How the Entity Secret Works](../../circle-docs/wallets/dev-controlled/entity-secret-management.mdx)
- [How-to: Generate and Register Your Entity Secret](../../circle-docs/wallets/dev-controlled/register-entity-secret.mdx)
