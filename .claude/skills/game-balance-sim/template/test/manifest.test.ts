import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadManifest, mergeTuning } from "../src/manifest.js";

test("mergeTuning: overrides win, everything else keeps the default", () => {
  const defaults = { a: 1, b: "x" };
  const merged = mergeTuning(defaults, { b: "y", c: true });
  assert.deepEqual(merged, { a: 1, b: "y", c: true });
});

test("loadManifest parses a valid manifest and fills in defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-manifest-"));
  try {
    const path = join(dir, "manifest.json");
    writeFileSync(
      path,
      JSON.stringify({ engine: "./engine.ts", levels: [1, 2], bots: ["greedy"] }),
    );
    const manifest = loadManifest(path);
    assert.equal(manifest.engine, "./engine.ts");
    assert.deepEqual(manifest.levels, [1, 2]);
    assert.equal(manifest.seedCount, 30);
    assert.equal(manifest.seedStart, 0);
    assert.deepEqual(manifest.tuning, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadManifest rejects a manifest with no engine", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-manifest-"));
  try {
    const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify({ levels: [1], bots: ["greedy"] }));
    assert.throws(() => loadManifest(path), /engine/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadManifest rejects an empty levels array", () => {
  const dir = mkdtempSync(join(tmpdir(), "gbs-manifest-"));
  try {
    const path = join(dir, "manifest.json");
    writeFileSync(path, JSON.stringify({ engine: "./engine.ts", levels: [], bots: ["greedy"] }));
    assert.throws(() => loadManifest(path), /levels/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
