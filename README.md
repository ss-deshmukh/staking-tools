# staking-utils

Tooling for Polkadot **staking-async** (DAP mode) on Asset Hub.

```
shared/        reusable core — chain config, snapshot reader/store, APY calculator
validator/     validator APY calculator (web UI + CLIs + tests)
snapshots/     on-chain era data, one JSON file per era (shared)
```

## Layout

| Path | What |
| --- | --- |
| `shared/chains/` | Chain config (`pah`, `wah`), PAPI descriptors, endpoints |
| `shared/snapshot/` | RPC reader, per-era JSON store, schema types |
| `shared/apy/` | Pure BigInt APY calculator (mirrors the pallet math) |
| `validator/` | The validator app — see `validator/README.md` |
| `snapshots/<chain>/<era>.json` | One file per era + `index.json` |

New tools go beside `validator/` and import from `shared/`.

## Setup

```bash
pnpm install
```

## Commands

```bash
pnpm snapshot --chain pah        # snapshot last 28 ended eras to JSON
pnpm apy --chain pah --top 10    # validator APY from a snapshot (CLI)
pnpm build-web                   # rebuild the validator web app
pnpm test                        # golden tests vs on-chain values
pnpm typecheck
```

Endpoints override via env: `RPC_PAH`, `RPC_WAH`.

## Snapshot format

One self-describing JSON per era under `snapshots/<chain>/`. Balances are u128
planck as decimal strings (parse with `BigInt`); `Perbill` carries `raw`
(0..=1e9) and `fraction`. Schema: `shared/snapshot/types.ts`.

Only **DAP (non-minting)** mode is modeled. Era duration = `SessionsPerEra × 4h`
(relay session) = 24h → 365 eras/year. `MaxEraDuration` is a cap, not the length.

## APY model (DAP mode)

Two reward streams, commission = 0:

```
staker share = stakerPot × (points/totalPoints) × own/(own+nominator)
incentive    = incentivePot × w(own) / Σ w(all validators)
APY          = (staker share + incentive) × 365 / own
```

`w` is the piecewise-√ self-stake curve (verified against on-chain
`ErasValidatorIncentiveWeight`). Pots come from era issuance × budget split.
Math: `shared/apy/calculator.ts`.
