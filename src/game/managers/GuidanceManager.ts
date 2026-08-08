import { GameState } from '../types';
import { ModifierManager } from './ModifierManager';

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

const TOPICS: GuidanceTopic[] = [
  {
    id: 'first_level_up',
    messages: [
      'Level up! Your hero grows a little stronger with every quest.',
      "You've also earned a stat point to spend -- visit the Heroes tab to assign it.",
    ],
    targetTab: 'heroes',
  },
  {
    id: 'first_equipment_found',
    messages: ["New gear! Anything you find sits in the stash until you equip it -- check the Inventory tab."],
    targetTab: 'equipment',
  },
  {
    id: 'first_chain_seen',
    messages: ["Some contracts continue into a bigger story across several stages -- these show up right on the Quest Board like any other."],
    targetTab: 'quests',
  },
  {
    id: 'hero_slots_full',
    messages: ["Every hero slot is full. Recruiting costs gold, but the slots themselves come from Guild Hall upgrades or a Renown perk."],
    targetTab: 'guild',
  },
  {
    id: 'raids_unlocked',
    messages: ["Raids are open -- multi-hero expeditions with bigger rewards and longer odds. You'll need a full, exact-size party before sending one out."],
    targetTab: 'raids',
  },
];

type Check = (state: GameState) => boolean;

const CHECKS: Record<string, Check> = {
  first_level_up: (state) => state.heroes.some((h) => h.level >= 2),
  first_equipment_found: (state) => state.discoveredItems.length >= 1,
  first_chain_seen: (state) => state.chainBoard.length > 0,
  hero_slots_full: (state) => state.heroes.length >= ModifierManager.heroSlots(state),
  raids_unlocked: (state) => ModifierManager.hasUnlock(state, 'raids'),
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
