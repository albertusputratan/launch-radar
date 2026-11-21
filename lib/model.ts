// Dual launch model. Node 22, standard library only.
// Implied value = (what a token would be worth if the record stayed as it is) × (the peers' token odds).
// Every coefficient is fit on this snapshot and kept only when it lowers both held-out misses.
// No protocol is priced by name. The only names in the rules are the house's exchange prefixes.

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

export const MODEL_VERSION = "dual-odds-2-re2";

/** Knobs the page reads back from data.js and uses for the same arithmetic. */
export const ECON = {
  tbill: 0.04,
  farm_dph: 60,
  crash: -30,
  /** Ceiling of the published plan. Each row uses 0.02% of its TVL, floored and capped. */
  deposit: 10_000,
  deposit_floor: 1_000,
  deposit_frac: 0.0002,
  share: 0.1,
  weeks: 12,
  shrink_k: 12,
  min_cat_n: 4,
  fam_k: 16,
  min_multiple: 0.03,
  max_multiple: 12,
  receipt_band: 0.02,
  keep_miss: 0.01,
  keep_brier: 0.001,
  boot: 64,
  age_unknown: 400,
  age_clamp: [0.75, 1.3] as const,
  implied_cap: 100_000_000_000_000,
};

const DAY_MS = 86_400_000;
const VERSIONED = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
const WRAPPED = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGES = /^(?:binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
const BRIDGE = new Set(["Bridge", "Canonical Bridge", "Cross Chain Bridge"]);
const LST = new Set(["Liquid Staking", "Liquid Restaking", "Restaked BTC"]);

/** [gas per transaction, exchange withdrawal], USD. Unknown chains use GAS_DEFAULT. */
export const GAS: Record<string, readonly [number, number]> = {
  Ethereum: [2.5, 5],
  Bitcoin: [1.2, 2],
  Tron: [0.8, 1.2],
  Binance: [0.08, 0.3],
  Avalanche: [0.08, 0.5],
  Polygon: [0.02, 0.3],
  Solana: [0.01, 0.8],
  Sui: [0.01, 0.5],
  Aptos: [0.01, 0.5],
  Base: [0.04, 0.5],
  Arbitrum: [0.04, 0.5],
  Optimism: [0.04, 0.5],
  Scroll: [0.05, 0.6],
  Linea: [0.05, 0.6],
  Blast: [0.04, 0.5],
  Mantle: [0.04, 0.5],
  "zkSync Era": [0.05, 0.6],
  Starknet: [0.06, 0.7],
  Monad: [0.03, 0.8],
  "Hyperliquid L1": [0.02, 0.8],
  Ink: [0.04, 0.8],
  Unichain: [0.04, 0.6],
  Berachain: [0.05, 0.7],
  Sonic: [0.04, 0.5],
  Sei: [0.03, 0.5],
  Ton: [0.05, 0.4],
  TON: [0.05, 0.4],
  Near: [0.03, 0.4],
  Celo: [0.03, 0.4],
  Gnosis: [0.02, 0.4],
  Plasma: [0.04, 0.6],
  Manta: [0.04, 0.5],
  Mode: [0.04, 0.5],
  Fraxtal: [0.04, 0.5],
  Taiko: [0.05, 0.6],
};

export const GAS_DEFAULT: readonly [number, number] = [0.06, 1.1];

export const PLAYS: Record<string, { label: string; txIn: number; txWeek: number; txOut: number; minIn: number; minWeek: number; minOut: number }> = {
  vault: { label: "Vault deposit", txIn: 2, txWeek: 0, txOut: 1, minIn: 15, minWeek: 5, minOut: 12 },
  lend: { label: "Supply and borrow", txIn: 3, txWeek: 0, txOut: 2, minIn: 18, minWeek: 5, minOut: 12 },
  lp: { label: "Pool liquidity", txIn: 3, txWeek: 1, txOut: 1, minIn: 18, minWeek: 8, minOut: 12 },
  perp: { label: "Margin", txIn: 2, txWeek: 1, txOut: 1, minIn: 15, minWeek: 8, minOut: 10 },
  rwa: { label: "Tokenised asset", txIn: 2, txWeek: 0, txOut: 1, minIn: 20, minWeek: 5, minOut: 12 },
  stake: { label: "Stake", txIn: 2, txWeek: 0, txOut: 1, minIn: 15, minWeek: 5, minOut: 12 },
  use: { label: "Use the app", txIn: 2, txWeek: 1, txOut: 1, minIn: 15, minWeek: 6, minOut: 10 },
};

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
  tier: string;
  verdict: "farm" | "thin" | "skip";
}

interface Factor {
  name: string;
  mult: number;
  used: boolean;
}

interface RadarRow {
  rank: number;
  rank_lo: number;
  rank_hi: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  tier: "watchlist" | "early" | "off-list";
  on_watchlist: boolean;
  g: number;
  ox: number[];
  curve: number;
  factors: Factor[];
  value_if_usd: number;
  odds: number;
  implied_value_usd: number;
  implied_lo: number;
  implied_hi: number;
  play: string;
  farm_chain: string;
  plan: {
    deposit: number;
    share: number;
    weeks: number;
    capture: number;
    fees: number;
    hours: number;
    net: number;
    tbill: number;
    dph: number;
    verdict: "farm" | "thin" | "skip";
  };
  steps: string[];
}

interface TermRow {
  name: string;
  loo: number;
  wf: number;
  kept: boolean;
  note: string;
}

interface OddsTerm {
  name: string;
  cv: number;
  wf: number;
  kept: boolean;
  note: string;
}

interface VComp {
  slug: string;
  cat: string;
  tvl: number;
  mcap: number;
  x: number;
  ly: number;
  g: number;
  age: number | null;
  listed: string;
  chains: number;
  placebo: number;
}

interface Peer {
  slug: string;
  cat: string;
  y: number;
  tvl: number;
  g: number;
  age: number | null;
  listed: string;
  chains: number;
  placebo: number;
  ltvl: number;
  lage: number;
  chf: number;
}

interface VSpec {
  cat: boolean;
  growth: boolean;
  age: boolean;
  chains: boolean;
  placebo: boolean;
}

interface OSpec {
  age: boolean;
  fam: boolean;
  tvl: boolean;
  growth: boolean;
  chains: boolean;
  placebo: boolean;
}

interface VFit {
  flat: number | null;
  a: number;
  b: number;
  scale: number;
  cat: Map<string, number>;
  gCoef: number;
  gMean: number;
  ageCoef: number;
  ageRef: number;
  chCoef: number;
  chMean: number;
  plCoef: number;
  plMean: number;
  spec: VSpec;
}

const EMPTY_SPEC: VSpec = { cat: false, growth: false, age: false, chains: false, placebo: false };
const EMPTY_ODDS: OSpec = { age: false, fam: false, tvl: false, growth: false, chains: false, placebo: false };

const log10 = (x: number): number => Math.log(x) / Math.LN10;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const c2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = (s.length - 1) / 2;
  return (s[Math.floor(m)]! + s[Math.ceil(m)]!) / 2;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo]!;
  return s[lo]! * (hi - idx) + s[hi]! * (idx - lo);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
  }
  const den = n * sxx - sx * sx;
  const b = Math.abs(den) < 1e-9 ? 1 : (n * sxy - sx * sy) / den;
  return { a: n ? (sy - b * sx) / n : 0, b: Number.isFinite(b) ? b : 1 };
}

function centeredSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (ys[i]! - my);
    den += dx * dx;
  }
  return den < 1e-12 ? 0 : num / den;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    const tmp = M[col]!;
    M[col] = M[piv]!;
    M[piv] = tmp;
    let diag = M[col]![col]!;
    if (Math.abs(diag) < 1e-12) diag = diag < 0 ? -1e-12 : 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / diag;
      for (let k = col; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[col]![k]!;
    }
    for (let k = col; k <= n; k++) M[col]![k] = M[col]![k]! / diag;
  }
  return M.map((row) => row[n]!);
}

function sigmoid(z: number): number {
  const x = clamp(z, -20, 20);
  return 1 / (1 + Math.exp(-x));
}

function fitLogit(X: number[][], y: number[]): number[] {
  const n = y.length;
  const d = X[0]!.length;
  const w = Array(d).fill(0);
  for (let it = 0; it < 24; it++) {
    const H = Array.from({ length: d }, () => Array(d).fill(0));
    const g = Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      let z = 0;
      for (let k = 0; k < d; k++) z += X[i]![k]! * w[k]!;
      const p = sigmoid(z);
      const v = Math.max(1e-5, p * (1 - p));
      const err = y[i]! - p;
      for (let a = 0; a < d; a++) {
        g[a] += X[i]![a]! * err;
        const xa = X[i]![a]! * v;
        for (let b = 0; b < d; b++) H[a]![b] += xa * X[i]![b]!;
      }
    }
    for (let a = 0; a < d; a++) H[a]![a] += 1e-3;
    const delta = solve(H, g);
    let step = 0;
    for (let a = 0; a < d; a++) {
      w[a] += delta[a]!;
      step += Math.abs(delta[a]!);
    }
    if (step < 1e-7) break;
  }
  return w;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resample<T>(rng: () => number, rows: T[]): T[] {
  const n = rows.length;
  const out: T[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = rows[Math.floor(rng() * n)]!;
  return out;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null || !/^\d{4}-\d{2}-\d{2}$/.test(listedAt)) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function growthOf(change: number | null): number {
  return clamp(change ?? 0, -40, 80) / 100;
}

function bridgeCat(p: SnapshotProtocol): boolean {
  return p.category !== null && BRIDGE.has(p.category);
}
function lstCat(p: SnapshotProtocol): boolean {
  return p.category !== null && LST.has(p.category);
}
function exchangeish(p: SnapshotProtocol): boolean {
  return p.category === "CEX" || EXCHANGES.test(p.name);
}
function wrappedName(p: SnapshotProtocol): boolean {
  return VERSIONED.test(p.name) || WRAPPED.test(p.name);
}

function houseOut(p: SnapshotProtocol): boolean {
  return bridgeCat(p) || lstCat(p) || exchangeish(p) || wrappedName(p);
}

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return !(p.mcap_usd !== null && p.mcap_usd > 0) && p.gecko_id === null && p.symbol === null;
}

function tokenTrades(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0;
}

function tokenOnRecord(p: SnapshotProtocol): boolean {
  return !tokenTrades(p) && (p.gecko_id !== null || p.symbol !== null);
}

export function isRankable(p: SnapshotProtocol): boolean {
  return recordsNoToken(p) && !houseOut(p);
}

function playId(category: string | null): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("lend") || c.includes("cdp") || c.includes("collateral")) return "lend";
  if (c.includes("dex")) return "lp";
  if (c.includes("deriv") || c.includes("perp") || c.includes("basis") || c.includes("option") || c.includes("predict")) return "perp";
  if (c.includes("rwa")) return "rwa";
  if (c.includes("stak") || c.includes("restak")) return "stake";
  if (c.includes("yield") || c.includes("vault") || c.includes("curat") || c.includes("allocat") || c.includes("farm") || c.includes("index")) return "vault";
  return "use";
}

function gasOf(chain: string): readonly [number, number] {
  return GAS[chain] ?? GAS_DEFAULT;
}

function pickChain(chains: string[]): { chain: string; gas: number; fund: number } {
  const top = chains.slice(0, 3);
  if (top.length === 0) return { chain: "its primary chain", gas: GAS_DEFAULT[0], fund: GAS_DEFAULT[1] };
  let best = top[0]!;
  let bestGas = gasOf(best)[0];
  for (let i = 1; i < top.length; i++) {
    const name = top[i]!;
    const g = gasOf(name)[0];
    if (g < bestGas) {
      best = name;
      bestGas = g;
    }
  }
  const quote = gasOf(best);
  return { chain: best, gas: quote[0], fund: quote[1] };
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1000) return `${sign}$${String(Math.round(a)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  if (a >= 100) return `${sign}$${a.toFixed(0)}`;
  return `${sign}$${a.toFixed(2)}`;
}

function fitStep(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length > 600) return `${t.slice(0, 597).trimEnd()}...`;
  if (t.length < 20) return `${t} Re-check the position before leaving it.`.slice(0, 600);
  return t;
}

function categoryPremiums(train: VComp[], a: number, b: number): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const t of train) {
    const arr = buckets.get(t.cat) ?? [];
    arr.push(t.ly - (a + b * t.x));
    buckets.set(t.cat, arr);
  }
  const out = new Map<string, number>();
  for (const [cat, arr] of buckets) {
    if (arr.length < ECON.min_cat_n) continue;
    const raw = median(arr);
    out.set(cat, (arr.length / (arr.length + ECON.shrink_k)) * raw);
  }
  return out;
}

function fitValue(train: VComp[], spec: VSpec): VFit {
  const flatMed = median(train.map((t) => t.mcap / t.tvl));
  if (train.length < 8) {
    return {
      flat: flatMed, a: 0, b: 1, scale: 1, cat: new Map(), gCoef: 0, gMean: 0, ageCoef: 0, ageRef: 2.6,
      chCoef: 0, chMean: 0, plCoef: 0, plMean: 0, spec,
    };
  }
  const { a, b } = ols(train.map((t) => t.x), train.map((t) => t.ly));
  const cat = spec.cat ? categoryPremiums(train, a, b) : new Map<string, number>();
  const base = (t: VComp): number => a + b * t.x + (cat.get(t.cat) ?? 0);
  const gMean = mean(train.map((t) => t.g));
  const gCoef = spec.growth ? centeredSlope(train.map((t) => t.g), train.map((t) => t.ly - base(t))) : 0;
  const afterG = (t: VComp): number => base(t) + gCoef * (t.g - gMean);
  let ageCoef = 0;
  let ageRef = 2.6;
  if (spec.age) {
    const dated = train.filter((t) => t.age !== null);
    if (dated.length >= 8) {
      const lx = dated.map((t) => log10(Math.max(30, t.age!)));
      ageRef = median(lx);
      ageCoef = centeredSlope(lx, dated.map((t) => t.ly - afterG(t)));
    }
  }
  const ageLo = log10(ECON.age_clamp[0]);
  const ageHi = log10(ECON.age_clamp[1]);
  const ageEffect = (t: VComp): number => {
    if (!spec.age) return 0;
    const lage = log10(Math.max(30, t.age ?? ECON.age_unknown));
    return clamp(ageCoef * (lage - ageRef), ageLo, ageHi);
  };
  const chMean = mean(train.map((t) => Math.min(t.chains, 8)));
  const chCoef = spec.chains
    ? centeredSlope(train.map((t) => Math.min(t.chains, 8)), train.map((t) => t.ly - afterG(t) - ageEffect(t)))
    : 0;
  const afterC = (t: VComp): number => afterG(t) + ageEffect(t) + chCoef * (Math.min(t.chains, 8) - chMean);
  const plMean = mean(train.map((t) => t.placebo));
  const plCoef = spec.placebo
    ? centeredSlope(train.map((t) => t.placebo), train.map((t) => t.ly - afterC(t)))
    : 0;
  const logRaw = (t: VComp): number => afterC(t) + plCoef * (t.placebo - plMean);
  const ratios = train.map((t) => t.mcap / Math.pow(10, logRaw(t))).filter((v) => Number.isFinite(v) && v > 0);
  const scale = median(ratios) || 1;
  return { flat: null, a, b, scale, cat, gCoef, gMean, ageCoef, ageRef, chCoef, chMean, plCoef, plMean, spec };
}

function predictMcap(fit: VFit, c: VComp): number {
  if (fit.flat !== null) return Math.max(1, c.tvl * fit.flat);
  const ageLo = log10(ECON.age_clamp[0]);
  const ageHi = log10(ECON.age_clamp[1]);
  let y = fit.a + fit.b * c.x + (fit.cat.get(c.cat) ?? 0);
  y += fit.gCoef * (c.g - fit.gMean);
  if (fit.spec.age) {
    const lage = log10(Math.max(30, c.age ?? ECON.age_unknown));
    y += clamp(fit.ageCoef * (lage - fit.ageRef), ageLo, ageHi);
  }
  y += fit.chCoef * (Math.min(c.chains, 8) - fit.chMean);
  y += fit.plCoef * (c.placebo - fit.plMean);
  return Math.max(1, Math.pow(10, y) * fit.scale);
}

function missFactor(errors: number[]): number {
  if (errors.length === 0) return 1;
  return Math.pow(10, median(errors.map((e) => Math.abs(e))));
}

function looErrors(comps: VComp[], spec: VSpec, flat: boolean): number[] {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const held = comps[i]!;
    const fit = flat ? fitValue(train, EMPTY_SPEC) : fitValue(train, spec);
    const pred = flat ? Math.max(1, held.tvl * (median(train.map((t) => t.mcap / t.tvl)) || 0.2)) : predictMcap(fit, held);
    errs.push(log10(held.mcap) - log10(pred));
  }
  return errs;
}

function wfErrors(comps: VComp[], spec: VSpec, flat: boolean): number[] {
  const dated = comps.filter((c) => c.listed).sort((a, b) => cmp(a.listed, b.listed) || cmp(a.slug, b.slug));
  const start = Math.max(12, Math.floor(dated.length * 0.55));
  const errs: number[] = [];
  for (let i = start; i < dated.length; i++) {
    const train = dated.slice(0, i);
    const held = dated[i]!;
    const pred = flat
      ? Math.max(1, held.tvl * (median(train.map((t) => t.mcap / t.tvl)) || 0.2))
      : predictMcap(fitValue(train, spec), held);
    errs.push(log10(held.mcap) - log10(pred));
  }
  return errs;
}

function foldOf(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  return (h >>> 0) % 5;
}

function familyTable(peers: Peer[]): Map<string, number> {
  const global = mean(peers.map((p) => p.y));
  const sum = new Map<string, { n: number; s: number }>();
  for (const p of peers) {
    const cur = sum.get(p.cat) ?? { n: 0, s: 0 };
    cur.n += 1;
    cur.s += p.y;
    sum.set(p.cat, cur);
  }
  const out = new Map<string, number>();
  for (const [cat, cur] of sum) out.set(cat, (cur.s + ECON.fam_k * global) / (cur.n + ECON.fam_k) - global);
  return out;
}

function design(row: Peer, spec: OSpec, fam: Map<string, number>): number[] {
  const x = [1];
  if (spec.age) x.push(row.lage);
  if (spec.fam) x.push(fam.get(row.cat) ?? 0);
  if (spec.tvl) x.push(row.ltvl);
  if (spec.growth) x.push(row.g);
  if (spec.chains) x.push(row.chf);
  if (spec.placebo) x.push(row.placebo);
  return x;
}

function oddsNames(spec: OSpec): string[] {
  const names = ["intercept"];
  if (spec.age) names.push("age");
  if (spec.fam) names.push("family");
  if (spec.tvl) names.push("size");
  if (spec.growth) names.push("growth");
  if (spec.chains) names.push("chains");
  if (spec.placebo) names.push("placebo");
  return names;
}

function fitOdds(peers: Peer[], spec: OSpec): { weights: number[]; fam: Map<string, number> } {
  const fam = familyTable(peers);
  const X = peers.map((p) => design(p, spec, fam));
  return { weights: fitLogit(X, peers.map((p) => p.y)), fam };
}

function probOf(fit: { weights: number[]; fam: Map<string, number> }, row: Peer, spec: OSpec): number {
  const x = design(row, spec, fit.fam);
  let z = 0;
  for (let i = 0; i < fit.weights.length; i++) z += fit.weights[i]! * x[i]!;
  return sigmoid(z);
}

function brierCV(peers: Peer[], spec: OSpec): number {
  let sse = 0;
  for (let f = 0; f < 5; f++) {
    const train = peers.filter((p) => foldOf(p.slug) !== f);
    const test = peers.filter((p) => foldOf(p.slug) === f);
    const fit = fitOdds(train, spec);
    for (const row of test) {
      const e = probOf(fit, row, spec) - row.y;
      sse += e * e;
    }
  }
  return sse / peers.length;
}

function brierWF(peers: Peer[], spec: OSpec): number {
  const dated = peers.filter((p) => p.listed).sort((a, b) => cmp(a.listed, b.listed) || cmp(a.slug, b.slug));
  const cut = Math.floor(dated.length * 0.6);
  const train = dated.slice(0, cut).concat(peers.filter((p) => !p.listed));
  const test = dated.slice(cut);
  if (train.length < 20 || test.length === 0) return 0.25;
  const fit = fitOdds(train, spec);
  let sse = 0;
  for (const row of test) {
    const e = probOf(fit, row, spec) - row.y;
    sse += e * e;
  }
  return sse / test.length;
}

interface ScoredProto {
  protocol: SnapshotProtocol;
  tier: "watchlist" | "early" | "off-list";
  age: number | null;
  g: number;
  placebo: number;
  peer: Peer;
}

/** Published plan size: 0.02% of TVL, never under $1k and never over $10k. */
function defaultDeposit(tvl: number): number {
  return c2(Math.max(ECON.deposit_floor, Math.min(ECON.deposit, tvl * ECON.deposit_frac)));
}

function planNumbers(
  tvl: number,
  implied: number,
  change: number | null,
  play: string,
  chain: { gas: number; fund: number },
  deposit: number,
  share: number,
  weeks: number,
): RadarRow["plan"] {
  const how = PLAYS[play] ?? PLAYS.use!;
  const fees = c2(chain.fund + chain.gas * (how.txIn + weeks * how.txWeek + how.txOut));
  const capture = c2((implied * share * deposit) / (tvl + deposit));
  const minutes = how.minIn + weeks * how.minWeek + how.minOut;
  const hours = c2(minutes / 60);
  const net = c2(capture - fees);
  const tbill = c2(deposit * ECON.tbill * (weeks * 7) / 365);
  const dph = hours > 0 ? c2(net / hours) : 0;
  let verdict: "farm" | "thin" | "skip" = "skip";
  if (change !== null && change <= ECON.crash) verdict = "skip";
  else if (!(net > 0)) verdict = "skip";
  // Farm only when the hour clears $60 and net is clearly ahead of the T-bill (at least 25% more).
  else if (net > tbill * 1.25 && dph >= ECON.farm_dph) verdict = "farm";
  else verdict = "thin";
  return { deposit, share, weeks, capture, fees, hours, net, tbill, dph, verdict };
}

function sentences(p: SnapshotProtocol, play: string, chain: string, deposit: number): { enter: string; qualify: string; watch: string; stop: string } {
  const dep = money(deposit);
  const quarter = money(deposit / 4);
  const nm = p.name;
  if (play === "lend") {
    return {
      enter: `Supply ${dep} of USDC to ${nm} on ${chain} and keep the receipt token in this wallet.`,
      qualify: `Borrow ${quarter} of a stablecoin against it so both sides stay open, and keep the health factor above 2.`,
      watch: `check the health factor and the supply rate on ${nm}.`,
      stop: `health nears 1.5 or utilisation sits at 100%`,
    };
  }
  if (play === "lp") {
    return {
      enter: `Add ${dep} to ${nm}'s deepest pool on ${chain}, in its busiest pair, and keep the LP receipt.`,
      qualify: `Stake the receipt in ${nm}'s own gauge or rewards contract if it has one; a third-party farm does not count.`,
      watch: `swap about ${money(deposit / 10)} through ${nm}'s own router and record the fee.`,
      stop: `impermanent loss on the position passes 2%`,
    };
  }
  if (play === "perp") {
    return {
      enter: `Deposit ${dep} of USDC as margin on ${nm} on ${chain}. Do not lever past 1x.`,
      qualify: `Open and close one ${dep} round trip on a major pair so the week counts as active volume.`,
      watch: `do one round trip and write down fees and funding.`,
      stop: `fees plus funding pass 3% of the margin`,
    };
  }
  if (play === "rwa") {
    return {
      enter: `Buy ${dep} of ${nm}'s tokenised asset on ${chain} and read the redemption notice before sending funds.`,
      qualify: `Complete ${nm}'s allowlist or KYC with this wallet if it asks, and wait until the wallet is cleared.`,
      watch: `check NAV and the redemption queue.`,
      stop: `redemptions pause or NAV is marked down`,
    };
  }
  if (play === "stake") {
    return {
      enter: `Stake ${dep} of the asset ${nm} accepts on ${chain} and note the unbonding period first.`,
      qualify: `Delegate to an operator ${nm} lists, and keep the receipt in this wallet.`,
      watch: `check the operator and the reward rate.`,
      stop: `the operator is slashed or the exit queue runs past a week`,
    };
  }
  if (play === "vault") {
    return {
      enter: `Deposit ${dep} of USDC into ${nm}'s main vault on ${chain} and keep the vault shares in this wallet.`,
      qualify: `Connect the same wallet to ${nm}'s points or referral page in week one, if it has one, and leave the shares put.`,
      watch: `note the share price and the vault TVL.`,
      stop: `the share price falls while the underlying asset is flat`,
    };
  }
  return {
    enter: `Move ${dep} into ${nm} on ${chain} through its own app, so the activity sits on this wallet.`,
    qualify: `Do one real action the app scores (a deposit, a swap, or a contract call) and leave the position open.`,
    watch: `repeat one real action and record the fee.`,
    stop: `withdrawals pause or the app stops crediting the wallet`,
  };
}

function buildSteps(p: SnapshotProtocol, play: string, chainName: string, chain: { gas: number }, plan: RadarRow["plan"], implied: number): string[] {
  const how = PLAYS[play] ?? PLAYS.use!;
  const talk = sentences(p, play, chainName, plan.deposit);
  const weeks = plan.weeks;
  const hold = weeks * 7;
  const gasBudget = c2(chain.gas * (how.txIn + weeks * how.txWeek + how.txOut));
  const weekGas = c2(chain.gas * how.txWeek);
  const label = plan.verdict === "farm" ? "FARM" : plan.verdict === "thin" ? "MARGINAL" : "SKIP";
  const lines = [
    `Setup: Create a fresh wallet used only to farm ${p.name}. Write the seed on paper and keep it offline. Do not reuse a wallet that already holds savings. Cost: nothing. Time: 10 minutes.`,
    `Verify: Find ${p.name} by the slug ${p.slug} on DefiLlama, open the app it links, and match the contract addresses. Confirm the record still shows no token, and read any points page before funding. Cost: nothing. Time: 12 minutes.`,
    `Fund: Withdraw ${money(plan.deposit)} of USDC (or the asset ${p.name} takes) plus ${money(gasBudget)} for gas to that wallet on ${chainName}. The exchange withdrawal is about ${money(plan.fees - gasBudget > 0 ? c2(plan.fees - gasBudget) : chain.gas)}. Cost: ${money(c2(plan.fees - gasBudget))}. Time: 10 minutes, plus the transfer.`,
    `Enter: ${talk.enter} Cost: ${money(c2(chain.gas * how.txIn))} of gas across ${how.txIn} transactions. Time: ${how.minIn} minutes.`,
    `Qualify: ${talk.qualify} Cost: ${money(chain.gas)} if this takes its own transaction, else nothing. Time: 10 minutes.`,
    `Cadence: Once a week for ${weeks} weeks, ${talk.watch} That is ${weeks} separate weeks, about ${how.minWeek} minutes and ${money(weekGas)} of gas each week. Cost: ${money(c2(weekGas * weeks))}. Time: ${how.minWeek * weeks} minutes over ${hold} days.`,
    `Stop: Leave early if ${talk.stop}, if TVL prints under ${money(p.tvl_usd * 0.7)} (30% below the ${money(p.tvl_usd)} in this snapshot), or if a token is announced with nothing set aside for current depositors. Cost: nothing. Time: 5 minutes a week.`,
    `Claim: If a token is issued, claim only inside ${p.name}'s own app from this wallet. Never pay a stranger to claim, and never sign a message that arrives in a DM. At an implied ${money(implied)} and a ${(plan.share * 100).toFixed(1)}% drop share, this deposit's modelled slice is ${money(plan.capture)}. Cost: about ${money(chain.gas)}. Time: 15 minutes.`,
    `Exit: After ${hold} days, or at the claim, unwind on ${chainName}, revoke approvals, and send the funds back to the exchange. Fees are ${money(plan.fees)} all-in. The same ${money(plan.deposit)} in a 4% T-bill for ${weeks} weeks is ${money(plan.tbill)}. Net of fees is ${money(plan.net)}, about ${money(plan.dph)} an hour. Verdict: ${label}. Cost: ${money(c2(chain.gas * how.txOut))}. Time: 12 minutes.`,
  ];
  return lines.map(fitStep);
}

function checksumOf(rows: { slug: string; rank: number; implied_value_usd: number }[]): string {
  let h = 2166136261;
  const s = rows.map((r) => `${r.slug}|${r.rank}|${r.implied_value_usd}`).join("\n");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

function ledgerBuckets(
  snapshot: Snapshot,
  compSlugs: Set<string>,
): { id: string; label: string; n: number; note: string; color: string }[] {
  const watch = new Set(snapshot.watchlist);
  const counts = new Map<string, number>();
  const bump = (id: string): void => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const p of snapshot.protocols) {
    const noToken = recordsNoToken(p);
    if (noToken && watch.has(p.slug)) bump("watch");
    else if (noToken && !houseOut(p) && p.tvl_usd >= snapshot.floor_usd) bump("offlist");
    else if (noToken && !houseOut(p)) bump("early");
    else if (tokenTrades(p) && compSlugs.has(p.slug)) bump("comp");
    else if (tokenTrades(p) || tokenOnRecord(p)) bump("recorded");
    else if (bridgeCat(p)) bump("bridge");
    else if (lstCat(p)) bump("lst");
    else if (exchangeish(p)) bump("exchange");
    else if (wrappedName(p)) bump("wrapped");
    else bump("other");
  }
  const spec: { id: string; label: string; note: string; color: string }[] = [
    { id: "watch", label: "Ranked · watchlist", note: "no token on record, at or above the floor, on the house list", color: "#2dd4bf" },
    { id: "early", label: "Ranked · early, below the floor", note: "no token, clears the house rules, TVL under the floor", color: "#60a5fa" },
    { id: "offlist", label: "Ranked · off-list, above the floor", note: "no token and above the floor, left off the list (a parent listing)", color: "#e8b84a" },
    { id: "comp", label: "Token trades · priced comp", note: "market cap inside the comp screen, used to fit the curve", color: "#f59e0b" },
    { id: "recorded", label: "Token on record · no usable cap", note: "a ticker or a cap outside the comp screen", color: "#94a3b8" },
    { id: "bridge", label: "Out · bridge", note: "no token, bridge category", color: "#a78bfa" },
    { id: "lst", label: "Out · liquid staking", note: "no token, liquid staking or restaked BTC", color: "#c084fc" },
    { id: "exchange", label: "Out · exchange", note: "no token, CEX category or an exchange name", color: "#fb7185" },
    { id: "wrapped", label: "Out · versioned or wrapped", note: "no token, versioned name or wrapped or staked wording", color: "#f97316" },
    { id: "other", label: "Out · other", note: "no token, and none of the buckets above", color: "#64748b" },
  ];
  return spec.filter((s) => (counts.get(s.id) ?? 0) > 0 || s.id !== "other").map((s) => ({ ...s, n: counts.get(s.id) ?? 0 }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Record<string, unknown> } {
  const asOf = snapshot.as_of;
  const placebo = new Map<string, number>();
  const ordered = [...snapshot.protocols].sort((a, b) => cmp(a.slug, b.slug));
  for (let i = 0; i < ordered.length; i++) {
    const next = ordered[(i + 1) % ordered.length]!;
    placebo.set(ordered[i]!.slug, growthOf(next.change_7d));
  }

  const peers: Peer[] = ordered.map((p) => {
    const age = ageDays(asOf, p.listed_at);
    return {
      slug: p.slug,
      cat: p.category ?? "Uncategorized",
      y: tokenTrades(p) || tokenOnRecord(p) ? 1 : 0,
      tvl: p.tvl_usd,
      g: growthOf(p.change_7d),
      age,
      listed: p.listed_at ?? "",
      chains: p.chains.length,
      placebo: placebo.get(p.slug) ?? 0,
      ltvl: log10(Math.max(1, p.tvl_usd)) - 7.2,
      lage: log10(Math.max(30, age ?? ECON.age_unknown)) - 2.6,
      chf: Math.min(p.chains.length, 6) - 1,
    };
  });
  const peerBySlug = new Map(peers.map((p) => [p.slug, p]));

  const comps: VComp[] = [];
  for (const p of ordered) {
    if (!tokenTrades(p) || houseOut(p)) continue;
    const mult = p.mcap_usd! / p.tvl_usd;
    if (mult < ECON.min_multiple || mult > ECON.max_multiple) continue;
    if (Math.abs(mult - 1) <= ECON.receipt_band) continue;
    const age = ageDays(asOf, p.listed_at);
    comps.push({
      slug: p.slug,
      cat: p.category ?? "Uncategorized",
      tvl: p.tvl_usd,
      mcap: p.mcap_usd!,
      x: log10(p.tvl_usd),
      ly: log10(p.mcap_usd!),
      g: growthOf(p.change_7d),
      age,
      listed: p.listed_at ?? "",
      chains: p.chains.length,
      placebo: placebo.get(p.slug) ?? 0,
    });
  }

  const flatLoo = missFactor(looErrors(comps, EMPTY_SPEC, true));
  const flatWf = missFactor(wfErrors(comps, EMPTY_SPEC, true));
  const sizeLoo = missFactor(looErrors(comps, EMPTY_SPEC, false));
  const sizeWf = missFactor(wfErrors(comps, EMPTY_SPEC, false));
  const valueTerms: TermRow[] = [
    { name: "Flat median multiple", loo: r4(flatLoo), wf: r4(flatWf), kept: false, note: "baseline" },
  ];
  let spec: VSpec = { ...EMPTY_SPEC };
  const sizeKept = sizeLoo < flatLoo - ECON.keep_miss && sizeWf < flatWf - ECON.keep_miss;
  valueTerms.push({
    name: "Size curve, log TVL",
    loo: r4(sizeLoo),
    wf: r4(sizeWf),
    kept: sizeKept,
    note: sizeKept ? "kept" : "tested, not kept",
  });
  let curLoo = sizeKept ? sizeLoo : flatLoo;
  let curWf = sizeKept ? sizeWf : flatWf;
  const candidates: { key: keyof VSpec; name: string }[] = [
    { key: "cat", name: "Category premium, shrunk" },
    { key: "growth", name: "7-day TVL growth" },
    { key: "age", name: "Years listed" },
    { key: "chains", name: "Chain count" },
    { key: "placebo", name: "Placebo: another row's week" },
  ];
  for (const cand of candidates) {
    const next: VSpec = { ...spec, [cand.key]: true };
    const loo = missFactor(looErrors(comps, next, false));
    const wf = missFactor(wfErrors(comps, next, false));
    const kept = sizeKept && loo < curLoo - ECON.keep_miss && wf < curWf - ECON.keep_miss;
    valueTerms.push({ name: cand.name, loo: r4(loo), wf: r4(wf), kept, note: kept ? "kept" : "tested, not kept" });
    if (kept) {
      spec = next;
      curLoo = loo;
      curWf = wf;
    }
  }

  const pricing = fitValue(comps, spec);
  const alt = {
    cat: fitValue(comps, { ...spec, cat: true }),
    growth: fitValue(comps, { ...spec, growth: true }),
    age: fitValue(comps, { ...spec, age: true }),
    chains: fitValue(comps, { ...spec, chains: true }),
    placebo: fitValue(comps, { ...spec, placebo: true }),
  };

  const oddsTerms: OddsTerm[] = [];
  let ospec: OSpec = { ...EMPTY_ODDS };
  let baseCV = brierCV(peers, ospec);
  let baseWF = brierWF(peers, ospec);
  oddsTerms.push({ name: "Base rate", cv: r4(baseCV), wf: r4(baseWF), kept: false, note: "baseline" });
  const oCands: { key: keyof OSpec; name: string }[] = [
    { key: "age", name: "Age, log years" },
    { key: "fam", name: "Family token rate" },
    { key: "tvl", name: "Size, log TVL" },
    { key: "growth", name: "7-day TVL growth" },
    { key: "chains", name: "Chain count" },
    { key: "placebo", name: "Placebo: another row's week" },
  ];
  for (const cand of oCands) {
    const next: OSpec = { ...ospec, [cand.key]: true };
    const cv = brierCV(peers, next);
    const wf = brierWF(peers, next);
    const kept = cv < baseCV - ECON.keep_brier && wf < baseWF - ECON.keep_brier;
    oddsTerms.push({ name: cand.name, cv: r4(cv), wf: r4(wf), kept, note: kept ? "kept" : "tested, not kept" });
    if (kept) {
      ospec = next;
      baseCV = cv;
      baseWF = wf;
    }
  }
  const oddsFit = fitOdds(peers, ospec);
  const oddsNameList = oddsNames(ospec);

  const looSigned = looErrors(comps, spec, false);
  let hit50 = 0;
  let hit80 = 0;
  for (let i = 0; i < looSigned.length; i++) {
    const others = looSigned.filter((_, j) => j !== i);
    const e = looSigned[i]!;
    if (e >= quantile(others, 0.25) && e <= quantile(others, 0.75)) hit50 += 1;
    if (e >= quantile(others, 0.1) && e <= quantile(others, 0.9)) hit80 += 1;
  }
  const q10 = quantile(looSigned, 0.1);
  const q25 = quantile(looSigned, 0.25);
  const q75 = quantile(looSigned, 0.75);
  const q90 = quantile(looSigned, 0.9);

  const datedComps = comps.filter((c) => c.listed).sort((a, b) => cmp(a.listed, b.listed) || cmp(a.slug, b.slug));
  const covCut = Math.max(12, Math.floor(datedComps.length * 0.6));
  const covTrain = datedComps.slice(0, covCut);
  const covTest = datedComps.slice(covCut);
  const trainRes = looErrors(covTrain, spec, false);
  const tq10 = quantile(trainRes, 0.1);
  const tq25 = quantile(trainRes, 0.25);
  const tq75 = quantile(trainRes, 0.75);
  const tq90 = quantile(trainRes, 0.9);
  const covFit = fitValue(covTrain, spec);
  let wf50 = 0;
  let wf80 = 0;
  for (const c of covTest) {
    const e = log10(c.mcap) - log10(predictMcap(covFit, c));
    if (e >= tq25 && e <= tq75) wf50 += 1;
    if (e >= tq10 && e <= tq90) wf80 += 1;
  }

  const watch = new Set(snapshot.watchlist);
  const chosen: ScoredProto[] = [];
  for (const p of ordered) {
    if (!recordsNoToken(p) || houseOut(p)) continue;
    const tier: ScoredProto["tier"] = watch.has(p.slug) ? "watchlist" : p.tvl_usd >= snapshot.floor_usd ? "off-list" : "early";
    const peer = peerBySlug.get(p.slug)!;
    chosen.push({ protocol: p, tier, age: ageDays(asOf, p.listed_at), g: growthOf(p.change_7d), placebo: placebo.get(p.slug) ?? 0, peer });
  }

  const catDisplay = categoryPremiums(comps, pricing.a, pricing.b);

  function multsFor(row: ScoredProto): Factor[] {
    const catLog = (spec.cat ? pricing.cat : alt.cat.cat).get(row.peer.cat) ?? catDisplay.get(row.peer.cat) ?? 0;
    const gFit = spec.growth ? pricing : alt.growth;
    const ageFit = spec.age ? pricing : alt.age;
    const chFit = spec.chains ? pricing : alt.chains;
    const plFit = spec.placebo ? pricing : alt.placebo;
    const ageLo = log10(ECON.age_clamp[0]);
    const ageHi = log10(ECON.age_clamp[1]);
    const lage = log10(Math.max(30, row.age ?? ECON.age_unknown));
    const ageEff = clamp(ageFit.ageCoef * (lage - ageFit.ageRef), ageLo, ageHi);
    return [
      { name: "Category", mult: Math.pow(10, catLog), used: spec.cat },
      { name: "7-day growth", mult: Math.pow(10, gFit.gCoef * (row.g - gFit.gMean)), used: spec.growth },
      { name: "Years listed", mult: Math.pow(10, ageEff), used: spec.age },
      { name: "Chain count", mult: Math.pow(10, chFit.chCoef * (Math.min(row.protocol.chains.length, 8) - chFit.chMean)), used: spec.chains },
      { name: "Placebo week", mult: Math.pow(10, plFit.plCoef * (row.placebo - plFit.plMean)), used: spec.placebo },
    ];
  }

  function priceOne(row: ScoredProto, fit: VFit, oFit: { weights: number[]; fam: Map<string, number> }, oUse: OSpec): { value: number; odds: number; implied: number } {
    const pred = predictMcap(fit, {
      slug: row.protocol.slug,
      cat: row.peer.cat,
      tvl: row.protocol.tvl_usd,
      mcap: 1,
      x: log10(Math.max(1, row.protocol.tvl_usd)),
      ly: 0,
      g: row.g,
      age: row.age,
      listed: row.protocol.listed_at ?? "",
      chains: row.protocol.chains.length,
      placebo: row.placebo,
    });
    const value = Math.max(1, Math.round(pred));
    const odds = probOf(oFit, row.peer, oUse);
    const implied = Math.max(1, Math.min(ECON.implied_cap, Math.round(value * odds)));
    return { value, odds, implied };
  }

  const rng = mulberry32(0x5a17e);
  const bags = new Map<string, number[]>();
  for (const row of chosen) bags.set(row.protocol.slug, []);
  for (let b = 0; b < ECON.boot; b++) {
    const fitB = fitValue(resample(rng, comps), spec);
    const oddsB = fitOdds(resample(rng, peers), ospec);
    const scored = chosen.map((row) => ({ slug: row.protocol.slug, implied: priceOne(row, fitB, oddsB, ospec).implied }));
    scored.sort((a, c) => c.implied - a.implied || cmp(a.slug, c.slug));
    scored.forEach((s, i) => bags.get(s.slug)!.push(i + 1));
  }

  const draft = chosen.map((row) => {
    const priced = priceOne(row, pricing, oddsFit, ospec);
    const factors = multsFor(row);
    const curve = Math.pow(10, pricing.a + pricing.b * log10(Math.max(1, row.protocol.tvl_usd)));
    const chain = pickChain(row.protocol.chains);
    const play = playId(row.protocol.category);
    const plan = planNumbers(row.protocol.tvl_usd, priced.implied, row.protocol.change_7d, play, chain, defaultDeposit(row.protocol.tvl_usd), ECON.share, ECON.weeks);
    const ox = design(row.peer, ospec, oddsFit.fam);
    const spreadLo = Math.pow(10, q25);
    const spreadHi = Math.pow(10, q75);
    const impliedLo = Math.max(1, Math.round(priced.implied * Math.min(spreadLo, 1)));
    const impliedHi = Math.max(priced.implied, Math.round(priced.implied * Math.max(spreadHi, 1)));
    const ranks = bags.get(row.protocol.slug)!.slice().sort((a, c) => a - c);
    let rankLo = ranks[Math.round(0.1 * (ranks.length - 1))] ?? 1;
    let rankHi = ranks[Math.round(0.9 * (ranks.length - 1))] ?? chosen.length;
    return {
      row, priced, factors, curve, chain, play, plan, ox, impliedLo, impliedHi, rankLo, rankHi,
    };
  });
  draft.sort((a, b) => b.priced.implied - a.priced.implied || cmp(a.row.protocol.slug, b.row.protocol.slug));

  const rows: RadarRow[] = draft.map((d, i) => {
    const rank = i + 1;
    const rankLo = Math.min(d.rankLo, rank);
    const rankHi = Math.max(d.rankHi, rank);
    const steps = buildSteps(d.row.protocol, d.play, d.chain.chain, { gas: d.chain.gas }, d.plan, d.priced.implied);
    return {
      rank,
      rank_lo: rankLo,
      rank_hi: rankHi,
      slug: d.row.protocol.slug,
      name: d.row.protocol.name,
      category: d.row.protocol.category,
      chains: d.row.protocol.chains,
      tvl_usd: d.row.protocol.tvl_usd,
      change_7d: d.row.protocol.change_7d,
      listed_at: d.row.protocol.listed_at,
      age_days: d.row.age,
      tier: d.row.tier,
      on_watchlist: d.row.tier === "watchlist",
      g: d.row.g,
      ox: d.ox,
      curve: d.curve,
      factors: d.factors,
      value_if_usd: d.priced.value,
      odds: d.priced.odds,
      implied_value_usd: d.priced.implied,
      implied_lo: d.impliedLo,
      implied_hi: d.impliedHi,
      play: d.play,
      farm_chain: d.chain.chain,
      plan: d.plan,
      steps,
    };
  });

  const verdicts = { farm: 0, thin: 0, skip: 0 };
  for (const row of rows) verdicts[row.plan.verdict] += 1;
  const compSlugs = new Set(comps.map((c) => c.slug));
  const ledger = ledgerBuckets(snapshot, compSlugs);
  const ledgerTotal = ledger.reduce((s, b) => s + b.n, 0);
  if (ledgerTotal !== snapshot.protocols.length) {
    throw new SnapshotError(`ledger sums to ${ledgerTotal}, snapshot has ${snapshot.protocols.length}`);
  }
  const watchHit = rows.filter((r) => r.on_watchlist).length;
  if (watchHit !== snapshot.watchlist.length) {
    throw new SnapshotError(`watchlist covered ${watchHit} of ${snapshot.watchlist.length}`);
  }

  const catObj: Record<string, number> = {};
  for (const [k, v] of [...pricing.cat.entries()].sort((a, b) => cmp(a[0], b[0]))) catObj[k] = v;
  const catShow: Record<string, number> = {};
  for (const [k, v] of [...catDisplay.entries()].sort((a, b) => cmp(a[0], b[0]))) catShow[k] = v;

  const keptValue = valueTerms.filter((t) => t.kept).length;
  const keptOdds = oddsTerms.filter((t) => t.kept).length;
  const beats = curLoo < flatLoo && curWf < flatWf;
  const blurb = `Implied value is the size curve${spec.cat ? " × category" : ""}${spec.growth ? " × 7-day growth" : ""}${spec.age ? " × years listed" : ""} times the peers' token odds. Leave-one-out miss ${curLoo.toFixed(2)}× versus a flat multiple ${flatLoo.toFixed(2)}×. Walk-forward ${curWf.toFixed(2)}× versus ${flatWf.toFixed(2)}×. ${beats ? "The kept model beats flat on both checks." : "Flat is closer on at least one check."}`;

  const radar = {
    as_of: asOf,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    blurb,
    checksum: checksumOf(rows),
    ledger,
    ledger_total: ledgerTotal,
    fit: {
      a: pricing.a,
      b: pricing.b,
      scale: pricing.scale,
      flat_multiple: median(comps.map((c) => c.mcap / c.tvl)),
      g_coef: spec.growth ? pricing.gCoef : alt.growth.gCoef,
      g_mean: spec.growth ? pricing.gMean : alt.growth.gMean,
      age_coef: spec.age ? pricing.ageCoef : alt.age.ageCoef,
      age_ref: spec.age ? pricing.ageRef : alt.age.ageRef,
      use: { cat: spec.cat, growth: spec.growth, age: spec.age, chains: spec.chains, placebo: spec.placebo },
      cat: spec.cat ? catObj : catShow,
      loo: r4(curLoo),
      loo_flat: r4(flatLoo),
      wf: r4(curWf),
      wf_flat: r4(flatWf),
      loo_n: comps.length,
      wf_n: wfErrors(comps, spec, false).length,
      q10, q25, q75, q90,
      honest50: looSigned.length ? hit50 / looSigned.length : 0,
      honest80: looSigned.length ? hit80 / looSigned.length : 0,
      honest_n: looSigned.length,
      wf50: covTest.length ? wf50 / covTest.length : 0,
      wf80: covTest.length ? wf80 / covTest.length : 0,
      wf_cov_n: covTest.length,
      comps_n: comps.length,
      terms: valueTerms,
      kept: keptValue,
      tried: valueTerms.length - 1,
      beats_flat: beats,
    },
    odds: {
      names: oddsNameList,
      weights: oddsFit.weights,
      cv: r4(baseCV),
      cv_base: oddsTerms[0]!.cv,
      wf: r4(baseWF),
      wf_base: oddsTerms[0]!.wf,
      terms: oddsTerms,
      kept: keptOdds,
      tried: oddsTerms.length - 1,
    },
    econ: {
      tbill: ECON.tbill,
      boot: ECON.boot,
      farm_dph: ECON.farm_dph,
      crash: ECON.crash,
      deposit: ECON.deposit,
      deposit_floor: ECON.deposit_floor,
      deposit_frac: ECON.deposit_frac,
      share: ECON.share,
      weeks: ECON.weeks,
      gas: GAS,
      gas_default: GAS_DEFAULT,
      plays: PLAYS,
    },
    verdicts,
    watchlist_size: snapshot.watchlist.length,
    watchlist_ranked: watchHit,
    board_size: rows.length,
    rows,
    comps: comps
      .map((c) => ({ name: ordered.find((p) => p.slug === c.slug)?.name ?? c.slug, category: c.cat, tvl: c.tvl, mcap: c.mcap }))
      .sort((a, b) => b.tvl - a.tvl || cmp(a.name, b.name)),
  };

  const board: BoardRow[] = rows.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.steps,
    tier: r.tier,
    verdict: r.plan.verdict,
  }));
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
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > ECON.implied_cap) {
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
  const order = [...ranks].sort((a, b) => a - b);
  for (let i = 0; i < order.length; i++) if (order[i] !== i + 1) return `rank ${i + 1} is missing`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${i + 1} outranks rank ${i}`;
  }
  if (byRank.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return "every row has the same implied value";
  return null;
}

export function dataScript(radar: unknown): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
