# Launch Radar (token-radar-01)

Comps-fitted pre-token launch radar for [make.fun's "Build the best token launch radar"](https://make.fun/bounty/token-radar-01) bounty.

## What it does

Reads the sealed DefiLlama protocol snapshot, fits launch multiples from protocols that already trade (category medians + log-size curve), validates with leave-one-out and walk-forward MAPE, ranks every eligible pre-token protocol (watchlist floor + early radar), and writes a static no-network dashboard with costed farm plans netted to $/hour (farm / thin / skip).

## Run

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
# open out/dashboard/index.html (data.js is written beside dashboard/)
```

Needs Node.js 22.18+.

## License

MIT
