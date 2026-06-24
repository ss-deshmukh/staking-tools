/**
 * APY CLI — computes validator APY from a snapshot era.
 *
 * Two modes:
 *   1. Report APY for the validators in an era (sorted, top N):
 *        pnpm apy --chain wah --era 10700 --top 10
 *      (defaults to the newest snapshotted era)
 *
 *   2. Simulate a hypothetical validator against an era's real params:
 *        pnpm apy --chain wah --own 30000 --nominators 100000 --commission 5
 *      (--own / --nominators in whole tokens; --commission in percent)
 *
 * The era's on-chain params (reward pot, incentive budget, curve, total points)
 * are taken from the snapshot; you vary the validator inputs.
 */
import { getChain, type ChainConfig } from "../../shared/chains/index.js";
import { readEra, listEras } from "../../shared/snapshot/store.js";
import {
  computeValidatorApy,
  eraContextForExisting,
  eraContextForHypothetical,
  type ApyResult,
} from "../../shared/apy/calculator.js";
import type { EraSnapshot } from "../../shared/snapshot/types.js";

interface Args {
  chain: string;
  era?: number;
  top: number;
  own?: number;
  nominators?: number;
  commission: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { chain: "wah", top: 10, commission: 0, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--chain": args.chain = next(); break;
      case "--era": args.era = parseInt(next(), 10); break;
      case "--top": args.top = parseInt(next(), 10); break;
      case "--own": args.own = parseFloat(next()); break;
      case "--nominators": args.nominators = parseFloat(next()); break;
      case "--commission": args.commission = parseFloat(next()); break;
      case "--json": args.json = true; break;
      case "--help": case "-h": printHelp(); process.exit(0);
      default: throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      "Compute validator APY from a snapshot era.",
      "",
      "Report mode (existing validators):",
      "  --chain <wah|pah>   Chain (default wah)",
      "  --era <n>           Era to use (default: newest snapshotted)",
      "  --top <n>           Show top N validators by stake (default 10)",
      "",
      "Simulate mode (hypothetical validator):",
      "  --own <tokens>      Your self-stake, in whole tokens",
      "  --nominators <tok>  Nominator stake backing you, in whole tokens",
      "  --commission <pct>  Commission percent (default 0)",
      "",
      "  --json              Emit JSON instead of a table",
      "  -h, --help          Show this help",
    ].join("\n"),
  );
}

function pct(fraction: number): string {
  return (fraction * 100).toFixed(2) + "%";
}

function fmtTokens(planck: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = planck / divisor;
  const frac = ((planck % divisor) * 10000n) / divisor; // 4 dp
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

function tokensToPlanck(tokens: number, decimals: number): bigint {
  // Avoid float drift: scale through a string with fixed decimals.
  const [intPart, fracPart = ""] = tokens.toString().split(".");
  const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

async function resolveEra(chain: ChainConfig, era?: number): Promise<EraSnapshot> {
  let target = era;
  if (target == null) {
    const eras = await listEras(chain);
    if (eras.length === 0) {
      throw new Error(
        `No snapshots for ${chain.name}. Run: pnpm snapshot --chain ${chain.key}`,
      );
    }
    target = eras[eras.length - 1];
  }
  const snap = await readEra(chain, target);
  if (!snap) {
    throw new Error(`No snapshot for era ${target}. Run a snapshot first.`);
  }
  return snap;
}

function printResult(
  label: string,
  r: ApyResult,
  decimals: number,
  symbol: string,
): void {
  const t = (p: bigint) => `${fmtTokens(p, decimals)} ${symbol}`;
  console.log(`\n${label}`);
  console.log(`  Validator APY (on own stake):  ${pct(r.validatorApy)}`);
  console.log(`  Nominator APY (on nom. stake): ${pct(r.nominatorApy)}`);
  console.log(`  Combined staker APY:           ${pct(r.combinedStakerApy)}`);
  console.log(`  --- per-era validator reward ---`);
  console.log(`    staker reward (own+comm):    ${t(r.validatorStakerReward)}`);
  console.log(`      of which commission:       ${t(r.commissionPayout)}`);
  console.log(`    self-stake incentive:        ${t(r.validatorIncentive)}`);
  console.log(`    era total kept:              ${t(r.validatorEraTotal)}`);
  console.log(`    annualized:                  ${t(r.validatorAnnual)}`);
  console.log(`  eras/year: ${r.erasPerYear.toFixed(1)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chain = getChain(args.chain);
  const snap = await resolveEra(chain, args.era);
  const { tokenDecimals: dec, tokenSymbol: sym } = snap.chain;

  console.log(
    `${snap.chain.chainName} — era ${snap.era} ` +
      `(${snap.validators.length} validators, era ≈ ${(Number(snap.eraDurationMs) / 3_600_000).toFixed(1)}h)`,
  );

  // Simulate mode if --own is given.
  if (args.own != null) {
    const ctx = eraContextForHypothetical(snap);
    const r = computeValidatorApy(
      {
        ownStake: tokensToPlanck(args.own, dec),
        nominatorStake: tokensToPlanck(args.nominators ?? 0, dec),
        commissionRaw: BigInt(Math.round(args.commission * 10_000_000)), // % -> Perbill
      },
      ctx,
    );
    if (args.json) {
      console.log(JSON.stringify(serializeResult(r), null, 2));
      return;
    }
    printResult(
      `Hypothetical validator: own=${args.own} ${sym}, ` +
        `nominators=${args.nominators ?? 0} ${sym}, commission=${args.commission}%`,
      r,
      dec,
      sym,
    );
    console.log(
      "\nNote: assumes average reward points (= total/validatorCount).",
    );
    return;
  }

  // Report mode: existing validators.
  const rows = snap.validators.slice(0, args.top).map((v) => {
    const ctx = eraContextForExisting(snap, v);
    const r = computeValidatorApy(
      {
        ownStake: BigInt(v.ownStake),
        nominatorStake: BigInt(v.totalStake) - BigInt(v.ownStake),
        commissionRaw: BigInt(v.commission.raw),
        rewardPoints: BigInt(v.rewardPoints),
      },
      ctx,
    );
    return { v, r };
  });

  if (args.json) {
    console.log(
      JSON.stringify(
        rows.map(({ v, r }) => ({
          address: v.address,
          ...serializeResult(r),
        })),
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `\n${"validator".padEnd(12)} ${"own".padStart(12)} ${"total".padStart(14)} ${"comm".padStart(7)} ${"val APY".padStart(9)} ${"nom APY".padStart(9)}`,
  );
  for (const { v, r } of rows) {
    console.log(
      `${v.address.slice(0, 10).padEnd(12)} ` +
        `${fmtTokens(BigInt(v.ownStake), dec).padStart(12)} ` +
        `${fmtTokens(BigInt(v.totalStake), dec).padStart(14)} ` +
        `${pct(v.commission.fraction).padStart(7)} ` +
        `${pct(r.validatorApy).padStart(9)} ` +
        `${pct(r.nominatorApy).padStart(9)}`,
    );
  }
}

function serializeResult(r: ApyResult): Record<string, unknown> {
  return {
    validatorApy: r.validatorApy,
    nominatorApy: r.nominatorApy,
    combinedStakerApy: r.combinedStakerApy,
    erasPerYear: r.erasPerYear,
    perEra: {
      validatorStakerReward: r.validatorStakerReward.toString(),
      commissionPayout: r.commissionPayout.toString(),
      validatorIncentive: r.validatorIncentive.toString(),
      validatorEraTotal: r.validatorEraTotal.toString(),
      nominatorReward: r.nominatorReward.toString(),
    },
    annual: {
      validator: r.validatorAnnual.toString(),
      nominator: r.nominatorAnnual.toString(),
    },
  };
}

main().catch((e) => {
  console.error("APY failed:", e?.message ?? e);
  process.exit(1);
});
