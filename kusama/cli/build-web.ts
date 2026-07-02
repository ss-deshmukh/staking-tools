/**
 * Builds the self-contained Kusama validator APY calculator by inlining
 * config.json into the template's `__CONFIG__` placeholder.
 *
 * Kusama runs classic NPoS (not staking-async), so — unlike the Polkadot
 * validator app — there is no on-chain snapshot: the model's inputs live in
 * kusama/config.json and are editable in the UI. This produces ONE
 * self-contained file with no runtime fetch and no CDN.
 *
 *   pnpm tsx kusama/cli/build-web.ts   # -> kusama/web/simulator.built.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const root = join(here, "..");

const tpl = readFileSync(join(web, "simulator.html"), "utf8");
// config.json is the single source of truth for the calculator's defaults.
const config = readFileSync(join(root, "config.json"), "utf8");
const configMin = JSON.stringify(JSON.parse(config));

if (!tpl.includes("__CONFIG__")) {
  throw new Error("template missing __CONFIG__ placeholder");
}

const out = tpl.replace("__CONFIG__", () => configMin);
const dest = join(web, "simulator.built.html");
writeFileSync(dest, out, "utf8");
console.log(`Built ${dest} (${out.length} bytes)`);
