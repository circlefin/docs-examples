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

import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
const recoveryFilePath = path.join(__dirname, "output", "recovery-file.dat");

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CIRCLE_API_KEY is required. Add it to .env or set it as an environment variable.",
    );
  }

  const existingEnv = await readFile(envPath, "utf8").catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return "";
      throw err;
    },
  );

  if (existingEnv.match(/^CIRCLE_ENTITY_SECRET=.*$/m)) {
    throw new Error(
      `CIRCLE_ENTITY_SECRET already exists in ${envPath}. Refusing to overwrite it.`,
    );
  }

  console.log("Registering Entity Secret...");
  await mkdir(path.dirname(recoveryFilePath), { recursive: true });

  const entitySecret = crypto.randomBytes(32).toString("hex");

  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryFilePath,
  });

  const nextEnv = existingEnv.trimEnd()
    ? `${existingEnv.trimEnd()}\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`
    : `CIRCLE_ENTITY_SECRET=${entitySecret}\n`;

  await writeFile(envPath, nextEnv, "utf8");

  console.log("Entity Secret registered.");
  console.log(`Recovery file saved to ${recoveryFilePath}`);
  console.log(`Updated ${envPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
