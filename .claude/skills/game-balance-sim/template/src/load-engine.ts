/**
 * Dynamically loads a game's engine module from a manifest's `engine` path.
 * Shared by runner.ts, replay.ts and the diagnostic tools so all of them
 * point at the same engine a manifest names, instead of each hardcoding a
 * game.
 */
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { GameEngine } from "./engine.js";

export async function loadEngine(
  manifestPath: string,
  engineRelPath: string,
): Promise<GameEngine<unknown, string, unknown, unknown>> {
  const abs = resolve(dirname(manifestPath), engineRelPath);
  const mod = await import(pathToFileURL(abs).href);
  const engine = (mod.default ?? mod.engine) as GameEngine<unknown, string, unknown, unknown> | undefined;
  if (!engine) {
    throw new Error(`engine module "${engineRelPath}" has no default (or named "engine") export`);
  }
  return engine;
}
