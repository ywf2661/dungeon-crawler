/**
 * Reference bot — the one targets are measured against.
 *
 * A sensible human, not an optimizer:
 *   - Attention horizon: only seriously considers the top `attentionSpan`
 *     actions by shallow "card reading" score (a human doesn't fully
 *     evaluate every shop offer before narrowing down).
 *   - Blend: scores each considered action as
 *       0.55 * normalized(simulated utility)  +  0.45 * normalized(card reading score)
 *     i.e. mostly "what does playing this out look like", partly "what does
 *     this look like on paper" (tags, rarity, printed stats).
 *   - Comfort threshold: drops any considered action whose simulated
 *     utility trails the best simulated option by more than
 *     `comfortThreshold` — a human won't pick something that reads well but
 *     simulates as clearly worse, even if the blend would rank it high.
 *   - Softmax over what's left, with `temperature`: better options are
 *     likelier, not certain. This is the one place true randomness enters a
 *     bot's decisions, and it is drawn from the policy RNG (not the engine's
 *     RNG), so re-running a seed reproduces the same choices.
 *
 * IMPORTANT: these parameters (weights, attention span, comfort threshold,
 * temperature) describe a plausible human and must never be fitted to hit
 * the targets in targets.json. If the Reference bot needs retuning to pass,
 * that's the game that needs retuning, not the bot — see references/bots.md.
 */
import type { AnyEngine, Bot } from "./types.js";
import { nextFloat, type RngState } from "../rng.js";

export interface ReferenceBotOptions {
  simWeight?: number; // default 0.55
  cardWeight?: number; // default 0.45
  attentionSpan?: number; // default 3
  comfortThreshold?: number; // default 0.35, in evaluate()'s own units
  temperature?: number; // default 0.35
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span < 1e-9) return values.map(() => 0.5);
  return values.map((v) => (v - min) / span);
}

function softmaxSample(
  scores: number[],
  temperature: number,
  rng: RngState,
): [number, RngState] {
  const maxScore = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - maxScore) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  const [r, next] = nextFloat(rng);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += (weights[i] as number) / total;
    if (r < acc) return [i, next];
  }
  return [weights.length - 1, next];
}

export function createReferenceBot<TState, TAction>(
  engine: AnyEngine<TState, TAction>,
  options: ReferenceBotOptions = {},
): Bot<TState, TAction> {
  const simWeight = options.simWeight ?? 0.55;
  const cardWeight = options.cardWeight ?? 0.45;
  const attentionSpan = options.attentionSpan ?? 3;
  const comfortThreshold = options.comfortThreshold ?? 0.35;
  const temperature = options.temperature ?? 0.35;

  return {
    name: "reference",
    choose(state: TState, legalActions: TAction[], policyRng: RngState): [TAction, RngState] {
      if (legalActions.length === 0) {
        throw new Error("reference bot: no legal actions");
      }
      if (legalActions.length === 1) {
        return [legalActions[0] as TAction, policyRng];
      }

      // Narrow to the actions a human would actually stop to consider.
      const byCardScore = legalActions
        .map((action) => ({ action, card: engine.cardReadingScore(state, action) }))
        .sort((a, b) => b.card - a.card)
        .slice(0, Math.max(1, attentionSpan));

      const simUtilities = byCardScore.map(({ action }) => engine.evaluate(engine.apply(state, action)));

      // Comfort threshold: drop options that simulate far worse than the best one.
      const bestSim = Math.max(...simUtilities);
      const kept = byCardScore
        .map((entry, i) => ({ ...entry, sim: simUtilities[i] as number }))
        .filter((entry) => bestSim - entry.sim <= comfortThreshold);
      const pool = kept.length > 0 ? kept : byCardScore.map((entry, i) => ({ ...entry, sim: simUtilities[i] as number }));

      const normSim = normalize(pool.map((e) => e.sim));
      const normCard = normalize(pool.map((e) => e.card));
      const blended = pool.map((_, i) => simWeight * (normSim[i] as number) + cardWeight * (normCard[i] as number));

      const [pickIndex, nextRng] = softmaxSample(blended, temperature, policyRng);
      return [pool[pickIndex]!.action, nextRng];
    },
  };
}
