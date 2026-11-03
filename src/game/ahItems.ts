import { EquipmentItem, Rarity } from './types';
import { EQUIPMENT_BY_ID, itemDisplayName } from './data/equipment';
import { CONSUMABLE_BY_ID } from './data/items';
import { EquipmentManager } from './managers/EquipmentManager';
import { SHARD_NAME, shardLabel } from './data/shards';
import { Tuning } from './data/tuning';

/**
 * Patch 0463 -- shared helpers for what an Auction House listing holds:
 * its display name, level and shop value. Used by Browse (search, sort,
 * the inspect view), the Sell form's pricing help and the "your item
 * sold" alerts (engine.checkAuctionSales).
 *
 * `auctionShopValue` is the same rule the server's Broker prices against
 * (server/items/gameItems.ts listingInfo): the game shop's price for that
 * exact item, +25% per enhancement level and scaled by wear the way the
 * vendor sell price is (40% when broken up to 100% at full durability).
 */

export type AhPayloadType = 'equipment' | 'consumable' | 'shard' | string;

export function auctionItemName(itemType: AhPayloadType, payload: unknown): string {
  if (itemType === 'shard') {
    const amount = Math.max(1, Math.floor(Number((payload as { amount?: number })?.amount) || 1));
    return shardLabel(amount);
  }
  if (itemType === 'equipment') {
    const item = payload as EquipmentItem;
    const def = item ? EQUIPMENT_BY_ID[item.defId] : undefined;
    if (!def) return item?.defId ?? 'an item';
    return `${itemDisplayName(item, def)}${item.plus > 0 ? ` +${item.plus}` : ''}`;
  }
  const defId = (payload as { defId?: string })?.defId;
  return (defId && CONSUMABLE_BY_ID[defId]?.name) || defId || 'an item';
}

export function auctionItemRarity(itemType: AhPayloadType, payload: unknown): Rarity | null {
  if (itemType === 'shard') return 'legendary';
  if (itemType === 'equipment') return EQUIPMENT_BY_ID[(payload as EquipmentItem)?.defId]?.rarity ?? null;
  const defId = (payload as { defId?: string })?.defId;
  return (defId && CONSUMABLE_BY_ID[defId]?.rarity) || null;
}

/** Gear's item level (rolled level, else its required level); null otherwise. */
export function auctionItemLevel(itemType: AhPayloadType, payload: unknown): number | null {
  if (itemType !== 'equipment') return null;
  const item = payload as EquipmentItem;
  const def = item ? EQUIPMENT_BY_ID[item.defId] : undefined;
  return def ? item.rolledItemLevel ?? def.reqLevel : null;
}

/** The game shop's gold price for this exact item, or null (Shard stacks
 *  and unknown items have no shop price). */
export function auctionShopValue(itemType: AhPayloadType, payload: unknown): number | null {
  if (itemType === 'equipment') {
    const item = payload as EquipmentItem;
    const def = item ? EQUIPMENT_BY_ID[item.defId] : undefined;
    if (!def) return null;
    const level = item.rolledItemLevel ?? def.reqLevel;
    const plus = Math.max(0, Math.floor(Number(item.plus) || 0));
    const max = EquipmentManager.maxDurability({ ...item, plus });
    const durability = Number.isFinite(Number(item.durability)) ? Number(item.durability) : max;
    const condition = 0.4 + 0.6 * Math.max(0, Math.min(1, durability / Math.max(1, max)));
    return Math.round(EquipmentManager.shopPrice(def, level) * (1 + plus * 0.25) * condition);
  }
  if (itemType === 'consumable') {
    const defId = (payload as { defId?: string })?.defId;
    const cost = defId ? CONSUMABLE_BY_ID[defId]?.cost : undefined;
    return cost && cost > 0 ? cost : null;
  }
  return null;
}

/** Gold -> scrap at the game's shared conversion rate (economy.scrapToGoldRatio). */
export function goldToScrap(gold: number): number {
  return Math.max(1, Math.round(gold / Tuning.get('economy.scrapToGoldRatio')));
}

/** A listing's price in gold terms, for sorting gold and scrap listings together. */
export function priceInGold(price: number, currency: string): number {
  return currency === 'scrap' ? price * Tuning.get('economy.scrapToGoldRatio') : price;
}

export { SHARD_NAME };
