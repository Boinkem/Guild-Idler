import { RaidDef, RaidDifficulty, RaidDifficultyConfig, RaidEncounterDef, Rarity } from '../types';
import { Tuning } from './tuning';
import { RARITY_ORDER } from '../util';

/**
 * Raids and their encounters live in json/*.json, same reasoning as
 * equipment/quest-templates/etc -- editable via tools/devtool without
 * touching TypeScript. Encounters are their own top-level content type
 * rather than nested inside a raid entry, since the devtool's generic
 * schema system only knows how to build a form for a flat array of
 * entries per file, not an array-of-objects field within one entry. A
 * RaidDef just references an ordered list of encounter ids, the same
 * pattern ItemSet.pieces already uses for equipment ids.
 */
import raidEncountersJson from './json/raid-encounters.json';
import raidsJson from './json/raids.json';

const HOUR = 3600000;

/** Raw shape on disk -- durationHours, not duration, matching the same
 *  human-friendly-unit convention injuries.json already uses. */
interface RaidEncounterJson extends Omit<RaidEncounterDef, 'duration'> {
  durationHours: number;
}

export const RAID_ENCOUNTERS: RaidEncounterDef[] = (raidEncountersJson as RaidEncounterJson[]).map((e) => ({
  ...e,
  duration: e.durationHours * HOUR,
}));
export const RAID_ENCOUNTER_BY_ID: Record<string, RaidEncounterDef> = Object.fromEntries(
  RAID_ENCOUNTERS.map((e) => [e.id, e]),
);

export const RAIDS: RaidDef[] = raidsJson as RaidDef[];
export const RAID_BY_ID: Record<string, RaidDef> = Object.fromEntries(RAIDS.map((r) => [r.id, r]));

/**
 * Difficulty configs -- deliberately global constants rather than per-raid
 * devtool fields for now. "Tuneable" here means "lives in one clear spot
 * that's easy to find and change," not necessarily "editable per raid in
 * the devtool" -- every raid using the same three tiers keeps N/H/M a
 * consistent, learnable promise across all of them, the same way every
 * quest offer's Easy/Normal/Hard/Epic/Legendary means the same thing
 * regardless of which quest it's attached to.
 */
export const RAID_DIFFICULTIES: Record<RaidDifficulty, RaidDifficultyConfig> = {
  // successPenalty raised (12->20, 24->50) and lootBonus introduced --
  // Mythic in particular is meant to be genuinely brutal, not just "harder
  // than Heroic": a 50-point penalty can push an encounter's baseline
  // success below the floor before the party's own bonus even applies.
  // The 9-hero party bonus is the intended counterweight, not a numbers
  // mistake -- confirmed as the deliberate design, not something to soften.
  // durationMultiplier: harder tiers take longer too -- normal 2h becomes
  // 2.3h at Heroic, 2.6h at Mythic (i.e. x1.15 / x1.3), matching the given
  // example exactly.
  // Normal's own numbers are all baseline zero-points (no penalty, x1
  // everything) rather than meaningfully "tunable" values, so they stay
  // literal here. Heroic/Mythic's four fields each read from the tuning
  // registry instead -- editable live via the devtool's Tuning tab. See
  // tuning.ts and tuning.json.
  // roleMismatchCap: Normal deliberately has none at all (undefined, not
  // just a high number) -- a mismatched Normal party still only eats the
  // ordinary per-slot roleMismatchPenalty subtraction and can climb back
  // up to MAX_SUCCESS on gear/level alone, same as before this existed.
  // Heroic/Mythic read theirs from the tuning registry like their other
  // three fields -- Mythic's is deliberately the lower of the two, same
  // "genuinely brutal, not just harder than Heroic" intent as its
  // successPenalty above.
  normal: { difficulty: 'normal', partySize: 3, successPenalty: 0, rewardMultiplier: 1, lootBonus: 0, durationMultiplier: 1 },
  heroic: {
    difficulty: 'heroic', partySize: 6,
    successPenalty: Tuning.get('raid_difficulty.heroic.successPenalty'),
    rewardMultiplier: Tuning.get('raid_difficulty.heroic.rewardMultiplier'),
    lootBonus: Tuning.get('raid_difficulty.heroic.lootBonus'),
    durationMultiplier: Tuning.get('raid_difficulty.heroic.durationMultiplier'),
    roleMismatchCap: Tuning.get('raid_difficulty.heroic.roleMismatchCap'),
  },
  mythic: {
    difficulty: 'mythic', partySize: 9,
    successPenalty: Tuning.get('raid_difficulty.mythic.successPenalty'),
    rewardMultiplier: Tuning.get('raid_difficulty.mythic.rewardMultiplier'),
    lootBonus: Tuning.get('raid_difficulty.mythic.lootBonus'),
    durationMultiplier: Tuning.get('raid_difficulty.mythic.durationMultiplier'),
    roleMismatchCap: Tuning.get('raid_difficulty.mythic.roleMismatchCap'),
  },
};

export const RAID_DIFFICULTY_ORDER: RaidDifficulty[] = ['normal', 'heroic', 'mythic'];

/**
 * Badge icons for the N/H/M difficulty circles. Lives in its own
 * public/raid-icons/ folder, separate from public/item-icons/, since these
 * are fixed UI chrome (exactly three, never devtool-edited) rather than
 * per-item art assigned one at a time. Falls back to the plain letter
 * label in the UI if the file is missing -- see DifficultyCircle in
 * RaidsPanel.tsx.
 */
export const RAID_DIFFICULTY_ICON: Record<RaidDifficulty, string> = {
  normal: './raid-icons/normal.png',
  heroic: './raid-icons/heroic.png',
  mythic: './raid-icons/mythic.png',
};

/** Parses a "defId@chance" loot entry into its two parts. Malformed entries
 *  (missing the @, or a non-numeric chance) are dropped rather than
 *  throwing, so one bad devtool edit can't break the whole raid. */
export function parseLootEntry(entry: string): { defId: string; chance: number } | null {
  const at = entry.lastIndexOf('@');
  if (at <= 0) return null;
  const defId = entry.slice(0, at);
  const chance = Number(entry.slice(at + 1));
  if (!defId || Number.isNaN(chance)) return null;
  return { defId, chance };
}

/** Parses a "<rarity>[:<dedicatedPetId>]@chance" eggLoot entry -- same
 *  malformed-entry-is-dropped-not-thrown safety as parseLootEntry above.
 *  The rarity half is validated against RARITY_ORDER so a typo'd devtool
 *  edit (e.g. "rar@5") silently drops instead of granting a bad Rarity
 *  value into game state. */
export function parseEggLootEntry(entry: string): { rarity: Rarity; dedicatedPetId?: string; chance: number } | null {
  const at = entry.lastIndexOf('@');
  if (at <= 0) return null;
  const chance = Number(entry.slice(at + 1));
  if (Number.isNaN(chance)) return null;
  const [rarityPart, dedicatedPetId] = entry.slice(0, at).split(':');
  if (!RARITY_ORDER.includes(rarityPart as Rarity)) return null;
  return { rarity: rarityPart as Rarity, dedicatedPetId: dedicatedPetId || undefined, chance };
}

/** The loot pool actually in play for a given difficulty -- lootHeroic/
 *  lootMythic if the encounter defines one, otherwise the same base `loot`
 *  every difficulty used before tiered pools existed. Used identically by
 *  both the real roll (RaidManager.resolve) and the UI preview, so what's
 *  shown always matches what can actually drop. */
export function lootForDifficulty(encounter: RaidEncounterDef, difficulty: RaidDifficulty): string[] {
  if (difficulty === 'heroic') return encounter.lootHeroic ?? encounter.loot;
  if (difficulty === 'mythic') return encounter.lootMythic ?? encounter.loot;
  return encounter.loot;
}

/** Raids visible in the UI: this one, plus any not-yet-reached raid another
 *  completed raid points at via unlocksRaidId -- shown greyed-out with the
 *  name/rewards hidden until actually unlocked, same "???" treatment used
 *  for undiscovered quest chains. */
export function isRaidUnlocked(raidId: string, completedRaids: string[], completedChains: string[]): boolean {
  const raid = RAID_BY_ID[raidId];
  if (!raid) return false;

  // Chain gate checked first and independently -- a raid gated purely by a
  // chain (no other raid's unlocksRaidId points to it) would otherwise fall
  // through to the "not gated by anything" raid-index fallback below and be
  // visible from the very start, which is exactly the bug this guards
  // against.
  if (raid.requiresChainId && !completedChains.includes(raid.requiresChainId)) return false;

  if (RAIDS.findIndex((r) => r.id === raidId) === 0) return true;
  const unlockedBy = RAIDS.find((r) => r.unlocksRaidId === raidId);
  if (!unlockedBy) return true; // not gated by another raid -- visible once its own chain gate (if any) clears
  return completedRaids.includes(unlockedBy.id);
}
