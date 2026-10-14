/**
 * Deterministic, seeded PRNG.
 *
 * Every function here is pure: it takes a state and returns [value, nextState]
 * instead of mutating anything. That is what lets the RNG state live inside
 * an immutable game `state` object (see engine.ts) and still let a run be
 * replayed byte-for-byte from its seed and action list.
 *
 * Algorithm: a 32-bit splitmix-style hash used as a counter-based generator.
 * It is not cryptographically strong and does not need to be — it only needs
 * to be fast, seedable, and identical across runs.
 */

export type RngState = number; // 32-bit unsigned integer

export function seedRng(seed: number): RngState {
  // Fold the seed into 32 bits. Accepts any finite number, including seeds
  // produced by hashing a string seed elsewhere.
  return seed >>> 0;
}

/** Hash a string into a seed, for human-friendly seed names ("run-0007"). */
export function seedFromString(input: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Advance the generator and return a float in [0, 1). */
export function nextFloat(state: RngState): [number, RngState] {
  let z = (state + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return [z / 4294967296, z];
}

/** Integer in [0, maxExclusive). */
export function nextInt(state: RngState, maxExclusive: number): [number, RngState] {
  const [f, next] = nextFloat(state);
  return [Math.floor(f * maxExclusive), next];
}

/** Uniform float in [min, max). */
export function nextRange(state: RngState, min: number, max: number): [number, RngState] {
  const [f, next] = nextFloat(state);
  return [min + f * (max - min), next];
}

/** Pick one element of a non-empty array. */
export function choice<T>(state: RngState, arr: readonly T[]): [T, RngState] {
  if (arr.length === 0) throw new Error("choice() called with an empty array");
  const [i, next] = nextInt(state, arr.length);
  return [arr[i] as T, next];
}

/**
 * Pick `count` distinct elements without replacement (order preserved from
 * a shuffled prefix). Used for e.g. drawing shop offers from an item pool.
 */
export function sample<T>(state: RngState, arr: readonly T[], count: number): [T[], RngState] {
  const pool = arr.slice();
  const picked: T[] = [];
  let s = state;
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const [idx, next] = nextInt(s, pool.length - i);
    picked.push(pool[idx] as T);
    pool[idx] = pool[pool.length - 1 - i] as T;
    s = next;
  }
  return [picked, s];
}

/** Bernoulli trial: true with probability p. */
export function chance(state: RngState, p: number): [boolean, RngState] {
  const [f, next] = nextFloat(state);
  return [f < p, next];
}
