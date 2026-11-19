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

const fit = radar.fit;
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows (${radar.early_size} early, ${fit.comps_used} comps)\n` +
    `launch radar: leave-one-out ${(fit.loo_mape * 100).toFixed(1)}% vs flat ${(fit.loo_flat_mape * 100).toFixed(1)}% (n=${fit.loo_n}); walk-forward ${(fit.wf_mape * 100).toFixed(1)}% vs flat ${(fit.wf_flat_mape * 100).toFixed(1)}% (n=${fit.wf_n}); ${fit.beats_flat ? "beats flat" : "flat is closer"}\n` +
    `launch radar: verdicts farm ${radar.verdicts.farm}, thin ${radar.verdicts.thin}, skip ${radar.verdicts.skip}\n` +
    `launch radar: wrote ${join(out, "board.json")}, ${join(out, "data.js")}, dashboard, ${shots.length} screenshots, dossier.json\n`,
);
