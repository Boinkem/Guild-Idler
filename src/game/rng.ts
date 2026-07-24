/**
 * Seeded random number generation.
 *
 * Quest outcomes are rolled from a seed derived from the quest id, so a quest
 * that finishes while the app is closed resolves to exactly the same result as
 * it would have live. That removes any incentive to close the app and reopen it
 * hoping for a better roll.
 */

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  chance(percent: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number | string): Rng {
  let s = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    chance: (percent) => next() * 100 < percent,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items) => {
      const total = items.reduce((sum, e) => sum + e.weight, 0);
      let roll = next() * total;
      for (const entry of items) {
        roll -= entry.weight;
        if (roll <= 0) return entry.item;
      }
      return items[items.length - 1].item;
    },
    shuffle: (items) => {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

/** Non-deterministic ids for things that are created live (heroes, item uids). */
export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
