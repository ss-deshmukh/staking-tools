/**
 * Builds the self-contained simulator HTML by injecting fresh snapshot data
 * into the template's `__DATA__` placeholder.
 *
 *   pnpm tsx validator/cli/embed.ts > validator/web/data.json   # refresh data first
 *   pnpm tsx validator/cli/build-web.ts                    # -> validator/web/simulator.built.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const tpl = readFileSync(join(dir, "simulator.html"), "utf8");
const data = readFileSync(join(dir, "data.json"), "utf8");
const minified = JSON.stringify(JSON.parse(data));

if (!tpl.includes("__DATA__")) {
  throw new Error("template missing __DATA__ placeholder");
}
const out = tpl.replace("__DATA__", minified);
const dest = join(dir, "simulator.built.html");
writeFileSync(dest, out, "utf8");
console.log(`Built ${dest} (${out.length} bytes)`);
