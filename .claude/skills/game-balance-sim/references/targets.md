# Targets

Targets are written before tuning starts, and they come from the user's
design intent — never invented from whatever a first simulation happens to
produce, and never adjusted mid-loop just to make a FAIL go away without a
reason. If a target turns out to be wrong (too strict, based on a bad
assumption), that's also a decision for the user, made explicitly, not a
silent edit.

## The five target shapes this method uses

### 1. Clear rate per act/stage

A **reference player** (the Reference bot from `references/bots.md`, never
the Planner or Greedy bot — those are bounds, not the target audience)
should clear each act/stage at a rate that gets progressively harder, e.g.:

```
act 1: 75%
act 2: 54%
act 3: 37%
act 4: 20%
```

Computed as: `wins(level, reference bot) / total_runs(level, reference bot)`.
Express as a range, not a point value (e.g. 70-80%, not exactly 75%) —
sampling error means a point target will "fail" on noise alone (see
`references/batches.md` for the ±5-point-at-30-seeds math that drives how
wide this range should be).

### 2. Fairness bands

Encounters (usually bosses) that occupy the same "slot" — same position in
progression, meant to be roughly interchangeable — should perform within a
points band of their slot's mean. A common default: **±10 points**.

"Points" needs a concrete scale from the engine's own encounter-scoring
function (see `evaluate` in `references/engine.md`, typically normalized to
0-100). Compute each variant's mean points across its recorded matchups,
compare to the mean across all variants in that slot, and flag any variant
whose deviation exceeds the band.

### 3. Build spread

Forced/dominant builds shouldn't wildly outperform the organic baseline —
e.g. **within 15 points** of the baseline's clear rate. This is the most
direct signal for a dominant combo: run the suspiciously strong loadout as a
forced build (Phase 4), compare its clear rate to the Greedy bot's organic
clear rate at the same level, and flag anything outside the band.

### 4. Resource use

Players should spend a meaningful share of what they earn — a common range
is **70-85% of gold available** (starting gold + earned). Too low means the
economy is undertuned (nothing worth buying, or too much gold); too high
(at or near 100%) can also be a smell (no meaningful choice about what to
skip). Compute as an average share across runs of the reference bot.

### 5. Content use

Every piece of content meant to matter — item, POI, feature, event — should
show up in play at some minimum rate, e.g. **≥25% of runs**. An item that's
picked in 1% of runs isn't part of the game anyone experiences; that's
either a useless-item problem (see `references/diagnostics.md`'s item
strength tool) or a content-gating problem (it's technically available but
never actually offered/reachable).

## Reacting to a FAIL

A scorecard FAIL means one of three things, and figuring out which is what
Phase 8 (diagnostics) is for:

1. **The game needs tuning** — most common. Use the diagnostics to find
   *which* lever, then go around the tuning loop (Phase 9).
2. **The target was wrong** — the design intent was miscalibrated, or the
   target was set before understanding the game's actual shape. This is a
   decision for the user, made explicitly and recorded, not a quiet edit to
   `targets.json`.
3. **The bot isn't representative** — rare, and dangerous to reach for
   first. If the Reference bot's behavior genuinely doesn't resemble a real
   player, that's a bot design problem. It is never acceptable to retune the
   Reference bot's parameters specifically to make a target pass — see the
   warning in `references/bots.md`.

## Format

`template/src/scorecard.ts` reads a `targets.json` shaped like
`template/examples/toy-dungeon/targets.json` and a `runs.jsonl` (Phase 5/6's
output) and produces a markdown PASS/FAIL table per target category. Keep
targets in version control alongside the manifest they're checked against,
so a target change is a reviewable diff like any other.
