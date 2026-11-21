# TOP-SPEC — beat ~96.7% (#1) from 94.72% (#187)

**Context (dev heat, provisional):** Scores are Bradley-Terry expected win rates vs **four fixed house dashboards** (not peer matches). Shown, never weighed; **final heat after Dec 14 re-judges everyone**. Interval shrinks with more games (12→20→28 if scrutiny). `Force_Last`; dossier Size is tiebreak (smaller wins).

**Judge order (RULES, most important first):** (1) working radar watchlist+implied+screenshots=code (2) value model from snapshot TVL/7d/no-token age, not hardcoded names (3) concrete costed farm steps (4) sortable/filterable dashboard+detail (5) looks made.

## Shared traits of #1–#10
- `implied = value_if_launches × token_odds`; terms kept only if LOO+WF (or dual) improve; Brier on board
- KPI strip + **758 ledger** + integrity + OOS evidence tables on **first screenshot**
- **Discriminating farms:** ~12–20 FARM / ~150+ MARGINAL (not 100+ FARM)
- Sliders: plan size (often **% of TVL**), drop share, horizon; board default or filtered shot shows honest nets
- Dark dense analyst UI; title sells the model

## Our gaps (01a1fbf7 @ 94.72%, #187)
1. **Farm bar too loose:** 112/197 FARM vs #1’s 14/198 — looks undiscriminating (hits criteria 3+5)
2. **Cover shot:** sorted by implied rank with mostly MARGINAL; not Farm/#$/hr; screenshots ~210–260KB (RULES prefer ~300–350KB)
3. Missing visible **drop-share** + **%TVL plan size** knobs like #1; “twice held-out” less crisp than #1 title/KPIs
4. Dossier ~1.0MB (fine; #2/#3 are leaner — optional later)

## Ranked changes (impact → effort)

| # | Change | Expected judge impact | Grok min |
|---|--------|----------------------|----------|
| **A** | **Tighten farm economics** so default scenario yields ~12–25 FARM (raise `$/h` bar and/or use 0.02% TVL deposits; keep T-bill + fee netting). Update KPIs + board.json verdicts. | **High** — biggest visual/semantic gap vs tops on criterion 3 | 4–6 |
| **B** | **Retake 3 screenshots:** (1) board with Farm filter or sort by net/hr, KPIs+ledger+OOS visible; (2) FARM watchlist detail; (3) filtered Farm. Aim ~300–350KB, 1440×900. | **High** — judge mainly sees dossier images | 3–4 |
| **C** | Add **drop-share slider** + plan-size mode **% of TVL** (default 0.02%) in UI; ensure cover uses that default. | Medium — matches #1 interaction story | 3–4 |
| D | Sharper “held-out twice” KPI copy + submission title like #1 | Low–med | 1–2 |
| E | Compress dossier / trim CSS | Tiebreak only | 2 |

## Tomorrow / this session plan
- **Do A+B in one short session** (add C only if time). Do **not** read old killed session 6842; new session only; never kill mid-write across compaction.
- Local: `MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json` → expect farm count ~12–25, watchlist 40/40, ledger 758.
- `makefun check` then submit **only if** checks pass and farm/UI clearly tighter than 94.72% entry.
- Leave ≥1 submit slot today if unsure; max **5/UTC day, 10 total** (account may show a lower day cap).

## Do not
- Long exploratory Grok runs; kill mid-session; rewrite whole model from scratch; copy top repos wholesale.
