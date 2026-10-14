# Bots

Three skill levels plus a forced-build mode. All four share one rule: a bot
only ever acts on information a player could have (`observe(state)`) plus
predictions it computes by **simulating the real engine on a private copy of
the state** — never a separate hand-coded model of what the engine would do.
That second part matters as much as the first: a bot that approximates
combat instead of running it will drift from the real engine the moment
anyone tunes a number, silently invalidating every batch built on it.

Working TypeScript for all three: `template/src/bots/{greedy,planner,reference}.ts`.

## Greedy — lower bound

No lookahead. Score every legal action with a shallow heuristic and take the
best score. This is also what plays forced builds (below) — give it a fixed
starting loadout and it plays every other decision with the same simple
policy.

```
function greedyChoose(state, legalActions):
    return argmax(legalActions, action => cardReadingScore(state, action))
```

A commonly useful per-action scoring shape, for a shop-style decision:

```
buyScore(item) = itemValue(item) - 0.2 * item.cost
# buy the highest-scoring affordable item if buyScore > 0, else skip
```

For a forced fight/engage decision with no lookahead available: "fight only
if a win is predicted" — using a cheap heuristic comparison (e.g. rough
attack/defense/HP totals), not a full simulation. The point of Greedy is
that it's *not* doing planner-grade work.

## Planner — upper bound

Full one-ply lookahead: actually run every legal action through the real
engine (`apply`, which is pure — this is just calling it and keeping the
result) and score the resulting state with the engine's `evaluate`. Take the
action with the highest resulting utility.

```
function plannerChoose(state, legalActions):
    return argmax(legalActions, action => evaluate(apply(state, action)))
```

A common `evaluate` shape for a roguelike-style structure — value a loadout
by playing out the *next fixed fight* (e.g. the upcoming boss) at full HP:

```
evaluate(state):
    if terminal: return terminal-appropriate constant (e.g. 0 lost, 2 won)
    target = the next forced encounter ahead of this decision
    sim = simulateAverageFight(currentStats(state), target)  # no RNG, expected damage
    return sim.win ? 1 + sim.playerHpShareRemaining
                   : sim.enemyHpShareRemoved
```

Note what `evaluate` must *not* do: if there are several equally-likely
variants of "the next boss" and the player has no in-game way to know which
one was rolled, `evaluate` should score against an **expected** encounter
(e.g. mean stats across variants), not the actual one sitting in hidden
state — otherwise Planner (and Reference, which also calls `evaluate`) gets
foreknowledge no real player has, which quietly erodes fairness-band signal
in later diagnostics. `template/examples/toy-dungeon/engine.ts`'s
`nextEncounter`/`expectedBossSpec` is a worked example of getting this right.

This is a one-ply lookahead, not a full-run search — it answers "of my
immediate options, which leaves me best off." A game with meaningfully
deeper decision trees can swap in real search here without changing how the
rest of the harness calls it.

## Reference — what targets are measured on

A plausible human, not an optimizer. Four ingredients:

**1. Attention horizon.** Only seriously considers the top-N legal actions
by shallow card-reading score (a human doesn't fully evaluate every shop
offer before narrowing down) — e.g. N=3.

**2. Blend.** For each considered action, combine simulated utility with the
shallow read:

```
score(action) = 0.55 * normalize(evaluate(apply(state, action)))
              + 0.45 * normalize(cardReadingScore(state, action))
```

`cardReadingScore` is the "reading the card" heuristic: same-tag synergy
with what's already owned, rarity, printed stats — information visible
without simulating anything. Normalize both components (e.g. min-max across
the candidate set) before blending so their scales don't dominate each other
arbitrarily.

**3. Comfort threshold.** Drop any considered action whose simulated utility
trails the best simulated option among the considered set by more than a
threshold (e.g. 0.35 on `evaluate`'s own scale) — a human won't pick
something that reads well on paper but clearly simulates worse, even if the
blend would otherwise rank it high.

**4. Softmax choice.** Sample from what's left with a temperature: better
options are likelier, not certain.

```
function referenceChoose(state, legalActions, policyRng):
    considered = topN(legalActions, by=cardReadingScore, n=attentionSpan)
    scored = considered.map(a => {
        sim: evaluate(apply(state, a)),
        card: cardReadingScore(state, a),
    })
    bestSim = max(scored.sim)
    kept = scored.filter(s => bestSim - s.sim <= comfortThreshold) or scored if empty
    blended = kept.map(s => simWeight * normalize(s.sim) + cardWeight * normalize(s.card))
    return softmaxSample(blended, temperature, policyRng)
```

Softmax sampling draws from the **policy RNG**, a stream separate from the
engine's own world/combat RNG (see `references/engine.md`) — so re-running a
seed reproduces the same bot choices, and changing bot parameters never
perturbs world generation.

### The rule that makes Reference trustworthy

Weights, attention span, comfort threshold, and temperature describe a
plausible human and must **never be fitted to hit targets**. If the
Reference bot needs retuning to pass a scorecard, the conclusion is that the
*game* needs retuning — not the bot. Fitting the bot to the target defeats
the entire point of having a target: it turns the scorecard into a tautology
instead of a measurement. Pick these parameters once, based on what a
reasonable player's behavior looks like, and leave them alone through the
tuning loop.

## Forced builds

A fixed loadout, given for free at the start of a run (day 1) or injected
mid-run, played by the Greedy bot. This exists specifically to catch
dominant builds: if a suspiciously strong-looking combo clears at a rate far
above the organic baseline (see the build-spread target in
`references/targets.md`), that's the signal, independent of whether any bot
would naturally *choose* that combo through normal play.

```
init(seed, level, tuning with tuning.forcedItems = "item_a,item_b")
# then play out with the Greedy bot as normal
```
