// main.ts — the token launch radar's entrypoint.
//
// Reads the sealed snapshot, ranks every pre-token protocol by implied
// launch value, writes the board and the dashboard's data, copies the
// dashboard and the screenshots into the output directory, and writes the
// dossier with buildDossier from vendor/makefun-board.ts.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// At harness runtime it reads /input/snapshot.json and writes /output.
// Standard library only. Deterministic: the same snapshot always writes
// the same bytes, so the harness's two runs agree.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard } from "./lib/model.ts";
import type { Snapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

function parseArgs(argv: string[]): { input?: string; output?: string } {
  const out: { input?: string; output?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input" && i + 1 < argv.length) {
      out.input = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--output" && i + 1 < argv.length) {
      out.output = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function resolveInput(inputArg: string | undefined, scriptDir: string): string {
  if (inputArg !== undefined) return resolve(inputArg);
  if (process.env.SNAPSHOT_PATH) return resolve(process.env.SNAPSHOT_PATH);
  const runtime = "/input/snapshot.json";
  if (existsSync(runtime)) return runtime;
  const kitLocal = join(
    scriptDir,
    "..",
    "token-radar-01-kit",
    "input",
    "snapshot.json",
  );
  if (existsSync(kitLocal)) return kitLocal;
  const sibling = join(scriptDir, "input", "snapshot.json");
  if (existsSync(sibling)) return sibling;
  return runtime;
}

function formatUsd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const inputPath = resolveInput(args.input, scriptDir);
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? args.output ?? "out");

  const snapshot = JSON.parse(readFileSync(inputPath, "utf8")) as Snapshot;
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
    throw new Error(`snapshot at ${inputPath} is not a token-radar snapshot`);
  }
  const board = buildBoard(snapshot);

  mkdirSync(join(outDir, "dashboard"), { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });

  writeFileSync(
    join(outDir, "board.json"),
    JSON.stringify({ rows: board.rows, meta: board.meta }, null, 2) + "\n",
  );
  writeFileSync(
    join(outDir, "data.js"),
    "window.RADAR = " + JSON.stringify(board, null, 2) + ";\n",
  );

  cpSync(join(scriptDir, "dashboard"), join(outDir, "dashboard"), {
    recursive: true,
  });
  const shotsDir = join(scriptDir, "screenshots");
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });
  }

  try {
    const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
    writeFileSync(join(outDir, "dossier.json"), dossier);
    console.log(`dossier: ${dossier.length} bytes`);
  } catch (err) {
    console.log(
      `dossier skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const top = board.rows.slice(0, 3);
  console.log(`snapshot: ${snapshot.as_of}, ${snapshot.protocols.length} protocols`);
  console.log(
    `board: ${board.rows.length} rows, watchlist ${board.meta.watchlist_covered}/${board.meta.watchlist_total}`,
  );
  for (const row of top) {
    console.log(`#${row.rank} ${row.name}: ${formatUsd(row.implied_value_usd)}`);
  }
  console.log(`output: ${outDir}`);
}

main();
