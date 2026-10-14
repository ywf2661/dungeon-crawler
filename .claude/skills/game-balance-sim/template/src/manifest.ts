/**
 * Manifest: the one file that changes when you're tuning. Tunables are data
 * (a JSON object merged over the engine's own defaults), never a code fork —
 * see references/tuning-loop.md for why that matters for the tuning loop.
 */

import { readFileSync } from "node:fs";
import type { Tuning } from "./engine.js";

export interface Manifest {
  /** Path (relative to the manifest file) to the game's engine module. Must
   * have a `default` (or named `engine`) export satisfying `GameEngine`. */
  engine: string;
  /** Which levels/acts to simulate, e.g. [1, 2, 3]. */
  levels: number[];
  /** How many seeds per (level, bot). ~30 keeps sampling error near ±5 points. */
  seedCount: number;
  /** First seed value; seeds used are seedStart .. seedStart + seedCount - 1. */
  seedStart?: number;
  /** Which bots to run: any of "greedy" | "planner" | "reference" | "forced". */
  bots: string[];
  /** Comma-separated item/loadout ids given for free at init to the "forced" bot. */
  forcedLoadout?: string;
  /** Overrides applied on top of the engine's shipped defaults. Empty = ship defaults. */
  tuning: Tuning;
  /** Optional label so run logs and scorecards can say which manifest produced them. */
  name?: string;
}

export function loadManifest(path: string): Manifest {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<Manifest>;
  if (!parsed.engine) {
    throw new Error(`manifest ${path}: "engine" must point at a GameEngine module`);
  }
  if (!Array.isArray(parsed.levels) || parsed.levels.length === 0) {
    throw new Error(`manifest ${path}: "levels" must be a non-empty array`);
  }
  if (!Array.isArray(parsed.bots) || parsed.bots.length === 0) {
    throw new Error(`manifest ${path}: "bots" must be a non-empty array`);
  }
  return {
    engine: parsed.engine,
    levels: parsed.levels,
    seedCount: parsed.seedCount ?? 30,
    seedStart: parsed.seedStart ?? 0,
    bots: parsed.bots,
    forcedLoadout: parsed.forcedLoadout,
    tuning: parsed.tuning ?? {},
    name: parsed.name,
  };
}

/** Overrides win; anything not overridden keeps the engine's shipped default. */
export function mergeTuning(defaults: Tuning, overrides: Tuning): Tuning {
  return { ...defaults, ...overrides };
}
