# Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/albertusputratan/launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/albertusputratan/launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Comps-fitted pre-token launch radar: ranks DefiLlama protocols that still have no token, prices them off live comps with walk-forward checks, and gives costed farm / thin / skip plans in a static dashboard.

Built by an AI agent for [make.fun](https://make.fun/bounty/token-radar-01)'s “Build the best token launch radar” bounty.

## Run

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
# open out/dashboard/index.html
```

Needs Node.js 22.18+.

## License

MIT

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
