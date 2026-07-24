import { CONSUMABLE_BY_ID, CONSUMABLES } from '../data/items';
import { ConsumableDef, GameState, Hero, Modifiers } from '../types';

export const InventoryManager = {
  count(state: GameState, defId: string): number {
    return state.inventory[defId] ?? 0;
  },

  add(state: GameState, defId: string, amount = 1): void {
    state.inventory[defId] = (state.inventory[defId] ?? 0) + amount;
  },

  remove(state: GameState, defId: string, amount = 1): boolean {
    const have = state.inventory[defId] ?? 0;
    if (have < amount) return false;
    state.inventory[defId] = have - amount;
    if (state.inventory[defId] === 0) delete state.inventory[defId];
    return true;
  },

  buy(state: GameState, defId: string, amount = 1): string | null {
    const def = CONSUMABLE_BY_ID[defId];
    if (!def) return 'That item is not for sale.';
    const cost = def.cost * amount;
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    InventoryManager.add(state, defId, amount);
    return null;
  },

  owned(state: GameState): { def: ConsumableDef; count: number }[] {
    return CONSUMABLES
      .map((def) => ({ def, count: state.inventory[def.id] ?? 0 }))
      .filter((entry) => entry.count > 0);
  },

  /** Uses a bandage-style item outside of questing. */
  useOnHero(state: GameState, hero: Hero, defId: string): string | null {
    const def = CONSUMABLE_BY_ID[defId];
    if (!def) return 'Unknown item.';
    if (!def.effect.healInjury) return 'Apply that one when sending a hero out.';
    if (hero.injuries.length === 0) return `${hero.name} is not injured.`;
    if (!InventoryManager.remove(state, defId)) return 'None left.';
    hero.injuries.shift();
    return null;
  },

  /** Aggregates the quest-time effects of a chosen consumable loadout. */
  loadoutEffects(defIds: string[]): {
    mods: Partial<Modifiers>;
    preventInjury: boolean;
    guaranteedGoodEvent: boolean;
  } {
    let success = 0;
    let gold = 0;
    let preventInjury = false;
    let guaranteedGoodEvent = false;
    for (const id of defIds) {
      const def = CONSUMABLE_BY_ID[id];
      if (!def) continue;
      success += def.effect.success ?? 0;
      gold += def.effect.gold ?? 0;
      preventInjury ||= !!def.effect.preventInjury;
      guaranteedGoodEvent ||= !!def.effect.guaranteedGoodEvent;
    }
    return { mods: { success, gold }, preventInjury, guaranteedGoodEvent };
  },
};
