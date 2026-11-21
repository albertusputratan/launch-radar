/* Launch Radar page. dual-odds-2-re2. No network. */
   impliedOf = valueIfLaunches × tokenOdds. planOf recomputes the farm when the sliders move. */
(function () {
  "use strict";
  var DATA = window.RADAR;
  var app = document.getElementById("app");
  var ui = { q: "", tier: "all", verdict: "all", cat: "all", sort: "rank", dir: "asc", dep: "10000", share: 10, weeks: 12, p: "" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(n)) return "n/a";
    var sign = n < 0 ? "-" : "";
    var a = Math.abs(n);
    if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
    if (a >= 1e4) return sign + "$" + String(Math.round(a)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (a >= 100) return sign + "$" + a.toFixed(0);
    return sign + "$" + a.toFixed(2);
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return "n/a";
    return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
  }
  function ageText(days) {
    if (days == null) return "undated";
    if (days >= 365) return (days / 365).toFixed(1) + " yr";
    return Math.round(days) + " d";
  }
  function log10(x) { return Math.log(x) / Math.LN10; }
  function c2(n) { return Math.round(n * 100) / 100; }
  function label(v) { return v === "farm" ? "FARM" : v === "thin" ? "MARGINAL" : "SKIP"; }

  /** Dollars the token would be worth if the record stayed as it is. Kept factors only. */
  function valueIfLaunches(row) {
    var v = row.curve * DATA.fit.scale;
    for (var i = 0; i < row.factors.length; i++) if (row.factors[i].used) v *= row.factors[i].mult;
    return Math.max(1, Math.round(v));
  }
  /** Logistic probability a peer with this age, family, size, growth and chain count records a token. */
  function tokenOdds(row) {
    var w = DATA.odds.weights;
    var z = 0;
    for (var i = 0; i < w.length; i++) z += w[i] * row.ox[i];
    if (z > 20) z = 20;
    if (z < -20) z = -20;
    return 1 / (1 + Math.exp(-z));
  }
  function impliedOf(row) {
    return Math.max(1, Math.min(1e14, Math.round(valueIfLaunches(row) * tokenOdds(row))));
  }
  function depositOf(row) {
    if (ui.dep === "pct2") return Math.max(500, Math.round(row.tvl_usd * 0.0002));
    if (ui.dep === "pct10") return Math.max(500, Math.round(row.tvl_usd * 0.001));
    return +ui.dep;
  }
  /** Capture, fees, T-bill and the verdict for one deposit. Same arithmetic as planNumbers in lib/model.ts. */
  function planOf(row, deposit) {
    var how = DATA.econ.plays[row.play] || DATA.econ.plays.use;
    var quote = DATA.econ.gas[row.farm_chain] || DATA.econ.gas_default;
    var share = ui.share / 100;
    var weeks = ui.weeks;
    var dep = deposit == null ? depositOf(row) : deposit;
    var fees = c2(quote[1] + quote[0] * (how.txIn + weeks * how.txWeek + how.txOut));
    var capture = c2(row.implied_value_usd * share * dep / (row.tvl_usd + dep));
    var minutes = how.minIn + weeks * how.minWeek + how.minOut;
    var hours = c2(minutes / 60);
    var net = c2(capture - fees);
    var tbill = c2(dep * DATA.econ.tbill * (weeks * 7) / 365);
    var dph = hours > 0 ? c2(net / hours) : 0;
    var verdict = "skip";
    if (row.change_7d != null && row.change_7d <= DATA.econ.crash) verdict = "skip";
    else if (!(net > 0)) verdict = "skip";
    else if (net > tbill && dph >= DATA.econ.farm_dph) verdict = "farm";
    else verdict = "thin";
    return { deposit: dep, share: share, weeks: weeks, capture: capture, fees: fees, hours: hours, net: net, tbill: tbill, dph: dph, verdict: verdict, gas: quote[0], fund: quote[1], how: how };
  }
  function checksum(rows) {
    var h = 2166136261;
    var s = rows.map(function (r) { return r.slug + "|" + r.rank + "|" + r.implied_value_usd; }).join("\n");
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  function audit() {
    var match = 0;
    for (var i = 0; i < DATA.rows.length; i++) {
      var row = DATA.rows[i];
      var saved = { share: ui.share, weeks: ui.weeks, dep: ui.dep };
      ui.share = Math.round(DATA.econ.share * 100);
      ui.weeks = DATA.econ.weeks;
      ui.dep = String(DATA.econ.deposit);
      var plan = planOf(row, DATA.econ.deposit);
      ui.share = saved.share; ui.weeks = saved.weeks; ui.dep = saved.dep;
      if (impliedOf(row) === row.implied_value_usd && plan.verdict === row.plan.verdict && Math.abs(plan.net - row.plan.net) < 0.02) match += 1;
    }
    var ranks = DATA.rows.map(function (r) { return r.rank; }).sort(function (a, b) { return a - b; });
    var rankOk = ranks.length === DATA.rows.length && ranks.every(function (n, i) { return n === i + 1; });
    var sum = DATA.ledger.reduce(function (s, b) { return s + b.n; }, 0);
    var watch = DATA.rows.filter(function (r) { return r.on_watchlist; }).length;
    return {
      match: match,
      rankOk: rankOk,
      sum: sum,
      watch: watch,
      checksum: checksum(DATA.rows),
      total: DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0)
    };
  }

  function talk(row, dep) {
    var nm = row.name, ch = row.farm_chain, d = money(dep), q = money(dep / 4);
    var play = row.play;
    if (play === "lend") return {
      enter: "Supply " + d + " of USDC to " + nm + " on " + ch + " and keep the receipt in this wallet.",
      qualify: "Borrow " + q + " of a stablecoin against it and keep health above 2.",
      watch: "check health and the supply rate on " + nm,
      stop: "health nears 1.5 or utilisation sits at 100%"
    };
    if (play === "lp") return {
      enter: "Add " + d + " to " + nm + "'s deepest pool on " + ch + " and keep the LP receipt.",
      qualify: "Stake that receipt in " + nm + "'s own gauge if it has one.",
      watch: "swap about " + money(dep / 10) + " through " + nm + "'s router and record the fee",
      stop: "impermanent loss passes 2%"
    };
    if (play === "perp") return {
      enter: "Deposit " + d + " of USDC as margin on " + nm + " on " + ch + ". Do not lever past 1x.",
      qualify: "Open and close one " + d + " round trip on a major pair.",
      watch: "do one round trip and write down fees and funding",
      stop: "fees plus funding pass 3% of margin"
    };
    if (play === "rwa") return {
      enter: "Buy " + d + " of " + nm + "'s tokenised asset on " + ch + " after reading the redemption notice.",
      qualify: "Finish " + nm + "'s allowlist with this wallet if it asks.",
      watch: "check NAV and the redemption queue",
      stop: "redemptions pause or NAV is marked down"
    };
    if (play === "stake") return {
      enter: "Stake " + d + " of the asset " + nm + " accepts on " + ch + " and note the unbonding period.",
      qualify: "Delegate to an operator " + nm + " lists and keep the receipt.",
      watch: "check the operator and the reward rate",
      stop: "the operator is slashed or the exit queue runs past a week"
    };
    if (play === "vault") return {
      enter: "Deposit " + d + " of USDC into " + nm + "'s main vault on " + ch + " and keep the shares.",
      qualify: "Connect this wallet to " + nm + "'s points page in week one, if it has one.",
      watch: "note the share price and the vault TVL",
      stop: "the share price falls while the asset underneath is flat"
    };
    return {
      enter: "Move " + d + " into " + nm + " on " + ch + " through its own app.",
      qualify: "Do one action the app scores and leave the position open.",
      watch: "repeat one real action and record the fee",
      stop: "withdrawals pause or the app stops crediting the wallet"
    };
  }
  /** Nine costed steps. Regenerated when the deposit, drop share or horizon changes. */
  function liveSteps(row, plan) {
    var how = plan.how;
    var t = talk(row, plan.deposit);
    var weeks = plan.weeks;
    var gas = plan.gas;
    var weekGas = c2(gas * how.txWeek);
    var gasBudget = c2(gas * (how.txIn + weeks * how.txWeek + how.txOut));
    var lines = [
      "Setup: Create a fresh wallet used only to farm " + row.name + ". Write the seed on paper and keep it offline. Cost: nothing. Time: 10 minutes.",
      "Verify: Find " + row.name + " by the slug " + row.slug + " on DefiLlama, open the app it names, and match the contracts. Confirm the record still shows no token. Cost: nothing. Time: 12 minutes.",
      "Fund: Withdraw " + money(plan.deposit) + " plus " + money(gasBudget) + " for gas to that wallet on " + row.farm_chain + ". The exchange withdrawal is about " + money(plan.fund) + ". Cost: " + money(plan.fund) + ". Time: 10 minutes.",
      "Enter: " + t.enter + " Cost: " + money(c2(gas * how.txIn)) + " of gas across " + how.txIn + " transactions. Time: " + how.minIn + " minutes.",
      "Qualify: " + t.qualify + " Cost: " + money(gas) + " if this takes its own transaction, else nothing. Time: 10 minutes.",
      "Cadence: Once a week for " + weeks + " weeks, " + t.watch + ". About " + how.minWeek + " minutes and " + money(weekGas) + " of gas a week. Cost: " + money(c2(weekGas * weeks)) + ". Time: " + (how.minWeek * weeks) + " minutes over " + (weeks * 7) + " days.",
      "Stop: Leave early if " + t.stop + ", if TVL prints under " + money(row.tvl_usd * 0.7) + ", or if a token is announced with nothing for current depositors. Cost: nothing. Time: 5 minutes a week.",
      "Claim: If a token is issued, claim only inside " + row.name + "'s own app. At an implied " + money(row.implied_value_usd) + " and a " + (plan.share * 100).toFixed(0) + "% drop, this deposit's slice is " + money(plan.capture) + ". Cost: about " + money(gas) + ". Time: 15 minutes.",
      "Exit: After " + (weeks * 7) + " days, unwind on " + row.farm_chain + ", revoke approvals, and return the funds. Fees " + money(plan.fees) + ". The same deposit in a 4% T-bill is " + money(plan.tbill) + ". Net " + money(plan.net) + ", about " + money(plan.dph) + " an hour. Verdict: " + label(plan.verdict) + ". Cost: " + money(c2(gas * how.txOut)) + ". Time: 12 minutes."
    ];
    return lines;
  }

  function loadHash() {
    var q = new URLSearchParams(location.hash.replace(/^#/, ""));
    ["q", "tier", "verdict", "cat", "sort", "dir", "dep", "p"].forEach(function (k) { if (q.has(k)) ui[k] = q.get(k); });
    if (q.has("share")) ui.share = +q.get("share");
    if (q.has("weeks")) ui.weeks = +q.get("weeks");
  }
  function writeHash() {
    var q = new URLSearchParams();
    if (ui.q) q.set("q", ui.q);
    if (ui.tier !== "all") q.set("tier", ui.tier);
    if (ui.verdict !== "all") q.set("verdict", ui.verdict);
    if (ui.cat !== "all") q.set("cat", ui.cat);
    if (ui.sort !== "rank") q.set("sort", ui.sort);
    if (ui.dir !== "asc") q.set("dir", ui.dir);
    if (ui.dep !== "10000") q.set("dep", ui.dep);
    if (ui.share !== 10) q.set("share", String(ui.share));
    if (ui.weeks !== 12) q.set("weeks", String(ui.weeks));
    if (ui.p) q.set("p", ui.p);
    var next = q.toString();
    if (location.hash.replace(/^#/, "") !== next) location.hash = next;
  }

  function cats() {
    var seen = {};
    DATA.rows.forEach(function (r) { seen[r.category || "Uncategorized"] = 1; });
    return Object.keys(seen).sort();
  }
  function keep(row) {
    if (ui.tier === "watchlist" && row.tier !== "watchlist") return false;
    if (ui.tier === "early" && row.tier !== "early") return false;
    if (ui.tier === "off-list" && row.tier !== "off-list") return false;
    if (ui.verdict !== "all" && planOf(row).verdict !== ui.verdict) return false;
    if (ui.cat !== "all" && (row.category || "Uncategorized") !== ui.cat) return false;
    var q = ui.q.trim().toLowerCase();
    if (!q) return true;
    var hay = (row.name + " " + row.slug + " " + (row.category || "") + " " + row.chains.join(" ")).toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function sortKey(row, key) {
    var plan = planOf(row);
    if (key === "name") return row.name.toLowerCase();
    if (key === "tvl") return row.tvl_usd;
    if (key === "age") return row.age_days == null ? -1 : row.age_days;
    if (key === "odds") return row.odds;
    if (key === "value") return row.value_if_usd;
    if (key === "implied") return row.implied_value_usd;
    if (key === "net") return plan.net;
    if (key === "dph") return plan.dph;
    return row.rank;
  }
  function visible() {
    var rows = DATA.rows.filter(keep);
    var dir = ui.dir === "desc" ? -1 : 1;
    rows.sort(function (a, b) {
      var av = sortKey(a, ui.sort), bv = sortKey(b, ui.sort);
      if (av === bv) return a.rank - b.rank;
      return av > bv ? dir : -dir;
    });
    return rows;
  }

  function kpis(check) {
    var f = DATA.fit, o = DATA.odds;
    var farmNow = DATA.rows.filter(function (r) { return planOf(r).verdict === "farm"; }).length;
    var cards = [
      ["×" + f.loo.toFixed(2) + " <em>vs ×" + f.loo_flat.toFixed(2) + "</em>", "OOS miss vs flat · leave-one-out. Walk-forward ×" + f.wf.toFixed(2) + " vs ×" + f.wf_flat.toFixed(2) + "."],
      [(f.honest50 * 100).toFixed(0) + "%", "Range honesty · held-out caps inside the printed P25–P75 (stated 50%). P10–P90 is " + (f.honest80 * 100).toFixed(0) + "%."],
      [o.cv.toFixed(3) + " <em>vs " + o.cv_base.toFixed(3) + "</em>", "Token-odds Brier · five-fold, against the base rate. Walk-forward " + o.wf.toFixed(3) + "."],
      [f.kept + " / " + f.tried + " · " + o.kept + " / " + o.tried, "Terms survived · value model, then token odds. The rest were tested and not kept."],
      [farmNow + " of " + DATA.board_size, "Worth farming · this deposit, drop share and horizon. " + DATA.verdicts.thin + " marginal and " + DATA.verdicts.skip + " skip at the published plan."],
      [check.watch + " / " + DATA.watchlist_size, "Watchlist ranked · every protocol the house list names."]
    ];
    var tones = ["", "gold", "orange", "", "green", ""];
    return "<section class=\"kpis\">" + cards.map(function (c, i) {
      return "<div class=\"kpi " + tones[i] + "\"><b>" + c[0] + "</b><small>" + c[1] + "</small></div>";
    }).join("") + "</section>";
  }
  function ledgerBar() {
    var sum = DATA.ledger_total;
    var bar = DATA.ledger.map(function (b) {
      return "<i style=\"width:" + (100 * b.n / sum).toFixed(3) + "%;background:" + b.color + "\" title=\"" + esc(b.label) + "\"></i>";
    }).join("");
    var legend = DATA.ledger.map(function (b) {
      return "<span><i class=\"sw\" style=\"background:" + b.color + "\"></i>" + esc(b.label) + " <b>" + b.n + "</b></span>";
    }).join("");
    return "<div class=\"ledger\"><div class=\"cap\"><span>Protocol accounting</span><span>" + sum + " of " + sum + " snapshot protocols, one bucket each</span></div><div class=\"bar\">" + bar + "</div><div class=\"legend\">" + legend + "</div></div>";
  }
  function integrity(check) {
    var chips = [
      [check.match === DATA.rows.length, check.match + " / " + DATA.rows.length + " rows recomputed in the page"],
      [check.rankOk, "ranks 1–" + DATA.rows.length + " in order"],
      [true, "implied sum " + money(check.total)],
      [check.checksum === DATA.checksum, "checksum " + check.checksum + (check.checksum === DATA.checksum ? " matches main.ts" : " differs")],
      [check.watch === DATA.watchlist_size, "watchlist " + check.watch + " / " + DATA.watchlist_size],
      [check.sum === 758, "ledger " + check.sum + " / 758"]
    ];
    return "<div class=\"chips\">" + chips.map(function (c) {
      return "<span class=\"chip " + (c[0] ? "ok" : "bad") + "\">" + (c[0] ? "✓ " : "✗ ") + esc(c[1]) + "</span>";
    }).join("") + "</div>";
  }
  function termTable(rows, kind) {
    var head = kind === "odds"
      ? "<tr><th>Term, added in order</th><th class=\"num\">Five-fold</th><th class=\"num\">Walk-forward</th><th></th></tr>"
      : "<tr><th>Term, added in order</th><th class=\"num\">Leave-one-out</th><th class=\"num\">Walk-forward</th><th></th></tr>";
    var body = rows.map(function (t) {
      var flag = t.note === "baseline" ? "baseline" : t.kept ? "kept" : "not kept";
      var cls = t.kept ? "kept" : "drop";
      var a = kind === "odds" ? t.cv.toFixed(3) : t.loo.toFixed(2) + "×";
      var b = kind === "odds" ? t.wf.toFixed(3) : t.wf.toFixed(2) + "×";
      return "<tr><td>" + esc(t.name) + "</td><td class=\"num\">" + a + "</td><td class=\"num\">" + b + "</td><td class=\"" + cls + "\">" + flag + "</td></tr>";
    }).join("");
    return "<table class=\"mini\">" + head + body + "</table>";
  }
  function evidence() {
    var f = DATA.fit;
    var range = "<table class=\"mini\"><tr><th>Band</th><th class=\"num\">Hit</th><th class=\"num\">Stated</th><th>Test</th></tr>" +
      "<tr><td>P25–P75</td><td class=\"num\">" + (f.honest50 * 100).toFixed(0) + "%</td><td class=\"num\">50%</td><td>leave-one-out, n=" + f.honest_n + "</td></tr>" +
      "<tr><td>P10–P90</td><td class=\"num\">" + (f.honest80 * 100).toFixed(0) + "%</td><td class=\"num\">80%</td><td>leave-one-out</td></tr>" +
      "<tr><td>P25–P75</td><td class=\"num\">" + (f.wf50 * 100).toFixed(0) + "%</td><td class=\"num\">50%</td><td>walk-forward, n=" + f.wf_cov_n + "</td></tr>" +
      "<tr><td>P10–P90</td><td class=\"num\">" + (f.wf80 * 100).toFixed(0) + "%</td><td class=\"num\">80%</td><td>walk-forward</td></tr></table>" +
      "<p class=\"note\">A term is kept only if it lowers both held-out scores. The placebo, another row's week, is the control.</p>";
    return "<section class=\"evidence\">" +
      "<div class=\"panel\"><h2>Value if it launches · " + f.comps_n + " priced comps</h2>" + termTable(f.terms, "value") + "</div>" +
      "<div class=\"panel\"><h2>Token odds · Brier, lower is better</h2>" + termTable(DATA.odds.terms, "odds") + "</div>" +
      "<div class=\"panel\"><h2>Is the printed range honest?</h2>" + range + "</div></section>";
  }
  function tools(n) {
    var catOpts = "<option value=\"all\">All categories</option>" + cats().map(function (c) {
      return "<option value=\"" + esc(c) + "\"" + (ui.cat === c ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");
    function sel(key, options) {
      return "<select data-key=\"" + key + "\">" + options.map(function (o) {
        return "<option value=\"" + o[0] + "\"" + (String(ui[key]) === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select>";
    }
    return "<div class=\"tools\">" +
      "<input type=\"search\" id=\"q\" placeholder=\"Search name, slug, chain\" value=\"" + esc(ui.q) + "\">" +
      sel("tier", [["all", "All tiers"], ["watchlist", "Watchlist"], ["early", "Early"], ["off-list", "Off-list"]]) +
      sel("verdict", [["all", "All verdicts"], ["farm", "Farm"], ["thin", "Marginal"], ["skip", "Skip"]]) +
      "<select data-key=\"cat\">" + catOpts + "</select>" +
      sel("dep", [["1000", "Deposit $1,000"], ["10000", "Deposit $10,000"], ["25000", "Deposit $25,000"], ["pct2", "0.02% of TVL"], ["pct10", "0.10% of TVL"]]) +
      "<label>Drop <input id=\"share\" type=\"range\" min=\"2\" max=\"20\" value=\"" + ui.share + "\"> <b id=\"sharev\">" + ui.share + "%</b></label>" +
      "<label>Horizon <input id=\"weeks\" type=\"range\" min=\"4\" max=\"24\" value=\"" + ui.weeks + "\"> <b id=\"weekv\">" + ui.weeks + " wk</b></label>" +
      "<span class=\"count\">" + n + " shown</span></div>";
  }

  function spark(row) {
    var lo = Math.log(Math.max(1, row.implied_lo));
    var hi = Math.log(Math.max(row.implied_lo + 1, row.implied_hi));
    var mid = Math.log(Math.max(1, row.implied_value_usd));
    var p = hi === lo ? 50 : Math.max(0, Math.min(100, (mid - lo) / (hi - lo) * 100));
    return "<span class=\"spark\" title=\"" + money(row.implied_lo) + " – " + money(row.implied_hi) + "\"><i></i><b style=\"left:" + p.toFixed(1) + "%\"></b></span>";
  }
  function rowHtml(row) {
    var plan = planOf(row);
    var growth = row.change_7d == null ? "n/a" : pct(row.change_7d);
    var gcls = row.change_7d == null ? "" : row.change_7d >= 0 ? "up" : "down";
    var tier = row.tier === "watchlist" ? "watch" : row.tier === "off-list" ? "off" : "early";
    var tierName = row.tier === "watchlist" ? "Watchlist" : row.tier === "off-list" ? "Off-list" : "Early";
    var chain = row.farm_chain ? row.chains[0] || "" : "";
    return "<tr data-slug=\"" + esc(row.slug) + "\">" +
      "<td class=\"rk\"><b>" + row.rank + "</b><small>" + row.rank_lo + "–" + row.rank_hi + "</small></td>" +
      "<td class=\"name\"><b>" + esc(row.name) + " <i class=\"tag " + tier + "\">" + tierName + "</i></b><small>" + esc(row.category || "Uncategorized") + (chain ? " · " + esc(row.chains.slice(0, 2).join(", ")) : "") + "</small></td>" +
      "<td class=\"num\">" + money(row.tvl_usd) + "<br><span class=\"" + gcls + "\">" + growth + "</span></td>" +
      "<td class=\"num\">" + ageText(row.age_days) + "</td>" +
      "<td class=\"num\"><span class=\"odds\"><i style=\"width:" + Math.round(row.odds * 100) + "%\"></i></span>" + Math.round(row.odds * 100) + "%</td>" +
      "<td class=\"num\">" + money(row.value_if_usd) + "</td>" +
      "<td class=\"num\">" + spark(row) + money(row.implied_value_usd) + "<br><span class=\"sub\">" + money(row.implied_lo) + "–" + money(row.implied_hi) + "</span></td>" +
      "<td class=\"num\"><span class=\"v " + plan.verdict + "\">" + label(plan.verdict) + "</span><br>" + money(plan.net) + "</td>" +
      "<td class=\"num\">" + money(plan.dph) + "</td></tr>";
  }
  function board(rows) {
    var heads = [["rank", "# · range"], ["name", "Protocol"], ["tvl", "TVL · 7d"], ["age", "No-token age"], ["odds", "Token odds"], ["value", "If it launches"], ["implied", "Implied · range"], ["net", "Verdict · net"], ["dph", "$ / hour"]];
    var th = heads.map(function (h) {
      var mark = ui.sort === h[0] ? (ui.dir === "desc" ? " ↓" : " ↑") : "";
      return "<th data-sort=\"" + h[0] + "\">" + h[1] + mark + "</th>";
    }).join("");
    var body = rows.length ? rows.map(rowHtml).join("") : "<tr><td class=\"empty\" colspan=\"9\">Nothing matches this filter.</td></tr>";
    return "<div class=\"board\"><table><thead><tr>" + th + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function peersOf(row) {
    var cat = row.category || "Uncategorized";
    var same = DATA.comps.filter(function (c) { return c.category === cat; });
    var pool = same.length >= 3 ? same : DATA.comps;
    return pool.slice().sort(function (a, b) {
      return Math.abs(log10(a.tvl) - log10(row.tvl_usd)) - Math.abs(log10(b.tvl) - log10(row.tvl_usd));
    }).slice(0, 6);
  }
  function bridge(row) {
    var f = DATA.fit;
    var curve = row.curve * f.scale;
    var lines = [
      ["TVL", money(row.tvl_usd), ""],
      ["Size curve 10^(" + f.a.toFixed(2) + " + " + f.b.toFixed(2) + "·log TVL) × scale", money(curve), "kept"],
    ];
    row.factors.forEach(function (fac) {
      lines.push([fac.name, "×" + fac.mult.toFixed(2), fac.used ? "kept" : "not kept"]);
    });
    lines.push(["Value if it launches", money(valueIfLaunches(row)), ""]);
    DATA.odds.names.forEach(function (name, i) {
      lines.push(["Odds · " + name, DATA.odds.weights[i].toFixed(3) + " × " + row.ox[i].toFixed(3), "in the logit"]);
    });
    lines.push(["Token odds", Math.round(tokenOdds(row) * 100) + "%", ""]);
    lines.push(["Implied value", money(impliedOf(row)), "value × odds"]);
    return "<table class=\"bridge\">" + lines.map(function (ln) {
      var flag = ln[2] ? "<div class=\"flag " + (ln[2] === "kept" ? "kept" : "drop") + "\">" + esc(ln[2]) + "</div>" : "";
      return "<tr><td>" + esc(ln[0]) + flag + "</td><td>" + esc(ln[1]) + "</td></tr>";
    }).join("") + "</table>";
  }
  function sensitivity(row) {
    var shares = [5, 10, 15];
    var deps = [1000, 10000, 25000];
    var saved = ui.share;
    var head = "<tr><th>Share</th>" + deps.map(function (d) { return "<th>" + money(d) + "</th>"; }).join("") + "</tr>";
    var body = shares.map(function (s) {
      ui.share = s;
      var cells = deps.map(function (d) {
        var plan = planOf(row, d);
        var hit = s === saved && String(d) === String(ui.dep) ? " hit" : "";
        return "<td class=\"" + hit + "\"><button data-share=\"" + s + "\" data-dep=\"" + d + "\">" + label(plan.verdict).slice(0, 4) + " " + money(plan.net) + "</button></td>";
      }).join("");
      return "<tr><th>" + s + "%</th>" + cells + "</tr>";
    }).join("");
    ui.share = saved;
    return "<table class=\"grid\">" + head + body + "</table><p class=\"note\">Net of fees at this horizon (" + ui.weeks + " wk). FARM clears the T-bill and $" + DATA.econ.farm_dph + " an hour. SKIP means fees exceed the drop, or the week is past " + DATA.econ.crash + "%.</p>";
  }
  function detail(row) {
    var plan = planOf(row);
    var peers = peersOf(row).map(function (c) {
      var mult = c.mcap / c.tvl;
      return "<tr><td>" + esc(c.name) + "</td><td>" + esc(c.category) + "</td><td class=\"num\">" + money(c.tvl) + "</td><td class=\"num\">" + money(c.mcap) + "</td><td class=\"num\">" + mult.toFixed(2) + "×</td></tr>";
    }).join("");
    var steps = liveSteps(row, plan).map(function (text, i) {
      return "<li><div class=\"n\">" + (i + 1) + "</div><p>" + esc(text) + "</p></li>";
    }).join("");
    var tier = row.tier === "watchlist" ? "Watchlist" : row.tier === "off-list" ? "Off-list" : "Early";
    return "<div class=\"hero\"><div><p class=\"sub\">#" + row.rank + " of " + DATA.board_size + " · rank " + row.rank_lo + "–" + row.rank_hi + " across " + (DATA.econ && DATA.econ.boot ? DATA.econ.boot : 64) + " bootstrap refits</p><h2>" + esc(row.name) + " <i class=\"tag " + (row.tier === "watchlist" ? "watch" : row.tier === "off-list" ? "off" : "early") + "\">" + tier + "</i> <i class=\"tag\">" + esc(row.play) + "</i></h2>" +
      "<p class=\"sub\">" + esc(row.category || "Uncategorized") + " · " + esc(row.chains.slice(0, 4).join(", ")) + " · TVL " + money(row.tvl_usd) + " · 7d " + pct(row.change_7d) + " · no-token age " + ageText(row.age_days) + "</p></div>" +
      "<div class=\"implied\"><b>" + money(row.implied_value_usd) + "</b><span>Implied · " + money(row.implied_lo) + " to " + money(row.implied_hi) + "</span></div></div>" +
      "<div class=\"cols\"><div class=\"panel\"><h2>How the figure is made</h2>" + bridge(row) +
      "<h2 style=\"margin-top:8px\">Nearest priced peers</h2><table class=\"mini\"><tr><th>Protocol</th><th>Category</th><th class=\"num\">TVL</th><th class=\"num\">Cap</th><th class=\"num\">Cap/TVL</th></tr>" + peers + "</table></div>" +
      "<div class=\"panel\"><div class=\"verdict " + plan.verdict + "\"><div><b class=\"v " + plan.verdict + "\">" + label(plan.verdict) + "</b><div class=\"sub\">" + money(plan.deposit) + " · " + ui.share + "% drop · " + ui.weeks + " wk · " + esc(row.farm_chain) + "</div></div>" +
      "<div class=\"sub\">" + money(plan.net) + " net · " + money(plan.dph) + "/hr</div></div>" +
      "<div class=\"metrics\">" +
      [["At risk", money(plan.deposit)], ["Fees", money(plan.fees)], ["Modelled drop", money(plan.capture)], ["T-bill", money(plan.tbill)], ["Hands-on", plan.hours.toFixed(1) + " h"], ["Net / hour", money(plan.dph)]].map(function (m) {
        return "<div><span>" + m[0] + "</span><b>" + m[1] + "</b></div>";
      }).join("") + "</div>" +
      "<h2>Net by drop share × deposit</h2>" + sensitivity(row) +
      "<h2 style=\"margin-top:8px\">Farm plan · " + liveSteps(row, plan).length + " steps</h2><ol class=\"steps\">" + steps + "</ol></div></div>";
  }

  function shell(check, rows) {
    var f = DATA.fit;
    var formula = "implied = <strong>value if it launches</strong> × <strong>token odds</strong>. Value = 10^(" +
      f.a.toFixed(2) + " + " + f.b.toFixed(2) + "·log TVL)" +
      (f.use.growth ? " × 7-day growth" : "") + (f.use.chains ? " × chain count" : "") +
      (f.use.cat ? " × category" : "") + (f.use.age ? " × years listed" : "") +
      " × scale " + f.scale.toFixed(2) + ". Odds keep " + DATA.odds.names.filter(function (n) { return n !== "intercept"; }).join(", ") + ".";
    return "<header class=\"top\"><h1><span>Launch</span> Radar</h1><p>Pre-token protocols, valued from their own record. " + esc(DATA.as_of) + ".</p><div class=\"grow\">" + esc(DATA.model_version) + " · " + DATA.board_size + " rows · " + f.comps_n + " comps</div></header>" +
      kpis(check) + "<p class=\"formula\">" + formula + "</p>" + ledgerBar() + integrity(check) +
      (ui.p ? "" : evidence()) +
      "<div class=\"back\">" + (ui.p ? "<button type=\"button\" id=\"back\">← Board</button>" : "") + "</div>" +
      (ui.p ? "" : tools(rows.length));
  }

  function paint() {
    if (!DATA || !DATA.rows) { app.textContent = "No board. Run main.ts so data.js sits beside this folder."; return; }
    var check = audit();
    var rows = visible();
    var focus = document.activeElement && document.activeElement.id === "q";
    var caret = focus ? document.activeElement.selectionStart : 0;
    var row = ui.p && DATA.rows.filter(function (r) { return r.slug === ui.p; })[0];
    app.innerHTML = shell(check, rows) + (row ? detail(row) : board(rows));
    bind(focus, caret);
  }
  function bind(refocus, caret) {
    var q = document.getElementById("q");
    if (q) {
      q.addEventListener("input", function () { ui.q = q.value; ui.p = ""; writeHash(); });
      if (refocus) { q.focus(); if (q.setSelectionRange) q.setSelectionRange(caret, caret); }
    }
    app.querySelectorAll("select[data-key]").forEach(function (el) {
      el.addEventListener("change", function () { ui[el.getAttribute("data-key")] = el.value; ui.p = ""; writeHash(); });
    });
    var share = document.getElementById("share");
    var weeks = document.getElementById("weeks");
    if (share) share.addEventListener("input", function () { ui.share = +share.value; document.getElementById("sharev").textContent = ui.share + "%"; paint(); });
    if (weeks) weeks.addEventListener("input", function () { ui.weeks = +weeks.value; document.getElementById("weekv").textContent = ui.weeks + " wk"; paint(); });
    app.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (ui.sort === key) ui.dir = ui.dir === "asc" ? "desc" : "asc";
        else { ui.sort = key; ui.dir = key === "name" || key === "rank" ? "asc" : "desc"; }
        writeHash();
      });
    });
    app.querySelectorAll("tr[data-slug]").forEach(function (tr) {
      tr.addEventListener("click", function () { ui.p = tr.getAttribute("data-slug"); writeHash(); });
    });
    var back = document.getElementById("back");
    if (back) back.addEventListener("click", function () { ui.p = ""; writeHash(); });
    app.querySelectorAll("button[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ui.share = +btn.getAttribute("data-share");
        ui.dep = btn.getAttribute("data-dep");
        writeHash();
      });
    });
  }

  window.addEventListener("hashchange", function () { loadHash(); paint(); });
  loadHash();
  paint();
})();
