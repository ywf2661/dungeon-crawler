/**
 * Toy Dungeon: a tiny roguelike-deckbuilder-shaped game that implements
 * `GameEngine`, so it can run out of the box against the whole harness.
 *
 * One run = one level (act): the player walks a fixed sequence of nodes
 * (fight / shop / rest / ... / boss), making real decisions only at shop and
 * rest nodes. Fight/boss nodes are forced ("engage" is the only legal
 * action) and resolve deterministically from the threaded RNG.
 *
 * Everything randomness-shaped is generated once at `init` from the world
 * RNG (enemy stat variance, which boss variant, shop offers) and threaded
 * forward; combat itself also draws from that same stream when a fight is
 * resolved. A run is therefore fully reproducible from (seed, level, tuning,
 * action list) alone — see skill/references/engine.md.
 *
 * Contains, on purpose: a dominant item combo, a useless item, and one
 * over-tuned boss variant per level. See items.ts and BOSS_VARIANTS below.
 * These exist so `npm run items`, `npm run calibrate` and the scorecard have
 * real problems to find.
 */
import type { GameEngine, Tuning } from "../../src/engine.js";
import { type RngState, chance, choice, nextRange, sample, seedRng } from "../../src/rng.js";
import { ITEMS, ITEM_IDS, tagCounts } from "./items.js";

export type NodeKind = "fight" | "shop" | "rest" | "boss";

// Same layout every level; only enemy/boss stats scale with level. A real
// game would vary the map too — kept fixed here so the toy stays small.
export const NODE_LAYOUT: NodeKind[] = ["fight", "fight", "shop", "rest", "fight", "shop", "fight", "boss"];

export interface BossVariant {
  key: string;
  hpMult: number;
}

// Three bosses per level "slot", meant to be roughly equal. "boss_c" is
// deliberately 35% tankier than the other two — the imbalance
// npm run calibrate is meant to catch and correct.
export const BOSS_VARIANTS: BossVariant[] = [
  { key: "boss_a", hpMult: 1.0 },
  { key: "boss_b", hpMult: 1.05 },
  { key: "boss_c", hpMult: 1.35 },
];

export interface EnemySpec {
  hp: number;
  maxHp: number;
  attack: number;
}

export interface ToyPlayer {
  hp: number;
  maxHp: number;
  gold: number;
  items: string[];
  bonusDefense: number;
}

export interface BossOutcome {
  variant: string;
  level: number;
  /** 1 + hp-share-remaining if the player won, or hp-share-removed if they lost. */
  score: number;
  /** The player's combat stats and max HP entering this fight — recorded so the
   * boss calibrator can re-fight this exact matchup deterministically at other
   * HP scales, instead of guessing at a stand-in loadout. */
  playerAttack: number;
  playerDefense: number;
  playerMaxHp: number;
}

export interface ToyState {
  level: number;
  tuning: Tuning;
  rng: RngState;
  nodeIndex: number;
  nodes: NodeKind[];
  generated: {
    enemies: Record<number, EnemySpec>;
    shopOffers: Record<number, string[]>;
    bossVariant: Record<number, string>;
  };
  player: ToyPlayer;
  status: "ongoing" | "won" | "lost";
  goldEarned: number;
  goldSpent: number;
  bossOutcome?: BossOutcome;
}

export type ToyAction = "engage" | "heal" | "upgrade" | "skip" | `buy:${string}`;

export interface ToyResult {
  status: "won" | "lost";
  level: number;
  hp: number;
  maxHp: number;
  gold: number;
  goldEarned: number;
  goldSpent: number;
  nodesCleared: number;
  totalNodes: number;
  items: string[];
  bossOutcome?: BossOutcome;
}

function num(tuning: Tuning, key: string, fallback: number): number {
  const v = tuning[key];
  return typeof v === "number" ? v : fallback;
}

function forcedItemsFrom(tuning: Tuning): string[] {
  const v = tuning.forcedItems;
  if (typeof v !== "string" || v.length === 0) return [];
  return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0 && s in ITEMS);
}

export interface CombatStats {
  attack: number;
  defense: number;
}

export function computeCombatStats(player: ToyPlayer, tuning: Tuning): CombatStats {
  let attack = num(tuning, "player_baseAttack", 7);
  let defense = num(tuning, "player_baseDefense", 3) + player.bonusDefense;
  const counts = tagCounts(player.items);
  for (const id of player.items) {
    const def = ITEMS[id];
    if (!def) continue;
    attack += def.attack;
    defense += def.defense;
  }
  const synergyBonus = num(tuning, "synergyBonus", 2);
  for (const tag of Object.keys(counts) as (keyof typeof counts)[]) {
    if (counts[tag] >= 2) attack += synergyBonus;
  }
  const [comboA, comboB] = ["iron_edge", "reckless_charm"];
  if (player.items.includes(comboA) && player.items.includes(comboB)) {
    attack += num(tuning, "dominantComboBonus", 5);
  }
  return { attack, defense };
}

/**
 * Find the next forced encounter (boss preferred, else the next fight) from
 * `fromIndex`, for `evaluate`'s lookahead.
 *
 * For a boss, this deliberately does NOT read `state.generated.enemies` —
 * that would leak which of the three boss variants was rolled before the
 * player has any in-game way to know, breaking the "bots only see
 * player-visible information" rule. Instead it builds the *expected* boss
 * (mean HP across variants) so a shop/rest decision is scored against "an
 * average boss ahead", not the specific one waiting at the end of the level.
 */
function nextEncounter(state: ToyState, fromIndex: number): EnemySpec | undefined {
  let fallback: EnemySpec | undefined;
  for (let i = fromIndex; i < state.nodes.length; i++) {
    const kind = state.nodes[i];
    if (kind === "boss") return expectedBossSpec(state.level, state.tuning);
    if (kind === "fight" && !fallback) fallback = state.generated.enemies[i];
  }
  return fallback;
}

/** Mean-HP boss spec across all variants — "an average boss", not any specific one. */
function expectedBossSpec(level: number, tuning: Tuning): EnemySpec {
  const meanHpMult = BOSS_VARIANTS.reduce((sum, v) => sum + v.hpMult, 0) / BOSS_VARIANTS.length;
  return bossSpecFor(level, { key: "expected", hpMult: meanHpMult }, tuning);
}

/** No-RNG expected-value fight, used by `evaluate` (planner/reference bot lookahead)
 * and by the diagnostic tools (item-strength, boss-calibrator), which need a cheap,
 * deterministic way to score "how would this loadout do against this enemy". */
export function simulateAverageFight(
  stats: CombatStats,
  playerHp: number,
  playerMaxHp: number,
  enemy: EnemySpec,
  tuning: Tuning,
): { playerWins: boolean; playerHpShareRemaining: number; enemyHpShareRemoved: number } {
  const critChance = num(tuning, "critChance", 0.1);
  const enemyCritChance = num(tuning, "enemyCritChance", 0.05);
  let hp = playerHp;
  let eHp = enemy.hp;
  const dmgToEnemy = Math.max(1, stats.attack) * (1 + critChance);
  const dmgToPlayer = Math.max(1, enemy.attack - stats.defense) * (1 + enemyCritChance);
  for (let round = 0; round < 60; round++) {
    eHp -= dmgToEnemy;
    if (eHp <= 0) {
      return { playerWins: true, playerHpShareRemaining: Math.max(0, hp / playerMaxHp), enemyHpShareRemoved: 1 };
    }
    hp -= dmgToPlayer;
    if (hp <= 0) {
      const removed = (enemy.hp - Math.max(eHp, 0)) / enemy.hp;
      return { playerWins: false, playerHpShareRemaining: 0, enemyHpShareRemoved: Math.min(1, Math.max(0, removed)) };
    }
  }
  const removed = (enemy.hp - Math.max(eHp, 0)) / enemy.hp;
  return { playerWins: false, playerHpShareRemaining: 0, enemyHpShareRemoved: Math.min(1, Math.max(0, removed)) };
}

/** Boss stats at a level for one variant, ignoring RNG (used by diagnostics). */
export function bossSpecFor(level: number, variant: BossVariant, tuning: Tuning): EnemySpec {
  const hp = Math.round((num(tuning, "bossBaseHp", 50) + level * num(tuning, "bossHpPerLevel", 7)) * variant.hpMult);
  const attack = Math.round(num(tuning, "bossBaseAttack", 7) + level * num(tuning, "bossAttackPerLevel", 1.1));
  return { hp, maxHp: hp, attack };
}

/** A representative (RNG-free) mid-level fight, for probing item strength. */
export function fightSpecFor(level: number, tuning: Tuning): EnemySpec {
  const hp = Math.round(num(tuning, "fightBaseHp", 16) + level * num(tuning, "fightHpPerLevel", 3));
  const attack = Math.round(num(tuning, "fightBaseAttack", 4) + level * num(tuning, "fightAttackPerLevel", 1));
  return { hp, maxHp: hp, attack };
}

/** evaluate()'s own scoring rule, exposed so diagnostics score encounters the same way the bots do. */
export function scoreEncounter(stats: CombatStats, playerMaxHp: number, enemy: EnemySpec, tuning: Tuning): number {
  const sim = simulateAverageFight(stats, playerMaxHp, playerMaxHp, enemy, tuning);
  return sim.playerWins ? 1 + sim.playerHpShareRemaining : sim.enemyHpShareRemoved;
}

function resolveEngage(state: ToyState): ToyState {
  const enemy = state.generated.enemies[state.nodeIndex];
  if (!enemy) throw new Error(`no enemy generated at node ${state.nodeIndex}`);
  const kind = state.nodes[state.nodeIndex];
  const stats = computeCombatStats(state.player, state.tuning);
  const critChance = num(state.tuning, "critChance", 0.1);
  const enemyCritChance = num(state.tuning, "enemyCritChance", 0.05);

  let rng = state.rng;
  let playerHp = state.player.hp;
  let enemyHp = enemy.hp;
  let playerWins = false;
  const maxRounds = 60;

  for (let round = 0; round < maxRounds; round++) {
    let crit: boolean;
    let variance: number;
    [crit, rng] = chance(rng, critChance);
    [variance, rng] = nextRange(rng, 0.85, 1.15);
    const dmgToEnemy = Math.max(1, Math.round(Math.max(1, stats.attack) * variance * (crit ? 2 : 1)));
    enemyHp -= dmgToEnemy;
    if (enemyHp <= 0) {
      playerWins = true;
      break;
    }

    [crit, rng] = chance(rng, enemyCritChance);
    [variance, rng] = nextRange(rng, 0.85, 1.15);
    const dmgToPlayer = Math.max(1, Math.round(Math.max(1, enemy.attack - stats.defense) * variance * (crit ? 2 : 1)));
    playerHp -= dmgToPlayer;
    if (playerHp <= 0) {
      playerWins = false;
      break;
    }
  }

  const outcomeScore = playerWins
    ? 1 + Math.max(0, playerHp / state.player.maxHp)
    : Math.min(1, Math.max(0, (enemy.hp - Math.max(enemyHp, 0)) / enemy.hp));

  let bossOutcome = state.bossOutcome;
  if (kind === "boss") {
    bossOutcome = {
      variant: state.generated.bossVariant[state.nodeIndex] ?? "unknown",
      level: state.level,
      score: outcomeScore,
      playerAttack: stats.attack,
      playerDefense: stats.defense,
      playerMaxHp: state.player.maxHp,
    };
  }

  if (!playerWins) {
    return {
      ...state,
      rng,
      player: { ...state.player, hp: 0 },
      status: "lost",
      bossOutcome,
    };
  }

  const reward = Math.round(num(state.tuning, "goldPerFightBase", 10) + state.level * num(state.tuning, "goldPerFightPerLevel", 3));
  const nodeIndex = state.nodeIndex + 1;
  const status = nodeIndex >= state.nodes.length ? "won" : state.status;
  return {
    ...state,
    rng,
    nodeIndex,
    player: { ...state.player, hp: playerHp, gold: state.player.gold + reward },
    goldEarned: state.goldEarned + reward,
    status,
    bossOutcome,
  };
}

function resolveRest(state: ToyState, action: ToyAction): ToyState {
  const player = { ...state.player };
  if (action === "heal") {
    const missing = player.maxHp - player.hp;
    player.hp = Math.min(player.maxHp, player.hp + Math.round(missing * num(state.tuning, "restHealFraction", 0.6)));
  } else if (action === "upgrade") {
    player.bonusDefense = player.bonusDefense + num(state.tuning, "upgradeDefenseBonus", 1);
  } else {
    throw new Error(`illegal rest action: ${action}`);
  }
  return { ...state, player, nodeIndex: state.nodeIndex + 1 };
}

function resolveShop(state: ToyState, action: ToyAction): ToyState {
  if (action === "skip") {
    return { ...state, nodeIndex: state.nodeIndex + 1 };
  }
  if (!action.startsWith("buy:")) throw new Error(`illegal shop action: ${action}`);
  const id = action.slice(4);
  const def = ITEMS[id];
  if (!def) throw new Error(`unknown item in action: ${action}`);
  const player = { ...state.player, items: [...state.player.items, id] };
  player.gold -= def.cost;
  if (def.maxHp) {
    player.maxHp += def.maxHp;
    player.hp += def.maxHp;
  }
  return { ...state, player, goldSpent: state.goldSpent + def.cost, nodeIndex: state.nodeIndex + 1 };
}

export const toyDungeonEngine: GameEngine<ToyState, ToyAction, ToyPlayer, ToyResult> = {
  init(seed, level, tuning) {
    let rng = seedRng((seed ^ Math.imul(level + 1, 0x9e3779b9)) >>> 0);
    const nodes = NODE_LAYOUT.slice();
    const generated: ToyState["generated"] = { enemies: {}, shopOffers: {}, bossVariant: {} };

    for (let i = 0; i < nodes.length; i++) {
      const kind = nodes[i];
      if (kind === "fight") {
        let varHp: number;
        let varAtk: number;
        [varHp, rng] = nextRange(rng, -2, 2);
        [varAtk, rng] = nextRange(rng, -1, 1);
        const hp = Math.round(num(tuning, "fightBaseHp", 16) + level * num(tuning, "fightHpPerLevel", 3) + varHp);
        const attack = Math.round(num(tuning, "fightBaseAttack", 4) + level * num(tuning, "fightAttackPerLevel", 1) + varAtk);
        generated.enemies[i] = { hp, maxHp: hp, attack };
      } else if (kind === "boss") {
        let variant: BossVariant;
        [variant, rng] = choice(rng, BOSS_VARIANTS);
        const hp = Math.round((num(tuning, "bossBaseHp", 50) + level * num(tuning, "bossHpPerLevel", 7)) * variant.hpMult);
        const attack = Math.round(num(tuning, "bossBaseAttack", 7) + level * num(tuning, "bossAttackPerLevel", 1.1));
        generated.enemies[i] = { hp, maxHp: hp, attack };
        generated.bossVariant[i] = variant.key;
      } else if (kind === "shop") {
        let offers: string[];
        [offers, rng] = sample(rng, ITEM_IDS, 3);
        generated.shopOffers[i] = offers;
      }
    }

    const startHp = num(tuning, "player_startHp", 34);
    const forced = forcedItemsFrom(tuning);
    let hpBonus = 0;
    for (const id of forced) hpBonus += ITEMS[id]?.maxHp ?? 0;

    const player: ToyPlayer = {
      hp: startHp + hpBonus,
      maxHp: startHp + hpBonus,
      gold: num(tuning, "player_startGold", 42),
      items: forced,
      bonusDefense: 0,
    };

    return {
      level,
      tuning,
      rng,
      nodeIndex: 0,
      nodes,
      generated,
      player,
      status: "ongoing",
      goldEarned: 0,
      goldSpent: 0,
    };
  },

  legalActions(state) {
    if (state.status !== "ongoing") return [];
    const kind = state.nodes[state.nodeIndex];
    if (kind === "fight" || kind === "boss") return ["engage"];
    if (kind === "rest") return ["heal", "upgrade"];
    if (kind === "shop") {
      const offers = state.generated.shopOffers[state.nodeIndex] ?? [];
      const actions: ToyAction[] = [];
      for (const id of offers) {
        const def = ITEMS[id];
        if (def && !state.player.items.includes(id) && state.player.gold >= def.cost) {
          actions.push(`buy:${id}`);
        }
      }
      actions.push("skip");
      return actions;
    }
    return [];
  },

  observe(state) {
    // The player only ever sees their own character sheet — not the RNG
    // state, not future node contents beyond what's been generated for
    // display (shop offers at the current node are fine; enemies further
    // ahead are not exposed here).
    return state.player;
  },

  apply(state, action) {
    if (state.status !== "ongoing") return state;
    const kind = state.nodes[state.nodeIndex];
    if (kind === "fight" || kind === "boss") return resolveEngage(state);
    if (kind === "rest") return resolveRest(state, action);
    if (kind === "shop") return resolveShop(state, action);
    throw new Error(`unknown node kind at index ${state.nodeIndex}`);
  },

  isTerminal(state) {
    return state.status !== "ongoing";
  },

  result(state) {
    if (state.status === "ongoing") throw new Error("result() called on a non-terminal state");
    return {
      status: state.status,
      level: state.level,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      gold: state.player.gold,
      goldEarned: state.goldEarned,
      goldSpent: state.goldSpent,
      nodesCleared: Math.min(state.nodeIndex, state.nodes.length),
      totalNodes: state.nodes.length,
      items: state.player.items,
      bossOutcome: state.bossOutcome,
    };
  },

  evaluate(state) {
    if (state.status === "lost") return 0;
    if (state.status === "won") return 2;
    const stats = computeCombatStats(state.player, state.tuning);
    const target = nextEncounter(state, state.nodeIndex);
    if (!target) return 1;
    const sim = simulateAverageFight(stats, state.player.hp, state.player.maxHp, target, state.tuning);
    return sim.playerWins ? 1 + sim.playerHpShareRemaining : sim.enemyHpShareRemoved;
  },

  cardReadingScore(state, action) {
    const kind = state.nodes[state.nodeIndex];
    if (kind === "rest") {
      const hpShare = state.player.hp / state.player.maxHp;
      if (action === "heal") return (1 - hpShare) * 3;
      if (action === "upgrade") return hpShare * 1.5 + 0.5;
      return 0;
    }
    if (kind === "shop") {
      if (action === "skip") return num(state.tuning, "skipBaseScore", 1.0);
      const id = action.startsWith("buy:") ? action.slice(4) : "";
      const def = ITEMS[id];
      if (!def) return -Infinity;
      const owned = tagCounts(state.player.items);
      let synergyRead = 0;
      for (const tag of def.tags) {
        if ((owned[tag] ?? 0) >= 1) synergyRead += num(state.tuning, "cardSynergyRead", 1.2);
      }
      const printedStats = def.attack * 1.0 + def.defense * 1.2 + (def.maxHp ?? 0) * 0.2;
      const rarityRead = def.rarity * 0.6;
      const costPenalty = def.cost * num(state.tuning, "cardCostPenalty", 0.02);
      return printedStats + synergyRead + rarityRead - costPenalty;
    }
    return 0; // fight/boss: only one legal action, score is irrelevant
  },

  describeAction(state, action) {
    if (action.startsWith("buy:")) {
      const id = action.slice(4);
      return `buy ${ITEMS[id]?.name ?? id}`;
    }
    return action;
  },
};

export default toyDungeonEngine;
