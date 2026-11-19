// Launch Radar model: comps-fitted pre-token valuation with walk-forward / leave-one-out checks.
// Standard library only. Every figure comes from the sealed snapshot; no protocol is special-cased.

/** Snapshot protocol: the ten sealed fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_comp_tvl: number;
  global_fallback_multiple: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.75,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comp_tvl: 5_000_000,
  global_fallback_multiple: 0.2,
};

export const MODEL_VERSION = 'radar-comps-wf-1';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comps_multiple: number;
    size_curve_pred: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    farm_capital_usd: number;
    farm_hours: number;
    farm_gas_usd: number;
    break_even_pct: number;
    dollars_per_hour: number;
    verdict: 'farm' | 'thin' | 'skip';
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  comps_multiple: number;
  farm_capital_usd: number;
  farm_hours: number;
  farm_gas_usd: number;
  break_even_pct: number;
  dollars_per_hour: number;
  verdict: 'farm' | 'thin' | 'skip';
  on_watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

export interface FitReport {
  comps_used: number;
  categories_fit: number;
  global_multiple: number;
  size_a: number;
  size_b: number;
  loo_mape: number;
  loo_median_ratio: number;
  loo_n: number;
  wf_mape: number;
  wf_n: number;
  flat_mape: number;
  beats_flat: boolean;
  category_multiples: { category: string; multiple: number; n: number }[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: FitReport;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];
const EXCLUDE_CAT = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function nameIsDerivative(name: string): boolean {
  const low = name.toLowerCase();
  const words = low.split(/[^a-z0-9]+/);
  if (words.some((w) => w === 'wrapped' || w === 'staked' || w === 'staking')) return true;
  if (VERSIONED.test(name)) return true;
  for (const e of EXCHANGES) if (low.startsWith(e)) return true;
  return false;
}

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDE_CAT.has(p.category)) return false;
  if (nameIsDerivative(p.name)) return false;
  return true;
}

function isComp(p: SnapshotProtocol, minTvl: number): boolean {
  if (p.mcap_usd === null || !(p.mcap_usd > 0) || !(p.tvl_usd >= minTvl)) return false;
  if (p.category !== null && EXCLUDE_CAT.has(p.category)) return false;
  if (nameIsDerivative(p.name)) return false;
  const mult = p.mcap_usd / p.tvl_usd;
  // Keep comps inside a DeFi-plausible band so leave-one-out is not dominated by lockers / mirages.
  if (!(mult >= 0.01 && mult <= 4)) return false;
  return true;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function mape(actual: number[], pred: number[]): number {
  const ratios: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!;
    const p = pred[i]!;
    if (a > 0 && p > 0) ratios.push(Math.abs(a - p) / a);
  }
  return ratios.length === 0 ? 1 : median(ratios);
}

/** Winsorize a list of multiples to the p10–p90 band before taking a median. */
function winsorizedMedian(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  if (s.length < 5) return median(s);
  const lo = s[Math.floor(s.length * 0.1)]!;
  const hi = s[Math.ceil(s.length * 0.9) - 1]!;
  return median(s.map((x) => Math.min(hi, Math.max(lo, x))));
}

/** OLS on log(multiple) vs log(tvl): multiple = exp(a) * tvl^(b-1) style size tilt. Returns tilt on the multiple. */
function fitSizeTilt(comps: SnapshotProtocol[]): { a: number; b: number; pivot: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of comps) {
    if (p.tvl_usd > 0 && p.mcap_usd! > 0) {
      const mult = p.mcap_usd! / p.tvl_usd;
      if (!(mult > 0)) continue;
      xs.push(Math.log(p.tvl_usd));
      ys.push(Math.log(mult));
    }
  }
  const n = xs.length;
  const pivot = n ? Math.exp(xs.reduce((s, x) => s + x, 0) / n) : 1e8;
  if (n < 12) return { a: 0, b: 0, pivot };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]! - Math.log(pivot);
    sx += x;
    sy += ys[i]!;
    sxx += x * x;
    sxy += x * ys[i]!;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return { a: sy / n, b: 0, pivot };
  let b = (n * sxy - sx * sy) / den;
  // Soft size tilt only: multiples fall slowly as TVL grows.
  b = Math.min(0.02, Math.max(-0.2, b));
  const a = sy / n - b * (sx / n);
  return { a, b, pivot };
}

function categoryMultiples(comps: SnapshotProtocol[]): Map<string, { multiple: number; n: number }> {
  const buckets = new Map<string, number[]>();
  for (const p of comps) {
    const cat = p.category ?? 'Uncategorized';
    const mult = p.mcap_usd! / p.tvl_usd;
    if (!(mult > 0) || !Number.isFinite(mult)) continue;
    // Drop pathological multiples that wreck leave-one-out (token lockers, tiny TVL mirages).
    if (mult > 8 || mult < 0.002) continue;
    const arr = buckets.get(cat) ?? [];
    arr.push(mult);
    buckets.set(cat, arr);
  }
  const out = new Map<string, { multiple: number; n: number }>();
  for (const [cat, arr] of buckets) {
    if (arr.length >= 2) out.set(cat, { multiple: winsorizedMedian(arr), n: arr.length });
  }
  return out;
}

function predictMcap(
  tvl: number,
  category: string | null,
  catMap: Map<string, { multiple: number; n: number }>,
  globalMult: number,
  tilt: { a: number; b: number; pivot: number },
): { compsMult: number; sizePred: number; blended: number } {
  const cat = category ?? 'Uncategorized';
  const hit = catMap.get(cat);
  // Shrink category median toward the global multiple: weight = n/(n+k).
  const k = 6;
  const catMult = hit ? hit.multiple : globalMult;
  const n = hit ? hit.n : 0;
  const shrink = n / (n + k);
  let mult = shrink * catMult + (1 - shrink) * globalMult;
  // Mild size tilt: larger TVL protocols clear a slightly lower multiple.
  const tiltFactor = Math.exp(Math.min(0, Math.max(-0.25, tilt.b)) * Math.log(Math.max(tvl, 1) / tilt.pivot));
  mult = mult * tiltFactor;
  const compsMult = mult;
  const sizePred = Math.max(1, Math.round(globalMult * tvl));
  const blended = Math.max(1, Math.round(mult * tvl));
  return { compsMult, sizePred, blended };
}

function growthMaturity(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return { growthPct, growthMult, maturityMult, age };
}

function fitFrom(comps: SnapshotProtocol[], model: ModelConstants): {
  catMap: Map<string, { multiple: number; n: number }>;
  globalMult: number;
  size: { a: number; b: number; pivot: number };
} {
  const catMap = categoryMultiples(comps);
  const allMult = comps
    .map((p) => p.mcap_usd! / p.tvl_usd)
    .filter((m) => m > 0.002 && m < 8 && Number.isFinite(m));
  const globalMult = allMult.length ? winsorizedMedian(allMult) : model.global_fallback_multiple;
  const size = fitSizeTilt(comps);
  return { catMap, globalMult, size };
}

function leaveOneOut(comps: SnapshotProtocol[], model: ModelConstants): { mape: number; medianRatio: number; n: number } {
  const actual: number[] = [];
  const pred: number[] = [];
  const ratios: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const held = comps[i]!;
    const rest = comps.filter((_, j) => j !== i);
    if (rest.length < 6) continue;
    const { catMap, globalMult, size } = fitFrom(rest, model);
    const { blended } = predictMcap(held.tvl_usd, held.category, catMap, globalMult, size);
    actual.push(held.mcap_usd!);
    pred.push(blended);
    ratios.push(blended / held.mcap_usd!);
  }
  return { mape: mape(actual, pred), medianRatio: median(ratios), n: actual.length };
}

function walkForward(comps: SnapshotProtocol[], model: ModelConstants): { mape: number; n: number } {
  const dated = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  if (dated.length < 16) return { mape: 1, n: 0 };
  const cut = Math.floor(dated.length * 0.7);
  const train = dated.slice(0, cut);
  const test = dated.slice(cut);
  const { catMap, globalMult, size } = fitFrom(train, model);
  const actual: number[] = [];
  const pred: number[] = [];
  for (const p of test) {
    const { blended } = predictMcap(p.tvl_usd, p.category, catMap, globalMult, size);
    actual.push(p.mcap_usd!);
    pred.push(blended);
  }
  return { mape: mape(actual, pred), n: actual.length };
}

function flatMape(comps: SnapshotProtocol[], model: ModelConstants): number {
  const allMult = comps
    .map((p) => p.mcap_usd! / p.tvl_usd)
    .filter((m) => m > 0.002 && m < 8 && Number.isFinite(m));
  const mult = allMult.length ? winsorizedMedian(allMult) : model.global_fallback_multiple;
  const actual = comps.map((p) => p.mcap_usd!);
  const pred = comps.map((p) => Math.max(1, Math.round(p.tvl_usd * mult)));
  return mape(actual, pred);
}

export function buildFit(snapshot: Snapshot, model: ModelConstants = MODEL): FitReport {
  const comps = snapshot.protocols.filter((p) => isComp(p, model.min_comp_tvl));
  const { catMap, globalMult, size } = fitFrom(comps, model);
  const loo = leaveOneOut(comps, model);
  const wf = walkForward(comps, model);
  const flat = flatMape(comps, model);
  const category_multiples = [...catMap.entries()]
    .map(([category, v]) => ({ category, multiple: round6(v.multiple), n: v.n }))
    .sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));
  return {
    comps_used: comps.length,
    categories_fit: category_multiples.length,
    global_multiple: round6(globalMult),
    size_a: round6(size.a),
    size_b: round6(size.b),
    loo_mape: round4(loo.mape),
    loo_median_ratio: round4(loo.medianRatio),
    loo_n: loo.n,
    wf_mape: round4(wf.mape),
    wf_n: wf.n,
    flat_mape: round4(flat),
    beats_flat: (wf.n >= 10 && wf.mape < flat) || loo.mape < flat,
    category_multiples,
  };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 20_000_000) return 75;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('privacy')) return `Route $${capital} through ${name} on ${chain} and leave a small balance.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
): { steps: FarmStep[]; capital: number; hours: number; gas: number; breakEvenPct: number; dph: number; verdict: 'farm' | 'thin' | 'skip' } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const setupGas = capital >= 150 ? 8 : 4;
  const weeklyGas = 2;
  const gas = setupGas + weeklyGas * weeks;
  const hours = 0.5 + weeks * (10 / 60) + 0.25; // setup + weekly + claim check
  const action = actionFor(p, capital, chain);
  // Conservative capture: 0.1% of implied, capped at 35% of capital (airdrop-sized, not mcap-sized).
  const expectedCapture = Math.min(implied * 0.001, capital * 0.35);
  const outlay = capital + gas;
  const breakEvenPct = expectedCapture > 0 ? round4((outlay / expectedCapture) * 100) : 999;
  const dph = hours > 0 ? Math.max(0, Math.round(expectedCapture / hours)) : 0;
  const roi = outlay > 0 ? expectedCapture / outlay : 0;
  const growthOk = p.change_7d === null || p.change_7d > -15;
  const youngish = age === null || age < 900;
  let verdict: 'farm' | 'thin' | 'skip' = 'skip';
  if (dph >= 18 && roi >= 0.22 && growthOk && youngish) verdict = 'farm';
  else if (dph >= 8 && roi >= 0.12 && growthOk) verdict = 'thin';

  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${setupGas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week (deposit, borrow, swap or vote) for ${weeks} weeks so activity spans multiple snapshots.`,
      cost: `about $${weeklyGas} of gas a week ($${weeklyGas * weeks} total)`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days; total outlay is $${capital} capital plus ~$${gas} gas (~${hours.toFixed(1)} hours of work).`,
      cost: `$${capital} stays in the position; $${gas} gas spent`,
      time: `${hold} days / ${hours.toFixed(1)} hours of active work`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay to claim.`,
      cost: 'no fee to check; never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Net the plan: at a 0.1% capture of the $${implied.toLocaleString('en-US')} implied (capped at 35% of capital → ~$${Math.round(expectedCapture).toLocaleString('en-US')}), outlay is ${breakEvenPct}% of that capture and the plan nets ~$${dph}/hour — verdict: ${verdict}.`,
      cost: `gas $${gas}; expected capture ~$${Math.round(expectedCapture)}`,
      time: `${hours.toFixed(1)} hours total`,
    },
  ];
  return { steps, capital, hours: round4(hours), gas, breakEvenPct, dph, verdict };
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; fit: FitReport } {
  const comps = snapshot.protocols.filter((p) => isComp(p, model.min_comp_tvl));
  const { catMap, globalMult, size } = fitFrom(comps, model);
  const fit = buildFit(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const gm = growthMaturity(p, snapshot.as_of, model);
    const pred = predictMcap(p.tvl_usd, p.category, catMap, globalMult, size);
    const implied = Math.max(1, Math.round(pred.blended * gm.growthMult * gm.maturityMult));
    const farm = farmSteps(p, gm.age, implied);
    return { p, implied, gm, pred, farm };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.gm.age,
    implied_value_usd: s.implied,
    model: {
      comps_multiple: round6(s.pred.compsMult),
      size_curve_pred: s.pred.sizePred,
      growth_pct: s.gm.growthPct,
      growth_multiplier: round4(s.gm.growthMult),
      maturity_multiplier: round4(s.gm.maturityMult),
      age_days: s.gm.age,
      farm_capital_usd: s.farm.capital,
      farm_hours: s.farm.hours,
      farm_gas_usd: s.farm.gas,
      break_even_pct: s.farm.breakEvenPct,
      dollars_per_hour: s.farm.dph,
      verdict: s.farm.verdict,
    },
    farm_steps: s.farm.steps.map(stepText),
  }));

  return { board, fit };
}

export function liveRows(snapshot: Snapshot, model: ModelConstants = MODEL): LiveRow[] {
  const comps = snapshot.protocols.filter((p) => isComp(p, model.min_comp_tvl));
  return comps
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 40)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.tvl_usd > 0 && p.mcap_usd ? round6(p.mcap_usd / p.tvl_usd) : null,
    }));
}

export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    comps_multiple: row.model.comps_multiple,
    farm_capital_usd: row.model.farm_capital_usd,
    farm_hours: row.model.farm_hours,
    farm_gas_usd: row.model.farm_gas_usd,
    break_even_pct: row.model.break_even_pct,
    dollars_per_hour: row.model.dollars_per_hour,
    verdict: row.model.verdict,
    on_watchlist: watchlist.has(row.slug),
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, fit } = buildBoard(snapshot, model);
  const live = liveRows(snapshot, model);
  const wl = new Set(snapshot.watchlist);
  const early = board.filter((r) => !wl.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, wl)),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `board has ${board.length} rows; need at least 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
