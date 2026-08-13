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
  {
    id: 'black_market_unlocked',
    messages: ["A Black Market has opened up in Vendors -- rarer stock than the regular shop, refreshed on its own rotation."],
    targetTab: 'vendors',
  },
  {
    id: 'legendary_quests_unlocked',
    messages: ["Legendary-tier contracts can now appear on the board -- the best rewards in the game, alongside the worst odds."],
    targetTab: 'quests',
  },
  {
    id: 'raids_heroic_unlocked',
    messages: ["Heroic-difficulty raids are cleared for takeoff -- harsher odds and longer expeditions, with loot to match."],
    targetTab: 'raids',
  },
  {
    id: 'raids_mythic_unlocked',
    messages: ["Mythic raids are open -- the hardest content in the game, and the only tier where the very best loot drops."],
    targetTab: 'raids',
  },
  {
    id: 'auto_chain_unlocked',
    messages: ["A hero can now keep taking the next contract on their own for a while, instead of waiting for fresh orders each time -- toggle it from a hero's own Quest Tab entry."],
    targetTab: 'quests',
  },
  {
    id: 'music_hall_unlocked',
    messages: ["The guild bard has a song ready -- pick it (or shuffle through everything you've unlocked) from the Track option in Settings."],
    targetTab: 'settings',
  },
  {
    id: 'first_injury_or_wear',
    messages: [
      "A hurt hero or worn-down gear both drag down the odds on every quest, not just the one that caused it -- don't just wait it out. Treat an injury or Repair a piece of gear right from a hero's card in the Heroes tab (or spend a Field Bandage there instead of gold).",
      "Each hero's very first Treat and first Repair are free, on the guild -- everything after that costs gold. A Physician's Charity or Smith's Charity guild upgrade can make more of each free every day, for every hero.",
    ],
    targetTab: 'heroes',
  },
];

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
  // autoChain isn't part of hasUnlock's own checked union (it's read
  // directly off the upgrade level elsewhere -- see QuestPanel.tsx/
  // GuildPanel.tsx), so this checks the same upgrade id GuildManager
  // already keys off of rather than extending hasUnlock's own type just
  // for one more caller.
  auto_chain_unlocked: (state) => GuildManager.upgradeLevel(state, 'auto_chain') > 0,
  music_hall_unlocked: (state) => (state.guild.music_hall ?? 0) >= 1,
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
