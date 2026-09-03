import { RaidDef, RaidDifficulty, RaidDifficultyConfig, RaidEncounterDef, Rarity } from '../types';
import { Tuning } from './tuning';
import { RARITY_ORDER } from '../util';
import { QUEST_CHAINS } from './quests';

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
import raidDifficultyIconsJson from './json/raid-difficulty-icons.json';

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
  // Legendary in particular is meant to be genuinely brutal, not just "harder
  // than Heroic": a 50-point penalty can push an encounter's baseline
  // success below the floor before the party's own bonus even applies.
  // The 9-hero party bonus is the intended counterweight, not a numbers
  // mistake -- confirmed as the deliberate design, not something to soften.
  // durationMultiplier: harder tiers take longer too -- normal 2h becomes
  // 2.3h at Heroic, 2.6h at Legendary (i.e. x1.15 / x1.3), matching the given
  // example exactly.
  // Normal's own numbers are all baseline zero-points (no penalty, x1
  // everything) rather than meaningfully "tunable" values, so they stay
  // literal here. Heroic/Legendary's four fields each read from the tuning
  // registry instead -- editable live via the devtool's Tuning tab. See
  // tuning.ts and tuning.json.
  // roleMismatchCap: Normal deliberately has none at all (undefined, not
  // just a high number) -- a mismatched Normal party still only eats the
  // ordinary per-slot roleMismatchPenalty subtraction and can climb back
  // up to MAX_SUCCESS on gear/level alone, same as before this existed.
  // Heroic/Legendary read theirs from the tuning registry like their other
  // three fields -- Legendary's is deliberately the lower of the two, same
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
  legendary: {
    difficulty: 'legendary', partySize: 9,
    successPenalty: Tuning.get('raid_difficulty.legendary.successPenalty'),
    rewardMultiplier: Tuning.get('raid_difficulty.legendary.rewardMultiplier'),
    lootBonus: Tuning.get('raid_difficulty.legendary.lootBonus'),
    durationMultiplier: Tuning.get('raid_difficulty.legendary.durationMultiplier'),
    roleMismatchCap: Tuning.get('raid_difficulty.legendary.roleMismatchCap'),
  },
};

export const RAID_DIFFICULTY_ORDER: RaidDifficulty[] = ['normal', 'heroic', 'legendary'];

/**
 * Player-facing display label per raid difficulty. As of patch 0166 the
 * internal id is 'legendary' too (full internal rename from the patch
 * 0165 display-only version -- ids, item suffixes, tuning keys, and the
 * upgrade id all now say `legendary`, not just this label), so this map
 * is trivial today. Kept rather than removed: it's the correct pattern
 * for whenever a genuinely new fourth tier lands above this one, and every
 * UI call site already reads through it instead of deriving a label by
 * capitalizing the raw id.
 */
export const RAID_DIFFICULTY_LABEL: Record<RaidDifficulty, string> = {
  normal: 'Normal',
  heroic: 'Heroic',
  legendary: 'Legendary',
};

/**
 * Badge icons for the N/H/L difficulty circles -- patch 0302: was a flat
 * `Record<RaidDifficulty, string>` path constant, editable only by
 * replacing the PNG files on disk by hand ("never devtool-edited," this
 * comment used to say). Now the same DevTool-editable `{path, focusX,
 * focusY, scale}` shape chain/raid banners already use
 * (raid-difficulty-icons.json, 3 entries), for the same reason those
 * exist: the actual bug report was that these are square source PNGs
 * rendered `object-fit: contain` inside a circular button
 * (DifficultyCircle, RaidsPanel.tsx), so a square canvas's own
 * background shows inside the round chrome instead of being cropped to
 * fill it. Fixing the crop (contain -> cover, see DifficultyCircle) is
 * only half the fix -- a plain center-crop won't always land right on
 * every source image, so this also gives it the same focus-point + zoom
 * adjuster every other DevTool-editable icon already has, rather than a
 * second one-off cropping mechanism.
 *
 * `path` unset (every entry ships that way) falls back to the exact
 * same convention path these always used --
 * `./lore/raid-difficulty-icons/<difficulty>.png` -- so nothing changes
 * visually from this patch alone beyond the contain->cover crop fix;
 * DevTool-assigning a real override only matters once someone actually
 * wants different art, same "nothing changes until deliberately
 * assigned" rollout every other bannerImage field follows. The three
 * files themselves moved from the old public/raid-icons/ (outside the
 * DevTool's public/lore/ picker root, hence "never devtool-edited") to
 * public/lore/raid-difficulty-icons/ -- identical art, just relocated to
 * where the picker can actually reach it; the old folder is left in
 * place, unreferenced, rather than deleted as part of a code patch.
 */
export interface RaidDifficultyIconDef {
  id: RaidDifficulty;
  path?: string;
  focusX?: number;
  focusY?: number;
  scale?: number;
}
export const RAID_DIFFICULTY_ICON_DEFS: Record<RaidDifficulty, RaidDifficultyIconDef> = Object.fromEntries(
  (raidDifficultyIconsJson as RaidDifficultyIconDef[]).map((d) => [d.id, d]),
) as Record<RaidDifficulty, RaidDifficultyIconDef>;

/** Resolves a difficulty's icon def to an actual src path -- an assigned
 *  `path` override (relative to public/lore/) wins, otherwise falls back
 *  to the original convention path. Mirrors raidBannerSrc's exact shape
 *  just below RaidBanner in RaidsPanel.tsx. */
export function raidDifficultyIconSrc(difficulty: RaidDifficulty): string {
  const def = RAID_DIFFICULTY_ICON_DEFS[difficulty];
  return def?.path ? `./lore/${def.path}` : `./lore/raid-difficulty-icons/${difficulty}.png`;
}

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
 *  lootLegendary if the encounter defines one, otherwise the same base
 *  `loot` every difficulty used before tiered pools existed. Used
 *  identically by both the real roll (RaidManager.resolve) and the UI
 *  preview, so what's shown always matches what can actually drop. */
export function lootForDifficulty(encounter: RaidEncounterDef, difficulty: RaidDifficulty): string[] {
  if (difficulty === 'heroic') return encounter.lootHeroic ?? encounter.loot;
  if (difficulty === 'legendary') return encounter.lootLegendary ?? encounter.loot;
  return encounter.loot;
}

/**
 * Same fallback shape as lootForDifficulty above, for eggLoot -- added in
 * patch 0250 alongside eggLootHeroic/eggLootLegendary on RaidEncounterDef.
 * The one difference from equipment loot: `loot` itself is required (every
 * encounter has one, even if empty), while `eggLoot` is optional and most
 * encounters have none at all -- so this returns `[]` rather than `encounter.
 * loot`'s always-defined fallback when nothing applies at any level. A
 * species meant to be Heroic-onward only (see PetDef -- Dragonling) simply
 * leaves eggLoot unset and relies on this returning [] at Normal.
 */
export function eggLootForDifficulty(encounter: RaidEncounterDef, difficulty: RaidDifficulty): string[] {
  if (difficulty === 'heroic') return encounter.eggLootHeroic ?? encounter.eggLoot ?? [];
  if (difficulty === 'legendary') return encounter.eggLootLegendary ?? encounter.eggLoot ?? [];
  return encounter.eggLoot ?? [];
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

/**
 * What specifically is still blocking a locked raid, in player-facing
 * terms -- direct request: the generic "Complete the previous raid to
 * reveal this one" told the player nothing about WHICH raid, or that a
 * raid can be gated by a quest chain instead of (or in addition to) a
 * prior raid. Returns null if the raid is already unlocked (nothing to
 * report) or genuinely unknown (defensive, shouldn't happen for any real
 * raid id). Mirrors isRaidUnlocked's own two gate checks exactly, in the
 * same order, so this can never disagree with what actually gates the
 * raid -- a raid gated by both a chain AND a prior raid reports the
 * chain first, same precedence isRaidUnlocked's own early-return gives
 * the chain check.
 */
export function raidLockReason(raidId: string, completedRaids: string[], completedChains: string[]): string | null {
  const raid = RAID_BY_ID[raidId];
  if (!raid) return null;
  if (isRaidUnlocked(raidId, completedRaids, completedChains)) return null;

  if (raid.requiresChainId && !completedChains.includes(raid.requiresChainId)) {
    const chain = QUEST_CHAINS.find((c) => c.id === raid.requiresChainId);
    return `Complete "${chain?.name ?? raid.requiresChainId}" to unlock this raid.`;
  }
  const unlockedBy = RAIDS.find((r) => r.unlocksRaidId === raidId);
  if (unlockedBy) {
    return `Complete ${unlockedBy.name} to unlock this raid.`;
  }
  // Shouldn't be reachable -- isRaidUnlocked already returned false above,
  // so one of the two gates it checks must be the reason. A generic
  // fallback rather than throwing keeps a devtool data-entry mistake
  // (e.g. a third raid somehow gated on neither) from crashing the UI.
  return 'Complete the previous raid to reveal this one.';
}

