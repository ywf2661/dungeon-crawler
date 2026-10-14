# Tuning loop

## Tunables are data, not code

Every value that might change during a balance pass lives in a manifest's
`tuning` block — overrides layered on top of the engine's own shipped
defaults (an empty `tuning: {}` plays exactly the shipped numbers). A tuning
*candidate* is therefore a JSON diff, never a branch, never a code fork:

```json
{
  "tuning": {
    "bossBaseHp": 46,
    "dominantComboBonus": 2
  }
}
```

This is what makes the loop below fast to iterate and easy to review — a
candidate is a small, readable diff against a known-good baseline, and
"what changed" is always answerable by diffing two manifests.

## The loop

```
change (edit tuning block)
  -> batch (npm run sim -- --manifest ... --out ...)
    -> finalize (npm run replay -- ...)          # reject nondeterministic runs first
      -> scorecard (npm run scorecard -- ...)
        -> diagnose (npm run items / npm run calibrate / etc., if something FAILs)
          -> repeat
```

Each iteration should change as little as possible — see "one lever per
question" below — so that when a scorecard row flips from FAIL to PASS (or
vice versa), it's attributable to something specific.

## CHANGES log

Keep a running log mapping every tuning change to everywhere it needs to be
ported once finalized:

```
2026-XX-XX  dominantComboBonus 6 -> 2
  reason: item-strength combo check showed +0.24 avg superadditivity (item_a + item_b),
          well above the dominant-combo threshold; build-spread target FAILed
          at levels 2-3 with the forced pair.
  port to: client engine defaults, on-chain program constants, item tooltip text
```

This log is what Phase 10 (Port and prove) works from — a change that was
tuned and verified in the manifest but never appears in the CHANGES log is a
change that's at real risk of not making it into the shipped defaults or the
on-chain program.

## Rules that hold up in practice

**Tune existing mechanics only, unless told otherwise.** A stated scope
limit like "no new mechanics" is a hard constraint for the whole loop, not a
suggestion — if the diagnostics point toward a fix that would require a new
mechanic (a new item type, a new resource), that goes back to the user as a
question, not as something to build anyway because it seemed like the right
call.

**One lever per question.** Change one tunable (or one tightly-related
group) per batch. Changing several unrelated numbers at once and then
running the scorecard makes it impossible to attribute a PASS/FAIL flip to
any one of them — the next iteration ends up re-deriving what should have
been known from this one.

**Watch for HP floors.** If a boss/enemy needs to scale below roughly half
its base HP to hit its fairness-band target, that's usually not really a
"this boss is too tanky" problem — it's a "player power is over-tuned"
problem showing up at one specific encounter. See the calibration-smell note
in `references/diagnostics.md`; flag it rather than silently applying the
scale.

**Per-entity overrides: check whether they replace or add.** A common bug
shape: a per-boss or per-enemy override in the manifest is meant to
*replace* the base value for that entity, but the engine implementation adds
it to the base value instead (or vice versa). This silently produces wildly
wrong numbers for exactly the entities someone was trying to hand-tune, and
it's easy to miss because the override *looks* correct in the manifest.
Check this explicitly the first time any per-entity override is used against
a given engine, not just the first time it "looks wrong."

**Checkpoints stay live through every iteration**, not just at the start:
- A text-vs-code conflict discovered mid-loop (a tooltip says one number,
  the tuning value is another) is a ruling for the user.
- Scope limits stated at intake apply to every subsequent change, not just
  the first one.
