import type { EquipmentItem, GameState, Hero, Modifiers, Stats } from '../types';
import type { Rng } from '../rng';
import { itemDef } from './equipment';
import { Tuning } from './tuning';

/**
 * Attunement (patch 0484) -- a Legendary Shard sink. Any Legendary item
 * (hand-authored, procedural or a Heirloom V/VI) can be Attuned for
 * economy.attuneShardCost Shards: one extra bonus line, stored on the item
 * as `attunement`. Re-attuning (economy.reattuneShardCost) rerolls it.
 *
 * A line's strength is fixed at roll time from the item's level (its
 * rolledItemLevel, else the def's reqLevel) and a 70-100% quality roll --
 * so re-level first, then attune, same order the Enchanter's reroll uses.
 * Not scaled by +refine or gear relevance: it's a flat bonus line.
 *
 * Common affixes feed the existing Modifiers / Stats sums
 * (HeroManager.equipmentMods / equipmentStats). Signature affixes are
 * Legendary-only flavour, read where they apply:
 *  - raidborn   RaidManager.partySuccessBonus (+success on raids)
 *  - unfading   EquipmentManager.applyWear (this item wears less)
 *  - mentor     RaidManager.resolve (other party members earn more XP)
 *  - shardseeker QuestManager.resolve (Shard chance on Epic/Legendary quests)
 *  - beastbond  PetManager.maxHealth + engine.revivePet (the wearer's pet)
 */
export type AttuneAffixId =
  | 'success' | 'gold' | 'xp' | 'loot' | 'speed' | 'health' | 'injuryResist' | 'durability'
  | 'strength' | 'endurance' | 'luck' | 'wisdom'
  | 'raidborn' | 'unfading' | 'mentor' | 'shardseeker' | 'beastbond';

export interface AttuneAffixDef {
  id: AttuneAffixId;
  name: string;
  kind: 'mod' | 'stat' | 'signature';
  /** Value at item level 50 and a perfect quality roll. */
  max: number;
  /** Fixed value: ignores item level and quality (Unfading). */
  fixed?: boolean;
  /** How a value reads on an item. */
  describe: (v: number) => string;
}

const pct = (label: string) => (v: number) => `+${v}% ${label}`;

export const ATTUNE_AFFIXES: AttuneAffixDef[] = [
  { id: 'success', name: 'Steady', kind: 'mod', max: 5, describe: pct('quest success') },
  { id: 'gold', name: 'Gilded', kind: 'mod', max: 12, describe: pct('gold') },
  { id: 'xp', name: 'Learned', kind: 'mod', max: 12, describe: pct('XP') },
  { id: 'loot', name: 'Seeking', kind: 'mod', max: 12, describe: pct('loot chance') },
  { id: 'speed', name: 'Swift', kind: 'mod', max: 10, describe: pct('speed') },
  { id: 'health', name: 'Hale', kind: 'mod', max: 60, describe: (v) => `+${v} Health` },
  { id: 'injuryResist', name: 'Warded', kind: 'mod', max: 12, describe: pct('injury resist') },
  { id: 'durability', name: 'Tempered', kind: 'mod', max: 15, describe: pct('durability') },
  { id: 'strength', name: 'Mighty', kind: 'stat', max: 30, describe: (v) => `+${v} Strength` },
  { id: 'endurance', name: 'Stalwart', kind: 'stat', max: 30, describe: (v) => `+${v} Endurance` },
  { id: 'luck', name: 'Lucky', kind: 'stat', max: 30, describe: (v) => `+${v} Luck` },
  { id: 'wisdom', name: 'Wise', kind: 'stat', max: 30, describe: (v) => `+${v} Wisdom` },
  { id: 'raidborn', name: 'Raidborn', kind: 'signature', max: 6, describe: (v) => `Raidborn: +${v} success on raids` },
  { id: 'unfading', name: 'Unfading', kind: 'signature', max: 50, fixed: true, describe: (v) => `Unfading: this item wears ${v}% slower` },
  { id: 'mentor', name: 'Mentor', kind: 'signature', max: 10, describe: (v) => `Mentor: the rest of the raid party earns +${v}% XP` },
  { id: 'shardseeker', name: 'Shardseeker', kind: 'signature', max: 2, describe: (v) => `Shardseeker: +${v}% Shard chance on Epic and Legendary quests` },
  { id: 'beastbond', name: 'Beastbond', kind: 'signature', max: 30, describe: (v) => `Beastbond: companion +${v} Health and ${v}% cheaper revives` },
];

export const ATTUNE_AFFIX_BY_ID: Record<string, AttuneAffixDef> = Object.fromEntries(ATTUNE_AFFIXES.map((a) => [a.id, a]));

const COMMON = ATTUNE_AFFIXES.filter((a) => a.kind !== 'signature');
const SIGNATURE = ATTUNE_AFFIXES.filter((a) => a.kind === 'signature');

/** May this item be attuned at all? Legendary rarity only. */
export function canAttune(item: EquipmentItem): boolean {
  return itemDef(item)?.rarity === 'legendary';
}

export function attuneLevel(item: EquipmentItem): number {
  return item.rolledItemLevel ?? itemDef(item)?.reqLevel ?? 1;
}

/** Rolls a fresh line for this item. `exclude` = the current affix, so a
 *  re-attune always lands on something different. */
export function rollAttunement(item: EquipmentItem, rng: Rng, exclude?: string): { affix: AttuneAffixId; value: number } {
  const signature = rng.chance(Tuning.get('economy.attuneSignatureChance'));
  const pool = (signature ? SIGNATURE : COMMON).filter((a) => a.id !== exclude);
  const def = pool[Math.floor(rng.next() * pool.length)] ?? COMMON[0];
  if (def.fixed) return { affix: def.id, value: def.max };
  const levelFactor = Math.min(1.2, Math.max(0.3, attuneLevel(item) / 50));
  const quality = 0.7 + rng.next() * 0.3;
  const precise = def.max * levelFactor * quality;
  // Small values keep one decimal place (Shardseeker's 2%) -- everything
  // else is a whole number, at least 1.
  const value = def.max <= 5 ? Math.max(0.5, Math.round(precise * 10) / 10) : Math.max(1, Math.round(precise));
  return { affix: def.id, value };
}

export function describeAttunement(a: NonNullable<EquipmentItem['attunement']>): string {
  return ATTUNE_AFFIX_BY_ID[a.affix]?.describe(a.value) ?? '';
}

/** The line as a Modifiers contribution (common mod affixes only). */
export function attunementMods(item: EquipmentItem): Partial<Modifiers> {
  const a = item.attunement;
  const def = a && ATTUNE_AFFIX_BY_ID[a.affix];
  if (!a || !def || def.kind !== 'mod') return {};
  return { [a.affix]: a.value } as Partial<Modifiers>;
}

/** The line as a Stats contribution (stat affixes only). */
export function attunementStats(item: EquipmentItem): Partial<Stats> {
  const a = item.attunement;
  const def = a && ATTUNE_AFFIX_BY_ID[a.affix];
  if (!a || !def || def.kind !== 'stat') return {};
  return { [a.affix]: a.value } as Partial<Stats>;
}

/** Sum of one signature affix across a hero's working (unbroken) gear. */
export function heroSignature(hero: Hero | undefined, affix: AttuneAffixId): number {
  if (!hero) return 0;
  let total = 0;
  for (const item of Object.values(hero.equipment)) {
    if (!item || item.durability <= 0 || item.attunement?.affix !== affix) continue;
    total += item.attunement.value;
  }
  return total;
}

/**
 * Patch 0484 -- combined cap on how much slower one Legendary can wear from
 * the Legendary Armoury plus an Unfading line (the hero-wide durability
 * modifier, Heirloom of the Unbreakable included, still applies on top
 * with its own existing floor).
 */
export const MAX_ITEM_WEAR_CUT_PCT = 60;

/** Legendary Armoury (Guild Hall, patch 0484): % slower Legendary wear. */
export function armouryWearCut(state: GameState): number {
  return (state.upgrades.legendary_armoury ?? 0) * Tuning.get('upgrade.legendary_armoury.wearCutPerLevel');
}
