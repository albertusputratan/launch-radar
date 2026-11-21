SHORT TASK (finish in under 10 tool calls; credits are tight).

The v2 model/dashboard already exist in this repo. Do ONLY:

1. Fix the broken string in `dashboard/app.js` around the detail hero (~line 418): `+ DATA.econ && "" +` is wrong operator precedence. It must read like: rank ranges across N bootstrap refits using `DATA.bootstrap_n` or similar field already on DATA (grep model/data.js). Use search_replace.

2. Regenerate the three competition screenshots with headless Chrome against `out/dashboard` AFTER re-running:
   `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json`
   Then capture (window 1440x900, allow time for paint):
   - screenshots/1-board.png — board view with KPIs + ledger visible
   - screenshots/2-detail.png — detail of a FARM watchlist row (use hash/query the app supports)
   - screenshots/3-filtered.png — filtered to Farm only
   Copy the same three into out/screenshots/. google-chrome is at /usr/bin/google-chrome.

3. Confirm local run still prints OOS/Brier/ledger 758 and exits 0.

Do not rewrite the model. Do not explore competitors. Stop when screenshots are new dark-UI images (file sizes should change from the old ~176KB cream board).
