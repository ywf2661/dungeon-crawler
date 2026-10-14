/**
 * Greedy bot — the lower bound.
 *
 * No lookahead, no simulation: score every legal action with the game's
 * "card reading" heuristic (same one the Reference bot partly relies on) and
 * take the best-scoring one. Ties broken by original order, so the bot is
 * fully deterministic given a state (it doesn't even need the policy RNG,
 * but takes/returns one to keep the Bot interface uniform).
 *
 * This is also the bot that plays forced builds (see runner.ts): give it a
 * fixed starting loadout and it will still play every other decision
 * (shop/rest choices) with this same simple policy.
 */
import type { AnyEngine, Bot } from "./types.js";
import type { RngState } from "../rng.js";

export function createGreedyBot<TState, TAction>(
  engine: AnyEngine<TState, TAction>,
): Bot<TState, TAction> {
  return {
    name: "greedy",
    choose(state: TState, legalActions: TAction[], policyRng: RngState): [TAction, RngState] {
      if (legalActions.length === 0) {
        throw new Error("greedy bot: no legal actions");
      }
      let best = legalActions[0] as TAction;
      let bestScore = -Infinity;
      for (const action of legalActions) {
        const score = engine.cardReadingScore(state, action);
        if (score > bestScore) {
          bestScore = score;
          best = action;
        }
      }
      return [best, policyRng];
    },
  };
}
