import { CURIO_BY_ID } from '../data/curios';
import { CurioDef, GameState } from '../types';

/**
 * Curios have exactly one thing you can do with them (sell), so this is
 * deliberately small -- not trying to mirror InventoryManager's full
 * buy/use/loadout surface, none of which applies here. Same "own bucket,
 * own manager, same shape as an existing sibling" precedent as
 * InventoryManager (for `state.inventory`) already set.
 */
export const CurioManager = {
  count(state: GameState, curioId: string): number {
    return state.curios[curioId] ?? 0;
  },

  add(state: GameState, curioId: string, amount = 1): void {
    state.curios[curioId] = (state.curios[curioId] ?? 0) + amount;
  },

  /** Everything currently owned with stock > 0, resolved against
   *  CURIO_BY_ID -- a curio id that no longer matches any def (a DevTool
   *  entry renamed/removed after some were already granted) is silently
   *  skipped rather than crashing the Inventory tab, same "degrade
   *  gracefully" precedent as everywhere else content might drift out
   *  from under an old save. */
  owned(state: GameState): { def: CurioDef; count: number }[] {
    return Object.entries(state.curios)
      .map(([id, count]) => ({ def: CURIO_BY_ID[id], count }))
      .filter((entry): entry is { def: CurioDef; count: number } => !!entry.def && entry.count > 0);
  },

  /** Sells the full stack of one curio -- there's no "sell one of five"
   *  case anywhere in the UI this is used from (see EquipmentPanel.tsx's
   *  own Curios section), same "one button, whole stack" shape the
   *  Warehouse's material selling (if it existed) would want, not
   *  ShopManager.sell's one-uid-at-a-time shape (curios aren't individual
   *  rollable items with a uid, just a flat count per def). Returns the
   *  gold earned, or 0 if there was nothing to sell. */
  sellAll(state: GameState, curioId: string): number {
    const def = CURIO_BY_ID[curioId];
    const have = state.curios[curioId] ?? 0;
    if (!def || have <= 0) return 0;
    const gold = def.sellValue * have;
    delete state.curios[curioId];
    state.gold += gold;
    state.stats.goldEarned += gold;
    return gold;
  },

  /** Sells every owned curio in one action -- the Curios-section
   *  counterpart to ShopManager.sellBelowRarity's "clear out the junk"
   *  bulk button. Returns how many distinct curios sold and the total
   *  gold earned, so the caller can report one summary rather than one
   *  toast per curio. */
  sellEverything(state: GameState): { count: number; gold: number } {
    const owned = CurioManager.owned(state);
    if (owned.length === 0) return { count: 0, gold: 0 };
    let gold = 0;
    for (const { def, count } of owned) {
      gold += def.sellValue * count;
      delete state.curios[def.id];
    }
    state.gold += gold;
    state.stats.goldEarned += gold;
    return { count: owned.length, gold };
  },
};
