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
  };
}

/**
 * Every tab that has its own internal sub-tab switcher, and the sub-tab
 * ids it recognizes -- the single source of truth for the nav
 * shimmer/unread system (patch 0191). Kept here (not duplicated per-panel)
 * since both the top-level nav (MenuWindow, aggregating a tab's shimmer
 * across all its sub-tabs) and each individual panel (acknowledging its
 * own active sub-tab) need the same list. SaveManager's own migration 42
 * has a second, deliberately-independent copy of this same list -- see
 * that migration's own comment for why it isn't imported from here
 * directly (SaveManager has no dependency on this module).
 */
export const TAB_SUBTABS: Record<string, string[]> = {
  vendors: ['blacksmith', 'alchemist', 'enchanter'],
  harvest: ['warehouse', 'fields'],
  lore: ['quests', 'raids', 'collection'],
  raids: ['raids', 'quartermaster'],
  stats: ['overview', 'achievements', 'results'],
  hatchery: ['home', 'pets'],
};

/**
 * Whether a specific tab (or a specific sub-tab within one) has a
 * banner-worthy notification targeting it that postdates the last time
 * the player visited it. `tab`/`subTab` together form the same
 * `tabAcknowledged` key `GameEngine.acknowledgeTab` writes -- see that
 * field's own comment in GameState for why this compares by array
 * position (id) rather than timestamp. `subTab` omitted means "this tab's
 * own bare key," matching a notification with no targetSubTab of its own,
 * not "any sub-tab" -- see isNavTabUnread just below for the aggregated
 * version that actually covers every sub-tab too.
 */
export function isTabUnread(state: GameState, tab: string, subTab?: string): boolean {
  const matches = (n: GameState['notifications'][number]) =>
    n.banner && n.targetTab === tab && (subTab ? n.targetSubTab === subTab : !n.targetSubTab);
  const key = subTab ? `${tab}:${subTab}` : tab;
  const seenId = state.tabAcknowledged[key];
  if (seenId === undefined) return state.notifications.some(matches);
  const idx = state.notifications.findIndex((n) => n.id === seenId);
  // Not found means the acknowledged entry has since aged out past the
  // 100-entry notification cap -- same "treat as fully unread rather than
  // guess at a boundary that no longer exists" fallback
  // unreadNotificationCount already uses for the exact same situation.
  if (idx === -1) return state.notifications.some(matches);
  // notifications is newest-first (unshift) -- everything before idx is
  // newer than the acknowledged entry.
  return state.notifications.slice(0, idx).some(matches);
}

/**
 * The nav-tab-level version of isTabUnread -- true if the tab's own bare
 * notifications are unread, OR if any of its sub-tabs' are (via
 * TAB_SUBTABS). This is what actually drives a top-level nav button's
 * shimmer; a tab with no entry in TAB_SUBTABS simply has nothing to
 * aggregate and behaves identically to isTabUnread(state, tab).
 */
export function isNavTabUnread(state: GameState, tab: string): boolean {
  if (isTabUnread(state, tab)) return true;
  return (TAB_SUBTABS[tab] ?? []).some((sub) => isTabUnread(state, tab, sub));
}
