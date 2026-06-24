/**
 * Snapshot CLI.
 *
 * Reads staking-async (DAP mode) on-chain state and writes one JSON file per
 * era under `snapshots/<chain>/<era>.json`, plus an `index.json`.
 *
 * Usage:
 *   pnpm snapshot --chain wah                 # last 28 ended eras (default)
 *   pnpm snapshot --chain pah --eras 56       # last 56 ended eras
 *   pnpm snapshot --chain wah --era 1234      # a single era
 *   pnpm snapshot --chain wah --from 1200 --to 1210
 *   pnpm snapshot --chain wah --nominators    # include per-nominator exposure
 *   pnpm snapshot --chain wah --force         # re-snapshot eras already on disk
 *
 * Env overrides: RPC_WAH / RPC_PAH to point at a custom node.
 */
import { getChain } from "../../shared/chains/index.js";
import {
  connect,
  readChainState,
  readEraSnapshot,
} from "../../shared/snapshot/reader.js";
import { writeEra, writeIndex, hasEra } from "../../shared/snapshot/store.js";

interface Args {
  chain: string;
  eras: number;
  era?: number;
  from?: number;
  to?: number;
  nominators: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    chain: "wah",
    eras: 28,
    nominators: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--chain":
        args.chain = next();
        break;
      case "--eras":
        args.eras = parseInt(next(), 10);
        break;
      case "--era":
        args.era = parseInt(next(), 10);
        break;
      case "--from":
        args.from = parseInt(next(), 10);
        break;
      case "--to":
        args.to = parseInt(next(), 10);
        break;
      case "--nominators":
        args.nominators = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      "Snapshot staking-async (DAP mode) era data to JSON.",
      "",
      "Options:",
      "  --chain <wah|pah>   Chain to snapshot (default: wah)",
      "  --eras <n>          Snapshot last N ended eras (default: 28)",
      "  --era <n>           Snapshot a single era",
      "  --from <n> --to <n> Snapshot an inclusive era range",
      "  --nominators        Include per-nominator exposure (heavier)",
      "  --force             Overwrite eras already present on disk",
      "  -h, --help          Show this help",
    ].join("\n"),
  );
}

/** Resolve which eras to snapshot from args + on-chain head. */
function resolveEraRange(
  args: Args,
  activeEra: number,
  historyDepth: number,
): number[] {
  // Only ended eras have a finalized reward pot. The active era is in progress.
  const newestEnded = activeEra - 1;
  // On-chain data is pruned beyond HistoryDepth.
  const oldestAvailable = Math.max(0, activeEra - historyDepth);

  let lo: number;
  let hi: number;
  if (args.era != null) {
    lo = hi = args.era;
  } else if (args.from != null || args.to != null) {
    lo = args.from ?? oldestAvailable;
    hi = args.to ?? newestEnded;
  } else {
    hi = newestEnded;
    lo = Math.max(oldestAvailable, hi - args.eras + 1);
  }

  const eras: number[] = [];
  for (let e = lo; e <= hi; e++) {
    if (e < 0) continue;
    eras.push(e);
  }
  return eras;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chain = getChain(args.chain);

  console.log(`Connecting to ${chain.name} ...`);
  const { api, meta, destroy } = await connect(chain);

  try {
    const state = await readChainState(api);
    console.log(
      `  active era: ${state.activeEra}, current era: ${state.currentEra}, history depth: ${state.historyDepth}`,
    );
    console.log(
      `  era duration (est): ${(Number(state.eraDurationMs) / 3_600_000).toFixed(2)}h, sessions/era: ${state.sessionsPerEra}`,
    );

    if (state.activeEra == null) {
      throw new Error("No active era on chain; cannot determine era range.");
    }

    const eras = resolveEraRange(args, state.activeEra, state.historyDepth);
    if (eras.length === 0) {
      console.log("No eras to snapshot.");
      return;
    }
    console.log(
      `Snapshotting ${eras.length} era(s): ${eras[0]}..${eras[eras.length - 1]}`,
    );

    const capturedAtMs = String(await currentTimeMs(api));

    let written = 0;
    let skipped = 0;
    for (const era of eras) {
      if (!args.force && (await hasEra(chain, era))) {
        skipped++;
        continue;
      }
      process.stdout.write(`  era ${era} ... `);
      const snapshot = await readEraSnapshot(api, meta, state, era, capturedAtMs, {
        includeNominators: args.nominators,
      });
      const path = await writeEra(chain, snapshot);
      written++;
      console.log(
        `${snapshot.validators.length} validators -> ${path.split("/").slice(-2).join("/")}`,
      );
    }

    await writeIndex(chain, meta, {
      currentEra: state.currentEra,
      activeEra: state.activeEra,
      historyDepth: state.historyDepth,
      updatedAtMs: capturedAtMs,
    });

    console.log(
      `Done. Wrote ${written}, skipped ${skipped} (already present; use --force to overwrite).`,
    );
  } finally {
    destroy();
  }
}

/** On-chain wall-clock via the Timestamp pallet (ms). */
async function currentTimeMs(api: any): Promise<bigint> {
  try {
    const now = await api.query.Timestamp.Now.getValue();
    if (typeof now === "bigint" && now > 0n) return now;
  } catch {
    /* fall through */
  }
  // Last resort: 0 (consumers rely on activeEraStart for timing anyway).
  return 0n;
}

main().catch((e) => {
  console.error("\nSnapshot failed:", e?.message ?? e);
  process.exit(1);
});
