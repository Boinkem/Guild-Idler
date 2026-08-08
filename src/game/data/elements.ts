import { Difficulty, ElementType, Hero } from '../types';
import { DIFFICULTY_ORDER } from './quests';
import { Rng } from '../rng';
import { Tuning } from './tuning';

export const ELEMENT_TYPES: ElementType[] = ['fire', 'frost', 'lightning', 'poison'];

export const ELEMENT_LABEL: Record<ElementType, string> = {
  fire: 'Fire', frost: 'Frost', lightning: 'Lightning', poison: 'Poison',
};

export const ELEMENT_GLYPH: Record<ElementType, string> = {
  fire: '\u{1f525}', frost: '\u{2744}\u{fe0f}', lightning: '\u{26a1}', poison: '\u{2620}\u{fe0f}',
};

/**
 * Icon pool for the Scrap "+N Scrap" collect-burst (see ScrapStation.tsx)
 * -- reuses 5 existing crafting icons rather than needing new art, same
 * "one is picked at random per event" idea as harvestIconFor
 * (data/materials.ts), just simpler: Scrap isn't a Harvest node, so there's
 * no per-material lookup, just one flat pool. Paths are relative to
 * public/item-icons/, matching ItemIcon's own convention.
 */
export const SCRAP_ICONS = [
  'crafting/Crafting_74.png',
  'crafting/Crafting_75.png',
  'crafting/Crafting_76.png',
  'crafting/Crafting_77.png',
  'crafting/Crafting_78.png',
];

/** Deterministic per-event pick from SCRAP_ICONS, so the same scrap action
 *  shows the same icon across a re-render but still varies action to
 *  action -- same sine-seed trick harvestIconFor already uses. */
export function scrapIconFor(seed: number): string {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return SCRAP_ICONS[Math.floor(frac * SCRAP_ICONS.length)];
}

/**
 * How many elemental tags a quest at a given difficulty tier CAN carry --
 * a ceiling, not a guarantee. Each element under that ceiling still rolls
 * independently (elemental.tagRollChancePercent, see below), so most
 * quests land well under their tier's own max, including zero. Harder
 * tiers get a higher ceiling on purpose, per the original ask ("the
 * harder the quest... the more resist modifiers... depending on how many
 * elements") -- Easy/Normal cap at 1, Hard/Epic at 2, Legendary at 3.
 */
function maxTagsForTier(difficulty: Difficulty): number {
  const tierIndex = DIFFICULTY_ORDER.indexOf(difficulty);
  return Math.min(ELEMENT_TYPES.length, 1 + Math.floor(tierIndex / 2));
}

/**
 * Rolls an independent set of elements (no repeats) for one tag list --
 * called twice per offer/encounter, once for vulnerableTo and once for
 * dealsElement, so the two lists are never forced to match or overlap.
 * At the tuned 22% per-candidate chance, a max-1 tier (Easy/Normal) lands
 * roughly 37% zero tags / 63% one tag; a max-2/3 tier (Hard/Epic/
 * Legendary) checks more candidates against that same per-candidate
 * chance, landing roughly 37% zero / 41% one / 21% two-or-more --
 * verified at runtime across 2000 samples per tier, not just estimated
 * from the math.
 * Shared by QuestManager.generateOffer (quests) and content authors
 * populating RaidEncounterDef by hand (raids don't roll this live, but
 * this same function is available if a future pass wants to
 * procedurally seed new encounters instead of hand-authoring them).
 */
export function rollElementTags(rng: Rng, difficulty: Difficulty): ElementType[] {
  const maxTags = maxTagsForTier(difficulty);
  const tags: ElementType[] = [];
  for (const el of rng.shuffle(ELEMENT_TYPES)) {
    if (tags.length >= maxTags) break;
    if (rng.chance(Tuning.get('elemental.tagRollChancePercent'))) tags.push(el);
  }
  return tags;
}

/**
 * Shared by QuestManager.previewSuccess and RaidManager.elementalBonus --
 * a quest offer and a raid encounter carry the same shape of tags, so one
 * function covers both. Two independent contributions:
 *
 * - Weapon side: the hero's equipped weapon's own elementalDamage
 *   (single value, not a magnitude -- see EquipmentItem's own comment on
 *   why infusing replaces rather than stacks) matching one of `tags.
 *   vulnerableTo` adds a flat elemental.bonusPerMatchPercent, UNLESS that
 *   same element is also listed under `tags.immuneTo` (raid-only) --
 *   immunity describes the encounter's own resilience, so a matching
 *   weapon does nothing special here rather than backfiring.
 * - Armor side: every equipped item's own elementalResist (a numeric
 *   value per element, additive across repeated infusions -- see
 *   EquipmentItem's own comment on why this one DOES stack) is summed
 *   for each element listed in `tags.dealsElement`. Not gated by
 *   `immuneTo` -- immunity is about the encounter's own weakness being
 *   nullified, not its attack type.
 */
export function elementalBonusForHero(
  hero: Hero,
  tags: { vulnerableTo?: ElementType[]; dealsElement?: ElementType[]; immuneTo?: ElementType[] },
): number {
  let bonus = 0;
  const weaponElement = hero.equipment.weapon?.elementalDamage;
  if (weaponElement && tags.vulnerableTo?.includes(weaponElement) && !(tags.immuneTo?.includes(weaponElement))) {
    bonus += Tuning.get('elemental.bonusPerMatchPercent');
  }
  for (const el of tags.dealsElement ?? []) {
    for (const item of Object.values(hero.equipment)) {
      bonus += item?.elementalResist?.[el] ?? 0;
    }
  }
  return bonus;
}
