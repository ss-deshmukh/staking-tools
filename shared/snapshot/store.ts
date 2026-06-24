import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChainConfig } from "../chains/index.js";
import type { EraSnapshot, SnapshotIndex, ChainMeta } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo-root `snapshots/` dir; per-chain subdir holds one file per era. */
const SNAPSHOTS_ROOT = join(__dirname, "..", "..", "snapshots");

export function chainDir(chain: ChainConfig): string {
  return join(SNAPSHOTS_ROOT, chain.key);
}

function eraPath(chain: ChainConfig, era: number): string {
  return join(chainDir(chain), `${era}.json`);
}

function indexPath(chain: ChainConfig): string {
  return join(chainDir(chain), "index.json");
}

/** Pretty-print JSON so files are human-readable and diff cleanly. */
function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export async function writeEra(
  chain: ChainConfig,
  snapshot: EraSnapshot,
): Promise<string> {
  await mkdir(chainDir(chain), { recursive: true });
  const path = eraPath(chain, snapshot.era);
  await writeFile(path, serialize(snapshot), "utf8");
  return path;
}

export async function readEra(
  chain: ChainConfig,
  era: number,
): Promise<EraSnapshot | null> {
  const path = eraPath(chain, era);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as EraSnapshot;
}

export async function hasEra(chain: ChainConfig, era: number): Promise<boolean> {
  return existsSync(eraPath(chain, era));
}

/** List era indices that already have a shard, sorted ascending. */
export async function listEras(chain: ChainConfig): Promise<number[]> {
  const dir = chainDir(chain);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => parseInt(f.replace(".json", ""), 10))
    .sort((a, b) => a - b);
}

export async function readIndex(
  chain: ChainConfig,
): Promise<SnapshotIndex | null> {
  const path = indexPath(chain);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as SnapshotIndex;
}

export async function writeIndex(
  chain: ChainConfig,
  meta: ChainMeta,
  state: {
    currentEra: number | null;
    activeEra: number | null;
    historyDepth: number;
    updatedAtMs: string;
  },
): Promise<string> {
  await mkdir(chainDir(chain), { recursive: true });
  const eras = await listEras(chain);
  const index: SnapshotIndex = {
    chain: meta,
    currentEra: state.currentEra,
    activeEra: state.activeEra,
    historyDepth: state.historyDepth,
    eras,
    updatedAtMs: state.updatedAtMs,
  };
  const path = indexPath(chain);
  await writeFile(path, serialize(index), "utf8");
  return path;
}
