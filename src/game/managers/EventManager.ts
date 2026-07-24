import { EVENTS, EVENTS_BY_KIND, EVENT_CHANCE, EventDef } from '../data/events';
import { DIFFICULTY_ORDER } from '../data/quests';
import { ActiveQuest } from '../types';
import { Rng } from '../rng';

export interface RolledEvents {
  defs: EventDef[];
  successDelta: number;
  goldPct: number;
  flatGold: number;
  xpPct: number;
  lootDelta: number;
  durabilityDelta: number;
  forcedInjury: boolean;
}

export const EventManager = {
  /**
   * Rolls zero to two events for a quest. Higher difficulty means more chances
   * for the road to get interesting in either direction.
   */
  roll(quest: ActiveQuest, rng: Rng): RolledEvents {
    const tierIndex = DIFFICULTY_ORDER.indexOf(quest.offer.difficulty);
    const baseChance = EVENT_CHANCE[Math.max(0, tierIndex)];
    const defs: EventDef[] = [];

    if (quest.guaranteedGoodEvent) {
      defs.push(rng.weighted(EVENTS_BY_KIND.positive.map((e) => ({ item: e, weight: e.weight }))));
    }

    if (rng.chance(baseChance)) {
      defs.push(rng.weighted(EVENTS.map((e) => ({ item: e, weight: e.weight }))));
    }
    // A second event only on the harder tiers, and only sometimes.
    if (tierIndex >= 2 && rng.chance(baseChance / 3)) {
      defs.push(rng.weighted(EVENTS.map((e) => ({ item: e, weight: e.weight }))));
    }

    const rolled: RolledEvents = {
      defs,
      successDelta: 0, goldPct: 0, flatGold: 0, xpPct: 0,
      lootDelta: 0, durabilityDelta: 0, forcedInjury: false,
    };

    for (const def of defs) {
      rolled.successDelta += def.effects.success ?? 0;
      rolled.goldPct += def.effects.goldPct ?? 0;
      rolled.flatGold += def.effects.flatGold ?? 0;
      rolled.xpPct += def.effects.xpPct ?? 0;
      rolled.lootDelta += def.effects.loot ?? 0;
      rolled.durabilityDelta += def.effects.durability ?? 0;
      rolled.forcedInjury ||= !!def.effects.injury;
    }
    return rolled;
  },
};
