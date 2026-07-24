import { EQUIPMENT_BY_ID, RARITY_PRICE_MULT } from '../data/equipment';
import { EquipmentDef, EquipmentItem, GameState, Hero } from '../types';
import { uid } from '../rng';
import { clamp } from '../util';

export const MAX_PLUS = 10;

export const EquipmentManager = {
  instantiate(defId: string): EquipmentItem | null {
    const def = EQUIPMENT_BY_ID[defId];
    if (!def) return null;
    return { uid: uid('it'), defId, durability: def.maxDurability, plus: 0 };
  },

  def(item: EquipmentItem): EquipmentDef | undefined {
    return EQUIPMENT_BY_ID[item.defId];
  },

  maxDurability(item: EquipmentItem): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 1;
    return Math.floor(def.maxDurability * (1 + item.plus * 0.1));
  },

  isBroken(item: EquipmentItem): boolean {
    return item.durability <= 0;
  },

  /** Gold to fully repair. Scales with rarity and missing durability. */
  repairCost(item: EquipmentItem, workshopLevel: number): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const missing = EquipmentManager.maxDurability(item) - item.durability;
    if (missing <= 0) return 0;
    const perPoint = 1.2 * RARITY_PRICE_MULT[def.rarity] * (1 + item.plus * 0.2);
    const discount = 1 - Math.min(0.4, workshopLevel * 0.04);
    return Math.max(1, Math.ceil(missing * perPoint * discount));
  },

  upgradeCost(item: EquipmentItem, workshopLevel: number): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const base = def.value * 0.6 * Math.pow(1.65, item.plus);
    const discount = 1 - Math.min(0.4, workshopLevel * 0.04);
    return Math.ceil(base * discount);
  },

  sellValue(item: EquipmentItem): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const condition = 0.4 + 0.6 * (item.durability / EquipmentManager.maxDurability(item));
    return Math.max(1, Math.floor(def.value * 0.35 * condition * (1 + item.plus * 0.25)));
  },

  shopPrice(def: EquipmentDef): number {
    return Math.ceil(def.value * 1.15);
  },

  canEquip(hero: Hero, item: EquipmentItem): { ok: boolean; reason?: string } {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return { ok: false, reason: 'Unknown item.' };
    if (hero.status === 'questing') return { ok: false, reason: `${hero.name} is away on a quest.` };
    if (hero.level < def.reqLevel) return { ok: false, reason: `Requires level ${def.reqLevel}.` };
    return { ok: true };
  },

  /** Moves an item from the stash onto a hero, returning any displaced item. */
  equip(state: GameState, hero: Hero, item: EquipmentItem): string | null {
    const check = EquipmentManager.canEquip(hero, item);
    if (!check.ok) return check.reason ?? 'Cannot equip.';
    const def = EQUIPMENT_BY_ID[item.defId]!;
    state.stash = state.stash.filter((i) => i.uid !== item.uid);
    const displaced = hero.equipment[def.slot];
    if (displaced) state.stash.push(displaced);
    hero.equipment[def.slot] = item;
    return null;
  },

  unequip(state: GameState, hero: Hero, slot: EquipmentDef['slot']): string | null {
    if (hero.status === 'questing') return `${hero.name} is away on a quest.`;
    const item = hero.equipment[slot];
    if (!item) return null;
    delete hero.equipment[slot];
    state.stash.push(item);
    return null;
  },

  /** Applies wear after a quest. Returns names of items that just broke. */
  applyWear(hero: Hero, amount: number, durabilityMod: number): string[] {
    const broken: string[] = [];
    const multiplier = clamp(1 - durabilityMod / 100, 0.15, 1);
    for (const item of Object.values(hero.equipment)) {
      if (!item) continue;
      const before = item.durability;
      if (before <= 0) continue;
      item.durability = Math.max(0, item.durability - Math.max(1, Math.round(amount * multiplier)));
      if (item.durability === 0) {
        broken.push(EQUIPMENT_BY_ID[item.defId]?.name ?? 'Unknown item');
      }
    }
    return broken;
  },

  repair(state: GameState, item: EquipmentItem, workshopLevel: number): string | null {
    const cost = EquipmentManager.repairCost(item, workshopLevel);
    if (cost === 0) return 'Already in perfect condition.';
    if (state.gold < cost) return 'Not enough gold for the repair.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    item.durability = EquipmentManager.maxDurability(item);
    return null;
  },

  upgrade(state: GameState, item: EquipmentItem, workshopLevel: number): string | null {
    if (item.plus >= MAX_PLUS) return 'Already at maximum refinement.';
    const cost = EquipmentManager.upgradeCost(item, workshopLevel);
    if (state.gold < cost) return 'Not enough gold for the upgrade.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    item.plus += 1;
    item.durability = EquipmentManager.maxDurability(item);
    return null;
  },

  /** Every item the player owns, equipped or stashed. */
  allItems(state: GameState): { item: EquipmentItem; heroId: string | null }[] {
    const out: { item: EquipmentItem; heroId: string | null }[] = [];
    for (const item of state.stash) out.push({ item, heroId: null });
    for (const hero of state.heroes) {
      for (const item of Object.values(hero.equipment)) {
        if (item) out.push({ item, heroId: hero.id });
      }
    }
    return out;
  },
};
