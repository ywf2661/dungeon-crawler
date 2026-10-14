# Chain parity (Solana-specific)

Skip this entirely if the game is fully client-side. If any rules run
on-chain — combat resolution, an economy, matchmaking, item effects — the
client engine from Phase 1 has to match the on-chain program exactly before
any simulation built on it means anything: a Monte Carlo batch that's
correct against the client but diverges from the program is measuring a
game that doesn't actually exist.

## The differential-testing loop

1. **Localnet.** Run the program against a local validator (or an
   ephemeral/forked environment), not devnet or mainnet — parity testing
   needs fast iteration and full control over initial state.
2. **Play the same action sequence through both.** For each seed/level, run
   identical actions through the client engine and through the on-chain
   program (via whatever client/SDK sends the equivalent instruction).
3. **Compare state after *every* action, not just at the end.** Comparing
   only final state hides exactly where two implementations diverged, which
   turns debugging into a bisection exercise you didn't need to have. Diff
   every field the program's account state exposes against the client
   state's equivalent fields after each step.
4. **Fix every divergence.** Common sources: different rounding
   (integer/fixed-point on-chain vs. floats client-side), different RNG
   (on-chain randomness is often derived differently — e.g. from a
   verifiable source or slot hash — than a client-side seeded PRNG),
   off-by-one in turn/phase ordering, and CPI side effects the client model
   doesn't represent (token transfers, PDA rent, etc. that don't change
   "the fight" but do change account state a naive parity check might
   compare).
5. **Only after a full run matches end-to-end**, treat that seed/action
   sequence as parity-clean.

## Fixtures

Once a sequence has been played through both systems and matches, freeze it:
record `(seed, level, tuning, actions[], client_result, chain_result)` as a
regression fixture. Fixtures do two jobs:

- They catch *client* regressions (Phase 6's replay/finalize step already
  does this for the client alone — a fixture additionally locks in that the
  client agrees with a real chain-confirmed outcome, not just with itself).
- They catch *program* regressions if the program changes later (a new
  program build that no longer reproduces a chain-confirmed fixture is a
  parity break, caught before it reaches devnet/mainnet).

Store fixtures alongside other run records (see `references/batches.md`'s
JSONL shape) so the same replay tooling can be pointed at them.

## What counts as "confirmed"

A fixture should be built from an actual on-chain transaction that landed
(localnet is fine, but it must be a real program execution — not a
hand-computed expected value). "Chain-confirmed" means the program itself
produced the recorded result, not that someone eyeballed the math and it
looked right.

## When parity work surfaces a text-vs-code conflict

It's common, while chasing a divergence, to discover that a tooltip, card
text, or design doc says one number and the program (or the client) does
something else. **This is a ruling for the user, not something to resolve
by picking whichever side looks more "correct."** Surface it plainly: here's
what the text says, here's what the code does, which one is the intended
behavior? Don't proceed past it with an assumption. See the Item Text
Rulings pattern in the main SKILL.md's Phase 9 checkpoints for how this
tends to recur during the tuning loop as well, once numbers start moving.

## Re-running the sweep after tuning

Phase 10 (Port and prove) ends with re-running this entire parity sweep
against the ported, final numbers — not just the client-side "manifest with
tuning == defaults without tuning" check. A tuning change that only touched
the client's tuning manifest but wasn't correctly ported to the on-chain
program's constants is exactly the kind of bug this sweep exists to catch
before it ships.
