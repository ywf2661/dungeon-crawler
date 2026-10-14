import assert from "node:assert/strict";
import { test } from "node:test";
import { chance, choice, nextFloat, nextInt, sample, seedFromString, seedRng } from "../src/rng.js";

test("nextFloat is deterministic for a given state", () => {
  const s = seedRng(42);
  const [a] = nextFloat(s);
  const [b] = nextFloat(s);
  assert.equal(a, b);
});

test("nextFloat advances state and stays in [0, 1)", () => {
  let s = seedRng(1);
  for (let i = 0; i < 1000; i++) {
    const [v, next] = nextFloat(s);
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
    assert.notEqual(next, s);
    s = next;
  }
});

test("two independent generators seeded alike produce identical streams", () => {
  let a = seedRng(1234);
  let b = seedRng(1234);
  for (let i = 0; i < 50; i++) {
    const [va, na] = nextFloat(a);
    const [vb, nb] = nextFloat(b);
    assert.equal(va, vb);
    a = na;
    b = nb;
  }
});

test("nextInt stays within [0, max)", () => {
  let s = seedRng(7);
  for (let i = 0; i < 500; i++) {
    const [v, next] = nextInt(s, 6);
    assert.ok(v >= 0 && v < 6);
    s = next;
  }
});

test("choice always returns an element of the array", () => {
  const arr = ["a", "b", "c"];
  let s = seedRng(9);
  for (let i = 0; i < 50; i++) {
    const [v, next] = choice(s, arr);
    assert.ok(arr.includes(v));
    s = next;
  }
});

test("sample returns distinct elements without replacement", () => {
  const arr = [1, 2, 3, 4, 5, 6];
  const [picked] = sample(seedRng(3), arr, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  for (const p of picked) assert.ok(arr.includes(p));
});

test("chance respects extremes", () => {
  const [always] = chance(seedRng(5), 1);
  assert.equal(always, true);
  const [never] = chance(seedRng(5), 0);
  assert.equal(never, false);
});

test("seedFromString is stable for the same input", () => {
  assert.equal(seedFromString("run-0007"), seedFromString("run-0007"));
  assert.notEqual(seedFromString("run-0007"), seedFromString("run-0008"));
});
