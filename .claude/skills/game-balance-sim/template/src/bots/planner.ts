/**
 * Planner bot — the upper bound.
 *
 * For every legal action, actually run it through the real engine (on a
 * private copy of the state — `apply` is pure, so this is just calling it
 * and keeping the result instead of the live state) and score the resulting
 * state with `engine.evaluate`. Take the action with the highest resulting
 * utility.
 *
 * This is a one-ply lookahead, not a full-run search: it answers "of my
 * immediate options, which leaves me best off," using the game's own utility
 * function (typically: the upcoming fixed fight, played out at full HP) to
 * define "best off". A game with meaningfully deeper decision trees can swap
 * in a proper search here without changing the Bot interface.
 */
import type { AnyEngine, Bot } from "./types.js";
import type { RngState } from "../rng.js";

export function createPlannerBot<TState, TAction>(
  engine: AnyEngine<TState, TAction>,
): Bot<TState, TAction> {
  return {
    name: "planner",
    choose(state: TState, legalActions: TAction[], policyRng: RngState): [TAction, RngState] {
      if (legalActions.length === 0) {
        throw new Error("planner bot: no legal actions");
      }
      let best = legalActions[0] as TAction;
      let bestUtility = -Infinity;
      for (const action of legalActions) {
        const outcome = engine.apply(state, action);
        const utility = engine.evaluate(outcome);
        if (utility > bestUtility) {
          bestUtility = utility;
          best = action;
        }
      }
      return [best, policyRng];
    },
  };
}
