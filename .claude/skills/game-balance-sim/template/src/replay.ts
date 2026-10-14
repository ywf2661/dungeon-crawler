#!/usr/bin/env node
/**
 * Finalize step: replay every run in a runs.jsonl and reject any that don't
 * reproduce exactly.
 *
 *   npm run replay -- --manifest <path> --runs <dir>/runs.jsonl [--out <dir>]
 *
 * For each recorded run, replays `engine.init(seed, level, tuning)` followed
 * by the exact recorded action list, then compares the resulting
 * `engine.result(state)` to what was recorded. Any mismatch means either the
 * engine is nondeterministic (a bug) or something upstream corrupted the
 * record — this is the check that catches both before a scorecard is
 * trusted. See references/batches.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RunRecord } from "./engine.js";
import { loadEngine } from "./load-engine.js";
import { loadManifest } from "./manifest.js";

interface Args {
  manifest: string;
  runs: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  let manifest = "";
  let runs = "";
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") manifest = argv[++i] ?? "";
    else if (a === "--runs") runs = argv[++i] ?? "";
    else if (a === "--out") out = argv[++i] ?? "";
  }
  if (!manifest || !runs) {
    throw new Error("usage: replay --manifest <path> --runs <runs.jsonl> [--out <dir>]");
  }
  return { manifest, runs, out };
}

interface Failure {
  runId: string;
  reason: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifest);
  const engine = await loadEngine(args.manifest, manifest.engine);

  const lines = readFileSync(args.runs, "utf8").split("\n").filter((l) => l.trim().length > 0);
  const failures: Failure[] = [];
  let passed = 0;

  for (const line of lines) {
    const record = JSON.parse(line) as RunRecord<string, unknown>;
    try {
      let state = engine.init(record.seed, record.level, record.tuning);
      for (const action of record.actions) {
        if (engine.isTerminal(state)) {
          throw new Error(`run terminated early, before replaying all ${record.actions.length} recorded actions`);
        }
        const legal = engine.legalActions(state);
        if (!legal.includes(action)) {
          throw new Error(`recorded action "${action}" is not legal on replay (legal: ${legal.join(", ")})`);
        }
        state = engine.apply(state, action);
      }
      if (!engine.isTerminal(state)) {
        throw new Error("replay finished the action list but the state is not terminal");
      }
      const replayedResult = engine.result(state);
      const a = JSON.stringify(replayedResult);
      const b = JSON.stringify(record.result);
      if (a !== b) {
        throw new Error(`result mismatch:\n  recorded: ${b}\n  replayed: ${a}`);
      }
      passed++;
    } catch (err) {
      failures.push({ runId: record.runId, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const total = passed + failures.length;
  const outDir = args.out ?? dirname(args.runs);
  const jsonPath = resolve(outDir, "replay-report.json");
  const mdPath = resolve(outDir, "replay-report.md");

  writeFileSync(jsonPath, JSON.stringify({ total, passed, failed: failures.length, failures }, null, 2));

  const md = [
    "# Replay report",
    "",
    `${passed}/${total} runs reproduced exactly.`,
    "",
    ...(failures.length === 0
      ? ["All runs passed."]
      : ["## Failures", "", ...failures.map((f) => `- \`${f.runId}\`: ${f.reason}`)]),
    "",
  ].join("\n");
  writeFileSync(mdPath, md);

  console.log(`[replay] ${passed}/${total} passed. Report: ${mdPath}`);
  if (failures.length > 0) {
    console.error(`[replay] ${failures.length} run(s) failed to reproduce — see ${mdPath}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
