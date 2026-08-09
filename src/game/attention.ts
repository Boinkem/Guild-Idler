import { GameState } from './types';
import { PetManager } from './managers/PetManager';

/**
 * The same three "needs attention" signals surfaced in two places: the
 * Dashboard's digest card (DashboardPanel's AttentionDigest) and the small
 * numeric badges on the Hatchery/Equipment/Quests nav tabs themselves
 * (MenuWindow). Pulled out here so both read from one place rather than
 * two copies of the same three counts drifting apart over time.
 *
 * Deliberately only signals that are real, persisted, and ongoing --
 * nothing transient like a toast or a one-time Guidance nudge -- so both
 * consumers stay accurate the next time the player opens the app, not
 * just right after whatever triggered them.
 */
export interface AttentionCounts {
  /** Heroes not currently questing -- pairs with Send All Idle. */
  idleHeroes: number;
  /** Eggs that have crossed their hatch threshold and are ready to collect. */
  eggsReady: number;
  /** Equipped gear (any hero, any slot) sitting at 0 durability. */
  brokenGear: number;
}

export function attentionCounts(state: GameState): AttentionCounts {
  return {
    idleHeroes: state.heroes.filter((h) => h.status !== 'questing').length,
    eggsReady: state.hatcheryUnlocked
      ? state.incubatingEggs.filter((e) => PetManager.isReady(e)).length
      : 0,
    brokenGear: state.heroes.reduce(
      (sum, h) => sum + Object.values(h.equipment).filter((item) => item && item.durability <= 0).length,
      0,
    ),
  };
}
