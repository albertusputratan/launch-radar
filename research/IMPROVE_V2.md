# Launch Radar v2 — beat the token-radar-01 leaderboard (aim #1)

You are improving the EXISTING entry in `/workspace/launch-radar-grok` (do not wipe and rewrite from scratch). Edit `lib/model.ts`, `main.ts`, `dashboard/*`, regenerate screenshots. Write code yourself — do not `cp` finished sources from other repos. You MAY read `/tmp/ref-sudhan`, `/tmp/ref-iqbal`, `/tmp/ref-4bill`, and `/workspace/makefun-radar` for ideas only.

## Current vs top (why we lose pairwise AI-judge comparisons)
Our live rank ~#9505, judge win rate ~80.4%. Top entries are ~96%+.
Study PNGs in `research/competitors/` (top1/top2/top3 vs ours). Tops win because:

1. **Model:** `implied = value_if_launches × token_odds`. Token odds fitted from peers' token record (age/family/TVL/growth), held-out Brier shown. Value terms tested held-out; only kept terms used; board shows "kept / not kept".
2. **Evidence on the board:** KPI strip with OOS miss as ×factor vs flat, range honesty %, token-odds Brier, terms survived, worth-farming count, watchlist 40/40. Full **758 ledger** accounting bar + integrity/checksum strip.
3. **Rank honesty:** bootstrap / refit **rank ranges** on every row.
4. **Farm economics:** deposit-sized plans, drop-share %, horizon weeks; net of fees vs T-bill and $/hour; FARM / MARGINAL|THIN / SKIP; live **sliders** recompute verdicts in the browser. Detail page: how the figure is made, nearest priced peers, sensitivity matrix, 8–10 costed steps.
5. **UI:** dark dense analyst dashboard (navy/slate, teal/gold/green/orange), not cream/serif brochure. Columns: rank+range, protocol+tier, TVL+7d, no-token age, token odds bar, if-launches, implied+range spark, verdict net, $/hr.
6. **Screenshots:** board sorted by $/hr or farm filter; detail of a FARM watchlist row; filtered farm view. Sharp, full UI chrome visible.

## Hard requirements (keep passing the gate)
- Node 22+, no npm deps in the program; `vendor/makefun-board.ts` unchanged from kit
- `board.json` ≥100 rows, full watchlist, ranks 1..N descending implied, 3–12 farm steps (20–600 chars) each
- Static dashboard: no network; board + detail + filter; same model must power board.json and page
- 3 screenshots under `screenshots/`: `1-board.png`, `2-detail.png`, `3-filtered.png`
- MIT LICENSE; README keeps the three make.fun badges + bounty link
- Local: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json` must succeed and print a clear summary (rows, watchlist, LOO/WF or OOS miss vs flat, farm/thin/skip counts, ledger 758)

## Implementation plan (do in order)
A. Extend `lib/model.ts`:
   - Dual pricing: size/category/growth curve for **value if launches**; logistic/peer rate for **token odds**; product = implied.
   - Held-out term selection (keep only terms that improve OOS); expose terms + kept flags in board meta.
   - LOO + walk-forward (or time-split) miss × vs flat; range calibration %; Brier for odds.
   - Bootstrap (~50–100 refits) rank lo/hi per row.
   - `ledgerOf(snapshot)` covering all 758 protocols with labeled buckets.
   - Farm planner: capital (absolute or % TVL), drop share, horizon weeks → capture, fees, net, $/hr, verdict; 6–10 specific steps with gas/time; sensitivity grid on detail.
B. Rebuild `dashboard/` as dark dense analyst UI matching the competitor bar: KPI strip, ledger bar, integrity strip, OOS evidence tables, filters, **sliders** (plan size / drop share / horizon) that recompute farm client-side from embedded model params, rich table + detail (peers, formula, plan, sensitivity).
C. Update `main.ts` outputs (board.json, dossier if needed) and console summary.
D. Screenshots via headless Chrome (`google-chrome --headless --disable-gpu --screenshot=... --window-size=1440,900` on `file://.../out/dashboard/index.html` or the mirrored screenshots paths). Capture: (1) board default or sorted by net/hr with KPIs+ledger visible, (2) detail of a FARM watchlist protocol, (3) filtered to Farm only. Copy into `screenshots/`.
E. Bump MODEL_VERSION; keep AGENTS.md accurate. Do not push/submit — the parent will.

## Done when
- Local run passes; watchlist 40/40; ledger accounts for 758; OOS/LOO clearly beats flat on the board; farm/thin/skip all present; screenshots refreshed and look competition-grade dark UI; `node --check` / run has no throw.

Credits are tight: edit surgically, avoid endless refactors, finish in one session.
