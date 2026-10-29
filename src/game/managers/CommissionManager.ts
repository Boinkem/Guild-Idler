import { CommissionReward, GameState, Rarity, VendorId } from '../types';
import { Rng } from '../rng';
import { RARITY_ORDER } from '../util';
import { EQUIPMENT, EQUIPMENT_BY_ID, itemDisplayName } from '../data/equipment';
import { CONSUMABLES } from '../data/items';
import { ELEMENT_GLYPH, ELEMENT_LABEL, ELEMENT_TYPES, GEM_TIER_LABEL } from '../data/elements';
import { MATERIAL_BY_ID } from '../data/materials';
import { rerollDay } from '../data/reroll';
import { COMMISSION_SIGIL, commissionOdds, commissionOrder, commissionQty, CommissionOrder } from '../data/commissions';
import { EquipmentManager } from './EquipmentManager';
import { GuildManager } from './GuildManager';
import { ModifierManager } from './ModifierManager';

/**
 * Vendor Commissions (patch 0455) -- see data/commissions.ts for the
 * design and numbers. Rewards by vendor:
 *  - Blacksmith: one piece of gear of the rolled rarity, at the guild's
 *    top hero level (same pool the Blacksmith's own stock draws from).
 *  - Alchemist: a stack of one consumable of the rolled rarity.
 *  - Enchanter: elemental gems of the rolled tier (weapon or resistance,
 *    random element) -- the same gems the Infuse stations spend.
 */
export const CommissionManager = {
  order(state: GameState, vendorId: VendorId): CommissionOrder | null {
    return commissionOrder(vendorId, GuildManager.vendorLevel(state, vendorId));
  },

  /** Handed in already today? */
  doneToday(state: GameState, vendorId: VendorId, now: number): boolean {
    return (state.commissionDay?.[vendorId] ?? -1) === rerollDay(now);
  },

  /** Null if it can be handed in right now, else why not (player-facing). */
  blocker(state: GameState, vendorId: VendorId, now: number): string | null {
    const order = CommissionManager.order(state, vendorId);
    if (!order) return 'Level this vendor up once to unlock commissions.';
    if (CommissionManager.doneToday(state, vendorId, now)) return 'Already handed in today. A new order arrives tomorrow.';
    if (state.scrap < order.scrap) return `Needs ${order.scrap.toLocaleString()} Scrap.`;
    const have = state.materials[order.materialId] ?? 0;
    if (have < order.material) return `Needs ${order.material} ${MATERIAL_BY_ID[order.materialId]?.name ?? order.materialId}.`;
    if (vendorId === 'blacksmith' && state.stash.length >= ModifierManager.stashCapacity(state)) return 'The stash is full.';
    return null;
  },

  rollRarity(vendorLevel: number, rng: Rng): Rarity {
    const odds = commissionOdds(vendorLevel);
    const weights = RARITY_ORDER.filter((r) => odds[r] > 0).map((r) => ({ item: r, weight: odds[r] }));
    return weights.length > 0 ? rng.weighted(weights) : 'common';
  },

  /**
   * Hands the commission in: spends the order, pays Rep, rolls and grants
   * the reward, marks today done. Returns the reward or an error string.
   * Rep goes into vendorGoldSpent, the counter Vendor Rep is derived from
   * (see vendorRep.ts) -- a commission counts as patronage.
   */
  complete(state: GameState, vendorId: VendorId, now: number, rng: Rng): CommissionReward | string {
    const blocked = CommissionManager.blocker(state, vendorId, now);
    if (blocked) return blocked;
    const order = CommissionManager.order(state, vendorId)!;
    const rarity = CommissionManager.rollRarity(order.level, rng);
    const reward = CommissionManager.grant(state, vendorId, rarity, rng);
    if (!reward) return 'The vendor had nothing to give -- nothing was spent.';

    state.scrap -= order.scrap;
    state.materials[order.materialId] -= order.material;
    state.vendorGoldSpent[vendorId] = (state.vendorGoldSpent[vendorId] ?? 0) + order.rep;
    state.commissionDay = { ...(state.commissionDay ?? { blacksmith: -1, alchemist: -1, enchanter: -1 }), [vendorId]: rerollDay(now) };
    return {
      ...reward, vendorId, level: order.level, rarity, rep: order.rep,
      scrapSpent: order.scrap, materialSpent: order.material,
    };
  },

  grant(state: GameState, vendorId: VendorId, rarity: Rarity, rng: Rng):
    Pick<CommissionReward, 'kind' | 'name' | 'icon' | 'glyph' | 'qty'> | null {
    if (vendorId === 'blacksmith') {
      const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
      // Same pool the Blacksmith's own stock rolls from (ShopManager).
      const pool = EQUIPMENT.filter((d) => d.rarity === rarity && !d.raidExclusive && !d.craftable && !d.chainExclusive);
      if (pool.length === 0) return null;
      const fits = pool.filter((d) => d.reqLevel <= topLevel);
      // Nothing of this rarity at the guild's level yet (a lucky
      // Legendary on a young roster): take the lowest-level ones instead.
      const minReq = Math.min(...pool.map((d) => d.reqLevel));
      const def = rng.pick(fits.length > 0 ? fits : pool.filter((d) => d.reqLevel === minReq));
      const item = EquipmentManager.instantiate(def.id, { itemLevel: topLevel, sourceTag: 'normal', rng, heroLevel: topLevel });
      if (!item) return null;
      state.stash.push(item);
      return { kind: 'equipment', name: itemDisplayName(item, EQUIPMENT_BY_ID[item.defId]!), icon: def.icon, glyph: '⚔', qty: 1 };
    }
    if (vendorId === 'alchemist') {
      // Same pool the Alchemist's Supplies stock rolls from.
      const pool = CONSUMABLES.filter((c) => c.rarity === rarity && !c.craftable);
      if (pool.length === 0) return null;
      const def = rng.pick(pool);
      const qty = commissionQty(vendorId, rarity);
      state.inventory[def.id] = (state.inventory[def.id] ?? 0) + qty;
      return { kind: 'consumable', name: def.name, icon: def.icon, glyph: def.glyph, qty };
    }
    // Enchanter -- elemental gems, weapon or resistance.
    const element = rng.pick(ELEMENT_TYPES);
    const resist = rng.chance(50);
    const qty = commissionQty(vendorId, rarity);
    const pool = resist ? state.resistGems : state.gems;
    const forElement = { ...(pool[element] ?? {}) };
    forElement[rarity] = (forElement[rarity] ?? 0) + qty;
    pool[element] = forElement;
    const name = `${GEM_TIER_LABEL[rarity]} ${ELEMENT_LABEL[element]} ${resist ? 'Resistance Gem' : 'Gem'}`;
    return { kind: 'gem', name, glyph: ELEMENT_GLYPH[element] ?? COMMISSION_SIGIL.enchanter, qty };
  },
};
