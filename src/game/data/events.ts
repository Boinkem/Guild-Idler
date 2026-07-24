import { Rarity } from '../types';

export interface EventDef {
  id: string;
  name: string;
  description: string;
  kind: 'positive' | 'neutral' | 'negative';
  weight: number;
  effects: {
    /** Percentage points added to the success roll for this quest. */
    success?: number;
    /** Multiplier applied to gold, e.g. 0.5 = +50%. */
    goldPct?: number;
    /** Flat gold added regardless of outcome. */
    flatGold?: number;
    xpPct?: number;
    /** Percentage points added to loot chance. */
    loot?: number;
    /** Extra durability damage. */
    durability?: number;
    /** Percentage added to quest duration (resolved as a delay note only). */
    delay?: number;
    /** Forces an injury attempt even on success. */
    injury?: boolean;
    /** Guarantees an extra loot roll at this rarity floor. */
    guaranteedLoot?: Rarity;
  };
}

export const EVENTS: EventDef[] = [
  /* ------------------------------ positive ------------------------------ */
  { id: 'treasure_chest', name: 'Found a Treasure Chest', kind: 'positive', weight: 20,
    description: 'Half-buried by the road, hinges rusted but the lock intact.',
    effects: { flatGold: 60, goldPct: 0.2 } },
  { id: 'helpful_merchant', name: 'Helpful Merchant', kind: 'positive', weight: 22,
    description: 'Shared a meal and a shortcut through the hills.',
    effects: { success: 8, goldPct: 0.1 } },
  { id: 'hidden_cache', name: 'Hidden Cache', kind: 'positive', weight: 16,
    description: 'Someone stashed supplies here and never came back for them.',
    effects: { flatGold: 35, loot: 10 } },
  { id: 'ancient_shrine', name: 'Ancient Shrine', kind: 'positive', weight: 14,
    description: 'A small offering, a long silence, and a lighter step afterwards.',
    effects: { success: 10, xpPct: 0.25 } },
  { id: 'lost_noble', name: 'Lost Noble Rewarded You', kind: 'positive', weight: 10,
    description: 'Pointed him toward the right road. He paid for the trouble.',
    effects: { flatGold: 140 } },
  { id: 'veteran_advice', name: 'Advice from a Veteran', kind: 'positive', weight: 12,
    description: 'An old campaigner drew the ground in the dirt and explained it twice.',
    effects: { success: 12 } },

  /* ------------------------------ neutral ------------------------------- */
  { id: 'strange_wanderer', name: 'Strange Wanderer', kind: 'neutral', weight: 18,
    description: 'Spoke in riddles, left before dawn, took nothing.',
    effects: { xpPct: 0.1 } },
  { id: 'mysterious_cave', name: 'Mysterious Cave', kind: 'neutral', weight: 16,
    description: 'Explored a little way in. Marked it on the map for later.',
    effects: { loot: 5, delay: 5 } },
  { id: 'weather_delay', name: 'Weather Delay', kind: 'neutral', weight: 20,
    description: 'Waited out the storm under a rock ledge.',
    effects: { delay: 15 } },
  { id: 'old_battlefield', name: 'Old Battlefield', kind: 'neutral', weight: 12,
    description: 'Counted the cairns. Left them undisturbed.',
    effects: { xpPct: 0.15, success: -2 } },

  /* ------------------------------ negative ------------------------------ */
  { id: 'bandit_ambush', name: 'Ambushed by Bandits', kind: 'negative', weight: 20,
    description: 'Four of them, badly organised, but they got a swing in.',
    effects: { success: -10, durability: 4, goldPct: -0.15 } },
  { id: 'monster_attack', name: 'Monster Attack', kind: 'negative', weight: 16,
    description: 'Something large came out of the treeline without warning.',
    effects: { success: -14, durability: 6, injury: true } },
  { id: 'broken_equipment', name: 'Broken Equipment', kind: 'negative', weight: 14,
    description: 'A strap gave out at the worst moment.',
    effects: { success: -6, durability: 10 } },
  { id: 'poison_cloud', name: 'Poisoned', kind: 'negative', weight: 10,
    description: 'Spores, fumes, or a very unfriendly dart.',
    effects: { success: -12, injury: true } },
  { id: 'lost_the_trail', name: 'Lost the Trail', kind: 'negative', weight: 16,
    description: 'Doubled back twice before finding the right ford.',
    effects: { success: -8, delay: 20 } },
  { id: 'toll_collectors', name: 'Toll Collectors', kind: 'negative', weight: 12,
    description: 'Official-looking. Probably not official.',
    effects: { goldPct: -0.25 } },
];

export const EVENTS_BY_KIND = {
  positive: EVENTS.filter((e) => e.kind === 'positive'),
  neutral: EVENTS.filter((e) => e.kind === 'neutral'),
  negative: EVENTS.filter((e) => e.kind === 'negative'),
};

/** Base chance that a quest rolls any event at all, per difficulty tier index. */
export const EVENT_CHANCE = [35, 45, 55, 65, 75];
