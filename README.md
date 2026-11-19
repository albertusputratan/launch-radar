# Launch Radar

A pre-token launch radar for the sealed DefiLlama snapshot. Protocols that already trade are the comps. Protocols whose record has no token are the board.

The value is a log-log size curve (market cap on TVL) plus a category premium shrunk toward 1, then a growth factor from the seven-day TVL change and a maturity factor from how long the book has been listed. Leave-one-out and a listing-date walk-forward are scored against a flat multiple. Each row has a farm plan with dollars, hours, and a farm, thin, or skip verdict. Capital is treated as locked, not spent. Gas follows the chain.

## Run

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Needs Node.js 22.18 or newer. The page is `out/dashboard/index.html`. It reads `out/data.js` and does not use the network.

## License

MIT
