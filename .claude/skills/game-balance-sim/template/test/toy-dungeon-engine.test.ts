import assert from "node:assert/strict";
import { test } from "node:test";
import { toyDungeonEngine, type ToyAction } from "../examples/toy-dungeon/engine.js";
import { createGreedyBot } from "../src/bots/greedy.js";
import { createPlannerBot } from "../src/bots/planner.js";
import { createReferenceBot } from "../src/bots/reference.js";
import { seedRng } from "../src/rng.js";

function playOut(seed: number, level: number, tuning: Record<string, never> = {}, botName: "greedy" | "planner" | "reference" = "greedy") {
  const bot =
    botName === "greedy"
      ? createGreedyBot(toyDungeonEngine)
      : botName === "planner"
        ? createPlannerBot(toyDungeonEngine)
        : createReferenceBot(toyDungeonEngine);
  let state = toyDungeonEngine.init(seed, level, tuning);
  let policyRng = seedRng(seed ^ 0x51ed270b);
  const actions: ToyAction[] = [];
  let guard = 0;
  while (!toyDungeonEngine.isTerminal(state)) {
    if (++guard > 1000) throw new Error("runaway run");
    const legal = toyDungeonEngine.legalActions(state);
    assert.ok(legal.length > 0, "legalActions must be non-empty on a non-terminal state");
    const [action, nextRng] = bot.choose(state, legal, policyRng);
    policyRng = nextRng;
    assert.ok(legal.includes(action), `bot chose an illegal action: ${action}`);
    actions.push(action);
    state = toyDungeonEngine.apply(state, action);
  }
  return { actions, result: toyDungeonEngine.result(state) };
}

test("apply() does not mutate the input state (purity)", () => {
  const state = toyDungeonEngine.init(1, 1, {});
  const before = JSON.stringify(state);
  const legal = toyDungeonEngine.legalActions(state);
  toyDungeonEngine.apply(state, legal[0]!);
  assert.equal(JSON.stringify(state), before, "apply() must not mutate its input state");
});

test("same seed + level + tuning + bot produces the exact same run twice", () => {
  const runA = playOut(123, 2, {}, "reference");
  const runB = playOut(123, 2, {}, "reference");
  assert.deepEqual(runA.actions, runB.actions);
  assert.deepEqual(runA.result, runB.result);
});

test("different seeds generally produce different action sequences", () => {
  const runA = playOut(1, 2, {}, "reference");
  const runB = playOut(2, 2, {}, "reference");
  assert.notDeepEqual(runA.actions, runB.actions);
});

test("a full run terminates in won or lost status", () => {
  for (let seed = 0; seed < 10; seed++) {
    const { result } = playOut(seed, 1, {}, "greedy");
    assert.ok(result.status === "won" || result.status === "lost");
  }
});

test("planner bot never picks an illegal action across many seeds/levels", () => {
  for (let seed = 0; seed < 10; seed++) {
    for (const level of [1, 2, 3]) {
      playOut(seed, level, {}, "planner");
    }
  }
});

test("replaying the recorded action list reproduces the recorded result", () => {
  const { actions, result } = playOut(7, 3, {}, "reference");
  let state = toyDungeonEngine.init(7, 3, {});
  for (const action of actions) {
    state = toyDungeonEngine.apply(state, action);
  }
  assert.ok(toyDungeonEngine.isTerminal(state));
  assert.deepEqual(toyDungeonEngine.result(state), result);
});

test("forced loadout tuning gives the player the named items for free", () => {
  const state = toyDungeonEngine.init(1, 1, { forcedItems: "iron_edge,reckless_charm" });
  assert.deepEqual(state.player.items.sort(), ["iron_edge", "reckless_charm"]);
});
