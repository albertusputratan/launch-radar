// Comps-fitted pre-token valuation. Node 22, standard library only.
// Every input is a field on the sealed snapshot. No protocol is named in the fit.

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

/** Knobs for the curve, the age adjustment, and the farm arithmetic. */
export const CONST = {
  growth_weight: 0.3,
  growth_floor: -40,
  growth_cap: 80,
  maturity_floor: 0.82,
  maturity_span: 0.28,
  maturity_days: 1460,
  unknown_age_days: 400,
  shrink_k: 6,
  min_category_n: 3,
  min_mult: 0.02,
  max_mult: 5,
  min_comp_tvl: 5_000_000,
  elasticity_min: 0.55,
  elasticity_max: 1.05,
  pool_frac: 0.002,
  farmer_scale: 90,
  farmer_power: 0.45,
  farmer_floor: 60,
  weight_base: 40,
  weight_floor: 0.9,
  weight_per_week: 0.025,
  weight_week_cap: 8,
  capture_floor_usd: 80,
  capture_capital_multiple: 3,
  setup_minutes: 20,
  weekly_minutes: 12,
  claim_minutes: 15,
  chain_switch_usd: 8,
  default_setup_usd: 2,
  default_weekly_usd: 0.65,
  farm_dph: 28,
  farm_net_usd: 36,
  farm_growth_floor: -12,
  thin_dph: 10,
  thin_net_usd: 12,
  crash_7d: -30,
  implied_cap: 100_000_000_000_000,
} as const;

export const MODEL_VERSION = "ledger-logmcap-1";

const DAY_MS = 86_400_000;
const VERSIONED = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const EXCHANGES = ["binance", "coinbase", "bybit", "kraken", "bitget", "okx", "bitfinex", "gemini"];
const EXCLUDE_CATEGORY = new Set([
  "Bridge",
  "Canonical Bridge",
  "Cross Chain Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

/** Known gas quotes in USD: [open the position, one later action]. Unknown chains use the mid default. */
const GAS_QUOTE: Record<string, readonly [number, number]> = {
  Ethereum: [14, 4.5],
  Bitcoin: [8, 2.5],
  Tron: [2.2, 0.7],
  Avalanche: [1.5, 0.45],
  Binance: [0.4, 0.12],
  Base: [0.7, 0.22],
  Arbitrum: [0.9, 0.28],
  Optimism: [0.75, 0.24],
  Polygon: [0.35, 0.1],
  Solana: [0.25, 0.08],
  "Hyperliquid L1": [0.5, 0.16],
  Sui: [0.3, 0.1],
  Aptos: [0.3, 0.1],
  Stellar: [0.15, 0.05],
  Monad: [0.6, 0.2],
  Plasma: [0.6, 0.2],
  Linea: [0.8, 0.25],
  Scroll: [0.9, 0.3],
  Blast: [0.5, 0.16],
  Mantle: [0.45, 0.14],
  "zkSync Era": [0.7, 0.22],
  Starknet: [0.8, 0.25],
  Ton: [0.3, 0.1],
  TON: [0.3, 0.1],
  Near: [0.35, 0.12],
  Sei: [0.4, 0.12],
  Sonic: [0.4, 0.12],
  Berachain: [0.5, 0.16],
  Unichain: [0.7, 0.22],
  Celo: [0.3, 0.1],
  Gnosis: [0.2, 0.08],
  Manta: [0.5, 0.16],
  Mode: [0.5, 0.16],
  Fraxtal: [0.6, 0.2],
  Taiko: [0.8, 0.25],
  "World Chain": [0.6, 0.2],
  Ink: [0.6, 0.2],
  Soneium: [0.6, 0.2],
  Katana: [0.7, 0.22],
  Corn: [0.7, 0.22],
  Morph: [0.6, 0.2],
  "Robinhood Chain": [0.7, 0.22],
  Cronos: [0.4, 0.12],
  Fantom: [0.4, 0.12],
  Moonbeam: [0.4, 0.12],
  Aurora: [0.4, 0.12],
  Ronin: [0.3, 0.1],
  "Polygon zkEVM": [0.6, 0.2],
  "Arbitrum Nova": [0.3, 0.1],
  opBNB: [0.25, 0.08],
};

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

interface Effect {
  premium: number;
  n: number;
}

interface Fit {
  a: number;
  b: number;
  scale: number;
  effects: Map<string, Effect>;
  globalMultiple: number;
}

interface ChainChoice {
  chain: string;
  primary: string | null;
  only: boolean;
  known: boolean;
  setup: number;
  weekly: number;
  primarySetup: number;
}

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
  listed_at: string | null;
  age_days: number | null;
  token_status: "pre-token";
  on_watchlist: boolean;
  implied_value_usd: number;
  model: {
    curve_mcap_usd: number;
    fitted_mcap_usd: number;
    fitted_multiple: number;
    category_premium: number;
    category_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    farm_chain: string;
    farm_capital_usd: number;
    farm_gas_usd: number;
    farm_hours: number;
    capture_usd: number;
    net_usd: number;
    dollars_per_hour: number;
    break_even_pct: number;
    verdict: "farm" | "thin" | "skip";
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
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  curve_mcap_usd: number;
  fitted_mcap_usd: number;
  fitted_multiple: number;
  category_premium: number;
  category_n: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_chain: string;
  farm_chain_note: string;
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_hours: number;
  farm_setup_usd: number;
  farm_weekly_usd: number;
  farm_weeks: number;
  farm_hold_days: number;
  capture_usd: number;
  capture_capped: boolean;
  active_farmers: number;
  position_weight: number;
  pool_usd: number;
  net_usd: number;
  dollars_per_hour: number;
  break_even_pct: number;
  verdict: "farm" | "thin" | "skip";
  verdict_reason: string;
  steps: FarmStep[];
}

export interface CompRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
  predicted_mcap_usd: number;
  error_pct: number;
}

export interface FitReport {
  comps_used: number;
  comps_excluded: number;
  categories_fit: number;
  size_a: number;
  size_b: number;
  scale: number;
  global_multiple: number;
  raw_median_multiple: number;
  loo_mape: number;
  loo_flat_mape: number;
  loo_median_ratio: number;
  loo_n: number;
  wf_mape: number;
  wf_flat_mape: number;
  wf_n: number;
  beats_flat: boolean;
  categories: { category: string; n: number; premium: number; multiple_at_100m: number }[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: typeof CONST;
  blurb: string;
  note: string;
  assumptions: string;
  fit: FitReport;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  verdicts: { farm: number; thin: number; skip: number };
  rows: RadarRow[];
  comps: CompRow[];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dollars(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(CONST.implied_cap, Math.max(1, Math.round(n)));
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 10_000) return `${sign}$${String(Math.round(a)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  if (a >= 1 && Math.abs(a - Math.round(a)) < 0.001) return `${sign}$${Math.round(a)}`;
  return `${sign}$${a.toFixed(2)}`;
}

function pctText(frac: number): string {
  return `${Math.round(frac * 1000) / 10}%`;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null || !/^\d{4}-\d{2}-\d{2}$/.test(listedAt)) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function derivativeName(name: string): boolean {
  const low = name.toLowerCase();
  const words = low.split(/[^a-z0-9]+/);
  if (words.some((w) => w === "wrapped" || w === "staked" || w === "staking")) return true;
  if (VERSIONED.test(name)) return true;
  return EXCHANGES.some((e) => low.startsWith(e));
}

function excludedCategory(category: string | null): boolean {
  return category !== null && EXCLUDE_CATEGORY.has(category);
}

/** A pre-token book that is not a wrapped, bridged, staked, or exchange product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (excludedCategory(p.category)) return false;
  if (derivativeName(p.name)) return false;
  return true;
}

function isComp(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || !(p.mcap_usd > 0) || !(p.tvl_usd >= CONST.min_comp_tvl)) return false;
  if (excludedCategory(p.category)) return false;
  if (derivativeName(p.name)) return false;
  const mult = p.mcap_usd / p.tvl_usd;
  return mult >= CONST.min_mult && mult <= CONST.max_mult;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function winsorizedMedian(values: number[]): number {
  if (values.length < 5) return median(values);
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor((sorted.length - 1) * 0.1)]!;
  const hi = sorted[Math.ceil((sorted.length - 1) * 0.9)]!;
  return median(sorted.map((v) => Math.min(hi, Math.max(lo, v))));
}

function medianAbsPct(actual: number[], pred: number[]): number {
  const errors: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!;
    const p = pred[i]!;
    if (a > 0 && p > 0) errors.push(Math.abs(a - p) / a);
  }
  return errors.length === 0 ? 1 : median(errors);
}

function catKey(category: string | null): string {
  return category ?? "Uncategorized";
}

/** log(mcap) = a + b·log(TVL), then a shrunk category premium and a median scale. */
function fitComps(comps: SnapshotProtocol[]): Fit {
  const n = comps.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of comps) {
    const x = Math.log(p.tvl_usd);
    const y = Math.log(p.mcap_usd!);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const den = n * sxx - sx * sx;
  let b = Math.abs(den) < 1e-9 || n < 8 ? 1 : (n * sxy - sx * sy) / den;
  if (!Number.isFinite(b)) b = 1;
  b = Math.min(CONST.elasticity_max, Math.max(CONST.elasticity_min, b));
  const a = n > 0 ? (sy - b * sx) / n : 0;
  const curveMultiple = (tvl: number): number => Math.exp(a) * Math.pow(Math.max(tvl, 1), b - 1);

  const buckets = new Map<string, number[]>();
  for (const p of comps) {
    const rel = p.mcap_usd! / p.tvl_usd / curveMultiple(p.tvl_usd);
    if (!Number.isFinite(rel) || rel <= 0) continue;
    const key = catKey(p.category);
    const arr = buckets.get(key) ?? [];
    arr.push(rel);
    buckets.set(key, arr);
  }
  const effects = new Map<string, Effect>();
  for (const [key, arr] of buckets) {
    if (arr.length < CONST.min_category_n) continue;
    const raw = winsorizedMedian(arr);
    const w = arr.length / (arr.length + CONST.shrink_k);
    effects.set(key, { premium: (1 - w) * 1 + w * raw, n: arr.length });
  }

  const uncal = (tvl: number, category: string | null): number => {
    const effect = effects.get(catKey(category));
    const premium = effect ? effect.premium : 1;
    return Math.max(tvl, 1) * curveMultiple(tvl) * premium;
  };
  const ratios = comps.map((p) => uncal(p.tvl_usd, p.category) / p.mcap_usd!);
  const mid = median(ratios.filter((v) => Number.isFinite(v) && v > 0));
  const scale = mid > 0 ? r6(1 / mid) : 1;
  const multiples = comps.map((p) => p.mcap_usd! / p.tvl_usd);
  return { a, b, scale, effects, globalMultiple: winsorizedMedian(multiples) };
}

function predictRaw(tvl: number, category: string | null, fit: Fit): { curve: number; fitted: number; premium: number; n: number } {
  const curve = Math.exp(fit.a) * Math.pow(Math.max(tvl, 1), fit.b);
  const effect = fit.effects.get(catKey(category));
  const premium = effect ? effect.premium : 1;
  const n = effect ? effect.n : 0;
  const fitted = curve * premium * fit.scale;
  return { curve, fitted, premium, n };
}

function predictMcap(tvl: number, category: string | null, fit: Fit): number {
  return Math.max(1, predictRaw(tvl, category, fit).fitted);
}

function flatMultiple(comps: SnapshotProtocol[]): number {
  const multiples = comps.map((p) => p.mcap_usd! / p.tvl_usd).filter((m) => Number.isFinite(m) && m > 0);
  return multiples.length ? winsorizedMedian(multiples) : 0.2;
}

function leaveOneOut(comps: SnapshotProtocol[]): { mape: number; flat: number; ratio: number; n: number } {
  const actual: number[] = [];
  const pred: number[] = [];
  const flatPred: number[] = [];
  const ratios: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const held = comps[i]!;
    const rest = comps.filter((_, j) => j !== i);
    if (rest.length < 8) continue;
    const fit = fitComps(rest);
    const hat = predictMcap(held.tvl_usd, held.category, fit);
    const flat = Math.max(1, held.tvl_usd * flatMultiple(rest));
    actual.push(held.mcap_usd!);
    pred.push(hat);
    flatPred.push(flat);
    ratios.push(hat / held.mcap_usd!);
  }
  return {
    mape: medianAbsPct(actual, pred),
    flat: medianAbsPct(actual, flatPred),
    ratio: ratios.length ? median(ratios) : 1,
    n: actual.length,
  };
}

function walkForward(comps: SnapshotProtocol[]): { mape: number; flat: number; n: number } {
  const dated = comps
    .filter((p) => p.listed_at !== null && /^\d{4}-\d{2}-\d{2}$/.test(p.listed_at))
    .sort((a, b) => cmpStr(a.listed_at!, b.listed_at!) || cmpStr(a.slug, b.slug));
  if (dated.length < 16) return { mape: 1, flat: 1, n: 0 };
  const cut = Math.floor(dated.length * 0.7);
  const train = dated.slice(0, cut);
  const test = dated.slice(cut);
  if (train.length < 8 || test.length === 0) return { mape: 1, flat: 1, n: 0 };
  const fit = fitComps(train);
  const flat = flatMultiple(train);
  const actual: number[] = [];
  const pred: number[] = [];
  const flatPred: number[] = [];
  for (const p of test) {
    actual.push(p.mcap_usd!);
    pred.push(predictMcap(p.tvl_usd, p.category, fit));
    flatPred.push(Math.max(1, p.tvl_usd * flat));
  }
  return { mape: medianAbsPct(actual, pred), flat: medianAbsPct(actual, flatPred), n: actual.length };
}

function quoteGas(chain: string): { setup: number; weekly: number; known: boolean } {
  const hit = GAS_QUOTE[chain];
  if (hit) return { setup: hit[0], weekly: hit[1], known: true };
  return { setup: CONST.default_setup_usd, weekly: CONST.default_weekly_usd, known: false };
}

function monthScore(setup: number, weekly: number): number {
  return setup + 4 * weekly;
}

function pickChain(chains: string[]): ChainChoice {
  if (chains.length === 0) {
    return {
      chain: "the home chain",
      primary: null,
      only: true,
      known: false,
      setup: CONST.default_setup_usd,
      weekly: CONST.default_weekly_usd,
      primarySetup: CONST.default_setup_usd,
    };
  }
  const primary = chains[0]!;
  const primaryQuote = quoteGas(primary);
  const primaryScore = monthScore(primaryQuote.setup, primaryQuote.weekly);
  let best = primary;
  let bestQuote = primaryQuote;
  let bestScore = primaryScore;
  for (let i = 1; i < chains.length; i++) {
    const name = chains[i]!;
    const q = quoteGas(name);
    const score = monthScore(q.setup, q.weekly);
    if (primaryScore - score >= CONST.chain_switch_usd && score < bestScore) {
      best = name;
      bestQuote = q;
      bestScore = score;
    }
  }
  return {
    chain: best,
    primary,
    only: chains.length === 1,
    known: bestQuote.known,
    setup: r2(bestQuote.setup),
    weekly: r2(bestQuote.weekly),
    primarySetup: r2(primaryQuote.setup),
  };
}

function chainNote(choice: ChainChoice): string {
  const open = money(choice.setup);
  if (choice.primary === null) {
    return `The snapshot names no chain, so the plan uses the mid gas quote of ${open} to open and ${money(choice.weekly)} a week.`;
  }
  if (!choice.known) {
    return `${choice.chain} has no specific gas quote, so the plan uses the mid default of ${open} to open and ${money(choice.weekly)} a week.`;
  }
  if (choice.only) return `${choice.chain} is the only chain listed, at about ${open} to open the position.`;
  if (choice.chain === choice.primary) {
    return `${choice.chain} is the first chain listed. Another chain would not save $${CONST.chain_switch_usd} over a month, so the plan stays there (about ${open} to open).`;
  }
  return `The first chain listed is ${choice.primary} (about ${money(choice.primarySetup)} to open). The plan uses ${choice.chain} instead, saving at least $${CONST.chain_switch_usd} over a month (about ${open} to open).`;
}

function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 200;
  if (tvl >= 250_000_000) return 120;
  if (tvl >= 80_000_000) return 80;
  if (tvl >= 20_000_000) return 50;
  return 35;
}

function holdDays(age: number | null): number {
  if (age === null) return 28;
  if (age < 180) return 56;
  if (age < 540) return 42;
  return 28;
}

function positionSentence(p: SnapshotProtocol, capital: number, choice: ChainChoice): string {
  const usd = money(capital);
  const name = p.name;
  const chain = choice.chain;
  const c = (p.category ?? "").toLowerCase();
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral")) {
    return `Supply ${usd} of USDC to ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes("dex") || c.includes("liquidity")) {
    return `Add ${usd} of balanced liquidity to the deepest ${name} pool on ${chain} and keep the LP receipt.`;
  }
  if (c.includes("yield") || c.includes("farm") || c.includes("leveraged")) {
    return `Deposit ${usd} into the main ${name} yield vault on ${chain} and keep the shares.`;
  }
  if (c.includes("curator") || c.includes("allocator") || c.includes("risk")) {
    return `Deposit ${usd} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (c.includes("basis") || c.includes("perpetual") || c.includes("derivative")) {
    return `Post ${usd} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes("prediction")) return `Fund ${name} with ${usd} on ${chain} and take one market position.`;
  if (c.includes("stable") || c.includes("cdp")) return `Mint or deposit ${usd} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes("rwa")) return `Buy ${usd} of the ${name} yield asset on ${chain} and hold the position.`;
  if (c.includes("insur")) return `Buy ${usd} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes("privacy")) return `Route ${usd} through ${name} on ${chain} and leave a small balance in the app.`;
  if (c.includes("staking") || c.includes("restak")) {
    return `Stake ${usd} of the chain asset through ${name} on ${chain} and keep the receipt.`;
  }
  if (c.includes("bridge")) return `Bridge ${usd} of USDC with ${name} onto ${chain} and use the funds in its app.`;
  if (c.includes("launch")) return `Commit ${usd} to one open ${name} sale or pool on ${chain} and keep the receipt.`;
  return `Deposit ${usd} of USDC into ${name} on ${chain} and keep the position open.`;
}

function activeFarmers(tvl: number): number {
  const ratio = Math.max(tvl, 1_000_000) / 1_000_000;
  return Math.max(CONST.farmer_floor, Math.round(CONST.farmer_scale * Math.pow(ratio, CONST.farmer_power)));
}

function decide(
  dph: number,
  net: number,
  change: number | null,
): { verdict: "farm" | "thin" | "skip"; reason: string } {
  if (change !== null && change <= CONST.crash_7d) {
    return {
      verdict: "skip",
      reason: `Seven-day TVL is ${change.toFixed(1)}%, past ${CONST.crash_7d}%, so the plan skips until the book stabilizes.`,
    };
  }
  const soft = change !== null && change <= CONST.farm_growth_floor;
  if (dph >= CONST.farm_dph && net >= CONST.farm_net_usd && !soft) {
    return {
      verdict: "farm",
      reason: `Net is about $${dph} an hour after gas (${money(net)} over the work), and seven-day TVL is not below ${CONST.farm_growth_floor}%.`,
    };
  }
  if (dph >= CONST.thin_dph && net >= CONST.thin_net_usd) {
    return {
      verdict: "thin",
      reason: `Net is about $${dph} an hour after gas, enough for a small position, short of the $${CONST.farm_dph} an hour farm line.`,
    };
  }
  if (net < CONST.thin_net_usd) {
    return {
      verdict: "skip",
      reason: `After gas the position nets ${money(net)}, under the $${CONST.thin_net_usd} thin line.`,
    };
  }
  return {
    verdict: "skip",
    reason: `About $${dph} an hour after gas, under the $${CONST.thin_dph} an hour thin line.`,
  };
}

export function joinStep(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`.replace(/\s+/g, " ").trim();
  if (s.length > 600) s = `${s.slice(0, 596).trimEnd()}...`;
  if (s.length < 20) s = `${s} Hold the position and re-check the protocol site.`;
  return s;
}

function growthOf(change: number | null): { pct: number; mult: number } {
  const pct = Math.min(CONST.growth_cap, Math.max(CONST.growth_floor, finite(change, 0)));
  return { pct: r4(pct), mult: r4(1 + (pct / 100) * CONST.growth_weight) };
}

function maturityOf(age: number | null): number {
  const days = age ?? CONST.unknown_age_days;
  const t = Math.min(Math.max(days, 0), CONST.maturity_days) / CONST.maturity_days;
  return r4(CONST.maturity_floor + CONST.maturity_span * t);
}

interface Scored {
  protocol: SnapshotProtocol;
  onWatchlist: boolean;
  age: number | null;
  row: RadarRow;
  board: Omit<BoardRow, "rank" | "farm_steps"> & { steps: FarmStep[] };
}

function scoreProtocol(p: SnapshotProtocol, asOf: string, fit: Fit, onWatchlist: boolean): Scored {
  const age = ageDays(asOf, p.listed_at);
  const raw = predictRaw(p.tvl_usd, p.category, fit);
  const growth = growthOf(p.change_7d);
  const maturity = maturityOf(age);
  const implied = dollars(raw.fitted * growth.mult * maturity);
  const choice = pickChain(p.chains);
  const note = chainNote(choice);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDays(age);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const setup = choice.setup;
  const weekly = choice.weekly;
  const gas = r2(setup + weekly * weeks);
  const hours = r2((CONST.setup_minutes + weeks * CONST.weekly_minutes + CONST.claim_minutes) / 60);
  const farmers = activeFarmers(p.tvl_usd);
  const pool = r2(implied * CONST.pool_frac);
  const weight = r4(Math.sqrt(capital / CONST.weight_base) * (CONST.weight_floor + Math.min(weeks, CONST.weight_week_cap) * CONST.weight_per_week));
  const ceiling = Math.max(CONST.capture_floor_usd, capital * CONST.capture_capital_multiple);
  const rawCapture = farmers > 0 ? (pool / farmers) * weight : 0;
  const capped = rawCapture > ceiling;
  const capture = r2(Math.min(ceiling, Math.max(0, rawCapture)));
  const net = r2(capture - gas);
  const dph = hours > 0 ? Math.round(net / hours) : 0;
  const breakEven = capture > 0 ? r2((gas / capture) * 100) : 999;
  const decision = decide(dph, net, p.change_7d);
  const curve = dollars(raw.curve);
  const fitted = dollars(raw.fitted);
  const multiple = p.tvl_usd > 0 ? r6(fitted / p.tvl_usd) : 0;

  const farmerLabel = String(farmers).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const steps: FarmStep[] = [
    {
      text: `Open a new wallet that will only farm ${p.name}. Fund it with ${money(capital)} plus gas, and keep the seed phrase offline.`,
      cost: "wallet software is free; the funding transfer is usually under $1",
      time: "5 minutes",
    },
    {
      text: `${positionSentence(p, capital, choice)} ${note}`,
      cost: `${money(capital)} stays in the position and can be withdrawn; about ${money(setup)} of gas is spent to open it`,
      time: `${CONST.setup_minutes} minutes`,
    },
    {
      text: `Once a week for ${weeks} weeks, send one small transaction on ${choice.chain} (a swap, a claim, or a vote) so the wallet is active on ${weeks} separate weeks.`,
      cost: `about ${money(weekly)} of gas a week, ${money(r2(weekly * weeks))} across ${weeks} weeks`,
      time: `${CONST.weekly_minutes} minutes a week`,
    },
    {
      text: `Leave the position open for ${hold} days. ${money(capital)} is locked and comes back when you exit; the ${money(gas)} of gas does not. Active work is about ${hours.toFixed(2)} hours.`,
      cost: `${money(gas)} of gas spent, ${money(capital)} of capital returned on exit`,
      time: `${hold} days on the clock, ${hours.toFixed(2)} hours of work`,
    },
    {
      text: `Save each transaction hash. When you exit, claim points only on the site ${p.name} publishes. Do not send funds to a claim page that arrives in a message.`,
      cost: "reading the claim page is free; never pay a fee to claim",
      time: `${CONST.claim_minutes} minutes`,
    },
    {
      text: `Modeled capture is ${money(capture)}${capped ? " after the cap" : ""}: ${(CONST.pool_frac * 100).toFixed(2)}% of the ${money(implied)} implied value (${money(pool)} pool) split across ${farmerLabel} active wallets, times a ${weight.toFixed(2)} weight. Gas of ${money(gas)} is ${breakEven}% of that capture. Net ${money(net)}, about $${dph} an hour. Verdict: ${decision.verdict}. ${decision.reason}`,
      cost: `${money(gas)} of gas against ${money(capture)} modeled capture`,
      time: `${hours.toFixed(2)} hours`,
    },
  ];

  const row: RadarRow = {
    rank: 0,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: age,
    on_watchlist: onWatchlist,
    implied_value_usd: implied,
    curve_mcap_usd: curve,
    fitted_mcap_usd: fitted,
    fitted_multiple: multiple,
    category_premium: r4(raw.premium),
    category_n: raw.n,
    growth_pct: growth.pct,
    growth_multiplier: growth.mult,
    maturity_multiplier: maturity,
    farm_chain: choice.chain,
    farm_chain_note: note,
    farm_capital_usd: capital,
    farm_gas_usd: gas,
    farm_hours: hours,
    farm_setup_usd: setup,
    farm_weekly_usd: weekly,
    farm_weeks: weeks,
    farm_hold_days: hold,
    capture_usd: capture,
    capture_capped: capped,
    active_farmers: farmers,
    position_weight: weight,
    pool_usd: pool,
    net_usd: net,
    dollars_per_hour: dph,
    break_even_pct: breakEven,
    verdict: decision.verdict,
    verdict_reason: decision.reason,
    steps,
  };

  return {
    protocol: p,
    onWatchlist,
    age,
    row,
    board: {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      token_status: "pre-token",
      on_watchlist: onWatchlist,
      implied_value_usd: implied,
      model: {
        curve_mcap_usd: curve,
        fitted_mcap_usd: fitted,
        fitted_multiple: multiple,
        category_premium: r4(raw.premium),
        category_n: raw.n,
        growth_pct: growth.pct,
        growth_multiplier: growth.mult,
        maturity_multiplier: maturity,
        farm_chain: choice.chain,
        farm_capital_usd: capital,
        farm_gas_usd: gas,
        farm_hours: hours,
        capture_usd: capture,
        net_usd: net,
        dollars_per_hour: dph,
        break_even_pct: breakEven,
        verdict: decision.verdict,
      },
      steps,
    },
  };
}

function buildFitReport(snapshot: Snapshot, comps: SnapshotProtocol[], fit: Fit): FitReport {
  const loo = leaveOneOut(comps);
  const wf = walkForward(comps);
  const liveWithMcap = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length;
  const categories = [...fit.effects.entries()]
    .map(([category, effect]) => ({
      category,
      n: effect.n,
      premium: r4(effect.premium),
      multiple_at_100m: r6(predictMcap(100_000_000, category, fit) / 100_000_000),
    }))
    .sort((a, b) => b.n - a.n || cmpStr(a.category, b.category));
  return {
    comps_used: comps.length,
    comps_excluded: liveWithMcap - comps.length,
    categories_fit: categories.length,
    size_a: r6(fit.a),
    size_b: r6(fit.b),
    scale: fit.scale,
    global_multiple: r6(predictMcap(100_000_000, null, fit) / 100_000_000),
    raw_median_multiple: r6(fit.globalMultiple),
    loo_mape: r4(loo.mape),
    loo_flat_mape: r4(loo.flat),
    loo_median_ratio: r4(loo.ratio),
    loo_n: loo.n,
    wf_mape: r4(wf.mape),
    wf_flat_mape: r4(wf.flat),
    wf_n: wf.n,
    beats_flat: wf.n >= 8 && wf.mape < wf.flat && loo.mape <= loo.flat,
    categories,
  };
}

function buildNote(fit: FitReport): { blurb: string; note: string; assumptions: string } {
  const beat = fit.beats_flat
    ? "The curve beats a flat multiple on both checks."
    : "A flat multiple is closer on at least one check.";
  const blurb = `Fitted on ${fit.comps_used} live comps. Market cap scales as TVL^${fit.size_b}. Leave-one-out error ${pctText(fit.loo_mape)} versus ${pctText(fit.loo_flat_mape)} flat. Walk-forward ${pctText(fit.wf_mape)} versus ${pctText(fit.wf_flat_mape)} flat. ${beat}`;
  const note = [
    "Implied value is the fitted market cap times a growth factor times a maturity factor.",
    `The fit is log market cap on log TVL (elasticity ${fit.size_b}) plus a category premium shrunk toward 1 with weight n/(n+${CONST.shrink_k}), estimated on ${fit.comps_used} tokens that already trade, with a market-cap multiple between ${CONST.min_mult} and ${CONST.max_mult}.`,
    `${fit.comps_excluded} other tokens with a market cap are left out of the fit (bridge, liquid staking, restaking, CEX, wrapped or staked names, or a multiple outside that band).`,
    `Predictions are scaled by ${fit.scale} so the median training comp matches its own market cap.`,
    `Growth is 1 + ${CONST.growth_weight} times the seven-day TVL change clipped to [${CONST.growth_floor}%, ${CONST.growth_cap}%]. A missing change counts as zero.`,
    `Maturity runs from ${CONST.maturity_floor} on the listing day to ${r4(CONST.maturity_floor + CONST.maturity_span)} after ${CONST.maturity_days} days. An unknown listing date uses ${CONST.unknown_age_days} days.`,
    `Leave-one-out median absolute error is ${pctText(fit.loo_mape)} on ${fit.loo_n} comps, against ${pctText(fit.loo_flat_mape)} for a flat multiple. Median predicted/actual is ${fit.loo_median_ratio}.`,
    `Walk-forward trains on protocols DefiLlama listed earlier and scores the ones it listed later: ${pctText(fit.wf_mape)} versus ${pctText(fit.wf_flat_mape)} flat (n=${fit.wf_n}).`,
    beat,
    "The board ranks protocols whose record has no token. Tokens that already trade are the comps, and they are not ranked.",
  ].join(" ");
  const assumptions = `Pool = ${(CONST.pool_frac * 100).toFixed(2)}% of implied value ÷ max(${CONST.farmer_floor}, ${CONST.farmer_scale}×(TVL/$1M)^${CONST.farmer_power}) × sqrt(capital/$${CONST.weight_base}) × (${CONST.weight_floor} + ${CONST.weight_per_week}×weeks), capped at max(${money(CONST.capture_floor_usd)}, ${CONST.capture_capital_multiple}× capital). Capital is returned; gas is the cost. Farm is at least $${CONST.farm_dph}/hour and $${CONST.farm_net_usd} net, with 7-day TVL above ${CONST.farm_growth_floor}%. Thin is at least $${CONST.thin_dph}/hour and $${CONST.thin_net_usd} net. A ${CONST.crash_7d}% week is a skip. This does not say a token will be issued.`;
  return { blurb, note, assumptions };
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comps = snapshot.protocols.filter(isComp);
  const fit = fitComps(comps);
  const report = buildFitReport(snapshot, comps, fit);
  const copy = buildNote(report);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen: SnapshotProtocol[] = [];
  const seen = new Set<string>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && !seen.has(slug)) {
      chosen.push(p);
      seen.add(slug);
    }
  }
  const extras = snapshot.protocols.filter((p) => !seen.has(p.slug) && isRankable(p));
  extras.sort((a, b) => cmpStr(a.slug, b.slug));
  for (const p of extras) chosen.push(p);

  const scored = chosen.map((p) => scoreProtocol(p, snapshot.as_of, fit, watch.has(p.slug)));
  scored.sort((a, b) => b.row.implied_value_usd - a.row.implied_value_usd || cmpStr(a.row.slug, b.row.slug));

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.board.slug,
    name: s.board.name,
    category: s.board.category,
    chains: s.board.chains,
    tvl_usd: s.board.tvl_usd,
    change_7d: s.board.change_7d,
    listed_at: s.board.listed_at,
    age_days: s.board.age_days,
    token_status: "pre-token",
    on_watchlist: s.board.on_watchlist,
    implied_value_usd: s.board.implied_value_usd,
    model: s.board.model,
    farm_steps: s.board.steps.map(joinStep),
  }));

  const rows: RadarRow[] = scored.map((s, i) => ({ ...s.row, rank: i + 1 }));
  const verdicts = { farm: 0, thin: 0, skip: 0 };
  for (const row of rows) verdicts[row.verdict] += 1;

  const compRows: CompRow[] = comps
    .map((p) => {
      const predicted = dollars(predictMcap(p.tvl_usd, p.category, fit));
      const error = p.mcap_usd! > 0 ? r2(((predicted - p.mcap_usd!) / p.mcap_usd!) * 100) : 0;
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd!,
        multiple: r6(p.mcap_usd! / p.tvl_usd),
        predicted_mcap_usd: predicted,
        error_pct: error,
      };
    })
    .sort((a, b) => b.tvl_usd - a.tvl_usd || cmpStr(a.slug, b.slug));

  const early = rows.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: CONST,
    blurb: copy.blurb,
    note: copy.note,
    assumptions: copy.assumptions,
    fit: report,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: early,
    verdicts,
    rows,
    comps: compRows,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError("snapshot.json is not JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new SnapshotError("snapshot.json is not an object");
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError("snapshot.json has no as_of date");
  if (typeof o.source !== "string" || o.source.length === 0) throw new SnapshotError("snapshot.json has no source");
  if (typeof o.floor_usd !== "number" || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError("snapshot.json has no floor_usd");
  if (!Array.isArray(o.protocols)) throw new SnapshotError("snapshot.json has no protocols array");
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== "string")) throw new SnapshotError("snapshot.json has no watchlist");
  const protocols: SnapshotProtocol[] = o.protocols.map((value, i) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = value as Record<string, unknown>;
    if (typeof p.slug !== "string" || p.slug.length === 0 || /\s/.test(p.slug)) throw new SnapshotError(`protocol ${i} has a bad slug`);
    if (typeof p.name !== "string" || p.name.length === 0) throw new SnapshotError(`protocol ${i} has no name`);
    if (typeof p.tvl_usd !== "number" || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`protocol ${i} has no TVL`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === "string" ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === "string") : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === "number" && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === "number" && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === "string" ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === "string" ? p.gecko_id : null,
      symbol: typeof p.symbol === "string" ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const ranks: number[] = [];
  for (const row of board) {
    if (!known.has(row.slug)) return `${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `duplicate slug ${row.slug}`;
    seen.add(row.slug);
    if (typeof row.name !== "string" || row.name.length === 0) return `${row.slug} has no name`;
    if (!Number.isSafeInteger(row.rank) || row.rank <= 0) return `${row.slug} has rank ${row.rank}`;
    ranks.push(row.rank);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > CONST.implied_cap) {
      return `${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${row.slug} has a farm step of ${trimmed.length} characters`;
    }
  }
  const missing = snapshot.watchlist.filter((slug) => !seen.has(slug));
  if (missing.length > 0) return `missing watchlist slugs: ${missing.slice(0, 5).join(", ")}`;
  const ordered = [...ranks].sort((a, b) => a - b);
  for (let i = 0; i < ordered.length; i++) if (ordered[i] !== i + 1) return `rank ${i + 1} is missing`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${i + 1} outranks rank ${i}`;
  }
  if (byRank.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return "every row has the same implied value";
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
