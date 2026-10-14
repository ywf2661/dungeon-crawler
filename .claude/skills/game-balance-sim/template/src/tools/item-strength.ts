#!/usr/bin/env node
/**
 * Exhaustive item strength diagnostic.
 *
 *   npm run items -- [--out <dir>]
 *
 * For every item, add it to each of a few standard loadouts and re-fight a
 * representative encounter at every level, comparing the with-item score to
 * the without-item score. Δscore uses the same 0..2 scale as
 * `engine.evaluate`/`cardReadingScore`'s sibling `scoreEncounter`, where a
 * ~1.0 point swing is roughly "one loss flipped into a win". Averaged across
 * loadouts and levels, this ranks items from most to least impactful and
 * flags near-zero items as candidates for a buff or removal.
 *
 * This script is wired directly to `examples/toy-dungeon` (it needs the
 * item catalog and a way to build RNG-free probe encounters, which aren't
 * part of the generic `GameEngine` contract). To point it at your own game,
 * swap the imports below for your item catalog and an equivalent
 * `scoreEncounter`/probe-building pair — the loop and reporting stay the
 * same. See references/diagnostics.md for the fully generic pseudocode.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ITEM_IDS, ITEMS } from "../../examples/toy-dungeon/items.js";
import {
  bossSpecFor,
  BOSS_VARIANTS,
  computeCombatStats,
  fightSpecFor,
  scoreEncounter,
  type ToyPlayer,
} from "../../examples/toy-dungeon/engine.js";

interface Args {
  out: string;
  levels: number[];
}

function parseArgs(argv: string[]): Args {
  let out = "out/diagnostics";
  let levels = [1, 2, 3];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i] ?? out;
    else if (a === "--levels") levels = (argv[++i] ?? "").split(",").map(Number);
  }
  return { out, levels };
}

const STANDARD_LOADOUTS: { name: string; items: string[] }[] = [
  { name: "empty", items: [] },
  { name: "guard-focus", items: ["oak_buckler", "plate_scrap"] },
  { name: "brute-focus", items: ["jagged_tooth", "warhorn"] },
  { name: "mixed", items: ["oak_buckler", "jagged_tooth", "lucky_coin"] },
];

function playerWith(items: string[]): ToyPlayer {
  let maxHp = 30;
  for (const id of items) maxHp += ITEMS[id]?.maxHp ?? 0;
  return { hp: maxHp, maxHp, gold: 0, items, bonusDefense: 0 };
}

function probesFor(levels: number[]) {
  const probes: { label: string; level: number; enemy: ReturnType<typeof fightSpecFor> }[] = [];
  for (const level of levels) {
    probes.push({ label: `L${level} fight`, level, enemy: fightSpecFor(level, {}) });
    for (const variant of BOSS_VARIANTS) {
      probes.push({ label: `L${level} boss (${variant.key})`, level, enemy: bossSpecFor(level, variant, {}) });
    }
  }
  return probes;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const probes = probesFor(args.levels);
  const tuning = {};

  const rows: { item: string; avgDelta: number; deltas: number[] }[] = [];

  for (const itemId of ITEM_IDS) {
    const deltas: number[] = [];
    for (const loadout of STANDARD_LOADOUTS) {
      if (loadout.items.includes(itemId)) continue;
      const without = playerWith(loadout.items);
      const withItem = playerWith([...loadout.items, itemId]);
      const withoutStats = computeCombatStats(without, tuning);
      const withStats = computeCombatStats(withItem, tuning);
      for (const probe of probes) {
        const before = scoreEncounter(withoutStats, without.maxHp, probe.enemy, tuning);
        const after = scoreEncounter(withStats, withItem.maxHp, probe.enemy, tuning);
        deltas.push(after - before);
      }
    }
    const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    rows.push({ item: itemId, avgDelta, deltas });
  }
  rows.sort((a, b) => b.avgDelta - a.avgDelta);

  // Bonus: surface the classic dominant-combo failure mode directly — does
  // owning both items together beat the sum of owning each alone?
  const comboA = "iron_edge";
  const comboB = "reckless_charm";
  const base = playerWith([]);
  const withA = playerWith([comboA]);
  const withB = playerWith([comboB]);
  const withBoth = playerWith([comboA, comboB]);
  const statsBase = computeCombatStats(base, tuning);
  const statsA = computeCombatStats(withA, tuning);
  const statsB = computeCombatStats(withB, tuning);
  const statsBoth = computeCombatStats(withBoth, tuning);
  let comboSuperadditivity = 0;
  for (const probe of probes) {
    const sBase = scoreEncounter(statsBase, base.maxHp, probe.enemy, tuning);
    const sA = scoreEncounter(statsA, withA.maxHp, probe.enemy, tuning);
    const sB = scoreEncounter(statsB, withB.maxHp, probe.enemy, tuning);
    const sBoth = scoreEncounter(statsBoth, withBoth.maxHp, probe.enemy, tuning);
    comboSuperadditivity += sBoth - sBase - (sA - sBase) - (sB - sBase);
  }
  comboSuperadditivity /= probes.length;

  const lines: string[] = [
    "# Item strength report",
    "",
    `Probed ${probes.length} encounters x ${STANDARD_LOADOUTS.length} standard loadouts.`,
    "Δscore ~1.0 ≈ one loss flipped to a win (see scoreEncounter's 0..2 scale).",
    "",
    "| Item | Avg Δscore | Flag |",
    "|---|---|---|",
    ...rows.map((r) => {
      const flag = Math.abs(r.avgDelta) < 0.05 ? "near-zero: buff or cut" : r.avgDelta > 0.5 ? "high impact" : "";
      return `| ${r.item} | ${r.avgDelta.toFixed(3)} | ${flag} |`;
    }),
    "",
    "## Combo check: iron_edge + reckless_charm",
    "",
    `Superadditivity (score(both) - score(base) - individual gains), avg over probes: **${comboSuperadditivity.toFixed(3)}**`,
    comboSuperadditivity > 0.15
      ? "This pair is worth noticeably more together than apart — a dominant-combo signal. See references/diagnostics.md."
      : "No strong superadditive interaction detected for this pair.",
    "",
  ];

  const md = lines.join("\n");
  mkdirSync(args.out, { recursive: true });
  const mdPath = resolve(args.out, "item-strength.md");
  writeFileSync(mdPath, md);
  console.log(md);
  console.log(`[items] written to ${mdPath}`);
}

main();
