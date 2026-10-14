import type { GameEngine } from "../engine.js";
import type { RngState } from "../rng.js";

/**
 * A bot picks one of the legal actions at a state. It only ever reads the
 * state through the engine's own player-facing hooks — `apply`,
 * `evaluate`, `cardReadingScore` — never by reaching into fields an engine
 * author didn't mean to expose. A conforming `GameEngine.evaluate` and
 * `cardReadingScore` must themselves only use information the player could
 * see (see `observe`) plus the outcome of actually simulating forward,
 * which is the "predictions computed by running the real engine on a copy
 * of the state" rule from references/bots.md. Keeping that boundary in the
 * engine (not the bot) is what lets every bot share one implementation.
 *
 * Bots that need randomness (the Reference bot's softmax sampling) take and
 * return a policy RngState explicitly, same discipline as the engine's own
 * RNG. The policy RNG is seeded from the run's seed but is a *separate*
 * stream from the engine's RNG, so changing bot behavior never perturbs
 * world generation and vice versa.
 */
export interface Bot<TState, TAction> {
  name: string;
  choose(state: TState, legalActions: TAction[], policyRng: RngState): [TAction, RngState];
}

export type AnyEngine<TState, TAction> = GameEngine<TState, TAction, unknown, unknown>;
