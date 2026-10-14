/**
 * Toy Dungeon's item pool: 12 items across 3 tags. Deliberately includes:
 *   - a dominant combo: "iron_edge" + "reckless_charm" (both "brute") stack
 *     a same-tag synergy bonus *and* a hard-coded combo bonus in engine.ts,
 *     making that pair wildly better than anything else in the game.
 *   - a useless item: "dull_stone" — cheap, but its stats round to nothing.
 * These are intentional teaching bugs for the diagnostic tools
 * (npm run items, and the build-combination/leave-one-out method in
 * skill/references/diagnostics.md) to find. See README for what they find.
 */

export type Tag = "brute" | "guard" | "trick";

export interface ItemDef {
  id: string;
  name: string;
  tags: Tag[];
  attack: number;
  defense: number;
  maxHp?: number;
  cost: number;
  rarity: 1 | 2 | 3;
}

export const ITEMS: Record<string, ItemDef> = {
  iron_edge: { id: "iron_edge", name: "Iron Edge", tags: ["brute"], attack: 3, defense: 0, cost: 40, rarity: 1 },
  reckless_charm: { id: "reckless_charm", name: "Reckless Charm", tags: ["brute"], attack: 3, defense: 0, cost: 45, rarity: 2 },
  jagged_tooth: { id: "jagged_tooth", name: "Jagged Tooth", tags: ["brute"], attack: 2, defense: 0, cost: 30, rarity: 1 },
  warhorn: { id: "warhorn", name: "Warhorn", tags: ["brute"], attack: 2, defense: 1, cost: 50, rarity: 2 },

  oak_buckler: { id: "oak_buckler", name: "Oak Buckler", tags: ["guard"], attack: 0, defense: 3, cost: 35, rarity: 1 },
  plate_scrap: { id: "plate_scrap", name: "Plate Scrap", tags: ["guard"], attack: 1, defense: 2, cost: 40, rarity: 1 },
  bulwark_sigil: { id: "bulwark_sigil", name: "Bulwark Sigil", tags: ["guard"], attack: 0, defense: 4, cost: 55, rarity: 2 },
  stone_hide: { id: "stone_hide", name: "Stone Hide", tags: ["guard"], attack: 0, defense: 2, maxHp: 5, cost: 45, rarity: 2 },

  lucky_coin: { id: "lucky_coin", name: "Lucky Coin", tags: ["trick"], attack: 1, defense: 0, cost: 25, rarity: 1 },
  // The useless item: low cost, but attack+defense+maxHp all effectively zero.
  dull_stone: { id: "dull_stone", name: "Dull Stone", tags: ["trick"], attack: 0, defense: 0, cost: 15, rarity: 1 },
  traveler_charm: { id: "traveler_charm", name: "Traveler's Charm", tags: ["trick"], attack: 0, defense: 0, maxHp: 8, cost: 35, rarity: 1 },
  sly_token: { id: "sly_token", name: "Sly Token", tags: ["trick"], attack: 1, defense: 1, cost: 30, rarity: 2 },
};

export const ITEM_IDS: string[] = Object.keys(ITEMS);

// The dominant combo the diagnostics are meant to catch. Kept as data (not
// hidden logic) so references/diagnostics.md can point straight at it.
export const DOMINANT_COMBO: [string, string] = ["iron_edge", "reckless_charm"];
export const USELESS_ITEM = "dull_stone";

export function tagCounts(itemIds: readonly string[]): Record<Tag, number> {
  const counts: Record<Tag, number> = { brute: 0, guard: 0, trick: 0 };
  for (const id of itemIds) {
    const def = ITEMS[id];
    if (!def) continue;
    for (const tag of def.tags) counts[tag]++;
  }
  return counts;
}
