import { EQUIPMENT, EQUIPMENT_BY_ID, RARITY_WEIGHT } from '../data/equipment';
import { CONSUMABLES } from '../data/items';
import { EquipmentItem, GameState, Rarity, ShopStock } from '../types';
import { createRng, uid } from '../rng';
import { HOUR, RARITY_ORDER } from '../util';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { rerollDay, rerollsUsedToday, nextRerollCost } from '../data/reroll';
import { Tuning } from '../data/tuning';
import { applyVendorRepDiscount } from '../data/vendorRep';

export const SHOP_REFRESH_MS = 4 * HOUR;
const SHOP_EQUIPMENT_SLOTS = 5;
/** Was uncapped -- rollConsumables used to hand back every single
 *  CONSUMABLES entry, every refresh, with no selection at all. Matches
 *  SHOP_EQUIPMENT_SLOTS so the Alchemist's stock reads the same size as
 *  the Blacksmith's rather than dwarfing it. */
const CONSUMABLE_SHOP_SLOTS = 5;

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

  /** Equipment half of refresh() below, pulled out standalone so a
   *  Blacksmith-only reroll (rerollBlacksmith) can regenerate just this
   *  half without touching Alchemist stock. Same weighted-pick logic as
   *  before, unchanged. */
  rollEquipment(state: GameState, seed: number | string) {
    const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
    const rng = createRng(`shop-equipment:${seed}:${state.createdAt}`);
    // raidExclusive items (Heroic/Legendary tiered raid loot variants) never
    // belong in a purchasable pool -- see the comment on EquipmentDef itself
    // for why. craftable bases get the same treatment, same reasoning in
    // the opposite direction -- they only ever exist as a Crafting result,
    // never something you'd find on a shelf. chainExclusive gets the same
    // treatment for the same reason: a Quest Chain's guaranteed reward item
    // showing up for sale before the chain is even discovered undercuts the
    // whole point of it being a reward.
    const eligible = EQUIPMENT.filter((def) => !def.raidExclusive && !def.craftable && !def.chainExclusive && def.reqLevel <= topLevel + 4);
    const picks = new Set<string>();
    let guard = 0;
    while (picks.size < Math.min(SHOP_EQUIPMENT_SLOTS, eligible.length) && guard++ < 200) {
      const def = rng.weighted(eligible.map((e) => ({ item: e, weight: RARITY_WEIGHT[e.rarity] })));
      picks.add(def.id);
    }
    // Vendor Rep discount baked in at roll time, same convention
    // refreshBlackMarket's own blackMarketDiscount modifier already
    // uses below -- accepts some staleness between a restock and a
    // level-up mid-window, same tradeoff that precedent already made.
    const repSpent = state.vendorGoldSpent?.blacksmith ?? 0;
    return [...picks].map((defId) => ({
      uid: uid('shopitem'),
      defId,
      price: applyVendorRepDiscount(EquipmentManager.shopPrice(EQUIPMENT_BY_ID[defId]), repSpent),
    }));
  },

  /** Consumables half of refresh() below -- see rollEquipment's own
   *  comment, mirrored for the Alchemist-only reroll (rerollAlchemist).
   *  Previously returned every entry in CONSUMABLES unconditionally (a
   *  real bug, not a design choice -- confirmed by grep, there was never
   *  any slicing/selection here at all) -- now picks CONSUMABLE_SHOP_SLOTS
   *  distinct items, weighted by RARITY_WEIGHT exactly the same way
   *  rollEquipment already weights gear, now that every ConsumableDef
   *  carries a rarity. */
  rollConsumables(state: GameState, seed: number | string) {
    const rng = createRng(`shop-consumables:${seed}:${state.createdAt}`);
    const picks = new Set<string>();
    let guard = 0;
    while (picks.size < Math.min(CONSUMABLE_SHOP_SLOTS, CONSUMABLES.length) && guard++ < 200) {
      const def = rng.weighted(CONSUMABLES.map((c) => ({ item: c, weight: RARITY_WEIGHT[c.rarity] })));
      picks.add(def.id);
    }
    return [...picks].map((defId) => ({ defId, stock: rng.int(2, 8) }));
  },

  /** Stock is seeded per refresh window so it is stable across restarts.
   *  `salt` defaults to 0 (fully deterministic per window, for reload
   *  stability). The natural 4-hour restock always regenerates both
   *  halves together via rollEquipment/rollConsumables above; the
   *  per-vendor manual rerolls (rerollBlacksmith/rerollAlchemist) call
   *  those two functions directly instead of this one, so rerolling one
   *  vendor's stock never touches the other's. */
  refresh(state: GameState, now: number, force = false, salt: number | string = 0): ShopStock {
    if (!force && !ShopManager.needsRefresh(state, now)) return state.shop;
    const window = Math.floor(now / SHOP_REFRESH_MS);
    const seed = `${window}:${salt}`;
    state.shop = {
      refreshedAt: window * SHOP_REFRESH_MS,
      consumables: ShopManager.rollConsumables(state, seed),
      equipment: ShopManager.rollEquipment(state, seed),
    };
    return state.shop;
  },

  timeUntilRefresh(state: GameState, now: number): number {
    return Math.max(0, state.shop.refreshedAt + SHOP_REFRESH_MS - now);
  },

  /**
   * Gold cost of the Blacksmith's next early gear restock -- 0 while
   * still within today's free allowance (Trade Favor: Blacksmith),
   * climbing per additional paid reroll after that. One of three
   * independent per-vendor reroll tracks, replacing the old single
   * shared Vendors restock reroll -- see ModifierManager.vendorFreeRerolls
   * and guild-idler-status.md's Vendor Upgrades Consolidation entry.
   */
  blacksmithRerollCost(state: GameState, now: number): number {
    const used = rerollsUsedToday(state.blacksmithRerollsUsedToday, state.blacksmithRerollDay, now);
    const free = ModifierManager.vendorFreeRerolls(state, 'blacksmith');
    const base = nextRerollCost(used, free, 'reroll.vendorBaseCost', 'reroll.vendorCostGrowth');
    return base === 0 ? 0 : applyVendorRepDiscount(base, state.vendorGoldSpent?.blacksmith ?? 0);
  },

  /** Restocks only the Blacksmith's own equipment stock early, spending
   *  today's next Blacksmith reroll. Leaves consumables and
   *  `state.shop.refreshedAt` untouched, same "doesn't push back the
   *  next scheduled natural restock" guarantee the old shared reroll had. */
  rerollBlacksmith(state: GameState, now: number): string | null {
    const day = rerollDay(now);
    if (state.blacksmithRerollDay !== day) {
      state.blacksmithRerollDay = day;
      state.blacksmithRerollsUsedToday = 0;
    }
    const cost = ShopManager.blacksmithRerollCost(state, now);
    if (cost > 0) {
      if (state.gold < cost) return `Not enough gold to reroll (needs ${cost}).`;
      state.gold -= cost;
      state.stats.goldSpent += cost;
      state.vendorGoldSpent.blacksmith += cost;
    }
    state.blacksmithRerollsUsedToday += 1;
    state.shop.equipment = ShopManager.rollEquipment(state, now);
    return null;
  },

  /** Same shape as blacksmithRerollCost, independent counter, for the
   *  Alchemist's own supplies stock. */
  alchemistRerollCost(state: GameState, now: number): number {
    const used = rerollsUsedToday(state.alchemistRerollsUsedToday, state.alchemistRerollDay, now);
    const free = ModifierManager.vendorFreeRerolls(state, 'alchemist');
    const base = nextRerollCost(used, free, 'reroll.vendorBaseCost', 'reroll.vendorCostGrowth');
    return base === 0 ? 0 : applyVendorRepDiscount(base, state.vendorGoldSpent?.alchemist ?? 0);
  },

  /** Restocks only the Alchemist's own consumable stock early -- same
   *  shape as rerollBlacksmith above, mirrored for consumables. */
  rerollAlchemist(state: GameState, now: number): string | null {
    const day = rerollDay(now);
    if (state.alchemistRerollDay !== day) {
      state.alchemistRerollDay = day;
      state.alchemistRerollsUsedToday = 0;
    }
    const cost = ShopManager.alchemistRerollCost(state, now);
    if (cost > 0) {
      if (state.gold < cost) return `Not enough gold to reroll (needs ${cost}).`;
      state.gold -= cost;
      state.stats.goldSpent += cost;
      state.vendorGoldSpent.alchemist += cost;
    }
    state.alchemistRerollsUsedToday += 1;
    state.shop.consumables = ShopManager.rollConsumables(state, now);
    return null;
  },

  /** Same shape again, for the Enchanter's Black Market -- previously
   *  had no manual reroll at all (a deliberately scarce, purely
   *  time-gated rotation). Trade Favor: Enchanter now buys the same
   *  "pay to hurry the next restock" option every other vendor already
   *  had, rather than leaving the Enchanter's own vendor-leveling track
   *  with nothing to spend Trade Favor charges on. */
  enchanterRerollCost(state: GameState, now: number): number {
    const used = rerollsUsedToday(state.enchanterRerollsUsedToday, state.enchanterRerollDay, now);
    const free = ModifierManager.vendorFreeRerolls(state, 'enchanter');
    const base = nextRerollCost(used, free, 'reroll.vendorBaseCost', 'reroll.vendorCostGrowth');
    return base === 0 ? 0 : applyVendorRepDiscount(base, state.vendorGoldSpent?.enchanter ?? 0);
  },

  /** Forces an early Black Market turnover, spending today's next
   *  Enchanter reroll. `state.blackMarket.refreshedAt` stays pinned to
   *  the current window's own boundary (same reasoning as the other two
   *  rerolls) so this doesn't push back the next scheduled natural
   *  16-hour restock. */
  rerollEnchanter(state: GameState, now: number): string | null {
    const day = rerollDay(now);
    if (state.enchanterRerollDay !== day) {
      state.enchanterRerollDay = day;
      state.enchanterRerollsUsedToday = 0;
    }
    const cost = ShopManager.enchanterRerollCost(state, now);
    if (cost > 0) {
      if (state.gold < cost) return `Not enough gold to reroll (needs ${cost}).`;
      state.gold -= cost;
      state.stats.goldSpent += cost;
      state.vendorGoldSpent.enchanter += cost;
    }
    state.enchanterRerollsUsedToday += 1;
    ShopManager.refreshBlackMarket(state, now, true, now);
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
   *
   * `salt` defaults to 0 (fully deterministic per window, for reload
   * stability), same convention as refresh() above -- rerollEnchanter passes
   * the exact reroll moment instead, so a manual reroll produces genuinely
   * new stock rather than reproducing the same window-seeded result.
   *
   * Price folds in Enchanted Seal's blackMarketDiscount mod (guild-wide,
   * via ModifierManager.global) on top of the existing markup -- the
   * guild's own standing with the Enchanter buys a better rate from
   * their black-market contact, same "own key, applied at generation
   * time" shape as everywhere else that reads a Modifiers discount.
   */
  refreshBlackMarket(state: GameState, now: number, force = false, salt: number | string = 0): ShopStock {
    if (!force && !ShopManager.blackMarketNeedsRefresh(state, now)) return state.blackMarket;
    const window = Math.floor(now / BLACK_MARKET_REFRESH_MS);
    const rng = createRng(`blackmarket:${window}:${state.createdAt}:${salt}`);
    const discount = ModifierManager.global(state).blackMarketDiscount ?? 0;
    // Enchanter's own Vendor Rep discount stacks with the existing
    // Enchanted Seal blackMarketDiscount modifier -- one's a guild-wide
    // upgrade, this one's personal loyalty, no reason they should
    // compete for the same slot.
    const repSpent = state.vendorGoldSpent?.enchanter ?? 0;

    const eligible = EQUIPMENT.filter((def) =>
      !def.raidExclusive && !def.craftable && !def.chainExclusive && (BLACK_MARKET_RARITIES as readonly string[]).includes(def.rarity));
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
        price: applyVendorRepDiscount(
          Math.ceil(EquipmentManager.shopPrice(EQUIPMENT_BY_ID[defId]) * BLACK_MARKET_MARKUP * (1 - discount / 100)),
          repSpent,
        ),
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
    if (state.stash.length >= ModifierManager.stashCapacity(state)) return 'The stash is full.';
    const item: EquipmentItem | null = EquipmentManager.instantiate(entry.defId);
    if (!item) return 'Unknown item.';
    state.gold -= entry.price;
    state.stats.goldSpent += entry.price;
    state.vendorGoldSpent.enchanter += entry.price;
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
    if (state.stash.length >= ModifierManager.stashCapacity(state)) return 'The stash is full.';
    const item: EquipmentItem | null = EquipmentManager.instantiate(entry.defId);
    if (!item) return 'Unknown item.';
    state.gold -= entry.price;
    state.stats.goldSpent += entry.price;
    state.vendorGoldSpent.blacksmith += entry.price;
    state.stash.push(item);
    if (!state.discoveredItems.includes(entry.defId)) state.discoveredItems.push(entry.defId);
    state.shop.equipment = state.shop.equipment.filter((e) => e.uid !== shopUid);
    return null;
  },

  sell(state: GameState, itemUid: string, now = Date.now()): string | null {
    const item = state.stash.find((i) => i.uid === itemUid);
    if (!item) return 'That item is equipped or missing.';
    if (item.locked) return 'That item is locked in the Vault.';
    const value = EquipmentManager.sellValue(item);
    state.stash = state.stash.filter((i) => i.uid !== itemUid);
    state.gold = Math.min(ModifierManager.goldStorage(state), state.gold + value);
    state.stats.goldEarned += value;
    // Recorded for the buyback list -- the exact item (uid, durability,
    // plus, customMods, enchantStats, everything), not just its defId, so
    // buying it back later hands back precisely what was sold rather than
    // a fresh-rolled equivalent. Newest entry first; oldest dropped once
    // the list would exceed shop.buybackMaxEntries -- a sale eventually
    // becomes permanent again rather than this list growing forever.
    state.buyback.unshift({ item, soldFor: value, soldAt: now });
    const maxEntries = Tuning.get('shop.buybackMaxEntries');
    if (state.buyback.length > maxEntries) state.buyback.length = maxEntries;
    return null;
  },

  /** Buyback price for a given sale -- always more than it sold for, see
   *  shop.buybackMarkup's own tuning description for why. */
  buybackPrice(entry: { soldFor: number }): number {
    return Math.ceil(entry.soldFor * Tuning.get('shop.buybackMarkup'));
  },

  /** Reverses a sale -- removes the entry from the buyback list and puts
   *  the exact same item (same uid, same durability/plus/customMods/
   *  enchantStats) straight back in the stash, same as if it had never
   *  been sold, minus the markup paid for the privilege. */
  buyBack(state: GameState, itemUid: string): string | null {
    const entry = state.buyback.find((e) => e.item.uid === itemUid);
    if (!entry) return 'That item is no longer available to buy back.';
    const price = ShopManager.buybackPrice(entry);
    if (state.gold < price) return 'Not enough gold.';
    if (state.stash.length >= ModifierManager.stashCapacity(state)) return 'The stash is full.';
    state.gold -= price;
    state.stats.goldSpent += price;
    state.buyback = state.buyback.filter((e) => e.item.uid !== itemUid);
    state.stash.push(entry.item);
    return null;
  },

  /**
   * Bulk-sells every stash item at or below `maxRarity` -- the "clear out
   * the junk" counterpart to selling one item at a time. Stash-only, same
   * as sell() -- equipped gear is never touched, so nothing a hero is
   * currently wearing can be swept up by accident regardless of its
   * rarity. Crafted items (`customMods` set) and enchanted items
   * (`enchantStats` set) are skipped even if their base rarity qualifies
   * -- both represent player effort/materials spent beyond what the
   * rarity alone reflects, so a blanket rarity sweep shouldn't be the
   * thing that sells one off by surprise. Returns how many items sold and
   * the total gold earned, so the caller can report a single summary
   * rather than one toast per item.
   */
  sellBelowRarity(state: GameState, maxRarity: Rarity): { count: number; gold: number } {
    const maxIndex = RARITY_ORDER.indexOf(maxRarity);
    const toSell = state.stash.filter((item) => {
      if (item.locked) return false;
      if (item.customMods || (item.enchantStats && Object.keys(item.enchantStats).length > 0)) return false;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) return false;
      return RARITY_ORDER.indexOf(def.rarity) <= maxIndex;
    });
    if (toSell.length === 0) return { count: 0, gold: 0 };
    const sellUids = new Set(toSell.map((i) => i.uid));
    const gold = toSell.reduce((sum, item) => sum + EquipmentManager.sellValue(item), 0);
    state.stash = state.stash.filter((i) => !sellUids.has(i.uid));
    state.gold = Math.min(ModifierManager.goldStorage(state), state.gold + gold);
    state.stats.goldEarned += gold;
    return { count: toSell.length, gold };
  },

  /** Same shape as sell() -- stash-only, same "equipped or missing"
   *  error -- but converts the item to Scrap instead of gold. Folds in
   *  the Blacksmith's own Bulk Scrapper vendor upgrade (scrapBonus,
   *  guild-wide via ModifierManager.global). See
   *  EquipmentManager.scrapValue for the rarity-based payout. */
  scrapItem(state: GameState, itemUid: string): string | null {
    const item = state.stash.find((i) => i.uid === itemUid);
    if (!item) return 'That item is equipped or missing.';
    if (item.locked) return 'That item is locked in the Vault.';
    const bonus = ModifierManager.global(state).scrapBonus ?? 0;
    const value = EquipmentManager.scrapValue(item, bonus);
    state.stash = state.stash.filter((i) => i.uid !== itemUid);
    state.scrap += value;
    return null;
  },
};
