#!/usr/bin/env node
/**
 * Monte Carlo batch runner.
 *
 *   npm run sim -- --manifest <path> --out <dir> [--shard i/n]
 *
 * Builds the full (level x seed x bot) matrix from the manifest, plays every
 * job to completion, and appends one JSON line per run to <out>/runs.jsonl:
 * `{ runId, level, seed, bot, tuning, actions, result }`. That log is the
 * only thing downstream tools (replay, scorecard, diagnostics) read.
 *
 * `--shard i/n` runs only jobs where `index % n === i`, so a batch can be
 * split across n machines/processes; each shard writes its own runs.jsonl
 * and the files can simply be concatenated afterwards. See
 * references/batches.md for the sampling-error and sharding math.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GameEngine, RunRecord, Tuning } from "./engine.js";
import { loadEngine } from "./load-engine.js";
import { loadManifest, mergeTuning } from "./manifest.js";
import { createGreedyBot } from "./bots/greedy.js";
import { createPlannerBot } from "./bots/planner.js";
import { createReferenceBot } from "./bots/reference.js";
import type { Bot } from "./bots/types.js";
import { seedRng } from "./rng.js";

interface Args {
  manifest: string;
  out: string;
  shard: [number, number];
}

function parseArgs(argv: string[]): Args {
  let manifest = "";
  let out = "out/run";
  let shard: [number, number] = [0, 1];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") manifest = argv[++i] ?? "";
    else if (a === "--out") out = argv[++i] ?? "";
    else if (a === "--shard") {
      const raw = argv[++i] ?? "";
      const parts = raw.split("/");
      const idx = Number(parts[0]);
      const n = Number(parts[1]);
      if (!Number.isInteger(idx) || !Number.isInteger(n) || n <= 0 || idx < 0 || idx >= n) {
        throw new Error(`--shard must look like "i/n" with 0 <= i < n, got "${raw}"`);
      }
      shard = [idx, n];
    }
  }
  if (!manifest) {
    throw new Error('usage: sim --manifest <path> --out <dir> [--shard i/n]');
  }
  return { manifest, out, shard };
}

function makeBot(name: string, engine: GameEngine<unknown, string, unknown, unknown>): Bot<unknown, string> {
  if (name === "greedy" || name === "forced") return createGreedyBot(engine);
  if (name === "planner") return createPlannerBot(engine);
  if (name === "reference") return createReferenceBot(engine);
  throw new Error(`unknown bot "${name}" (expected greedy | planner | reference | forced)`);
}

function runOne(
  engine: GameEngine<unknown, string, unknown, unknown>,
  bot: Bot<unknown, string>,
  seed: number,
  level: number,
  tuning: Tuning,
): { actions: string[]; result: unknown } {
  let state = engine.init(seed, level, tuning);
  // Policy RNG is a separate stream from the engine's own world/combat RNG
  // (folded from the same seed with a fixed odd constant) so bot randomness
  // never perturbs world generation, and vice versa.
  let policyRng = seedRng((seed ^ 0x51ed270b) >>> 0);
  const actions: string[] = [];
  let guard = 0;
  while (!engine.isTerminal(state)) {
    if (++guard > 10_000) throw new Error("runaway run: over 10000 actions, likely a non-terminating engine");
    const legal = engine.legalActions(state);
    if (legal.length === 0) throw new Error("legalActions() returned [] on a non-terminal state");
    const [action, nextPolicyRng] = bot.choose(state, legal, policyRng);
    policyRng = nextPolicyRng;
    actions.push(action);
    state = engine.apply(state, action);
  }
  return { actions, result: engine.result(state) };
}

interface Job {
  level: number;
  seed: number;
  botName: string;
}

function buildJobs(manifest: ReturnType<typeof loadManifest>): Job[] {
  const jobs: Job[] = [];
  const seedStart = manifest.seedStart ?? 0;
  for (const level of manifest.levels) {
    for (let s = 0; s < manifest.seedCount; s++) {
      const seed = seedStart + s;
      for (const botName of manifest.bots) {
        jobs.push({ level, seed, botName });
      }
    }
  }
  return jobs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifest);
  const engine = await loadEngine(args.manifest, manifest.engine);

  mkdirSync(args.out, { recursive: true });
  const runsPath = resolve(args.out, "runs.jsonl");
  writeFileSync(runsPath, "");

  const jobs = buildJobs(manifest);
  const [shardIdx, shardN] = args.shard;
  const shardJobs = jobs.filter((_, i) => i % shardN === shardIdx);

  const baseTuning = mergeTuning({}, manifest.tuning);
  let written = 0;
  for (let i = 0; i < shardJobs.length; i++) {
    const job = shardJobs[i]!;
    const bot = makeBot(job.botName, engine);
    const tuning =
      job.botName === "forced" && manifest.forcedLoadout
        ? mergeTuning(baseTuning, { forcedItems: manifest.forcedLoadout })
        : baseTuning;

    const { actions, result } = runOne(engine, bot, job.seed, job.level, tuning);
    const record: RunRecord<string, unknown> = {
      runId: `L${job.level}-S${job.seed}-${job.botName}-${i}`,
      level: job.level,
      seed: job.seed,
      bot: job.botName,
      tuning,
      actions,
      result,
    };
    appendFileSync(runsPath, JSON.stringify(record) + "\n");
    written++;
  }

  console.log(
    `[sim] wrote ${written} runs to ${runsPath} (shard ${shardIdx + 1}/${shardN} of ${jobs.length} total jobs)`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
