#!/usr/bin/env node
/**
 * Counterfactual boss calibrator.
 *
 *   npm run calibrate -- --runs <dir>/runs.jsonl [--out <dir>]
 *
 * Reads recorded boss fights (reference bot only — targets are always
 * measured on the reference bot) from a runs.jsonl. Each recorded fight
 * carries the player's actual attack/defense/max-HP *at the moment they
 * fought that boss* (see `BossOutcome` in examples/toy-dungeon/engine.ts).
 * For every boss variant, re-fights every one of its recorded matchups
 * deterministically (no RNG — same `scoreEncounter` the bots use for
 * lookahead) at HP scales from 0.5x to 1.5x, and reports the scale whose
 * mean lands closest to the level's mean across variants. A noise gate
 * skips any variant that's already within 4 points of the mean, so the
 * tool doesn't chase sampling noise. See references/diagnostics.md.
 *
 * Wired to `examples/toy-dungeon` for the deterministic re-fight step
 * (`scoreEncounter`/`bossSpecFor`); swap that part out for your own
 * engine's equivalent, as long as each recorded boss fight carries enough
 * of the player's state to be replayed at a different boss HP.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RunRecord } from "../engine.js";
import { BOSS_VARIANTS, bossSpecFor, scoreEncounter } from "../../examples/toy-dungeon/engine.js";

const NOISE_GATE_POINTS = 4;
const SCALE_MIN = 0.5;
const SCALE_MAX = 1.5;
const SCALE_STEP = 0.02;

interface BossOutcome {
  variant: string;
  score: number;
  playerAttack: number;
  playerDefense: number;
  playerMaxHp: number;
}

interface BalanceResult {
  level: number;
  bossOutcome?: BossOutcome;
}

interface Args {
  runs: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  // Defaults line up with `npm run sim`'s own default demo output, so
  // `npm run sim -- --manifest examples/toy-dungeon/manifest.json --out out/demo`
  // followed by a bare `npm run calibrate` works with no extra flags.
  let runs = "out/demo/runs.jsonl";
  let out = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") runs = argv[++i] ?? runs;
    else if (a === "--out") out = argv[++i] ?? "";
  }
  return { runs, out: out || resolve(runs, "..") };
}

function pointsFromScore(score: number): number {
  return Math.max(0, Math.min(100, (score / 2) * 100));
}

/** Re-fight one recorded matchup with the boss's HP scaled by `scale`. */
function refightAtScale(level: number, variantKey: string, outcome: BossOutcome, scale: number): number {
  const variant = BOSS_VARIANTS.find((v) => v.key === variantKey);
  if (!variant) throw new Error(`unknown boss variant ${variantKey}`);
  const spec = bossSpecFor(level, variant, {});
  const scaledSpec = { ...spec, hp: Math.max(1, Math.round(spec.hp * scale)), maxHp: Math.max(1, Math.round(spec.maxHp * scale)) };
  const stats = { attack: outcome.playerAttack, defense: outcome.playerDefense };
  const score = scoreEncounter(stats, outcome.playerMaxHp, scaledSpec, {});
  return pointsFromScore(score);
}

/** Mean points across all of a variant's recorded matchups, re-fought at `scale`. */
function meanPointsAtScale(level: number, variantKey: string, outcomes: BossOutcome[], scale: number): number {
  const points = outcomes.map((o) => refightAtScale(level, variantKey, o, scale));
  return points.reduce((a, b) => a + b, 0) / points.length;
}

function bestScaleFor(level: number, variantKey: string, outcomes: BossOutcome[], targetPoints: number): { scale: number; points: number } {
  let best = { scale: 1.0, points: meanPointsAtScale(level, variantKey, outcomes, 1.0), gap: Infinity };
  for (let scale = SCALE_MIN; scale <= SCALE_MAX + 1e-9; scale += SCALE_STEP) {
    const points = meanPointsAtScale(level, variantKey, outcomes, scale);
    const gap = Math.abs(points - targetPoints);
    if (gap < best.gap) best = { scale, points, gap };
  }
  return { scale: Math.round(best.scale * 100) / 100, points: best.points };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const runs = readFileSync(args.runs, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RunRecord<string, BalanceResult> & { bot: string });

  const refRuns = runs.filter((r) => r.bot === "reference" && r.result.bossOutcome);
  const levels = [...new Set(refRuns.map((r) => r.level))].sort((a, b) => a - b);

  const lines: string[] = [
    "# Boss calibrator report",
    "",
    "Each recorded boss fight is re-fought deterministically at its own recorded loadout, boss HP scaled 0.5x-1.5x.",
    `Noise gate: only recommends a change when the boss's mean is off by >= ${NOISE_GATE_POINTS} points to begin with.`,
    "",
    "| Level | Variant | Observed mean (1.0x) | Level mean | Gap | Recommended scale | New estimate |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const level of levels) {
    const levelRuns = refRuns.filter((r) => r.level === level);
    const byVariant = new Map<string, BossOutcome[]>();
    for (const r of levelRuns) {
      const bo = r.result.bossOutcome!;
      if (!byVariant.has(bo.variant)) byVariant.set(bo.variant, []);
      byVariant.get(bo.variant)!.push(bo);
    }

    // "Observed mean" here is the deterministic re-fight at scale 1.0 (not
    // the raw recorded score, which includes combat RNG) — that's what
    // makes the gap-to-level-mean comparison and the scale search consistent
    // with each other; see references/diagnostics.md for why.
    const meansAtOne = [...byVariant.entries()].map(([variant, outcomes]) => ({
      variant,
      outcomes,
      mean: meanPointsAtScale(level, variant, outcomes, 1.0),
    }));
    const levelMean = meansAtOne.length > 0 ? meansAtOne.reduce((a, b) => a + b.mean, 0) / meansAtOne.length : 0;

    for (const { variant, outcomes, mean } of meansAtOne.sort((a, b) => a.variant.localeCompare(b.variant))) {
      const gap = Math.abs(mean - levelMean);
      if (gap < NOISE_GATE_POINTS) {
        lines.push(
          `| ${level} | ${variant} | ${mean.toFixed(1)} | ${levelMean.toFixed(1)} | ${gap.toFixed(1)} | 1.00 (no change, within noise gate) | ${mean.toFixed(1)} |`,
        );
        continue;
      }
      const rec = bestScaleFor(level, variant, outcomes, levelMean);
      lines.push(
        `| ${level} | ${variant} | ${mean.toFixed(1)} | ${levelMean.toFixed(1)} | ${gap.toFixed(1)} | ${rec.scale.toFixed(2)}x | ${rec.points.toFixed(1)} |`,
      );
    }
  }
  lines.push("");

  const md = lines.join("\n");
  mkdirSync(args.out, { recursive: true });
  const mdPath = resolve(args.out, "boss-calibration.md");
  writeFileSync(mdPath, md);
  console.log(md);
  console.log(`[calibrate] written to ${mdPath}`);
}

main();
