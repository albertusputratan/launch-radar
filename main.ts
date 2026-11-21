// Launch Radar. Node 22, standard library only.
//
// Reads the sealed snapshot, scores every rankable pre-token protocol, and writes
// board.json, data.js, a copy of dashboard/ and screenshots/, then dossier.json.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { boardIssue, buildRadar, dataScript, parseSnapshot, SnapshotError } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

function fail(message: string, code: number): never {
  process.stderr.write(`launch radar: ${message}\n`);
  process.exit(code);
}

function copyPlainFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith(".")) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const inputArg = arg("input", "/input");
const inputFile = inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}`, 2);

let snapshot;
try {
  snapshot = parseSnapshot(readFileSync(inputFile, "utf8"));
} catch (err) {
  if (err instanceof SnapshotError) fail(err.message, 2);
  throw err;
}

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`board refused: ${issue}`, 1);

const out = arg("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "board.json"), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, "data.js"), dataScript(radar));
copyPlainFiles(join(here, "dashboard"), join(out, "dashboard"));

const shots = copyPlainFiles(join(here, "screenshots"), join(out, "screenshots"));
if (shots.length < 3) fail(`screenshots/ has ${shots.length} images; need the board, a detail view, and a filtered view`, 1);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name} is not a dossier file name`, 1);
}

writeFileSync(
  join(out, "dossier.json"),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

const fit = radar.fit as {
  loo: number;
  loo_flat: number;
  wf: number;
  wf_flat: number;
  loo_n: number;
  wf_n: number;
  beats_flat: boolean;
  kept: number;
  tried: number;
  comps_n: number;
  honest50: number;
};
const odds = radar.odds as { cv: number; cv_base: number; kept: number; tried: number };
const verdicts = radar.verdicts as { farm: number; thin: number; skip: number };
const ledgerTotal = radar.ledger_total as number;
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, watchlist ${radar.watchlist_ranked}/${snapshot.watchlist.length}, ${board.length} rows, ${fit.comps_n} priced comps\n` +
    `launch radar: OOS miss ${fit.loo.toFixed(2)}× vs flat ${fit.loo_flat.toFixed(2)}× (leave-one-out n=${fit.loo_n}); walk-forward ${fit.wf.toFixed(2)}× vs flat ${fit.wf_flat.toFixed(2)}× (n=${fit.wf_n}); ${fit.beats_flat ? "beats flat" : "flat is closer"}\n` +
    `launch radar: token-odds Brier ${odds.cv.toFixed(3)} vs base ${odds.cv_base.toFixed(3)}; value terms kept ${fit.kept}/${fit.tried}; odds terms kept ${odds.kept}/${odds.tried}; range honesty ${(fit.honest50 * 100).toFixed(0)}%\n` +
    `launch radar: verdicts farm ${verdicts.farm}, thin ${verdicts.thin}, skip ${verdicts.skip}; ledger ${ledgerTotal}\n` +
    `launch radar: wrote ${join(out, "board.json")}, ${join(out, "data.js")}, dashboard, ${shots.length} screenshots, dossier.json\n`,
);
