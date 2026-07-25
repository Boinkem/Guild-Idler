import { Difficulty, Rarity } from '../types';

export interface EventDef {
  id: string;
  name: string;
  description: string;
  kind: 'positive' | 'neutral' | 'negative';
  weight: number;
  /** Reserves the grander/grimmer events for quests that deserve them. */
  minDifficulty?: Difficulty;
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

/**
 * Events live in json/events.json so they can be edited via tools/devtool
 * without touching TypeScript.
 */
import eventsJson from './json/events.json';
export const EVENTS: EventDef[] = eventsJson as EventDef[];

export const EVENTS_BY_KIND = {
  positive: EVENTS.filter((e) => e.kind === 'positive'),
  neutral: EVENTS.filter((e) => e.kind === 'neutral'),
  negative: EVENTS.filter((e) => e.kind === 'negative'),
};

/** Base chance that a quest rolls any event at all, per difficulty tier index. */
export const EVENT_CHANCE = [35, 45, 55, 65, 75];
