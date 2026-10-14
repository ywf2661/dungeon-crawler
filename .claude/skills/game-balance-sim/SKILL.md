---
name: game-balance-sim
description: Use when balancing a game with simulated players — running bots/Monte Carlo batches to tune difficulty, find dominant builds, spot useless items, or fix uneven bosses/enemies. Applies to any game with rules that can be run headlessly (roguelikes, deckbuilders, tactics games, economy/idle games), on-chain or off. Trigger phrases: "balance my game", "tune difficulty", "run bot simulations", "find dominant builds", "is this item useless", "clear rate targets", "Monte Carlo balance pass".
---

# Game Balance Sim

Balance a game the way you'd test any other system with unclear behavior:
build a headless model of the rules, throw simulated players at it in bulk,
measure against numeric targets, and use diagnostics to find *why* a number
is off before changing anything. This is not playtesting with humans — it's
the thing you run between playtests, in minutes, as many times as you want.

The method below was distilled from a real balance pass on a roguelike
dungeon game. It is written to be game-agnostic: no game
names, no item names, no other games are referenced anywhere in this skill.

## When to stop and read further

This file is the workflow. Details, formulas, and pseudocode live in
`references/`. Read a reference file when you reach the phase it covers —
don't front-load all of them.

## Phase 0 — Intake (ask the user, don't assume)

Before writing anything, ask:

1. **Engine language and where the rules live.** Is there already a
   headless/pure implementation, or does game logic live inside a UI/engine
   (Unity, Godot, a React client) and need extracting?
2. **On-chain program or not?** If the game (or part of it — combat,
   economy, matchmaking) runs on Solana, parity with the chain is a
   prerequisite for trusting any simulation (Phase 2). If everything is
   client-side, skip straight to Phase 3.
3. **Targets.** Does the user already have numeric targets (clear rates,
   fairness bands, resource-use ranges)? If not, this is a **checkpoint** —
   don't invent targets. Ask, or help the user derive them from design intent
   (see `references/targets.md` for the shape targets usually take).
4. **Scope limits.** Confirm explicitly: is new-mechanic design in scope, or
   only tuning numbers on what already exists? Most balance passes are
   numbers-only — assume that unless told otherwise, and treat "no new
   mechanics" as a hard constraint once stated.

Do not proceed past intake with assumptions standing in for these answers.

## Phase 1 — Headless, deterministic engine

The game's rules become a pure reducer: `(state, action) -> state`. No UI, no
wall clock, no network calls, no ambient randomness — every random draw comes
from a seeded RNG carried inside `state` and threaded explicitly through
every transition.

This is almost always the biggest chunk of work in a balance pass, especially
when the rules currently live inside a rendering/UI layer. See
`references/engine.md` for the extraction pattern, seeded-RNG idioms, and
what "pure" actually has to mean here (no `Date.now()`, no mutation, no
hidden state).

The `template/` in this repo (`template/src/engine.ts` +
`template/examples/toy-dungeon`) is a working, minimal example of this shape
— copy its structure, not its content.

## Phase 2 — Chain parity (Solana only, skip if fully client-side)

If any rules also run on-chain, the client engine must match the program
exactly. Play the same action sequence through both, compare state after
*every* action (not just at the end), and fix every divergence before trusting
any simulation built on the client engine. Chain-confirmed fights become
regression fixtures once they pass.

See `references/parity.md` for the differential-testing loop and fixture
format. **Checkpoint:** if parity work turns up a text-vs-code conflict
(the UI/docs say one number, the program does another), that is a ruling for
the user to make, not something to resolve by guessing which is "right."

## Phase 3 — Targets first

Write numeric targets *before* touching any tuning value. Typical shapes:

- Clear rate per act/stage for a reference player, progressively harder
  (e.g. 75/54/37/20).
- Fairness bands: same-slot bosses/enemies within a points band of their
  mean (e.g. ±10).
- Build spread: forced/dominant builds within a points band of the
  organic baseline (e.g. 15).
- Resource use: a spend range (e.g. 70-85% of gold available).
- Content use: each POI/feature/item used in at least some share of runs
  (e.g. ≥25%).

**Checkpoint:** targets come from the user (design intent), not from
whatever the simulation happens to produce. See `references/targets.md` for
the full menu and how each target is computed from run records.

## Phase 4 — Bots

Three skill levels, all seeing only player-visible information, all making
predictions by *simulating* the real engine on a private copy of the state
(never a separate hand-coded model of it):

- **Greedy** (lower bound) — fixed priority list, no lookahead.
- **Planner** (upper bound) — simulates every option, takes max utility.
- **Reference** (what targets are measured on) — blends engine simulation
  (~55%) with shallow "card reading" heuristics (~45%), limited attention
  span, a comfort threshold, and softmax choice. Its parameters describe a
  plausible human and must **never** be fitted to hit targets — if it needs
  retuning to pass, the game needs retuning, not the bot.
- **Forced builds** — a fixed day-1/mid-run loadout, played by the greedy
  bot, to catch dominant builds early.

Full pseudocode, utility formulas, and the reasoning behind each parameter:
`references/bots.md`. Working TypeScript: `template/src/bots/`.

## Phase 5 — Monte Carlo batches

Runs = levels × seeds × bots (+ forced). ~30 seeds per (level, bot) keeps
sampling error near ±5 points — see `references/batches.md` for the math and
for sizing a batch to fit a time budget, plus sharding (`--shard i/n`) for
splitting across machines.

## Phase 6 — Record and replay (finalize)

Every run records its seed, tuning, and full action list. A finalize step
replays each run from that record and **rejects any that doesn't reproduce
exactly** — this is what catches nondeterminism bugs before they corrupt a
scorecard. `template/src/replay.ts` implements this; details and failure
modes in `references/batches.md`.

## Phase 7 — Scorecard

Aggregate the (now replay-verified) runs into a PASS/FAIL table against
Phase 3's targets. `template/src/scorecard.ts` does this generically from a
`targets.json` and a `runs.jsonl`. Read `references/targets.md` for what each
row means and how to react to a FAIL (tune vs. re-examine the target).

## Phase 8 — Diagnostics

When the scorecard says *something* is wrong, diagnostics say *what*:

- **Exhaustive item strength** — add each item to standard loadouts, fight
  representative enemies/bosses across levels, Δscore where ~1.0 ≈ one loss
  flipped to a win. Finds useless items and (via a combo check) dominant
  pairs.
- **Exhaustive build combinations** — every k-item combo per archetype;
  best/median/worst.
- **Leave-one-out** — which single item is carrying a build.
- **Counterfactual boss/enemy calibrator** — re-fight recorded encounters
  with HP scaled ×0.5-1.5, find the scale that would move a boss to its
  slot's mean, gated so it never reacts to noise (only move when it closes
  the gap by ≥4 points).

Pseudocode and exact definitions: `references/diagnostics.md`. Working
examples: `template/src/tools/item-strength.ts`,
`template/src/tools/boss-calibrator.ts`.

## Phase 9 — Tuning loop

Tunable numbers live in a manifest's `tuning` block (overrides layered on
the engine's shipped defaults) — a tuning candidate is data, never a code
fork. The loop is: change → batch → scorecard → diagnose → repeat. Keep a
CHANGES log mapping every change to everywhere it needs to be ported (client,
chain program, docs).

**Checkpoints inside this loop:**
- A text-vs-code conflict (what a card/tooltip says vs. what the code does)
  is a ruling for the user — don't silently pick one.
- "No new mechanics" (or any other stated scope limit) is a hard constraint;
  a fix that needs a new mechanic goes back to the user as a question, not
  as a workaround.
- If a boss/enemy needs to drop below roughly half its HP to hit its target,
  that's usually a signal that *player power* is the real problem, not that
  specific encounter — flag it rather than just applying the scale.

Pitfalls, the manifest-override shape, and the CHANGES log format:
`references/tuning-loop.md`.

## Phase 10 — Port and prove

Port final numbers into the real game (and program, if on-chain), bake them
as the new shipped defaults, and verify **"manifest with tuning == defaults
without tuning" run-for-run** before calling it done. If Phase 2 applied,
re-run the parity sweep against the ported numbers.

## Quick start for the agent

1. Read this file fully before starting (you just did).
2. Run Phase 0 intake as actual questions to the user — do not skip it.
3. For a first pass on an unfamiliar codebase, try the template end-to-end
   on `template/examples/toy-dungeon` first (see the repo README) to get
   familiar with the shape of a run, a scorecard, and a diagnostic report
   before doing the same against the user's real game.
4. Work phase by phase. Re-read the relevant `references/*.md` at the start
   of each phase rather than trying to hold all ten phases' details in
   context at once.
