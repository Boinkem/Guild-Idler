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
 *
 * All-stats rework (patch 0255, see guild-idler-status.md). The roll pool
 * used to draw from BOTH the 4 raw Stats and 6 direct Modifiers at equal
 * odds/cost -- a real exploit, not just a flavor choice: a direct
 * Modifier roll (e.g. `xp: +18`) added linearly, while a Stat roll (e.g.
 * `wisdom: +18`) first had to pass through statMods' sqrt() curve, so its
 * marginal value shrank the more of that stat a hero already had. Since a
 * hero's stat totals only grow over a run, a Stat-affix became a worse
 * and worse deal relative to a Modifier-affix at the exact same gear
 * budget the longer you played -- backwards from what gear should do.
 * The pool is Stats-only now; direct Modifier affixes are retired from
 * procedural rolls entirely. `budgetRarityMultiplier` was bumped
 * accordingly (Tuning) since half the pool that used to pay out at full
 * linear value is gone -- a first-pass floor, not a value-parity attempt
 * (a literal parity conversion against old legendary items came out to
 * ~290 raw Endurance on a single slot, more than a maxed hero could ever
 * accumulate on their own -- the power curve is accepted to flatten/shift
 * rather than preserve exact old per-item numbers; needs live playtest
 * verification).
 */

/** Where a procedurally-generated item came from -- drives both the
 *  budget multiplier and the bracketed display tag. `standard` covers
 *  Easy/Normal (no multiplier, no tag) and Epic/Legendary quest tiers
 *  (no multiplier -- their extra power already comes through the
 *  rarity/level curve itself -- but still tagged, for consistency and
 *  because a player might reasonably want to know an Epic-quest drop
 *  from a Hard-quest one at the same rarity).
 *
 *  `chainReplayHeroic`/`chainReplayLegendary` (patch 0225, Replayable
 *  Quest Chains -- see guild-idler-status.md's Backlog entry) cover a
 *  chain replay's *padding* loot only -- whatever a stage's ordinary
 *  procedural pool-pick already selected, same mechanism `raidHeroic`/
 *  `raidLegendary` already use for raids. Deliberately separate budget
 *  multipliers and separate display labels from the raid tags, even
 *  though the underlying mechanism is identical -- see their own
 *  comments below for why. The chain's own *dedicated* reward item is a
 *  different, deliberately non-procedural mechanism entirely (see
 *  scaleDedicatedItem below) -- these two tags never reach that
 *  path, since dedicated rewards are chainExclusive and therefore never
 *  isProceduralTemplate() in the first place. */
export type LootSourceTag =
  | 'easy' | 'normal' | 'hard' | 'epic' | 'legendary'
  | 'raidHeroic' | 'raidLegendary'
  | 'chainReplayHeroic' | 'chainReplayLegendary';

export type BonusRollTier = 'none' | 'fortunate' | 'charmed';

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
    // Deliberately their own tuning ids, not a reuse of the raid ones --
    // chain replay is meant to be lighter-weight solo-hero repeatable
    // content, not a second raid ladder (same reasoning
    // CHAIN_REPLAY_DIFFICULTIES' own successPenalty/lootBonus already
    // used, softer than RAID_DIFFICULTIES' equivalents). Values sit
    // between hardQuest's 1.15x and raid's 1.5x/2.2x.
    case 'chainReplayHeroic': return Tuning.get('loot_procedural.chainReplayHeroicBudgetMultiplier');
    case 'chainReplayLegendary': return Tuning.get('loot_procedural.chainReplayLegendaryBudgetMultiplier');
    default: return 1;
  }
}

/** Display label for the bracketed source tag -- e.g. "Iron Sword [Hard]".
 *  Easy/Normal quest drops get no bracket at all (the common case
 *  shouldn't be visually noisy); everything else does.
 *
 *  chainReplayHeroic/Legendary deliberately use "Replay: Heroic"/
 *  "Replay: Legendary" rather than reusing raid's bare "Heroic"/
 *  "Legendary" text (confirmed design decision) -- a player should be
 *  able to tell at a glance whether a drop came from a raid or a chain
 *  replay, not just that it was hard-won either way. */
function sourceTagLabel(sourceTag: LootSourceTag): string | null {
  switch (sourceTag) {
    case 'hard': return 'Hard';
    case 'epic': return 'Epic';
    case 'legendary': return 'Legendary';
    case 'raidHeroic': return 'Heroic';
    case 'raidLegendary': return 'Legendary';
    case 'chainReplayHeroic': return 'Replay: Heroic';
    case 'chainReplayLegendary': return 'Replay: Legendary';
    default: return null; // easy, normal
  }
}

export interface ProceduralRoll {
  stats: Partial<Stats>;
  bonusTier: BonusRollTier;
  displayName: string;
}

/**
 * Rolls a procedurally-generated item's real power. `baseName` is the
 * template's authored flavor name (e.g. "Iron Sword") -- this only ever
 * decorates it with a bonus-roll prefix and/or a source-tag suffix, never
 * invents a new base name.
 *
 * `weightedKey`/`weightMultiplier` (patch 0215, Fortune Charms) bias
 * which stat each affix slot lands on -- every other key keeps its
 * default weight of 1, `weightedKey` gets `weightMultiplier` instead.
 * Omitted entirely for an ordinary unweighted roll (the overwhelming
 * majority of drops). As of patch 0255 (all-stats rework) this only
 * ever meaningfully targets a Stats key -- a Fortune Charm that still
 * names a retired Modifiers key (pre-0255 data) simply never matches
 * anything in the pool and degrades to an ordinary unweighted roll
 * rather than erroring; real Fortune Charm data was remapped in the
 * same patch (gold -> luck, xp -> wisdom) so this shouldn't come up in
 * practice.
 *
 * `poolRestriction` existed pre-0255 (Enchanter reroll, patch 0215) to
 * keep a reroll from touching `enchantStats` -- moot now that the pool
 * is Stats-only and the stat half of a roll lives in its own
 * `rolledStats` field (see EquipmentManager.instantiate and
 * CraftingManager.reroll), so the parameter is retired along with the
 * Modifiers half of the pool it used to distinguish.
 */
export function rollProceduralItem(
  rarity: Rarity, itemLevel: number, sourceTag: LootSourceTag, baseName: string, rng: Rng,
  weightedKey?: keyof Stats, weightMultiplier?: number,
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

  const stats: Partial<Stats> = {};
  for (let i = 0; i < slots; i++) {
    const picked = weightedKey
      ? rng.weighted(STAT_KEYS.map((k) => ({ item: k, weight: k === weightedKey ? (weightMultiplier ?? 1) : 1 })))
      : rng.pick(STAT_KEYS);
    stats[picked] = (stats[picked] ?? 0) + perSlot;
  }

  let displayName = baseName;
  if (bonusTier === 'charmed') displayName = `Charmed ${displayName}`;
  else if (bonusTier === 'fortunate') displayName = `Fortunate ${displayName}`;
  const tagLabel = sourceTagLabel(sourceTag);
  if (tagLabel) displayName = `${displayName} [${tagLabel}]`;

  return { stats, bonusTier, displayName };
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

export interface DedicatedItemScale {
  /** The item's full scaled stats, meant to fully replace item.rolledStats
   *  (not def.stats, which stays the item's own unscaled authored
   *  baseline) -- writes to `rolledStats`, the same field patch 0255 gave
   *  procedural rolls, never `enchantStats` (that field is Armour
   *  Infusion's own additive purchases -- see rolledStats' own comment in
   *  types.ts). Pre-0258 this wrote a delta into `enchantStats`, sharing
   *  the exact hazard patch 0255 fixed for procedural rolls but left
   *  alone here at the time (out of scope then); fixed now while this
   *  function is being rebuilt anyway. */
  rolledStats: Partial<Stats>;
  /** Preserved-only mods (durability/health -- see patch 0256's own
   *  writeup for why these two specifically never converted to Stats),
   *  scaled by the same ratio as rolledStats so a bigger drop's
   *  durability/health grows with it rather than staying frozen at the
   *  item's original authored size. */
  mods: Partial<Modifiers>;
  displayName: string;
}

/**
 * Scales an already-authored hand-authored item's (chainExclusive
 * reward OR ordinary raid Set piece) stats for a Heroic/Legendary drop
 * -- the dedicated-item counterpart to rollProceduralItem above, but a
 * genuinely different mechanism, not a variant of it.
 *
 * Patch 0258 (Dedicated Reward Level Scaling, see guild-idler-status.md)
 * rework: previously this only multiplied the item's own fixed authored
 * numbers by a flat per-tier multiplier, blind to the hero's actual
 * level -- a level-50 hero replaying a level-5 chain on Legendary got
 * the same tiny item a level-6 hero would on first clear (`itemLevel`
 * was passed as the CHAIN's own reqLevel, and `rolledItemLevel` was
 * deliberately never set, so gear_relevance decay applied against that
 * same low number forever after). Now recomputes a fresh stat BUDGET
 * against the hero's current level, the same `GEAR_SCORE_BY_RARITY *
 * multiplier * levelFactor` shape rollProceduralItem/patch 0256's
 * item-re-author already use, then redistributes that budget across the
 * item's EXISTING stat proportions -- so `wardens_signet` stays an
 * Endurance/Luck ring (its patch 0257 signature-stat lean, preserved
 * exactly), just a correspondingly bigger one at level 50 than at its
 * own level 16. The heroic/legendary multiplier stacks ON TOP of this
 * level-scaled budget, not instead of it -- direct answer to "should
 * this scale to hero level or difficulty tier": both, stacked.
 *
 * Extended from chainExclusive-only to any hand-authored item
 * (`!isProceduralTemplate`), since raid Set pieces had literally no
 * scaling mechanism before this patch, not even the old flat
 * multiplier chains had -- see EquipmentManager.instantiate's own
 * comment for the branch condition. `raid_dedicated`'s own multiplier
 * pair (1.5/2.2) matches loot_procedural's existing raidHeroic/
 * raidLegendaryBudgetMultiplier values rather than reusing chain
 * replay's (1.3/1.7) -- raids were already the more generously-tuned
 * content family for procedural loot, so their own named gear follows
 * that same existing premium rather than a fresh number.
 *
 * Deliberately NOT set to keep re-scaling live as the hero levels
 * further -- confirmed design: an item is fixed at whatever level it
 * dropped at (via `rolledItemLevel`, set by the caller), same as any
 * other piece of gear. A player who wants it to keep pace either pays
 * to re-level it at the Blacksmith (now open to hand-authored items
 * too, see EquipmentManager.relevel's own comment) or farms a fresh,
 * higher-level drop.
 *
 * No Fortunate/Charmed bonus roll here, unlike rollProceduralItem --
 * these are already unique, named story/raid rewards; a random bonus
 * prefix on top would read as redundant rather than exciting, so this
 * deliberately doesn't offer one.
 */
export function scaleDedicatedItem(
  def: { name: string; rarity: Rarity; mods?: Partial<Modifiers>; stats?: Partial<Stats> },
  heroLevel: number,
  sourceTag: 'chainReplayHeroic' | 'chainReplayLegendary' | 'raidHeroic' | 'raidLegendary',
): DedicatedItemScale {
  const isRaid = sourceTag === 'raidHeroic' || sourceTag === 'raidLegendary';
  const isLegendaryTier = sourceTag === 'chainReplayLegendary' || sourceTag === 'raidLegendary';
  const tierMultiplier = isRaid
    ? Tuning.get(isLegendaryTier ? 'raid_dedicated.legendaryMultiplier' : 'raid_dedicated.heroicMultiplier')
    : Tuning.get(isLegendaryTier ? 'chain_replay_dedicated.legendaryMultiplier' : 'chain_replay_dedicated.heroicMultiplier');

  const originalStats = def.stats ?? {};
  const originalTotal = Object.values(originalStats).reduce((a, b) => a + b, 0);
  const levelBudget = GEAR_SCORE_BY_RARITY[def.rarity]
    * Tuning.get('chain_replay_dedicated.levelScaleBudgetMultiplier')
    * levelFactor(heroLevel);
  const scaledBudget = levelBudget * tierMultiplier;

  const rolledStats: Partial<Stats> = {};
  const mods: Partial<Modifiers> = {};
  if (originalTotal > 0) {
    for (const [key, value] of Object.entries(originalStats) as [keyof Stats, number][]) {
      rolledStats[key] = Math.max(1, Math.round(scaledBudget * (value / originalTotal)));
    }
    // durability/health (the two preserved mod keys post-0256) scale by
    // the item's overall budget growth ratio, not the flat tier
    // multiplier alone -- a level-50 drop's Health bonus should grow
    // with the rest of the item, not stay frozen at its level-25 size.
    const growthRatio = scaledBudget / originalTotal;
    for (const [key, value] of Object.entries(def.mods ?? {}) as [keyof Modifiers, number][]) {
      mods[key] = Math.max(1, Math.round(value * growthRatio));
    }
  }

  const tagLabel = sourceTagLabel(sourceTag);
  const displayName = tagLabel ? `${def.name} [${tagLabel}]` : def.name;

  return { rolledStats, mods, displayName };
}

