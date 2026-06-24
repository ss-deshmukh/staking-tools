# Validator APY calculator

Web app: set your self-stake → see your validator APY under **Referendum 1909**
parameters, against Polkadot Asset Hub's real era issuance.

```
validator/
  web/    simulator.html (template, __DATA__ placeholder) + built output
  cli/    snapshot · apy · embed · build-web
  test/   golden tests vs on-chain values
```

## Build & run

```bash
pnpm build-web                       # embed latest snapshot data + build the page
open validator/web/simulator.built.html
```

`simulator.built.html` is self-contained (data baked in, no network) and
gitignored. Published as a claude.ai artifact.

## CLIs

| Command | Does |
| --- | --- |
| `pnpm snapshot --chain pah` | Pull era data from RPC → `snapshots/pah/*.json` |
| `pnpm apy --chain pah --top 10` | Validator APY table for an era |
| `pnpm apy --chain pah --own 30000` | Simulate a hypothetical validator |
| `pnpm build-web` | Refresh embedded data + rebuild the page |
| `pnpm test` | Golden tests |

## Model

Ref 1909: budget 45.2% staker / 22.6% incentive / 32.2% buffer; curve target
30k, cap 100k, slope 0.5. Two streams (commission = 0): your share of the staker
pool + the self-stake incentive. The incentive denominator is the exact sum of
`w(self-stake)` over every validator in the era. See `../shared/apy/calculator.ts`.
