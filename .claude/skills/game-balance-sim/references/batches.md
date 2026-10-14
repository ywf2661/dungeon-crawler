# Monte Carlo batches

## Sizing a batch

```
runs = levels × seeds × bots  (+ one pass of forced builds)
```

A common shape: a handful of acts/levels (3-8), 30 seeds, 3 bots (Greedy,
Planner, Reference) plus forced builds — e.g. 40 stages × 30 seeds × 3 bots
plus forced runs, for a game with many short stages; scale the level count
to whatever the game actually has. 30 seeds per (level, bot) keeps sampling
error on a clear-rate
percentage near **±5 points** at typical batch sizes (roughly the standard
error of a proportion at n≈30 per cell; more seeds tightens this, fewer
widens it — if a scorecard result sits right at a target boundary, that's a
signal to add seeds before concluding anything, not to eyeball it).

Size the batch to fit your time budget (a common target: something that
finishes in about an hour on a small server for a full production game; the
toy example in this repo's `template/` runs its whole demo batch in well
under a minute on a laptop). If a full batch doesn't fit the budget, prefer
fewer seeds across all cells over dropping bots or levels — losing a whole
bot or level loses a whole axis of signal, while fewer seeds just widens
error bars predictably.

## Sharding

`--shard i/n` runs only jobs where `job_index % n === i`, so a batch can be
split across `n` machines/processes. Each shard writes its own
`runs.jsonl`; concatenating the shards' files afterward reconstructs the
full batch. See `template/src/runner.ts`'s `--shard` flag for a working
implementation — the job list (the full levels × seeds × bots cross product)
is built once, deterministically, before sharding, so every shard's slice is
disjoint and the union is exactly the full batch.

## What a run record needs

One line of JSONL per run:

```
{
  "runId": "...",
  "level": 3,
  "seed": 1042,
  "bot": "reference",
  "tuning": { ...the exact tuning object this run used... },
  "actions": ["engage", "buy:item_a", "skip", "engage", ...],
  "result": { "status": "won", ... whatever the engine's result() returns ... }
}
```

The `seed` + `level` + `tuning` + `actions` list is, by construction (Phase
1's purity requirement), everything needed to reproduce `result` exactly.
That's what makes replay possible.

## Record and replay (finalize)

A batch isn't trustworthy until every run in it has been replayed and
confirmed to reproduce exactly:

```
for each record in runs.jsonl:
    state = engine.init(record.seed, record.level, record.tuning)
    for action in record.actions:
        assert action in engine.legalActions(state)   # catches drift too
        state = engine.apply(state, action)
    assert engine.isTerminal(state)
    assert deepEqual(engine.result(state), record.result)
```

Any run that fails this means one of:

- **The engine is nondeterministic** — a bug in Phase 1's purity (ambient
  randomness, mutation, hidden state). This is the most important failure
  mode to catch, because a nondeterministic engine silently corrupts every
  scorecard and diagnostic built on it without ever raising an error on its
  own.
- **Something upstream corrupted the record** — a serialization bug, a race
  condition in a parallel runner, truncated output.
- **An action list references a state the current engine build can't
  produce** — e.g. replaying an old batch's runs after a tuning/engine
  change. This is expected and fine when intentional (you're checking
  reproducibility of *old* runs against *old* tuning, which should still
  work since `tuning` is recorded per-run) — but if it fails, that's a sign
  the tuning override wasn't actually applied consistently at record time.

Reject failing runs from the scorecard rather than silently including them —
a scorecard built partly on unverifiable runs is worse than a smaller,
fully-verified one. `template/src/replay.ts` implements this end-to-end and
writes a pass/fail report; wire it into CI if this repo's batches run
regularly.

## Order of operations

Always: **sim → replay (finalize) → scorecard → diagnostics.** Running
diagnostics or trusting a scorecard before replay has passed means debugging
on top of runs that might not even be real.
