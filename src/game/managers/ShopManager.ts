import { EQUIPMENT, EQUIPMENT_BY_ID, RARITY_WEIGHT } from '../data/equipment';
import { CONSUMABLES } from '../data/items';
import { EquipmentItem, GameState, ShopStock } from '../types';
import { createRng, uid } from '../rng';
import { HOUR } from '../util';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { rerollDay, rerollsUsedToday, nextRerollCost } from '../data/reroll';

export const SHOP_REFRESH_MS = 4 * HOUR;
const SHOP_EQUIPMENT_SLOTS = 5;

export const BLACK_MARKET_REFRESH_MS = 16 * HOUR;
const BLACK_MARKET_SLOTS = 3;
/** Black market items cost more than the same piece would at the armourer. */
const BLACK_MARKET_MARKUP = 1.65;
/** Only these rarities ever show up — this is where the good stuff lives. */
const BLACK_MARKET_RARITIES = ['rare', 'epic', 'legendary'] as const;

export const ShopManager = {
  needsRefresh(state: GameState, now: number): boolean {
    return now - state.shop.refreshedAt >= SHOP_REFRESH_MS;
  },

  /** Stock is seeded per refresh window so it is stable across restarts.
   *  `salt` defaults to 0 (fully deterministic per window, for reload
   *  stability); the Vendors reroll button passes the exact reroll moment
   *  instead, so a manual reroll produces genuinely new stock rather than
   *  reproducing the same window-seeded result. */
  refresh(state: GameState, now: number, force = false, salt: number | string = 0): ShopStock {
    if (!force && !ShopManager.needsRefresh(state, now)) return state.shop;
    const window = Math.floor(now / SHOP_REFRESH_MS);
    const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
    const rng = createRng(`shop:${window}:${state.createdAt}:${salt}`);

    // raidExclusive items (Heroic/Mythic tiered raid loot variants) never
    // belong in a purchasable pool -- see the comment on EquipmentDef itself
    // for why. This was the actual bug: nothing here previously excluded
    // them at all. craftable bases get the same treatment, same reasoning
    // in the opposite direction -- they only ever exist as a Crafting
    // result, never something you'd find on a shelf.
    const eligible = EQUIPMENT.filter((def) => !def.raidExclusive && !def.craftable && def.reqLevel <= topLevel + 4);
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

  /**
   * Gold cost of the *next* Vendors restock reroll -- 0 while still within
   * today's free allowance (see ModifierManager.vendorFreeRerolls),
   * climbing per additional paid reroll after that. Same shape as
   * QuestManager.questRerollCost, entirely independent counter/upgrade.
   */
  vendorRerollCost(state: GameState, now: number): number {
    const used = rerollsUsedToday(state.vendorRerollsUsedToday, state.vendorRerollDay, now);
    const free = ModifierManager.vendorFreeRerolls(state);
    return nextRerollCost(used, free, 'reroll.vendorBaseCost', 'reroll.vendorCostGrowth');
  },

  /**
   * Restocks the Vendors shop (equipment AND consumables -- refresh()
   * already regenerates both together) early, spending today's next
   * reroll. Doesn't touch the black market -- that has its own, much
   * longer natural refresh window, deliberately scarce rather than
   * something to reroll on demand. `state.shop.refreshedAt` stays pinned
   * to the current window's own boundary (refresh() sets it from `window`,
   * not `now`), so a reroll doesn't push back the next scheduled natural
   * restock either.
   */
  rerollShop(state: GameState, now: number): string | null {
    const day = rerollDay(now);
    if (state.vendorRerollDay !== day) {
      state.vendorRerollDay = day;
      state.vendorRerollsUsedToday = 0;
    }
    const cost = ShopManager.vendorRerollCost(state, now);
    if (cost > 0) {
      if (state.gold < cost) return `Not enough gold to reroll (needs ${cost}).`;
      state.gold -= cost;
      state.stats.goldSpent += cost;
    }
    state.vendorRerollsUsedToday += 1;
    ShopManager.refresh(state, now, true, now);
    return null;
  },

  /* ------------------------------ black market ----------------------------- */

  blackMarketNeedsRefresh(state: GameState, now: number): boolean {
    return now - (state.blackMarket?.refreshedAt ?? 0) >= BLACK_MARKET_REFRESH_MS;
  },

  /**
   * Deliberately does not filter by hero level the way the regular shop does —
   * the point of the black market is gear worth aspiring to, not gear you can
   * use today. reqLevel still gates equipping it once bought.
   */
  refreshBlackMarket(state: GameState, now: number, force = false): ShopStock {
    if (!force && !ShopManager.blackMarketNeedsRefresh(state, now)) return state.blackMarket;
    const window = Math.floor(now / BLACK_MARKET_REFRESH_MS);
    const rng = createRng(`blackmarket:${window}:${state.createdAt}`);

    const eligible = EQUIPMENT.filter((def) =>
      !def.raidExclusive && !def.craftable && (BLACK_MARKET_RARITIES as readonly string[]).includes(def.rarity));
    const picks = new Set<string>();
    let guard = 0;
    while (picks.size < Math.min(BLACK_MARKET_SLOTS, eligible.length) && guard++ < 200) {
      // Weighted toward legendary more heavily than the regular shop — that's
      // the entire point of paying a markup here.
      const def = rng.weighted(eligible.map((e) => ({
        item: e,
        weight: e.rarity === 'legendary' ? 6 : e.rarity === 'epic' ? 3 : 1,
      })));
      picks.add(def.id);
    }

    state.blackMarket = {
      refreshedAt: window * BLACK_MARKET_REFRESH_MS,
      consumables: [],
      equipment: [...picks].map((defId) => ({
        uid: uid('blackmarket'),
        defId,
        price: Math.ceil(EquipmentManager.shopPrice(EQUIPMENT_BY_ID[defId]) * BLACK_MARKET_MARKUP),
      })),
    };
    return state.blackMarket;
  },

  timeUntilBlackMarketRefresh(state: GameState, now: number): number {
    return Math.max(0, (state.blackMarket?.refreshedAt ?? 0) + BLACK_MARKET_REFRESH_MS - now);
  },

  buyBlackMarketEquipment(state: GameState, shopUid: string): string | null {
    const entry = state.blackMarket.equipment.find((e) => e.uid === shopUid);
    if (!entry) return 'That item has already been sold.';
    if (state.gold < entry.price) return 'Not enough gold.';
    const item: EquipmentItem | null = EquipmentManager.instantiate(entry.defId);
    if (!item) return 'Unknown item.';
    state.gold -= entry.price;
    state.stats.goldSpent += entry.price;
    state.stash.push(item);
    if (!state.discoveredItems.includes(entry.defId)) state.discoveredItems.push(entry.defId);
    state.blackMarket.equipment = state.blackMarket.equipment.filter((e) => e.uid !== shopUid);
    state.stats.blackMarketPurchases += 1;
    return null;
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

  /** Same shape as sell() -- stash-only, same "equipped or missing" error
   *  -- but converts the item to Scrap instead of gold. See
   *  EquipmentManager.scrapValue for the rarity-based payout. */
  scrapItem(state: GameState, itemUid: string): string | null {
    const item = state.stash.find((i) => i.uid === itemUid);
    if (!item) return 'That item is equipped or missing.';
    const value = EquipmentManager.scrapValue(item);
    state.stash = state.stash.filter((i) => i.uid !== itemUid);
    state.scrap += value;
    return null;
  },
};
