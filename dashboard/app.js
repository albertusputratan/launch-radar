// Launch Radar dashboard: static, no network. Renders board, filters, detail and farm plans from window.RADAR.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', verdict: 'all', band: 'all', sort: 'implied', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.round(d) + 'd';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  // Farm plan mirrored from model.ts so the page and board.json stay the same story.
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    if (p.tvl_usd >= 2e7) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age == null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Provide $" + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('privacy') >= 0) return 'Route $' + capital + ' through ' + name + ' on ' + chain + ' and leave a small balance.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmPlan(p) {
    var chain = chainOf(p);
    var capital = p.farm_capital_usd != null ? p.farm_capital_usd : capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var setupGas = capital >= 150 ? 8 : 4;
    var weeklyGas = 2;
    var gas = p.farm_gas_usd != null ? p.farm_gas_usd : setupGas + weeklyGas * weeks;
    var hours = p.farm_hours != null ? p.farm_hours : 0.5 + weeks * (10 / 60) + 0.25;
    var implied = p.implied_value_usd;
    var capture = Math.min(implied * 0.001, capital * 0.35);
    var outlay = capital + gas; var be = p.break_even_pct != null ? p.break_even_pct : (capture > 0 ? Math.round((outlay / capture) * 10000) / 100 : 999);
    var dph = p.dollars_per_hour != null ? p.dollars_per_hour : Math.max(0, Math.round(capture / hours));
    var verdict = p.verdict || 'farm';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm on ' + chain + ', and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + setupGas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week (deposit, borrow, swap or vote) for ' + weeks + ' weeks so activity spans multiple snapshots.', cost: 'about $' + weeklyGas + ' of gas a week ($' + (weeklyGas * weeks) + ' total)', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days; total outlay is $' + capital + ' capital plus ~$' + gas + ' gas (~' + hours.toFixed(1) + ' hours of work).', cost: '$' + capital + ' stays in the position; $' + gas + ' gas spent', time: hold + ' days / ' + hours.toFixed(1) + ' hours of active work' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay to claim.", cost: 'no fee to check; never pay to claim', time: '10 minutes' },
      { text: 'Net the plan: at a 0.1% capture of implied (capped at 35% of capital → ~$' + Math.round(capture).toLocaleString('en-US') + '), outlay is ' + be + '% of that capture and the plan nets ~$' + dph + '/hour — verdict: ' + verdict + '.', cost: 'gas $' + gas + '; expected capture ~$' + Math.round(capture), time: hours.toFixed(1) + ' hours total' }
    ];
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.rows.slice();
    list = list.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (state.band === 'watchlist' && !r.on_watchlist) return false;
      if (state.band === 'early' && r.on_watchlist) return false;
      if (state.band === 'farm' && r.verdict !== 'farm') return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      var av = a[key === 'implied' ? 'implied_value_usd' : key === 'tvl' ? 'tvl_usd' : key === 'growth' ? (a.change_7d || 0) : key === 'dph' ? a.dollars_per_hour : a.rank];
      var bv = b[key === 'implied' ? 'implied_value_usd' : key === 'tvl' ? 'tvl_usd' : key === 'growth' ? (b.change_7d || 0) : key === 'dph' ? b.dollars_per_hour : b.rank];
      if (key === 'growth') { av = a.change_7d == null ? -9999 : a.change_7d; bv = b.change_7d == null ? -9999 : b.change_7d; }
      if (av === bv) return a.rank - b.rank;
      return av > bv ? state.dir : -state.dir;
    });
    return list;
  }

  function renderKpis() {
    var box = document.getElementById('kpis');
    var f = DATA.fit || {};
    var items = [
      ['Board', DATA.board_size + ' · wl ' + DATA.watchlist_size],
      ['Comps', (f.comps_used || 0) + ' · ' + (f.categories_fit || 0) + ' cats'],
      ['LOO MAPE', ((f.loo_mape || 0) * 100).toFixed(0) + '% · n=' + (f.loo_n || 0)],
      ['WF MAPE', ((f.wf_mape || 0) * 100).toFixed(0) + '% · n=' + (f.wf_n || 0)],
      ['Walk-fwd vs flat', f.beats_flat ? 'beats flat' : 'flat closer']
    ];
    box.innerHTML = '';
    items.forEach(function (it) {
      box.appendChild(el('div', { class: 'kpi' }, el('b', { text: it[1] }), el('span', { text: it[0] })));
    });
  }

  function renderDetail(row) {
    var pane = el('div', { class: 'panel', id: 'detail-pane' });
    if (!row) {
      pane.appendChild(el('h2', { text: 'Protocol detail' }));
      pane.appendChild(el('div', { class: 'empty', text: 'Select a protocol on the board to see its valuation and farm plan.' }));
      return pane;
    }
    pane.appendChild(el('h2', { text: '#' + row.rank + ' · ' + row.name }));
    var body = el('div', { class: 'detail' });
    body.appendChild(el('div', { class: 'meta' },
      el('div', { class: 'cell' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', { class: 'cell' }, el('span', { text: 'Comps multiple' }), el('b', { class: 'num', text: (row.comps_multiple || 0).toFixed(3) + '× TVL' })),
      el('div', { class: 'cell' }, el('span', { text: '7d / age' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' · ' + fmtAge(row.age_days) })),
      el('div', { class: 'cell' }, el('span', { text: 'Farm capital / gas' }), el('b', { class: 'num', text: '$' + row.farm_capital_usd + ' / $' + row.farm_gas_usd })),
      el('div', { class: 'cell' }, el('span', { text: '$/hour · verdict' }), el('b', { class: 'num', text: '$' + row.dollars_per_hour + '/h' }), ' ', el('span', { class: 'pill ' + row.verdict, text: row.verdict }))
    ));
    body.appendChild(el('p', { class: 'note', text: (row.category || 'Uncategorized') + ' on ' + (row.chains || []).join(', ') + (row.on_watchlist ? ' · watchlist' : ' · early radar') + '. Growth×' + row.growth_multiplier + ' · maturity×' + row.maturity_multiplier + '.' }));
    var ol = el('ul', { class: 'steps' });
    farmPlan(row).forEach(function (s, i) {
      ol.appendChild(el('li', null,
        el('strong', { text: (i + 1) + '. ' + s.text }),
        el('em', { text: 'Cost: ' + s.cost + ' · Time: ' + s.time })
      ));
    });
    body.appendChild(ol);
    pane.appendChild(body);
    return pane;
  }

  function render() {
    renderKpis();
    app.innerHTML = '';
    app.setAttribute('aria-busy', 'false');
    var cats = {};
    DATA.rows.forEach(function (r) { cats[r.category || 'Uncategorized'] = true; });
    var catNames = Object.keys(cats).sort();

    var toolbar = el('div', { class: 'toolbar' },
      el('input', { type: 'search', placeholder: 'Filter by name, slug, chain…', value: state.q, oninput: function (e) { state.q = e.target.value; render(); } }),
      el('select', { onchange: function (e) { state.category = e.target.value; render(); } },
        el('option', { value: 'all', text: 'All categories' }),
        catNames.map(function (c) { var o = el('option', { value: c, text: c }); if (c === state.category) o.selected = true; return o; })
      ),
      el('div', { class: 'chips' },
        [['all', 'All'], ['watchlist', 'Watchlist'], ['early', 'Early'], ['farm', 'Farm only']].map(function (x) {
          return el('button', { class: 'chip' + (state.band === x[0] ? ' active' : ''), type: 'button', text: x[1], onclick: function () { state.band = x[0]; render(); } });
        }),
        [['all', 'Any verdict'], ['farm', 'farm'], ['thin', 'thin'], ['skip', 'skip']].map(function (x) {
          return el('button', { class: 'chip' + (state.verdict === x[0] ? ' active' : ''), type: 'button', text: x[1], onclick: function () { state.verdict = x[0]; render(); } });
        })
      )
    );
    app.appendChild(toolbar);

    var list = rows();
    if (!state.selected && list.length) state.selected = list[0].slug;
    var selected = DATA.rows.find(function (r) { return r.slug === state.selected; }) || list[0] || null;

    var table = el('table');
    var thead = el('thead');
    var head = el('tr');
    [['rank', '#'], ['name', 'Protocol'], ['implied', 'Implied'], ['tvl', 'TVL'], ['growth', '7d'], ['dph', '$/h'], ['verdict', 'Plan']].forEach(function (col) {
      head.appendChild(el('th', {
        text: col[1] + (state.sort === col[0] ? (state.dir < 0 ? ' ↓' : ' ↑') : ''),
        onclick: function () {
          if (state.sort === col[0]) state.dir *= -1;
          else { state.sort = col[0]; state.dir = col[0] === 'rank' ? 1 : -1; }
          render();
        }
      }));
    });
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        class: selected && selected.slug === r.slug ? 'selected' : '',
        onclick: function () { state.selected = r.slug; render(); }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, r.name, r.on_watchlist ? el('span', { class: 'pill', text: ' WL' }) : null),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: '$' + r.dollars_per_hour }),
        el('td', null, el('span', { class: 'pill ' + r.verdict, text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var left = el('div', { class: 'panel' },
      el('h2', { text: 'Board · ' + list.length + ' shown of ' + DATA.board_size + ' · as of ' + DATA.as_of }),
      el('div', { class: 'table-wrap' }, table),
      el('div', { class: 'modelbox' },
        el('div', { text: 'Model ' + DATA.model_version + ': implied = blend(category median × TVL, size curve exp(a+b·ln TVL)) × growth × maturity. Fitted on ' + (DATA.fit && DATA.fit.comps_used) + ' live comps; leave-one-out MAPE ' + (((DATA.fit && DATA.fit.loo_mape) || 0) * 100).toFixed(0) + '%; walk-forward MAPE ' + (((DATA.fit && DATA.fit.wf_mape) || 0) * 100).toFixed(0) + '%; ' + (DATA.fit && DATA.fit.beats_flat ? 'beats' : 'does not beat') + ' a flat ' + ((DATA.model && DATA.model.global_fallback_multiple) || 0.2) + '× multiple.' }),
        el('div', { text: 'Farm plans assume 0.2% capture of implied value (capped at 35% of capital); verdict farm / thin / skip is netted from $/hour and gas vs capture. Snapshot: ' + DATA.source + '.' })
      )
    );

    var layout = el('div', { class: 'layout' }, left, renderDetail(selected));
    app.appendChild(layout);
  }

  render();
})();
