# Diagnostics

A scorecard FAIL says *that* something's off. These tools say *why*, so a
tuning change targets the actual cause instead of getting adjusted by feel.

## Exhaustive item strength

For every item, add it to each of a few standard loadouts and re-fight
representative enemies/bosses across levels, comparing the with-item score
to the without-item score.

```
for item in all_items:
    deltas = []
    for loadout in standard_loadouts:
        if item in loadout: continue
        before = scoreEncounter(statsFor(loadout), probe)
        after  = scoreEncounter(statsFor(loadout + item), probe)
        deltas.append(after - before)   # for every (loadout, probe) pair
    report(item, mean(deltas))
```

`Δscore ≈ 1.0` on the same 0-2 scale `evaluate` uses means roughly "one loss
flipped to a win" — useful as a rule of thumb for how big a Δ has to be to
matter. Items whose average Δ rounds to ~0 across every loadout and probe
are candidates for a buff or removal — they exist in the game but don't
actually change outcomes. Items with very high Δ deserve a second look with
the combo tools below, since a single item rarely gets *that* strong on its
own — it's more often propping up (or dominating alongside) something else.

Working example: `template/src/tools/item-strength.ts` (runs against the
toy game; swap its item-catalog/probe-building imports for your own engine's
equivalents — the loop and reporting logic don't need to change).

## Exhaustive build combinations

Every k-item combination within an archetype/tag, scored the same way, then
summarized:

```
for tag in tags:
    itemsInTag = items with that tag
    for k in 1..maxComboSize:
        for combo in combinations(itemsInTag, k):
            scores[combo] = scoreAcrossProbes(combo)
    report best / median / worst combo per k
```

This is the direct way to catch a dominant *pair or trio* that individually
scored only moderately well in the single-item tool — the interaction is the
problem, not any one item. A useful derived signal: **superadditivity** —
does `score(A+B)` exceed `score(base) + (score(A) - score(base)) + (score(B)
- score(base))`? A large positive value means the pair is worth more
together than the sum of its parts, which is exactly the shape of a
dominant-combo bug. `template/src/tools/item-strength.ts` includes a worked
example of this specific check for one suspected pair, as a lighter-weight
alternative to the full k-combination sweep when you already have a
suspect.

## Leave-one-out

For a build that's already known to be strong, remove one item at a time and
re-score, to find which item is actually carrying it:

```
full = scoreAcrossProbes(build)
for item in build:
    reduced = scoreAcrossProbes(build - item)
    contribution[item] = full - reduced
report items ranked by contribution, descending
```

The item with the largest drop-on-removal is the one doing the real work;
everything else in the build may be closer to filler. This is often faster
than the full combination sweep once a specific build is already the
question, rather than "what's the best build in this archetype."

## Counterfactual boss/enemy calibrator

Re-fight recorded encounters with HP scaled across a range (e.g. ×0.5-1.5),
and find the scale that would move a boss/enemy to its slot's mean:

```
observed = meanPoints(recorded matchups for this variant, scale=1.0)
target   = meanPoints(recorded matchups for the whole slot, scale=1.0)
gap = abs(observed - target)
if gap < noiseGate:            # e.g. 4 points
    report "no change" — this is within sampling noise, not a real gap
else:
    scale = argmin over [0.5 .. 1.5] of
                abs(meanPoints(refight matchups at that scale) - target)
    report scale, and the resulting estimated points at that scale
```

**Re-fight each recorded matchup at the player's own recorded stats for that
fight**, not a single made-up "standard" loadout — using one arbitrary
stand-in loadout systematically offsets every variant by the same amount and
can make the *relative* comparison between variants misleading (or, worse,
point the recommended scale in the wrong direction entirely, since a
uniformly-offset baseline doesn't preserve which direction closes the real
gap). `template/src/tools/boss-calibrator.ts` records each boss fight's
`playerAttack` / `playerDefense` / `playerMaxHp` at the moment of the fight
specifically so re-fights use real matchups.

**The noise gate matters.** Without it, this tool will happily "correct" for
pure sampling noise, producing a scale recommendation on every single
variant on every run, most of which are chasing nothing. Only recommend
(and only apply) a change when it closes a gap that's unlikely to be noise —
4 points is a reasonable default at the batch sizes in
`references/batches.md`; tighten it if batches get much larger.

## A calibration smell worth flagging, not just fixing

If a boss/enemy needs to drop below roughly **half its HP** to hit its
target, don't just apply that scale and move on — flag it. That's usually a
sign the real problem is player power (items, synergies, economy) upstream
of this one encounter, and scaling the boss down is treating a symptom.
Bring it back to the user as a finding, with the item-strength and
combination diagnostics' evidence attached, before deciding whether to scale
the encounter, nerf player power, or both.
