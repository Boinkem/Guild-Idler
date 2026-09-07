import { Difficulty, QuestOffer, QuestTag, Rarity } from '../types';
import { HOUR, MINUTE } from '../util';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  baseSuccess: number;
  minDuration: number;
  maxDuration: number;
  xpMultiplier: number;
  /** Chance that any loot roll happens at all. */
  lootChance: number;
  /**
   * No longer a real availability gate (patch 0214) -- a quest offer's
   * actual reqLevel now rolls near hero.level regardless of difficulty
   * (see QuestManager.rollReqLevel). This survives purely as the "typical
   * level" reference balance.ts's bestUnlockedTier/expectedRatePerHour
   * use to estimate this tier's per-hour rate for the burst/medium
   * fast-quest cap system, which is deliberately untouched by the
   * reqLevel-roll rework -- same numeric values the old reqLevel had.
   */
  referenceLevel: number;
  /**
   * Multiplies the level-scaled questGoldBaseline/questXpBaseline curve
   * (progression.ts) for a standard (non-burst/non-medium) offer --
   * replaces the old flat minGold/maxGold range, which was calibrated
   * once around a fixed reqLevel that no longer exists. See
   * guild-idler-status.md's patch 0214 writeup.
   */
  rewardMultiplier: number;
  /** Weight when generating the board. */
  weight: number;
  color: string;
  /**
   * Patch 0332 -- replaces the old two-tier burst/medium system entirely
   * (see this file's own header comment for the full redesign reasoning
   * and guild-idler-status.md's patch 0332 writeup for the before/after).
   * One roll, one chance, on EVERY difficulty tier now (not Easy-only) --
   * this is the base chance before GameState.questFastUpgrades' Lucky
   * Streak bonus (QuestManager.generateOffer adds that on top). Kept
   * deliberately low and DECREASING per tier (Easy highest, Legendary
   * lowest, direct request: "Id like easy ones to be more common than
   * legendarys") -- rarity is the ONLY guardrail against a fast roll
   * becoming the dominant per-hour strategy now that the old cap/floor/
   * taper stack (balance.ts's fastQuestCapsPerHour/fastQuestFloorPerHour/
   * easyFastModeChances) is gone, a deliberate choice confirmed directly
   * rather than assumed safe.
   */
  fastChance: number;
  /**
   * A Fast roll's duration is a PERCENTAGE of this tier's own normal
   * min/maxDuration range, not an absolute duration -- the old burst
   * system's fixed 2-8min window only ever made sense pinned to Easy;
   * stretched naively up to Legendary it would mean "finish a 24-hour
   * quest in 3 minutes," which breaks the "difficulty scales everything"
   * redesign this whole patch is built around. fastMinDurationPct anchors
   * off minDuration, fastMaxDurationPct off maxDuration -- both fields
   * are percentages (10 means 10%), not fractions.
   */
  fastMinDurationPct: number;
  fastMaxDurationPct: number;
}

/**
 * DIFFICULTIES lives in json/difficulties.json so it can be edited via
 * tools/devtool without touching TypeScript -- same pattern
 * QUEST_TEMPLATES/QUEST_PREFIXES/QUEST_CHAINS above already use.
 *
 * Duration fields use the same "friendly unit on disk, converted to ms at
 * import" convention raid-encounters.json (durationHours) and
 * quest-chains.json (durationMinutes) already established: the main
 * min/maxDuration range is always a whole number of hours across all 5
 * tiers, so it's stored as *Hours.
 *
 * Per-tier balance history worth keeping, since it doesn't fit anywhere
 * in a JSON file with no comments (full detail also in
 * guild-idler-status.md's patch 0332 writeup):
 * - Patch 0332 replaced the old burst/medium two-tier system (own
 *   fastChance/fastMinDurationPct/fastMaxDurationPct fields per tier now,
 *   see DifficultyConfig's own comment) after direct feedback that the
 *   old system's guardrail stack (a live per-hour cap, a matching floor,
 *   a level-based taper, ALL fighting the same "burst became the
 *   mathematically dominant strategy at low levels" fire) was itself the
 *   problem -- burst's reward table was a separate, generous, easily-
 *   exploited mini-economy bolted onto Easy specifically. Fast quests now
 *   use the SAME reward formula every other quest does, just time-scaled
 *   and rarity-gated instead.
 * - Epic's xpMultiplier was raised 11 -> 12 and Legendary's 26 -> 30 --
 *   verified directly that both tiers' xp/hr had fallen BELOW Hard's at
 *   their old values, the opposite of what progressing through
 *   difficulty should feel like.
 */
interface DifficultyConfigJson {
  id: Difficulty;
  label: string;
  baseSuccess: number;
  minDurationHours: number;
  maxDurationHours: number;
  xpMultiplier: number;
  lootChance: number;
  referenceLevel: number;
  rewardMultiplier: number;
  weight: number;
  color: string;
  fastChance: number;
  fastMinDurationPct: number;
  fastMaxDurationPct: number;
}

import difficultiesJson from './json/difficulties.json';
export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = Object.fromEntries(
  (difficultiesJson as DifficultyConfigJson[]).map((d): [Difficulty, DifficultyConfig] => [
    d.id,
    {
      id: d.id, label: d.label, baseSuccess: d.baseSuccess,
      minDuration: d.minDurationHours * HOUR, maxDuration: d.maxDurationHours * HOUR,
      xpMultiplier: d.xpMultiplier,
      lootChance: d.lootChance, referenceLevel: d.referenceLevel, rewardMultiplier: d.rewardMultiplier,
      weight: d.weight, color: d.color,
      fastChance: d.fastChance,
      fastMinDurationPct: d.fastMinDurationPct, fastMaxDurationPct: d.fastMaxDurationPct,
    },
  ]),
) as Record<Difficulty, DifficultyConfig>;

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'epic', 'legendary'];

/** Quest names are assembled from a verb, a subject, and an optional place. */
interface Template {
  verb: string;
  subjects: string[];
  tag: QuestTag;
  flavour: string[];
  /**
   * Reserves grandiose "raid boss" templates for the difficulty tiers that
   * deserve them. Omit for a template usable at any difficulty.
   */
  minDifficulty?: Difficulty;
}

/**
 * Quest name templates live in json/quest-templates.json so they can be edited
 * via tools/devtool without touching TypeScript. This file just types and
 * re-exports them.
 */
import questTemplatesJson from './json/quest-templates.json';
export const QUEST_TEMPLATES: Template[] = questTemplatesJson as Template[];

// Was a plain array of strings; now {id, text} objects so it fits the
// DevTool's generic id-keyed editor shape (every other content type there
// is an array of objects, not raw scalars) -- editable via the new
// 'quest-prefixes' devtool tab without touching TypeScript.
import questPrefixesJson from './json/quest-prefixes.json';
export const QUEST_PREFIXES: string[] = (questPrefixesJson as { id: string; text: string }[]).map((p) => p.text);

/**
 * One entry per QuestTag -- a display name plus the same optional
 * banner-art-override + focus point shape ChainDef.banner/RaidDef.banner
 * already use (see quest-tags.json). Shown as a subtle full-card backdrop
 * behind every quest offer (see QuestTagBanner in QuestPanel.tsx),
 * separate from and much fainter than the bold banner strip a story-chain
 * quest specifically gets. Lives in json/quest-tags.json so the art and
 * focus point are editable via the DevTool the same way chain/raid
 * banners already are, rather than hardcoded per tag in TypeScript.
 */
export interface QuestTagDef {
  id: QuestTag;
  name: string;
  // `scale` (patch 0164) is an optional 100-300 zoom independent of
  // focusX/focusY -- omitted means the exact same plain `cover` every
  // banner used before this field existed, see QuestTagBanner's own
  // comment in QuestPanel.tsx.
  banner?: { path?: string; focusX?: number; focusY?: number; scale?: number };
  /**
   * Patch 0270. Same "separate, deliberately independent icon" story as
   * RaidDef.icon (see that comment in types.ts) -- a standard quest
   * offer's card thumb (QuestRow's `.raid-card-thumb`) has always used
   * this tag's own `banner` crop as a stand-in icon. Falls back to
   * `banner` when unset, same reasoning: no icon art exists yet, so
   * guessing a convention path would blank out every existing card.
   */
  icon?: { path?: string; focusX?: number; focusY?: number; scale?: number };
}

import questTagsJson from './json/quest-tags.json';
export const QUEST_TAGS: QuestTagDef[] = questTagsJson as QuestTagDef[];
export const QUEST_TAG_BY_ID: Record<QuestTag, QuestTagDef> = Object.fromEntries(
  QUEST_TAGS.map((t) => [t.id, t]),
) as Record<QuestTag, QuestTagDef>;

/* --------------------------- multi-day chains --------------------------- */

export interface ChainStageDef {
  name: string;
  flavour: string;
  /**
   * What kind of quest this specific stage is -- combat, arcane, stealth,
   * etc. Every stage across all 19 chains was authored individually
   * against its own flavour text (added retroactively; before this, every
   * chain stage in the game was hardcoded to 'explore' regardless of what
   * it was actually about, which meant Gladiator/Lizardman/Wizard got a
   * preferred-quest bonus on literally every story chain unconditionally
   * -- see QuestManager.chainOffer and previewSuccess for the read side of
   * this field).
   */
  tag: QuestTag;
  difficulty: Difficulty;
  duration: number;
  goldMultiplier: number;
}

export interface ChainDef {
  id: string;
  name: string;
  description: string;
  reqLevel: number;
  stages: ChainStageDef[];
  /** Guaranteed reward on completion. */
  rewardGold: number;
  rewardItems: string[];
  rewardRenown: number;
  /**
   * An epithet granted to whichever hero completes the final stage --
   * see Hero.titles/HeroManager.grantTitle for how a hero can hold
   * several of these and choose which one displays. Never re-granted on
   * a repeat (chains only complete once anyway, so this is mostly
   * documentation of that fact, not an active guard).
   */
  title?: string;
  /** A short narrative recap shown on the Lore tab once this chain is completed. */
  epilogue?: string;
  /**
   * A prior chain that must appear in state.completedChains before this one
   * can ever be offered -- confirmed against the actual prose (each of
   * these chains directly references the one before it, not just shares a
   * loose theme), not gated purely on level the way every chain already is.
   * A gated chain otherwise behaves exactly like a level-gated one: it just
   * never appears on the board yet, counted the same as any other
   * undiscovered chain -- no new UI needed for this.
   */
  requiresChainId?: string;
  /**
   * True for exactly one chain -- the Hatchery's own intro. Completing it
   * flips state.hatcheryUnlocked and triggers the one-time spotlight
   * prompt on the new tab. Handled in QuestManager.resolve's chain-
   * completion block, right alongside the ordinary rewardGold/rewardItems
   * grant. Deliberately just the unlock+spotlight now, not the egg grant
   * itself -- see rewardEgg below, which the_last_clutch also uses, same
   * as any future chain that wants to guarantee one.
   */
  grantsHatchery?: boolean;
  /**
   * True for exactly one chain -- Grimsby's own intro ("The Man Who
   * Sells Maybe"). Same shape as grantsHatchery: flips
   * state.peddlerUnlocked and queues the one-time spotlight prompt,
   * handled in QuestManager.resolve's chain-completion block right
   * alongside it. See guild-idler-status.md's Grimsby writeup.
   */
  grantsPeddler?: boolean;
  /**
   * True for exactly one chain -- the Harvest tab's own intro
   * (`the_first_haul`). Same shape as grantsHatchery/grantsPeddler: flips
   * state.harvestUnlocked and queues the one-time spotlight prompt,
   * handled in QuestManager.resolve's chain-completion block right
   * alongside them. See guild-idler-status.md's Harvest-unlock writeup
   * and GameState.harvestUnlocked's own comment for why this one field
   * gets different migration treatment than the other two despite
   * looking identical here.
   */
  grantsHarvest?: boolean;
  /**
   * A guaranteed egg on completion -- the egg equivalent of rewardItems
   * above, same "always granted, not a chance roll" contract. Optional
   * dedicatedPetId locks in a specific species from the dedicated pool
   * (see EggInstance.dedicatedPetId) rather than the general random one,
   * the same way `the_last_clutch` guarantees hatchery_hound specifically
   * rather than leaving it to chance. Independent of grantsHatchery --
   * that flag is only ever about the Hatchery's own unlock, any chain can
   * carry a rewardEgg once the Hatchery already exists.
   */
  rewardEgg?: { rarity: Rarity; dedicatedPetId?: string };
  /**
   * Optional banner-art override + focus point, editable via the DevTool's
   * banner picker (see server.mjs's `bannerImage` field type). `path` is
   * relative to public/lore/ (e.g. "chains/foo.jpg") and overrides the
   * default chains/<id>.jpg naming convention ChainBanner otherwise falls
   * back to -- omitted entirely, nothing changes from before this existed.
   * focusX/focusY are 0-100 percentages fed straight into CSS
   * backgroundPosition (50/50 = center, the same default every banner used
   * unconditionally before this). `scale` (patch 0164) is an optional
   * 100-300 zoom, independent of focusX/focusY, fed into backgroundSize --
   * omitted (or 100) means the exact same plain 'cover' every banner used
   * before this existed. Same shape as RaidDef.banner in types.ts.
   */
  banner?: { path?: string; focusX?: number; focusY?: number; scale?: number };
  /**
   * Patch 0270. Same "separate, deliberately independent icon" story as
   * RaidDef.icon in types.ts -- the collapsed chain card thumb (ChainCard
   * in LorePanel.tsx, ChainRow in DiscoveredQuestsPanel.tsx) has always
   * used this chain's own `banner` crop as a stand-in icon. Falls back to
   * `banner` when unset, same reasoning: no icon art exists yet, so
   * guessing a convention path would blank out every existing chain
   * card's thumb at once.
   */
  icon?: { path?: string; focusX?: number; focusY?: number; scale?: number };
}

/**
 * Quest chains live in json/quest-chains.json so they can be edited via
 * tools/devtool without touching TypeScript -- same pattern
 * QUEST_TEMPLATES/QUEST_PREFIXES above already use, just a bigger and
 * more nested payload (20 chains, each with its own ordered `stages`
 * array). This was long-tracked as "bigger than it sounds" in
 * guild-idler-status.md's backlog, and the nesting is exactly why: the
 * devtool's schema system, before this, only knew how to build a form
 * for a flat array of entries per file (see raids.ts's own comment on
 * why raid encounters are their own top-level type rather than nested
 * inside a raid, for the same reason) -- a repeatable stage sub-form
 * needed a genuinely new field type (`chainStages`), not just a JSON
 * migration. See tools/devtool/server.mjs's `chainStages` case and
 * app.js's matching UI for that half of this.
 *
 * The JSON itself was generated programmatically from the previous
 * hardcoded TS array (via a one-off tsx script dumping QUEST_CHAINS to
 * JSON) rather than hand-transcribed, specifically to rule out copy
 * errors across 20 chains' worth of prose and stage data.
 */
interface ChainStageJson extends Omit<ChainStageDef, 'duration'> {
  durationMinutes: number;
}
interface ChainDefJson extends Omit<ChainDef, 'stages'> {
  stages: ChainStageJson[];
}

import questChainsJson from './json/quest-chains.json';
export const QUEST_CHAINS: ChainDef[] = (questChainsJson as ChainDefJson[]).map((c) => ({
  ...c,
  stages: c.stages.map(({ durationMinutes, ...s }) => ({ ...s, duration: durationMinutes * MINUTE })),
}));

/**
 * A fresh guild's very first quest, hand-crafted rather than pulled from
 * the normal procedural pool -- see SaveManager.createInitialState, the
 * only place this actually gets placed on a board (directly into the
 * starter hero's own questBoards entry, so it's guaranteed to be there
 * and guaranteed to be the only option, rather than competing for
 * attention against 2-3 freshly-rolled ordinary offers). QuestManager.
 * resolve() checks this exact id to FORCE an injury and break the
 * starter Wooden Practice Sword regardless of the normal RNG -- the
 * whole point of a tutorial quest is that the player learns healing and
 * repair on quest one, not "maybe, if the dice cooperate." Deliberately
 * still a real, ordinary-shaped QuestOffer otherwise (goes through the
 * exact same send/resolve/reward path as everything else) rather than a
 * scripted cutscene -- the lesson is "this is what a normal quest can
 * do to you," which only lands if it plays out through the same system
 * every later quest does.
 */
export const TUTORIAL_QUEST_ID = 'tutorial_first_quest';
export function tutorialQuestOffer(): QuestOffer {
  return {
    id: TUTORIAL_QUEST_ID,
    name: 'A Guild\u2019s First Job',
    flavour: 'Nothing grand -- a cellar full of rats, or so the farmer swears. Every guild starts somewhere, and it is rarely anywhere glamorous.',
    difficulty: 'easy',
    tag: 'combat',
    duration: 5 * MINUTE,
    // High on purpose -- this is meant to read as a genuine first
    // success, not a coin flip. The injury and the broken sword happen
    // regardless of this roll (see QuestManager.resolve's own tutorial
    // override), so a high success chance doesn't undercut the lesson,
    // it just keeps the very first thing a new player sees from also
    // being a failure screen.
    baseSuccess: 90,
    rewardGold: 40,
    rewardXp: 20,
    loot: [],
    reqLevel: 1,
    // Patch 0332, direct request: the tutorial quest should read as this
    // same category of quest from a new player's very first contract
    // onward -- explicit now rather than an accident of its 5-minute
    // duration happening to fall under some threshold (see QuestOffer.
    // fast's own comment for why this moved to an explicit flag).
    fast: true,
  };
}
