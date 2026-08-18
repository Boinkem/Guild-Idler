import { GameState } from './types';
import { PetManager } from './managers/PetManager';
import { NODE_ORDER } from './data/materials';

/**
 * The same signals surfaced in two places: the Dashboard's digest card
 * (DashboardPanel's AttentionDigest) and the small numeric badges on the
 * Hatchery/Equipment/Quests/Harvest nav tabs themselves (MenuWindow).
 * Pulled out here so both read from one place rather than two copies of
 * the same counts drifting apart over time.
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
  /** Harvest nodes with a settled, still-catchable item sitting unclaimed
   *  right now. `HarvestNodeState.pending` is fully persisted GameState
   *  (see its own doc comment) and GameEngine.refreshWorld already clears
   *  it back to null the moment it expires, so a non-null reading here is
   *  always genuinely still catchable, not stale. */
  harvestReady: number;
  /** Whether at least one discovered quest chain is currently open to at
   *  least one hero (same per-hero level gate DiscoveredQuestsPanel's own
   *  chainOffers filter uses). A boolean rather than a count -- unlike
   *  idle heroes or ready eggs, "how many chains" doesn't mean much on
   *  its own (one available chain is exactly as worth opening the tab
   *  for as three), so this drives a rotating border-light on the
   *  Discovered Quests nav tab (see .chain-available in app.css) instead
   *  of a numeric badge. */
  chainQuestAvailable: boolean;
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
    harvestReady: NODE_ORDER.filter((id) => state.harvestNodes[id]?.pending !== null).length,
    chainQuestAvailable: state.chainBoard.some(
      (offer) => state.heroes.some((h) => h.level >= offer.reqLevel),
    ),
  };
}
