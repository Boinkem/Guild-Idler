import { Modifiers, Rarity, Stats } from '../types';
import { Rng } from '../rng';
import { GEAR_SCORE_BY_RARITY } from './equipment';
import { Tuning } from './tuning';

/**
 * Procedural itemization (patch 0214) -- see guild-idler-status.md's full
 * writeup. Full replacement for how ordinary loot gets its power: any
 * EquipmentDef with no `mods` and no `stats` populated is a "blank"
 * template (slot/rarity/visuals only), and rolls its real mods/stats here
 * at drop time instead of reading fixed hand-authored numbers. Sets and
 * any other deliberately hand-authored item (a populated `mods`/`stats`
 * on the def) opt OUT of this entirely -- see EquipmentManager.instantiate,
 * the one call site that decides whether to roll at all.
 */

/** Where a procedurally-generated item came from -- drives both the
 *  budget multiplier and the bracketed display tag. `standard` covers
 *  Easy/Normal (no multiplier, no tag) and Epic/Legendary quest tiers
 *  (no multiplier -- their extra power already comes through the
 *  rarity/level curve itself -- but still tagged, for consistency and
 *  because a player might reasonably want to know an Epic-quest drop
 *  from a Hard-quest one at the same rarity). */
export type LootSourceTag = 'easy' | 'normal' | 'hard' | 'epic' | 'legendary' | 'raidHeroic' | 'raidLegendary';

export type BonusRollTier = 'none' | 'fortunate' | 'charmed';

const MODIFIER_KEYS: (keyof Modifiers)[] = ['success', 'gold', 'xp', 'loot', 'injuryResist', 'speed'];
const STAT_KEYS: (keyof Stats)[] = ['strength', 'endurance', 'luck', 'wisdom'];

/** How many independent affix rolls a rarity gets -- more slots at higher
 *  rarity, same "rarity earns more distinct rolls, not just bigger
 *  numbers on one roll" idea Masterwork's own modsToPick already
 *  established (see equipment.ts). */
const AFFIX_SLOTS_BY_RARITY: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5,
};

/**
 * Fraction of full power a given item level is worth, 0.1-1 across the
 * 1-55 level range. Deliberately simple and linear (unlike statMods'
 * sqrt curves) -- this is a budget-sizing input, not a diminishing-
 * returns conversion; the sqrt/pow shaping still happens downstream, the
 * normal way, once the rolled raw stat actually reaches statMods.
 */
function levelFactor(itemLevel: number): number {
  return Math.max(0.1, Math.min(1, itemLevel / 55));
}

function sourceBudgetMultiplier(sourceTag: LootSourceTag): number {
  switch (sourceTag) {
    case 'raidHeroic': return Tuning.get('loot_procedural.raidHeroicBudgetMultiplier');
    case 'raidLegendary': return Tuning.get('loot_procedural.raidLegendaryBudgetMultiplier');
    case 'hard': return Tuning.get('loot_procedural.hardQuestBudgetMultiplier');
    default: return 1;
  }
}

/** Display label for the bracketed source tag -- e.g. "Iron Sword [Hard]".
 *  Easy/Normal quest drops get no bracket at all (the common case
 *  shouldn't be visually noisy); everything else does. */
function sourceTagLabel(sourceTag: LootSourceTag): string | null {
  switch (sourceTag) {
    case 'hard': return 'Hard';
    case 'epic': return 'Epic';
    case 'legendary': return 'Legendary';
    case 'raidHeroic': return 'Heroic';
    case 'raidLegendary': return 'Legendary';
    default: return null; // easy, normal
  }
}

export interface ProceduralRoll {
  mods: Partial<Modifiers>;
  stats: Partial<Stats>;
  bonusTier: BonusRollTier;
  displayName: string;
}

/**
 * Rolls a procedurally-generated item's real power. `baseName` is the
 * template's authored flavor name (e.g. "Iron Sword") -- this only ever
 * decorates it with a bonus-roll prefix and/or a source-tag suffix, never
 * invents a new base name.
 */
export function rollProceduralItem(
  rarity: Rarity, itemLevel: number, sourceTag: LootSourceTag, baseName: string, rng: Rng,
): ProceduralRoll {
  let budget = GEAR_SCORE_BY_RARITY[rarity]
    * Tuning.get('loot_procedural.budgetRarityMultiplier')
    * levelFactor(itemLevel)
    * sourceBudgetMultiplier(sourceTag);

  // Charmed checked first, Fortunate only if Charmed didn't hit --
  // mutually exclusive, matches the "rare tier wins if both would apply"
  // shape most loot-rarity rolls already use elsewhere in this game.
  let bonusTier: BonusRollTier = 'none';
  if (rng.chance(Tuning.get('loot_procedural.charmedChance'))) {
    bonusTier = 'charmed';
    budget *= 1 + Tuning.get('loot_procedural.charmedBudgetBonus') / 100;
  } else if (rng.chance(Tuning.get('loot_procedural.fortunateChance'))) {
    bonusTier = 'fortunate';
    budget *= 1 + Tuning.get('loot_procedural.fortunateBudgetBonus') / 100;
  }

  const slots = AFFIX_SLOTS_BY_RARITY[rarity];
  const perSlot = Math.max(1, Math.round(budget / slots));
  const pool: { fromStats: boolean; key: string }[] = [
    ...MODIFIER_KEYS.map((key) => ({ fromStats: false, key })),
    ...STAT_KEYS.map((key) => ({ fromStats: true, key })),
  ];

  const mods: Partial<Modifiers> = {};
  const stats: Partial<Stats> = {};
  for (let i = 0; i < slots; i++) {
    const picked = rng.pick(pool);
    if (picked.fromStats) {
      const k = picked.key as keyof Stats;
      stats[k] = (stats[k] ?? 0) + perSlot;
    } else {
      const k = picked.key as keyof Modifiers;
      mods[k] = (mods[k] ?? 0) + perSlot;
    }
  }

  let displayName = baseName;
  if (bonusTier === 'charmed') displayName = `Charmed ${displayName}`;
  else if (bonusTier === 'fortunate') displayName = `Fortunate ${displayName}`;
  const tagLabel = sourceTagLabel(sourceTag);
  if (tagLabel) displayName = `${displayName} [${tagLabel}]`;

  return { mods, stats, bonusTier, displayName };
}

/** True if a def has no authored power of its own -- the "blank
 *  template" signal that opts an item INTO procedural generation. Sets
 *  and every other hand-authored item populate at least one of these two
 *  fields and are exempt. */
export function isProceduralTemplate(def: { mods?: Partial<Modifiers>; stats?: Partial<Stats> }): boolean {
  const hasMods = !!def.mods && Object.keys(def.mods).length > 0;
  const hasStats = !!def.stats && Object.keys(def.stats).length > 0;
  return !hasMods && !hasStats;
}
