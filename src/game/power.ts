import { GameState } from './types';
import { HeroManager } from './managers/HeroManager';

/**
 * A single aggregated "how far has this guild come" number, combining every
 * progress system rather than just one dimension — hero power, renown
 * invested, vendor relationships built, guild upgrades bought, chains
 * completed, and accumulated ascension. Purely derived from existing state;
 * nothing new to save.
 */
export function guildPowerLevel(state: GameState): number {
  let total = 0;

  for (const hero of state.heroes) {
    const stats = HeroManager.totalStats(hero);
    total += stats.strength + stats.endurance + stats.luck + stats.wisdom;
    total += hero.ascension * 30;
  }

  total += state.renown * 2;
  total += Object.values(state.vendorLevels).reduce((sum, lvl) => sum + lvl, 0) * 50;
  total += Object.values(state.upgrades).reduce((sum, lvl) => sum + lvl, 0) * 20;
  total += state.completedChains.length * 100;

  return Math.floor(total);
}

/**
 * Level tiers echo the same colour language as equipment rarity (see
 * RARITY_COLOR in util.ts) — a level-50 hero's ring glows the same amber as
 * a legendary weapon, reinforcing "you've become that" rather than
 * introducing a second, unrelated colour system to learn.
 */
export function levelTierColor(level: number): string {
  if (level >= 50) return '#d9a441'; // legendary
  if (level >= 35) return '#a874d6'; // epic
  if (level >= 20) return '#5b8fd6'; // rare
  if (level >= 10) return '#79a86b'; // uncommon
  return '#b9ad93'; // common
}

export function levelTierName(level: number): string {
  if (level >= 50) return 'Legendary';
  if (level >= 35) return 'Epic';
  if (level >= 20) return 'Rare';
  if (level >= 10) return 'Uncommon';
  return 'Common';
}
