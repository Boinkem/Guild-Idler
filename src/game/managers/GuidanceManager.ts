import { GameState } from '../types';
import { ModifierManager } from './ModifierManager';
import { GuildManager } from './GuildManager';
import { EquipmentManager } from './EquipmentManager';

/**
 * A one-time "how to" nudge, tied to a real state condition. Fires exactly
 * once ever, chained onto the toast queue as one or more messages in order
 * (see GameEngine.reportGuidance) -- e.g. "Level up!" followed immediately
 * by "you can spend that stat point in the Heroes tab" as two toasts back
 * to back, rather than one crowded message.
 *
 * This is deliberately a starter set covering the first few levels and
 * upgrades, not an exhaustive one -- same expectation as ACHIEVEMENTS:
 * meant to grow incrementally over time, not be complete on day one.
 */
export interface GuidanceTopic {
  id: string;
  messages: string[];
  /** Menu tab this topic's advice points at, if there's an obvious single
   *  destination -- rendered as a "Go to" button wherever the message ends
   *  up (toast is transient either way; the Guide's Notifications log is
   *  where this actually matters, since those entries are permanent). */
  targetTab?: string;
}

// Lives in json/guidance-topics.json (devtool-editable, new
// `guidance-topics` content type) -- prose only (id/messages/targetTab).
// The actual trigger CONDITION for each topic stays in the CHECKS map
// below as real code, deliberately not moved to JSON -- a state-reading
// predicate isn't safely author-able as data the way plain prose is, and
// every CHECKS entry already has to reference a specific id here, so a
// topic added purely through the devtool wouldn't have anywhere to plug
// its own trigger logic in anyway. Same split `quest-chains.json`'s
// `rewardEgg` established between authored content and code-side effects.
import guidanceTopicsJson from '../data/json/guidance-topics.json';
const TOPICS: GuidanceTopic[] = guidanceTopicsJson as GuidanceTopic[];

type Check = (state: GameState) => boolean;

const CHECKS: Record<string, Check> = {
  first_level_up: (state) => state.heroes.some((h) => h.level >= 2),
  first_equipment_found: (state) => state.discoveredItems.length >= 1,
  first_chain_seen: (state) => state.chainBoard.length > 0,
  hero_slots_full: (state) => state.heroes.length >= ModifierManager.heroSlots(state),
  raids_unlocked: (state) => ModifierManager.hasUnlock(state, 'raids'),
  black_market_unlocked: (state) => ModifierManager.hasUnlock(state, 'blackMarket'),
  legendary_quests_unlocked: (state) => ModifierManager.hasUnlock(state, 'legendaryQuests'),
  raids_heroic_unlocked: (state) => ModifierManager.hasUnlock(state, 'raidsHeroic'),
  raids_mythic_unlocked: (state) => ModifierManager.hasUnlock(state, 'raidsMythic'),
  // The Training tab's own nav visibility gate (MenuWindow.tsx) reads
  // completedRaids directly rather than a dedicated boolean -- this check
  // mirrors that exact same condition rather than introducing a second
  // source of truth for "has the tab appeared yet." Deliberately doesn't
  // read ModifierManager.hasUnlock(state, 'training') -- that flag is the
  // separate Fund Training *purchase*, gating the tab's content once
  // it's already visible, not whether the tab exists at all. This topic
  // is about the tab's first appearance, so it should fire the moment
  // that's true regardless of whether the player has funded it yet.
  training_tab_unlocked: (state) => state.completedRaids.includes('blackford_keep'),
  // autoChain isn't part of hasUnlock's own checked union (it's read
  // directly off the upgrade level elsewhere -- see QuestPanel.tsx/
  // GuildPanel.tsx), so this checks the same upgrade id GuildManager
  // already keys off of rather than extending hasUnlock's own type just
  // for one more caller.
  auto_chain_unlocked: (state) => GuildManager.upgradeLevel(state, 'auto_chain') > 0,
  first_bard_track_unlocked: (state) => (state.unlockedBardTracks ?? []).length >= 1,
  first_injury_or_wear: (state) => state.heroes.some((h) => h.injuries.length > 0
    || Object.values(h.equipment).some((item) => item && item.durability < EquipmentManager.maxDurability(item))),
};

export const GuidanceManager = {
  isSeen(state: GameState, id: string): boolean {
    return state.seenGuidance.includes(id);
  },

  /**
   * Same reasoning as AchievementManager.checkAll: cheap, state-only reads,
   * safe to call after any action that could plausibly satisfy one rather
   * than needing to know which specific action maps to which topic.
   */
  checkAll(state: GameState): GuidanceTopic[] {
    const triggered: GuidanceTopic[] = [];
    for (const topic of TOPICS) {
      if (GuidanceManager.isSeen(state, topic.id)) continue;
      const check = CHECKS[topic.id];
      if (!check || !check(state)) continue;
      state.seenGuidance.push(topic.id);
      triggered.push(topic);
    }
    return triggered;
  },

  list() {
    return TOPICS;
  },
};
