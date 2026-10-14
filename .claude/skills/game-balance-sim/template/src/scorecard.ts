#!/usr/bin/env node
/**
 * Scorecard: aggregate a runs.jsonl into per-target PASS/FAIL tables.
 *
 *   npm run scorecard -- --runs <dir>/runs.jsonl --targets <targets.json> --out <dir>
 *
 * Reads targets.json (see examples/toy-dungeon/targets.json for the shape)
 * and checks five things against it, all computed only from what's in each
 * run's recorded `result` — see references/targets.md for what each one
 * means and why:
 *   1. clear rate per level, for the reference bot
 *   2. boss fairness: each boss variant's mean outcome within a points band
 *      of its level's mean across variants
 *   3. build spread: forced-loadout clear rate vs. greedy's organic clear
 *      rate, within a points band (a big gap flags a dominant build)
 *   4. resource use: average share of available gold spent, for the
 *      reference bot
 *   5. content use: each item picked in at least some minimum share of runs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RunRecord } from "./engine.js";

/**
 * The scorecard is generic across games, but it does need a game's `result`
 * to carry these fields (extra fields are fine and ignored) — that's the
 * minimal shape a `GameEngine.result()` should expose to use this script
 * as-is. `examples/toy-dungeon`'s `ToyResult` satisfies this structurally.
 */
interface BalanceResult {
  status: "won" | "lost";
  level: number;
  goldEarned: number;
  goldSpent: number;
  items: string[];
  bossOutcome?: { variant: string; score: number };
}

interface Targets {
  referenceBot: string;
  forcedBot: string;
  baselineBot: string;
  startGold: number;
  clearRate: Record<string, [number, number]>; // level -> [minPct, maxPct]
  fairnessBandPoints: number;
  buildSpreadPoints: number;
  goldUseRange: [number, number]; // fraction, e.g. [0.70, 0.85]
  contentUseMinRate: number; // fraction, e.g. 0.25
}

interface Args {
  runs: string;
  targets: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let runs = "";
  let targets = "";
  let out = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") runs = argv[++i] ?? "";
    else if (a === "--targets") targets = argv[++i] ?? "";
    else if (a === "--out") out = argv[++i] ?? "";
  }
  if (!runs || !targets) throw new Error("usage: scorecard --runs <runs.jsonl> --targets <targets.json> --out <dir>");
  return { runs, targets, out: out || resolve(runs, "..") };
}

function loadRuns(path: string): RunRecord<string, BalanceResult>[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RunRecord<string, BalanceResult>);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function pass(ok: boolean): string {
  return ok ? "PASS" : "FAIL";
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const targets = JSON.parse(readFileSync(args.targets, "utf8")) as Targets;
  const runs = loadRuns(args.runs);

  const lines: string[] = ["# Balance scorecard", ""];
  let anyFail = false;
  const fail = () => {
    anyFail = true;
  };

  // 1. Clear rate per level, reference bot.
  lines.push("## Clear rate (reference bot)", "", "| Level | Target | Actual | Runs | Result |", "|---|---|---|---|---|");
  const refRuns = runs.filter((r) => r.bot === targets.referenceBot);
  const levels = [...new Set(refRuns.map((r) => r.level))].sort((a, b) => a - b);
  for (const level of levels) {
    const levelRuns = refRuns.filter((r) => r.level === level);
    const cleared = levelRuns.filter((r) => r.result.status === "won").length;
    const rate = levelRuns.length > 0 ? cleared / levelRuns.length : 0;
    const target = targets.clearRate[String(level)];
    const ok = target ? rate * 100 >= target[0] && rate * 100 <= target[1] : true;
    if (!ok) fail();
    lines.push(
      `| ${level} | ${target ? `${target[0]}-${target[1]}%` : "n/a"} | ${pct(rate)} | ${levelRuns.length} | ${target ? pass(ok) : "n/a"} |`,
    );
  }
  lines.push("");

  // 2. Boss fairness: each variant within `fairnessBandPoints` of its level's mean.
  lines.push(
    "## Boss fairness (reference bot, points = outcome score scaled to 0-100)",
    "",
    "| Level | Variant | Mean points | Level mean | Deviation | Result |",
    "|---|---|---|---|---|---|",
  );
  for (const level of levels) {
    const levelRuns = refRuns.filter((r) => r.level === level && r.result.bossOutcome);
    const byVariant = new Map<string, number[]>();
    for (const r of levelRuns) {
      const bo = r.result.bossOutcome!;
      const points = Math.max(0, Math.min(100, (bo.score / 2) * 100));
      if (!byVariant.has(bo.variant)) byVariant.set(bo.variant, []);
      byVariant.get(bo.variant)!.push(points);
    }
    const allPoints = [...byVariant.values()].flat();
    const levelMean = allPoints.length > 0 ? allPoints.reduce((a, b) => a + b, 0) / allPoints.length : 0;
    for (const [variant, points] of [...byVariant.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const mean = points.reduce((a, b) => a + b, 0) / points.length;
      const deviation = Math.abs(mean - levelMean);
      const ok = deviation <= targets.fairnessBandPoints;
      if (!ok) fail();
      lines.push(
        `| ${level} | ${variant} | ${mean.toFixed(1)} | ${levelMean.toFixed(1)} | ${deviation.toFixed(1)} | ${pass(ok)} |`,
      );
    }
  }
  lines.push("");

  // 3. Build spread: forced loadout vs. baseline (greedy, free choice).
  lines.push(
    "## Build spread (forced loadout vs. baseline)",
    "",
    "| Level | Forced clear % | Baseline clear % | Spread | Result |",
    "|---|---|---|---|---|",
  );
  for (const level of levels) {
    const forcedRuns = runs.filter((r) => r.bot === targets.forcedBot && r.level === level);
    const baselineRuns = runs.filter((r) => r.bot === targets.baselineBot && r.level === level);
    if (forcedRuns.length === 0 || baselineRuns.length === 0) continue;
    const forcedRate = forcedRuns.filter((r) => r.result.status === "won").length / forcedRuns.length;
    const baselineRate = baselineRuns.filter((r) => r.result.status === "won").length / baselineRuns.length;
    const spreadPoints = Math.abs(forcedRate - baselineRate) * 100;
    const ok = spreadPoints <= targets.buildSpreadPoints;
    if (!ok) fail();
    lines.push(`| ${level} | ${pct(forcedRate)} | ${pct(baselineRate)} | ${spreadPoints.toFixed(1)} pts | ${pass(ok)} |`);
  }
  lines.push("");

  // 4. Resource use: share of available gold spent, reference bot.
  lines.push("## Resource use — gold spent (reference bot)", "", "| Level | Avg. share spent | Target | Result |", "|---|---|---|---|");
  for (const level of levels) {
    const levelRuns = refRuns.filter((r) => r.level === level);
    const shares = levelRuns.map((r) => {
      const available = targets.startGold + r.result.goldEarned;
      return available > 0 ? r.result.goldSpent / available : 0;
    });
    const avg = shares.length > 0 ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
    const ok = avg >= targets.goldUseRange[0] && avg <= targets.goldUseRange[1];
    if (!ok) fail();
    lines.push(
      `| ${level} | ${pct(avg)} | ${pct(targets.goldUseRange[0])}-${pct(targets.goldUseRange[1])} | ${pass(ok)} |`,
    );
  }
  lines.push("");

  // 5. Content use: every item picked in at least `contentUseMinRate` of reference-bot runs.
  lines.push("## Content use — item pick rate (reference bot, all levels)", "", "| Item | Pick rate | Target | Result |", "|---|---|---|---|");
  const totalRefRuns = refRuns.length;
  const itemCounts = new Map<string, number>();
  for (const r of refRuns) {
    for (const item of r.result.items) {
      itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
    }
  }
  for (const [item, count] of [...itemCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rate = totalRefRuns > 0 ? count / totalRefRuns : 0;
    const ok = rate >= targets.contentUseMinRate;
    if (!ok) fail();
    lines.push(`| ${item} | ${pct(rate)} | >= ${pct(targets.contentUseMinRate)} | ${pass(ok)} |`);
  }
  lines.push("");

  lines.push(anyFail ? "**Overall: FAIL** — see failing rows above." : "**Overall: PASS**");
  lines.push("");

  const md = lines.join("\n");
  const mdPath = resolve(args.out, "scorecard.md");
  writeFileSync(mdPath, md);
  console.log(md);
  console.log(`[scorecard] written to ${mdPath}`);
  if (anyFail) process.exitCode = 1;
}

main();
