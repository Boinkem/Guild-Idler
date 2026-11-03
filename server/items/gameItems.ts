/**
 * Game item helpers for the Auction House Broker (patch 0462).
 *
 * This file is NOT part of the server's own TypeScript build (it lives
 * outside server/src on purpose). It imports the game's real item code
 * from src/game -- the same roller, prices and data the game client uses --
 * and is bundled into one self-contained file by
 * server/scripts/bundle-game-items.mjs (esbuild) during `npm run build`,
 * so the compiled server never has to compile game code itself. Under
 * `npm run dev` (tsx) the server imports this .ts file directly instead.
 * See server/src/gameItems.ts for the loader and the typed interface.
 *
 * Mirrors ShopManager.rollEquipment exactly: a procedural-template base
 * rolls real stats at the target item level with sourceTag 'normal'; a
 * hand-authored base is a plain instance at its own reqLevel; price is
 * EquipmentManager.shopPrice at that level. So a Broker listing is the
 * same thing a player could have bought from the Blacksmith or found.
 *
 * Game data is baked in at bundle time -- rebuild the server after
 * changing equipment.json / consumables.json / tuning.json.
 */
import { EQUIPMENT, EQUIPMENT_BY_ID } from '../../src/game/data/equipment';
import { CONSUMABLES, CONSUMABLE_BY_ID } from '../../src/game/data/items';
import { EquipmentManager } from '../../src/game/managers/EquipmentManager';
import { isProceduralTemplate } from '../../src/game/data/proceduralLoot';
import { Tuning } from '../../src/game/data/tuning';
import { createRng } from '../../src/game/rng';
import type { EquipmentItem, Rarity } from '../../src/game/types';

export type RarityWeights = Partial<Record<Rarity, number>>;

export interface BrokerItem {
  itemType: 'equipment' | 'consumable';
  payload: unknown;
  /** What the game's own shop would charge for this exact item, in gold. */
  shopValue: number;
  /** Item level (gear) or null (consumables have none). */
  level: number | null;
  rarity: Rarity;
  name: string;
}

/** Same pool the Blacksmith stocks from (ShopManager.rollEquipment). */
const GEAR_POOL = EQUIPMENT.filter((def) => !def.raidExclusive && !def.craftable && !def.chainExclusive);
/** Shop-bought consumables only -- craft-only ones (craftable: true) are left to real players. */
const CONSUMABLE_POOL = CONSUMABLES.filter((def) => !def.craftable && def.cost > 0);

export const SCRAP_TO_GOLD_RATIO: number = Tuning.get('economy.scrapToGoldRatio');

function pickRarity(available: Rarity[], weights: RarityWeights, rng: ReturnType<typeof createRng>): Rarity | null {
  const options = available.map((r) => ({ item: r, weight: weights[r] ?? 0 })).filter((o) => o.weight > 0);
  return options.length > 0 ? rng.weighted(options) : null;
}

/** Rolls one piece of gear whose level lands inside [minLevel, maxLevel]. */
export function rollGear(minLevel: number, maxLevel: number, weights: RarityWeights, seed: string): BrokerItem | null {
  const rng = createRng(seed);
  const itemLevel = rng.int(minLevel, maxLevel);
  // Procedural bases roll to itemLevel; hand-authored ones keep their own
  // reqLevel (ShopManager patch 0369), so they only fit if that's in range.
  const eligible = GEAR_POOL.filter((def) => (isProceduralTemplate(def)
    ? def.reqLevel <= itemLevel
    : def.reqLevel >= minLevel && def.reqLevel <= maxLevel));
  const rarity = pickRarity([...new Set(eligible.map((d) => d.rarity))], weights, rng);
  if (!rarity) return null;
  const def = rng.pick(eligible.filter((d) => d.rarity === rarity));
  const procedural = isProceduralTemplate(def);
  const item = procedural
    ? EquipmentManager.instantiate(def.id, { itemLevel, sourceTag: 'normal', rng })
    : EquipmentManager.instantiate(def.id);
  if (!item) return null;
  const level = procedural ? itemLevel : def.reqLevel;
  return {
    itemType: 'equipment',
    payload: item,
    shopValue: EquipmentManager.shopPrice(def, level),
    level,
    rarity: def.rarity,
    name: item.proceduralName ?? def.name,
  };
}

/** Rolls one shop consumable. Listings are single items, as the game lists them. */
export function rollConsumable(weights: RarityWeights, seed: string): BrokerItem | null {
  const rng = createRng(seed);
  const rarity = pickRarity([...new Set(CONSUMABLE_POOL.map((d) => d.rarity))], weights, rng);
  if (!rarity) return null;
  const def = rng.pick(CONSUMABLE_POOL.filter((d) => d.rarity === rarity));
  return { itemType: 'consumable', payload: { defId: def.id }, shopValue: def.cost, level: null, rarity: def.rarity, name: def.name };
}

/**
 * What the game's shop would charge for a listed item, and its level --
 * the Broker's "fair price" anchor for a real player's listing. Gear is
 * adjusted for enhancement (+25% per +1, as sellValue does) and wear
 * (40% at zero durability up to 100% at full, as sellValue does). Null
 * for anything the Broker doesn't trade (Shard stacks, unknown items).
 */
export function listingInfo(itemType: string, payload: unknown): { shopValue: number; level: number | null; rarity: Rarity } | null {
  if (itemType === 'equipment') {
    const item = payload as EquipmentItem;
    const def = item && typeof item.defId === 'string' ? EQUIPMENT_BY_ID[item.defId] : undefined;
    if (!def) return null;
    const level = item.rolledItemLevel ?? def.reqLevel;
    const plus = Math.max(0, Math.floor(Number(item.plus) || 0));
    const max = EquipmentManager.maxDurability({ ...item, plus });
    const durability = Number.isFinite(Number(item.durability)) ? Number(item.durability) : max;
    const condition = 0.4 + 0.6 * Math.max(0, Math.min(1, durability / Math.max(1, max)));
    return { shopValue: Math.round(EquipmentManager.shopPrice(def, level) * (1 + plus * 0.25) * condition), level, rarity: def.rarity };
  }
  if (itemType === 'consumable') {
    const defId = (payload as { defId?: string })?.defId;
    const def = defId ? CONSUMABLE_BY_ID[defId] : undefined;
    return def && def.cost > 0 ? { shopValue: def.cost, level: null, rarity: def.rarity } : null;
  }
  return null;
}
