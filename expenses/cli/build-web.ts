/**
 * Builds the self-contained protocol-expenses simulator HTML by inlining
 * style.css, lib.js, and config.json into the template's placeholders.
 *
 * Unlike the retreat original (which fetched config.yaml + loaded CDN scripts),
 * this produces ONE self-contained file with no runtime fetch and no CDN —
 * matching this repo's static-site model.
 *
 *   pnpm tsx expenses/cli/build-web.ts   # -> expenses/web/expenses.built.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const root = join(here, "..");

const tpl = readFileSync(join(web, "expenses.html"), "utf8");
const style = readFileSync(join(web, "style.css"), "utf8");
const lib = readFileSync(join(web, "lib.js"), "utf8");
// config.json is the single source of truth for the simulator's data.
const config = readFileSync(join(root, "config.json"), "utf8");
const configMin = JSON.stringify(JSON.parse(config));

for (const marker of ["/* __STYLE__ */", "// __LIB__", "__CONFIG__"]) {
  if (!tpl.includes(marker)) throw new Error(`template missing ${marker} placeholder`);
}

const out = tpl
  .replace("/* __STYLE__ */", () => style)
  .replace("// __LIB__", () => lib)
  .replace("__CONFIG__", () => configMin);

const dest = join(web, "expenses.built.html");
writeFileSync(dest, out, "utf8");
console.log(`Built ${dest} (${out.length} bytes)`);
