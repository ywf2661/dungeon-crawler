# Engine: headless, deterministic, pure

The single hardest prerequisite for everything else in this method. If the
engine isn't actually pure and deterministic, every batch, scorecard, and
diagnostic built on it is measuring noise.

## The shape

```
type Engine<State, Action, Observation, Result> = {
  init(seed, level, tuning): State
  legalActions(state): Action[]        // [] iff isTerminal(state)
  observe(state): Observation          // player-visible slice of state
  apply(state, action): State          // pure; never mutates `state`
  isTerminal(state): boolean
  result(state): Result                // only valid once isTerminal
  evaluate(state): number              // heuristic utility, for bot lookahead
  cardReadingScore(state, action): number  // shallow "how does this look" score
}
```

`evaluate` and `cardReadingScore` aren't part of "the rules" in the strict
sense — they're the hooks that let generic bots (Phase 4) make decisions
without the harness needing game-specific knowledge. Write them once,
alongside the engine, and keep them honest: `evaluate` may only use
information a player could infer plus the result of actually simulating
forward (never peek at hidden state, like which of several equally-likely
enemy variants was rolled before the player has revealed it).

## What "pure" has to mean

- No `Date.now()`, no `Math.random()`, no reading a clock or an external
  service.
- No mutation of the input `state` — always build and return a new one.
  (Object spread / structural sharing is fine and fast; in-place mutation of
  shared substructures is not, because it corrupts whatever else is still
  holding a reference to the "old" state — including the copy replay.ts
  compares against.)
- No hidden state outside of what's in `state`. If two calls to `init` with
  the same `(seed, level, tuning)` don't produce byte-identical states, or
  two calls to `apply` with the same `(state, action)` don't produce
  byte-identical results, nothing downstream can be trusted.

A good litmus test: serialize `state` to JSON before and after calling
`apply` on a *cloned* copy. The original must be byte-identical.

## Seeded RNG, threaded through state

All randomness — combat variance, shop offers, loot rolls, enemy variants —
comes from one RNG whose *state* lives inside the game state, not from a
global generator. Represent RNG state as pure functions:

```
seedRng(seed: number): RngState
nextFloat(state: RngState): [value: number, nextState: RngState]
```

Every call that needs randomness takes the current RNG state and returns
both a value and the next RNG state, which then gets threaded back into the
game state. This is what makes `(seed, level, tuning, actions[])` alone
enough to reproduce a run exactly — see `template/src/rng.ts` for a working
32-bit splitmix-style implementation with helpers for `nextInt`, `choice`,
`sample` (without replacement), and `chance` (Bernoulli).

**Two separate RNG streams matter:** the engine's own world/combat RNG, and
a *policy* RNG the harness gives bots for their own randomness (the
Reference bot's softmax sampling). Keep these separate (seed the policy RNG
from the run seed with a different fold) so that changing bot behavior never
perturbs world generation, and vice versa — otherwise "same seed, different
bot" runs stop being comparable.

## Extracting an engine that currently lives in a UI/client

Most of the actual effort in Phase 1 is this extraction, not writing new
logic:

1. Find every place game rules read from or write to something other than
   the passed-in state: `Date.now()`, animation timers, direct DOM/UI reads,
   a live RPC call, `Math.random()`. Each one needs to become either a pure
   function of `state`, or removed from the reducer and pushed to a
   presentation layer that wraps the pure core.
2. Inventory every random draw (crit rolls, loot tables, matchmaking,
   shuffle) and route it through the threaded RNG instead of an ambient one.
3. Write `legalActions` and `apply` to cover every decision point a player
   actually makes — including ones that feel automatic in the UI (e.g. "end
   turn" or "continue") if they can branch on hidden state.
4. Keep `observe(state)` honest: return only what a player can currently
   see. This matters more than it looks like it does — bots built on top
   will happily exploit any leak (see `references/bots.md`'s note on the
   attention span / comfort threshold needing real info to work against).

## Determinism smoke test

Before moving to Phase 2 or Phase 4, run this check (or the equivalent —
`template/test/toy-dungeon-engine.test.ts` has a working example):

```
run1 = play(engine, seed=42, level=1, actions=[...fixed sequence...])
run2 = play(engine, seed=42, level=1, actions=[...same sequence...])
assert deepEqual(run1.result, run2.result)
```

If this doesn't hold, stop and fix it before writing a single bot — it will
otherwise silently poison every later phase (Phase 6's replay/finalize step
exists specifically to keep catching this on an ongoing basis, but it
shouldn't be the first line of defense).
