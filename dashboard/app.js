// Launch Radar page. No network. Reads window.RADAR, written beside this folder as data.js.
(function () {
  "use strict";
  var DATA = window.RADAR;
  var main = document.getElementById("main");
  var DEFAULTS = { band: "all", verdict: "all", cat: "all", q: "", sort: "implied", dir: "desc", p: "", view: "board" };

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value == null) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (item) { append(node, item); }); return; }
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  function formatUsd(n) {
    if (n == null || !isFinite(n)) return "n/a";
    var sign = n < 0 ? "-" : "";
    var a = Math.abs(n);
    if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return sign + "$" + String(Math.round(a)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (a >= 1 && Math.abs(a - Math.round(a)) < 0.001) return sign + "$" + Math.round(a);
    return sign + "$" + a.toFixed(2);
  }
  function formatHour(n) {
    if (n == null || !isFinite(n)) return "n/a";
    return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n));
  }
  function formatPct(n) {
    if (n == null || !isFinite(n)) return "n/a";
    return (n > 0 ? "+" : "") + Number(n).toFixed(1) + "%";
  }
  function formatAge(days) {
    if (days == null) return "unlisted";
    if (days >= 365) return (days / 365).toFixed(1) + "y";
    return Math.round(days) + "d";
  }
  function pctPoints(frac) { return Math.round((frac || 0) * 1000) / 10 + "%"; }

  function readState() {
    var params = new URLSearchParams(location.hash.replace(/^#/, ""));
    var state = {};
    Object.keys(DEFAULTS).forEach(function (key) { state[key] = params.get(key) || DEFAULTS[key]; });
    return state;
  }
  function writeState(patch) {
    var state = readState();
    Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
    var params = new URLSearchParams();
    Object.keys(DEFAULTS).forEach(function (key) {
      if (state[key] && state[key] !== DEFAULTS[key]) params.set(key, state[key]);
    });
    var next = params.toString();
    if (location.hash.replace(/^#/, "") === next) render();
    else location.hash = next;
  }

  function renderKpis() {
    var fit = DATA.fit;
    var box = document.getElementById("kpis");
    var items = [
      [String(DATA.board_size), DATA.watchlist_size + " watchlist"],
      [String(fit.comps_used), "Live comps"],
      [pctPoints(fit.loo_mape) + " vs " + pctPoints(fit.loo_flat_mape), "Leave-one-out"],
      [pctPoints(fit.wf_mape) + " vs " + pctPoints(fit.wf_flat_mape), "Walk-forward"],
      [fit.beats_flat ? "Beats flat" : "Flat closer", "Out of sample"]
    ];
    box.textContent = "";
    items.forEach(function (item) {
      box.appendChild(h("div", { class: "kpi" }, h("b", { text: item[0] }), h("span", { text: item[1] })));
    });
  }

  function categories(rows) {
    var seen = {};
    rows.forEach(function (row) { seen[row.category || "Uncategorized"] = true; });
    return Object.keys(seen).sort();
  }

  function toolbar(state, rows) {
    var cats = categories(rows);
    var search = h("input", {
      id: "q", type: "search", placeholder: "Filter by name, slug, or chain", value: state.q,
      oninput: function (event) { writeState({ q: event.target.value, p: "" }); }
    });
    var select = h("select", {
      id: "cat",
      onchange: function (event) { writeState({ cat: event.target.value, p: "" }); }
    }, h("option", { value: "all", text: "All categories" }));
    cats.forEach(function (cat) {
      var option = h("option", { value: cat, text: cat });
      if (cat === state.cat) option.selected = true;
      select.appendChild(option);
    });
    var band = h("div", { class: "chips" });
    [["all", "All books"], ["watchlist", "Watchlist"], ["early", "Early"]].forEach(function (item) {
      band.appendChild(h("button", {
        type: "button", class: state.band === item[0] ? "on" : "", text: item[1],
        onclick: function () { writeState({ band: item[0], p: "" }); }
      }));
    });
    var verdict = h("div", { class: "chips" });
    [["all", "Any plan"], ["farm", "Farm"], ["thin", "Thin"], ["skip", "Skip"]].forEach(function (item) {
      verdict.appendChild(h("button", {
        type: "button", class: state.verdict === item[0] ? "on" : "", text: item[1],
        onclick: function () { writeState({ verdict: item[0], p: "" }); }
      }));
    });
    var views = h("div", { class: "chips" });
    [["board", "Board"], ["comps", "Live comps"]].forEach(function (item) {
      views.appendChild(h("button", {
        type: "button", class: state.view === item[0] && !state.p ? "on" : "", text: item[1],
        onclick: function () { writeState({ view: item[0], p: "" }); }
      }));
    });
    var mix = DATA.verdicts;
    return h("div", { class: "toolbar" },
      search, select, band, verdict, views,
      h("div", { class: "mix", text: "farm " + mix.farm + " · thin " + mix.thin + " · skip " + mix.skip })
    );
  }

  function matches(row, state) {
    if (state.band === "watchlist" && !row.on_watchlist) return false;
    if (state.band === "early" && row.on_watchlist) return false;
    if (state.verdict !== "all" && row.verdict !== state.verdict) return false;
    if (state.cat !== "all" && (row.category || "Uncategorized") !== state.cat) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = (row.name + " " + row.slug + " " + (row.category || "") + " " + (row.chains || []).join(" ")).toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function filteredRows(state) {
    return DATA.rows.filter(function (row) { return matches(row, state); });
  }

  function sortValue(row, key) {
    if (key === "name") return row.name.toLowerCase();
    if (key === "implied") return row.implied_value_usd;
    if (key === "tvl") return row.tvl_usd;
    if (key === "multiple") return row.fitted_multiple;
    if (key === "growth") return row.change_7d == null ? -9999 : row.change_7d;
    if (key === "age") return row.age_days == null ? -1 : row.age_days;
    if (key === "dph") return row.dollars_per_hour;
    return row.rank;
  }

  function sortRows(rows, state) {
    var dir = state.dir === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = sortValue(a, state.sort);
      var bv = sortValue(b, state.sort);
      if (av === bv) return a.rank - b.rank;
      return av > bv ? dir : -dir;
    });
  }

  function bridgeRows(row) {
    return [
      ["Size curve", formatUsd(row.curve_mcap_usd)],
      ["After category", formatUsd(row.fitted_mcap_usd)],
      ["Fitted multiple", row.fitted_multiple.toFixed(3) + "× TVL"],
      ["Category premium", row.category_n ? row.category_premium.toFixed(2) + "× · n=" + row.category_n : "global curve"],
      ["Growth", "×" + row.growth_multiplier + " (" + formatPct(row.growth_pct) + ")"],
      ["Maturity", "×" + row.maturity_multiplier + " · " + formatAge(row.age_days)]
    ];
  }

  function renderSteps(row) {
    return h("ol", { class: "steps" }, row.steps.map(function (step, index) {
      return h("li", null,
        h("div", { class: "n", text: String(index + 1) }),
        h("div", null,
          h("p", { text: step.text }),
          h("p", { class: "meta", text: "Cost: " + step.cost + " · Time: " + step.time })
        )
      );
    }));
  }

  function openRow(slug) { writeState({ p: slug, view: "board" }); }

  function renderBoard(state) {
    var list = sortRows(filteredRows(state), state);
    var top = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var columns = [
      ["rank", "#"], ["name", "Protocol"], ["implied", "Implied"], ["tvl", "TVL"],
      ["multiple", "Multiple"], ["growth", "7d"], ["age", "Age"], ["dph", "$/hour"], ["verdict", "Plan"]
    ];
    var head = h("tr");
    columns.forEach(function (col) {
      var mark = state.sort === col[0] ? (state.dir === "asc" ? " ↑" : " ↓") : "";
      head.appendChild(h("th", {
        text: col[1] + mark, scope: "col",
        onclick: function () {
          if (state.sort === col[0]) writeState({ dir: state.dir === "asc" ? "desc" : "asc" });
          else writeState({ sort: col[0], dir: col[0] === "name" || col[0] === "rank" ? "asc" : "desc" });
        }
      }));
    });
    var body = h("tbody");
    list.forEach(function (row) {
      var width = Math.max(4, Math.round((row.implied_value_usd / top) * 100));
      var growthClass = row.change_7d == null ? "" : row.change_7d >= 0 ? "up" : "down";
      body.appendChild(h("tr", {
        tabindex: "0",
        onclick: function () { openRow(row.slug); },
        onkeydown: function (event) { if (event.key === "Enter") openRow(row.slug); }
      },
        h("td", { class: "num", text: String(row.rank) }),
        h("td", { class: "name" }, row.name, row.on_watchlist ? h("span", { class: "pill watch", text: "watch" }) : null),
        h("td", { class: "num" }, formatUsd(row.implied_value_usd), h("span", { class: "meter" }, h("i", { style: "width:" + width + "%" }))),
        h("td", { class: "num", text: formatUsd(row.tvl_usd) }),
        h("td", { class: "num", text: row.fitted_multiple.toFixed(3) + "×" }),
        h("td", { class: "num " + growthClass, text: formatPct(row.change_7d) }),
        h("td", { class: "num", text: formatAge(row.age_days) }),
        h("td", { class: "num", text: formatHour(row.dollars_per_hour) }),
        h("td", null, h("span", { class: "pill " + row.verdict, text: row.verdict }))
      ));
    });
    var table = h("table", null, h("thead", null, head), body);
    var panel = h("div", { class: "panel" },
      h("div", { class: "panel-h" },
        h("h2", { text: "Board" }),
        h("p", { text: list.length + " shown of " + DATA.board_size + " · " + DATA.as_of })
      ),
      list.length ? h("div", { class: "table-wrap" }, table) : h("div", { class: "empty", text: "Nothing matches this filter." }),
      h("div", { class: "foot", text: DATA.blurb + " Live tokens stay off this board. " + DATA.source })
    );
    main.appendChild(toolbar(state, DATA.rows));
    main.appendChild(panel);
  }

  function renderDetail(state) {
    var row = DATA.rows.filter(function (item) { return item.slug === state.p; })[0];
    main.appendChild(h("div", { class: "back" }, h("button", {
      type: "button", text: "Back to the board",
      onclick: function () { writeState({ p: "" }); }
    })));
    if (!row) {
      main.appendChild(h("div", { class: "panel empty", text: "That protocol is not on the board." }));
      return;
    }
    var facts = h("div", { class: "panel" },
      h("div", { class: "hero" },
        h("p", { class: "kicker", text: "Rank " + row.rank + " · " + (row.on_watchlist ? "watchlist" : "early") }),
        h("h2", { text: row.name }),
        h("p", { class: "implied" }, formatUsd(row.implied_value_usd), h("span", { text: "Implied value" })),
        h("p", { class: "sub", text: (row.category || "Uncategorized") + " · " + (row.chains.length ? row.chains.slice(0, 6).join(", ") : "no chain listed") + (row.chains.length > 6 ? " +" + (row.chains.length - 6) : "") })
      ),
      h("div", { class: "bridge" }, bridgeRows(row).map(function (item) {
        return h("div", { class: "cell" }, h("span", { text: item[0] }), h("b", { text: item[1] }));
      })),
      h("div", { class: "banner " + row.verdict },
        h("strong", { text: row.verdict + " · " + formatHour(row.dollars_per_hour) + "/hour" }),
        h("p", { text: row.verdict_reason })
      ),
      h("div", { class: "bridge" }, [
        ["Farm on", row.farm_chain],
        ["Capital locked", formatUsd(row.farm_capital_usd)],
        ["Gas spent", formatUsd(row.farm_gas_usd)],
        ["Work", row.farm_hours.toFixed(2) + " h"],
        ["Modeled capture", formatUsd(row.capture_usd)],
        ["Gas / capture", row.break_even_pct + "%"]
      ].map(function (item) {
        return h("div", { class: "cell" }, h("span", { text: item[0] }), h("b", { text: item[1] }));
      })),
      h("p", { class: "note", text: row.farm_chain_note })
    );
    var plan = h("div", { class: "panel" },
      h("div", { class: "panel-h" },
        h("h2", { text: "Farm plan" }),
        h("p", { text: row.farm_hold_days + " days · " + row.farm_weeks + " weekly actions" })
      ),
      renderSteps(row),
      h("p", { class: "note", text: DATA.assumptions })
    );
    main.appendChild(h("div", { class: "detail" }, facts, plan));
  }

  function renderComps(state) {
    var q = state.q.trim().toLowerCase();
    var list = DATA.comps.filter(function (row) {
      if (state.cat !== "all" && (row.category || "Uncategorized") !== state.cat) return false;
      if (!q) return true;
      return (row.name + " " + row.slug + " " + (row.category || "")).toLowerCase().indexOf(q) >= 0;
    });
    var body = h("tbody");
    list.forEach(function (row) {
      var cls = row.error_pct >= 0 ? "up" : "down";
      body.appendChild(h("tr", null,
        h("td", { class: "name", text: row.name }),
        h("td", { text: row.category || "Uncategorized" }),
        h("td", { class: "num", text: formatUsd(row.tvl_usd) }),
        h("td", { class: "num", text: formatUsd(row.mcap_usd) }),
        h("td", { class: "num", text: row.multiple.toFixed(3) + "×" }),
        h("td", { class: "num", text: formatUsd(row.predicted_mcap_usd) }),
        h("td", { class: "num " + cls, text: formatPct(row.error_pct) })
      ));
    });
    var head = h("tr");
    ["Protocol", "Category", "TVL", "Market cap", "Multiple", "Model", "Error"].forEach(function (label) {
      head.appendChild(h("th", { text: label, scope: "col" }));
    });
    var cats = h("div", { class: "bridge" }, DATA.fit.categories.slice(0, 6).map(function (cat) {
      return h("div", { class: "cell" },
        h("span", { text: cat.category + " · n=" + cat.n }),
        h("b", { text: cat.multiple_at_100m.toFixed(3) + "× at $100M" })
      );
    }));
    main.appendChild(toolbar(state, DATA.comps));
    main.appendChild(h("div", { class: "panel" },
      h("div", { class: "panel-h" },
        h("h2", { text: "Live comps" }),
        h("p", { text: list.length + " of " + DATA.comps.length + " · in-sample, not the rank" })
      ),
      cats,
      h("div", { class: "table-wrap" }, h("table", null, h("thead", null, head), body)),
      h("div", { class: "foot", text: DATA.note })
    ));
  }

  function render() {
    if (!DATA || !DATA.rows) {
      main.textContent = "No board data. Run main.ts so data.js sits next to the dashboard folder.";
      return;
    }
    var focus = document.activeElement;
    var focusId = focus && focus.id === "q" ? "q" : "";
    var caret = focusId ? focus.selectionStart : null;
    var state = readState();
    main.textContent = "";
    main.setAttribute("aria-busy", "false");
    renderKpis();
    if (state.p) renderDetail(state);
    else if (state.view === "comps") renderComps(state);
    else renderBoard(state);
    if (focusId) {
      var box = document.getElementById(focusId);
      if (box) {
        box.focus();
        if (caret != null && box.setSelectionRange) box.setSelectionRange(caret, caret);
      }
    }
  }

  window.addEventListener("hashchange", render);
  render();
})();
