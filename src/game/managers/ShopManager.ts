import { EQUIPMENT, EQUIPMENT_BY_ID, RARITY_WEIGHT } from '../data/equipment';
import { CONSUMABLES } from '../data/items';
import { EquipmentItem, GameState, ShopStock } from '../types';
import { createRng, uid } from '../rng';
import { HOUR } from '../util';
import { EquipmentManager } from './EquipmentManager';

export const SHOP_REFRESH_MS = 4 * HOUR;
const SHOP_EQUIPMENT_SLOTS = 5;

export const ShopManager = {
  needsRefresh(state: GameState, now: number): boolean {
    return now - state.shop.refreshedAt >= SHOP_REFRESH_MS;
  },

  /** Stock is seeded per refresh window so it is stable across restarts. */
  refresh(state: GameState, now: number, force = false): ShopStock {
    if (!force && !ShopManager.needsRefresh(state, now)) return state.shop;
    const window = Math.floor(now / SHOP_REFRESH_MS);
    const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
    const rng = createRng(`shop:${window}:${state.createdAt}`);

    const eligible = EQUIPMENT.filter((def) => def.reqLevel <= topLevel + 4);
    const picks = new Set<string>();
    let guard = 0;
    while (picks.size < Math.min(SHOP_EQUIPMENT_SLOTS, eligible.length) && guard++ < 200) {
      const def = rng.weighted(eligible.map((e) => ({ item: e, weight: RARITY_WEIGHT[e.rarity] })));
      picks.add(def.id);
    }

    state.shop = {
      refreshedAt: window * SHOP_REFRESH_MS,
      consumables: CONSUMABLES.map((c) => ({ defId: c.id, stock: rng.int(2, 8) })),
      equipment: [...picks].map((defId) => ({
        uid: uid('shopitem'),
        defId,
        price: EquipmentManager.shopPrice(EQUIPMENT_BY_ID[defId]),
      })),
    };
    return state.shop;
  },

  timeUntilRefresh(state: GameState, now: number): number {
    return Math.max(0, state.shop.refreshedAt + SHOP_REFRESH_MS - now);
  },

  buyEquipment(state: GameState, shopUid: string): string | null {
    const entry = state.shop.equipment.find((e) => e.uid === shopUid);
    if (!entry) return 'That item has already been sold.';
    if (state.gold < entry.price) return 'Not enough gold.';
    const item: EquipmentItem | null = EquipmentManager.instantiate(entry.defId);
    if (!item) return 'Unknown item.';
    state.gold -= entry.price;
    state.stats.goldSpent += entry.price;
    state.stash.push(item);
    if (!state.discoveredItems.includes(entry.defId)) state.discoveredItems.push(entry.defId);
    state.shop.equipment = state.shop.equipment.filter((e) => e.uid !== shopUid);
    return null;
  },

  sell(state: GameState, itemUid: string): string | null {
    const item = state.stash.find((i) => i.uid === itemUid);
    if (!item) return 'That item is equipped or missing.';
    const value = EquipmentManager.sellValue(item);
    state.stash = state.stash.filter((i) => i.uid !== itemUid);
    state.gold += value;
    state.stats.goldEarned += value;
    return null;
  },
};
