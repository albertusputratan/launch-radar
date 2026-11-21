SHORT SESSION (~10 minutes). Credits tight. Read TOP-SPEC.md items A and B only (C if leftover). Do NOT read research/competitors, /tmp/ref-*, or old sessions. Do NOT explore. Implement then stop.

## A — Tighten farm economics (lib/model.ts + dashboard/app.js if needed)
Default scenario must yield about **12–25 FARM** rows (not ~112). Prefer:
- Default deposit = **max($1k, min($10k, 0.02% of TVL))** or fixed plan size 0.02% of TVL with floor/ceiling
- Raise farm $/hour bar (e.g. toward $25/h like #1) and/or require net clearly beats T-bill
- Keep thin/marginal + skip; update KPI “worth farming” count
- Print farm/thin/skip counts on successful `node main.ts` run

## B — Screenshots (mandatory)
After `MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json`:
1. `screenshots/1-board.png` — board with Farm filter OR sort by net/hr; KPIs + ledger + OOS strip visible; show green FARM rows
2. `screenshots/2-detail.png` — detail of a FARM watchlist protocol
3. `screenshots/3-filtered.png` — filtered to Farm only
Use `/usr/bin/google-chrome --headless=new --window-size=1440,900 --virtual-time-budget=8000 --screenshot=... file:///workspace/launch-radar-grok/out/dashboard/index.html#...`
Copy into `screenshots/` and ensure main.ts copies them to out. Prefer PNG ~300–350KB if easy (quality), stay under 512KB.

## Hard stops
- Node only, no npm; vendor/makefun-board.ts unchanged
- Do not kill yourself; finish cleanly; no compaction mid-write of huge files if avoidable — prefer search_replace for model tweaks, not rewriting entire model.ts
- Do not push/submit

When done print: farm/thin/skip counts and screenshot byte sizes.
