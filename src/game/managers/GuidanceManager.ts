import { GameState } from '../types';
import { ModifierManager } from './ModifierManager';
import { GuildManager } from './GuildManager';
import { EquipmentManager } from './EquipmentManager';
import { RECRUIT_COST } from '../data/progression';

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
  raids_legendary_unlocked: (state) => ModifierManager.hasUnlock(state, 'raidsLegendary'),
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
  // Deliberately checks live state (some hero currently Fallen) rather
  // than a log/result flag -- this runs immediately after
  // QuestManager.resolve/RaidManager.resolve in the same tick, before
  // any revive action could possibly have happened yet, so the state is
  // guaranteed fresh. Same "first X" shape as every other topic here.
  first_hero_fallen: (state) => state.heroes.some((h) => h.status === 'fallen'),
  // A fresh guild already starts with one hero (see SaveManager's
  // starter-hero seeding) and the shortened onboarding tour's own last
  // step already points a brand new player at sending that hero out --
  // so this is deliberately NOT "recruited a hero at all," it's
  // specifically the SECOND one (heroes.length >= 2), the first genuine
  // recruit decision the player makes on their own. Pairs with
  // second_hero_affordable below, which fires earlier (once gold covers
  // the cheapest recruit) as the nudge toward actually doing this.
  first_hero_recruited: (state) => state.heroes.length >= 2,
  // 150 is the cheapest recruit cost in recruit-costs.json (Adventurer
  // and Knight both sit there) -- not hardcoded as a guess, read
  // directly from RECRUIT_COST so this stays correct if those numbers
  // ever move. heroes.length === 1 (not <= 1) is deliberate: this is
  // specifically about a guild that's never recruited anyone yet, not
  // "has fewer than 2 heroes" in general (which would also match a
  // guild that recruited and then lost someone) -- exact, not a fuzzy
  // approximation.
  second_hero_affordable: (state) => state.heroes.length === 1
    && state.gold >= Math.min(...Object.values(RECRUIT_COST)),
  // Same trigger as second_hero_affordable above, deliberately -- the
  // first time a new guild has spare gold at all is a natural moment to
  // mention both "recruit more" and "the Guild Hall" together, and the
  // two-topics-one-shared-condition split (rather than one topic with
  // two messages) exists only because a GuidanceTopic has a single
  // targetTab, and these two point at different tabs.
  guild_hall_intro: (state) => state.heroes.length === 1
    && state.gold >= Math.min(...Object.values(RECRUIT_COST)),
  // Patch 0308. The three new post-tutorial-quest topics -- each reads
  // straight off its own dedicated GameState flag rather than deriving
  // anything, since all three are set exactly once, right at the real
  // moment they should fire (QuestManager.resolve, MenuWindow's
  // tab-switch effect, and engine.useConsumable respectively). See
  // each flag's own comment in types.ts for the full reasoning.
  first_quest_complete_vendor_nudge: (state) => state.hasCompletedFirstQuest,
  first_vendors_visit: (state) => state.hasVisitedVendorsTab,
  first_consumable_obtained: (state) => state.hasObtainedConsumable,
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
