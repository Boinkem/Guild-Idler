import { Stats, Role, Modifiers, HeroClass } from '../game/types';
import { HeroManager } from '../game/managers/HeroManager';
import { roleAwareStatLabel } from '../game/util';

/**
 * Hero card attribute readouts (hero-card redesign) -- turns each raw stat
 * into "what this stat actually buys you", which the old flat
 * `Strength 34` stat-row never said anywhere in the UI.
 *
 * Deliberately calls HeroManager.statMods / personalLootBonus rather than
 * re-deriving their curves here: the contribution of one stat is measured
 * as `statMods(total) - statMods(total with that stat zeroed)`, and the
 * marginal value of the next point as `statMods(total+1) - statMods(total)`.
 * If those formulas are ever retuned, this file follows automatically and
 * cannot go stale the way a hand-copied sqrt() would (see
 * stat-conversion-table.md's own "regenerate rather than hand-edit" note).
 *
 * Success is a deliberate exception to that zeroed-diff pattern (patch
 * 0295) -- see statEffectBlocks' own comment below for why.
 */

type ModKey = keyof Modifiers;

export type EffectFormat = 'points' | 'percent' | 'multiplier';

export interface StatEffectLine {
  /** Player-facing name of the modifier this stat feeds. */
  label: string;
  value: number;
  format: EffectFormat;
  /** 0-1, for the small meter beside the number. Relative to a soft
   *  reference value per modifier, not an absolute cap -- these mods have
   *  no hard ceiling, the bar is a "how stacked is this" hint only. */
  ratio: number;
  /** CSS colour var for the meter fill. */
  tint: string;
}

export interface StatEffectBlock {
  key: keyof Stats;
  /** Role-aware (Strength / Agility / Intellect), via roleAwareStatLabel. */
  label: string;
  /** Two-letter plate glyph, e.g. ST / EN / LK / WS. */
  glyph: string;
  /** CSS colour var used for the plate + accent edge. */
  tint: string;
  /** One-line "what it's for". */
  blurb: string;
  value: number;
  lines: StatEffectLine[];
  /** "+0.14 success", "+0.08 success · +0.19 resist · +0.34 speed", ... */
  marginal: string;
}

const SOFT_REFERENCE: Partial<Record<ModKey, number>> = {
  success: 15,
  injuryResist: 25,
  speed: 25,
  gold: 30,
  xp: 30,
};
const LOOT_SOFT_REFERENCE = 175;

const TINT: Record<keyof Stats, string> = {
  strength: 'var(--blood)',
  endurance: 'var(--moss)',
  luck: 'var(--brass)',
  wisdom: 'var(--sky)',
};

const GLYPH: Record<keyof Stats, string> = {
  strength: 'ST', endurance: 'EN', luck: 'LK', wisdom: 'WS',
};

const BLURB: Record<keyof Stats, string> = {
  strength: 'drives quest success',
  endurance: 'double dip \u2014 feeds two',
  luck: 'gold earned & rare drops',
  wisdom: 'experience gained',
};

/** Which modifiers each stat actually feeds, in display order. `loot` is
 *  handled separately (multiplicative, personalLootBonus, not in Modifiers).
 *  Endurance deliberately does NOT list 'success' here (patch 0295) -- the
 *  Endurance/Loot rework (see HeroManager.statMods' own comment) removed
 *  Endurance's Success slice outright, folding it into Strength's
 *  coefficient instead. A stale FEEDS entry here (carried over from before
 *  that rework) meant the Endurance card showed a "Success +0.0" line that
 *  could never read as anything but zero, confirmed live on a real save. */
const FEEDS: Record<keyof Stats, { key: ModKey; label: string; format: EffectFormat }[]> = {
  strength: [{ key: 'success', label: 'Success', format: 'points' }],
  endurance: [
    { key: 'injuryResist', label: 'Injury resist', format: 'percent' },
    { key: 'speed', label: 'Quest speed', format: 'percent' },
  ],
  luck: [{ key: 'gold', label: 'Gold', format: 'percent' }],
  wisdom: [{ key: 'xp', label: 'Experience', format: 'percent' }],
};

/** Short label used in the "next point" line -- lowercase, no units. */
const MARGINAL_LABEL: Partial<Record<ModKey, string>> = {
  success: 'success', injuryResist: 'resist', speed: 'speed', gold: 'gold', xp: 'xp',
};

function mod(stats: Stats, key: ModKey): number {
  return HeroManager.statMods(stats)[key] ?? 0;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function formatEffect(value: number, format: EffectFormat): string {
  switch (format) {
    case 'points': return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
    case 'percent': return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    case 'multiplier': return `\u00d7${(1 + value / 100).toFixed(2)}`;
  }
}

export function statEffectBlocks(total: Stats, role: Role, heroClass: HeroClass, level: number): StatEffectBlock[] {
  // Success's headline number is deliberately NOT the same zeroed-diff every
  // other line uses (patch 0295, direct feedback: a hero showing "+22
  // Success" on the card was landing nowhere near that on real quests).
  // QuestManager.previewSuccess only curves the INVESTED half of a hero's
  // success -- stat points actually spent, gear worn -- not the automatic
  // growth every hero of this class/level gets for free just by leveling
  // up. Showing the full total here overstated what a player's own choices
  // were worth by exactly that auto-growth amount. autoGrowthSuccess is the
  // same "zero investment" snapshot previewSuccess itself computes.
  const autoGrowthStats = HeroManager.baselineStats(heroClass, level);
  const autoGrowthSuccess = HeroManager.statMods(autoGrowthStats).success ?? 0;

  return (['strength', 'endurance', 'luck', 'wisdom'] as (keyof Stats)[]).map((key) => {
    const zeroed: Stats = { ...total, [key]: 0 };
    const bumped: Stats = { ...total, [key]: total[key] + 1 };

    const lines: StatEffectLine[] = FEEDS[key].map(({ key: modKey, label, format }) => {
      const value = modKey === 'success'
        ? mod(total, modKey) - autoGrowthSuccess
        : mod(total, modKey) - mod(zeroed, modKey);
      const reference = SOFT_REFERENCE[modKey] ?? 25;
      return { label, value, format, ratio: clamp01(value / reference), tint: TINT[key] };
    });

    const marginalParts = FEEDS[key].map(({ key: modKey }) => {
      const delta = mod(bumped, modKey) - mod(total, modKey);
      return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} ${MARGINAL_LABEL[modKey]}`;
    });

    // Luck feeds Gold (additive) and Loot (multiplicative) through two
    // independent formulas -- shown as two separate lines, never summed.
    // See stat-conversion-table.md's Units section.
    if (key === 'luck') {
      const loot = HeroManager.personalLootBonus(total) - HeroManager.personalLootBonus(zeroed);
      lines.push({
        label: 'Rare loot',
        value: loot,
        format: 'multiplier',
        ratio: clamp01(loot / LOOT_SOFT_REFERENCE),
        tint: 'var(--violet)',
      });
      const lootDelta = HeroManager.personalLootBonus(bumped) - HeroManager.personalLootBonus(total);
      marginalParts.push(`+${lootDelta.toFixed(2)} loot%`);
    }

    return {
      key,
      label: roleAwareStatLabel(key, role),
      glyph: GLYPH[key],
      tint: TINT[key],
      blurb: BLURB[key],
      value: Math.round(total[key]),
      lines,
      marginal: marginalParts.join(' \u00b7 '),
    };
  });
}
