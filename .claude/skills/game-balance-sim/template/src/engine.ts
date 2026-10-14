/**
 * The generic contract every game implements to be simulated by this harness.
 *
 * Implement this once per game. Everything else in `src/` (bots, runner,
 * replay, scorecard, diagnostics) is written only against this interface, so
 * it works unchanged for any game that satisfies it.
 *
 * Rules for a valid implementation (see references/engine.md for why these
 * matter):
 *   - `apply` must be pure: same (state, action) in, same new state out,
 *     forever. No `Date.now()`, no `Math.random()`, no filesystem, no
 *     mutation of the input state.
 *   - All randomness is drawn from an RNG state that lives *inside* `TState`
 *     and is threaded through explicitly (see src/rng.ts). That is what
 *     makes a run reproducible from (seed, level, tuning, actions[]) alone.
 *   - `legalActions` must return a non-empty array until `isTerminal` is
 *     true. A state with exactly one legal action is fine (e.g. "resolve
 *     this fight") — the point is bots always choose *something*, so every
 *     run is a clean action log.
 */

export type Tuning = Record<string, number | string | boolean>;

export interface GameEngine<TState, TAction, TObservation, TResult> {
  /** Build the initial state for one run. Must be a pure function of its inputs. */
  init(seed: number, level: number, tuning: Tuning): TState;

  /** Actions available at this state. Empty iff `isTerminal(state)`. */
  legalActions(state: TState): TAction[];

  /**
   * The player-visible slice of `state`. Bots only ever see this, never the
   * raw state — that's what keeps a "reference bot" honest about only using
   * information a real player would have.
   */
  observe(state: TState): TObservation;

  /** Pure state transition. Never mutates `state`. */
  apply(state: TState, action: TAction): TState;

  isTerminal(state: TState): boolean;

  /** Final outcome, only meaningful once `isTerminal(state)` is true. */
  result(state: TState): TResult;

  /**
   * Heuristic utility of a state, used by the Planner and Reference bots to
   * score hypothetical futures ("if I bought this item, how would the next
   * boss fight go?"). This is the one place a game injects domain knowledge
   * into bot decision-making; see references/bots.md for the shape this
   * usually takes (predicted win/loss margin against the next fixed fight).
   */
  evaluate(state: TState): number;

  /**
   * "Card reading" score for a candidate action from the current state,
   * without simulating it: same-tag synergy, rarity, printed stats. Used by
   * the Reference bot to blend a shallow human-like read with real
   * simulation. See references/bots.md.
   */
  cardReadingScore(state: TState, action: TAction): number;

  /** Short, stable label for an action, used in bot priority lists and logs. */
  describeAction(state: TState, action: TAction): string;
}

/** One completed run, as written to a JSONL run log by the runner. */
export interface RunRecord<TAction, TResult> {
  runId: string;
  level: number;
  seed: number;
  bot: string;
  tuning: Tuning;
  actions: TAction[];
  result: TResult;
}
