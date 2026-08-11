import { CONSUMABLE_BY_ID, CONSUMABLES } from '../data/items';
import { ConsumableDef, GameState, Hero, Modifiers } from '../types';
import { HeroManager } from './HeroManager';

export const InventoryManager = {
  /**
   * The one place a consumable defId actually gets resolved to its def --
   * checks `state.customConsumables` (crafted variants with a chosen mod
   * bonus baked in, see CraftingManager) before falling back to the
   * static, hand-authored `CONSUMABLE_BY_ID`. Every other function below
   * goes through this rather than reading `CONSUMABLE_BY_ID` directly, so
   * a crafted variant behaves identically to a shop-bought consumable
   * everywhere it might show up -- equipped, used standalone, or applied
   * to a quest.
   */
  resolveDef(state: GameState, defId: string): ConsumableDef | undefined {
    return state.customConsumables[defId] ?? CONSUMABLE_BY_ID[defId];
  },

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

  /** Everything with stock > 0 -- both the static shop catalogue and any
   *  crafted custom variants, since the latter only ever exist in
   *  `state.inventory` via crafting, never the static `CONSUMABLES` list. */
  owned(state: GameState): { def: ConsumableDef; count: number }[] {
    const all: ConsumableDef[] = [...CONSUMABLES, ...Object.values(state.customConsumables)];
    return all
      .map((def) => ({ def, count: state.inventory[def.id] ?? 0 }))
      .filter((entry) => entry.count > 0);
  },

  /** Uses a bandage-style item outside of questing. */
  useOnHero(state: GameState, hero: Hero, defId: string): string | null {
    const def = InventoryManager.resolveDef(state, defId);
    if (!def) return 'Unknown item.';
    const healsInjury = !!def.effect.healInjury;
    const restoresHealth = (def.effect.restoreHealth ?? 0) > 0;
    if (!healsInjury && !restoresHealth) return 'Apply that one when sending a hero out.';
    if (healsInjury && hero.injuries.length === 0 && !restoresHealth) {
      return `${hero.name} is not injured.`;
    }
    if (!InventoryManager.remove(state, defId)) return 'None left.';
    if (healsInjury && hero.injuries.length > 0) hero.injuries.shift();
    if (restoresHealth) {
      const max = HeroManager.maxHealth(hero);
      const current = HeroManager.currentHealth(hero);
      // Deliberately does NOT revive a Fallen hero -- restoreHealth tops
      // up an already-standing hero. Reviving from 0 goes through
      // engine.reviveHero (paid) or the Infirmary auto-revive timer, not
      // a potion -- see guild-idler-status.md's Health stat + Fallen/
      // death mechanic section for why that split is intentional (a
      // potion shouldn't quietly bypass the revival cost/wait).
      if (hero.status !== 'fallen') {
        hero.health = Math.min(max, current + (def.effect.restoreHealth! / 100) * max);
      }
    }
    return null;
  },

  /** Aggregates the quest-time effects of a chosen consumable loadout. */
  loadoutEffects(state: GameState, defIds: string[]): {
    mods: Partial<Modifiers>;
    preventInjury: boolean;
    guaranteedGoodEvent: boolean;
    healthDamageReduction: number;
  } {
    let success = 0;
    let gold = 0;
    let xp = 0;
    let loot = 0;
    let injuryResist = 0;
    let speed = 0;
    let preventInjury = false;
    let guaranteedGoodEvent = false;
    let healthDamageReduction = 0;
    for (const id of defIds) {
      const def = InventoryManager.resolveDef(state, id);
      if (!def) continue;
      success += def.effect.success ?? 0;
      gold += def.effect.gold ?? 0;
      xp += def.effect.xp ?? 0;
      loot += def.effect.loot ?? 0;
      injuryResist += def.effect.injuryResist ?? 0;
      speed += def.effect.speed ?? 0;
      preventInjury ||= !!def.effect.preventInjury;
      guaranteedGoodEvent ||= !!def.effect.guaranteedGoodEvent;
      healthDamageReduction += def.effect.healthDamageReduction ?? 0;
    }
    return {
      mods: { success, gold, xp, loot, injuryResist, speed },
      preventInjury,
      guaranteedGoodEvent,
      healthDamageReduction: Math.min(100, healthDamageReduction),
    };
  },
};
