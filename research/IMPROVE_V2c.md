Execute these steps NOW. No planning essays. No reading competitors. Max efficiency.

STEP 1 — search_replace in dashboard/app.js
Replace this exact broken fragment:
`+ " across " + DATA.econ && "" +
      "64 bootstrap refits</p>`
with:
`+ " across " + (DATA.econ && DATA.econ.boot ? DATA.econ.boot : 64) + " bootstrap refits</p>`

If DATA.econ.boot is missing that is fine (fallback 64).

STEP 2 — shell: regenerate board then screenshots
```bash
cd /workspace/launch-radar-grok
mkdir -p out screenshots
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
# pick a farm watchlist slug from board if needed; default yuzu-money or first farm watchlist
SLUG=$(node -e "const b=require('./out/board.json'); const r=b.rows.find(x=>x.verdict==='farm'&&x.tier==='watchlist')||b.rows.find(x=>x.verdict==='farm'); console.log(r.slug)")
CHROME=/usr/bin/google-chrome
BASE="file:///workspace/launch-radar-grok/out/dashboard/index.html"
shot() { local url="$1" out="$2"; "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=8000 --screenshot="$out" "$url"; }
shot "$BASE" screenshots/1-board.png
shot "$BASE#p=$SLUG" screenshots/2-detail.png
shot "$BASE#verdict=farm" screenshots/3-filtered.png
cp -f screenshots/1-board.png screenshots/2-detail.png screenshots/3-filtered.png out/screenshots/
ls -la screenshots/
```
If chrome flags fail, retry with `--headless --screenshot=...` without `=new`.

STEP 3 — Confirm `screenshots/1-board.png` size is NOT 176647 (old cream UI). Print `wc -c screenshots/*.png` and exit.

Do not edit lib/model.ts. Stop after screenshots succeed.
