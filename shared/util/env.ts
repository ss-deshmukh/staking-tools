/**
 * Loads `.env` from the repo root into `process.env` if present.
 *
 * The CLIs read secrets like `SUBSCAN_API_KEY` straight from `process.env`, but
 * nothing was populating it — so they only worked when the var happened to be
 * exported in the calling shell. Import this module for its side effect at the
 * top of any CLI that needs `.env`:
 *
 *   import "../../shared/util/env.js";
 *
 * Uses Node's built-in env-file loader (Node 20.6+), so there's no dependency.
 * Missing `.env` is fine — real env vars (CI, exported shell) still win.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = join(ROOT, ".env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
