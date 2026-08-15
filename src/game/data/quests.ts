import { Difficulty, QuestOffer, QuestTag, Rarity } from '../types';
import { HOUR, MINUTE } from '../util';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  baseSuccess: number;
  minDuration: number;
  maxDuration: number;
  minGold: number;
  maxGold: number;
  xpMultiplier: number;
  /** Chance that any loot roll happens at all. */
  lootChance: number;
  reqLevel: number;
  /** Weight when generating the board. */
  weight: number;
  color: string;
  /**
   * A second, short duration range rolled with `burstChance` probability
   * instead of the normal min/maxDuration. A single wide uniform range
   * mostly rolls near its own middle — verified directly, widening Easy's
   * floor to 90s on its own left the *typical* roll still around an hour,
   * so a genuinely fast early hook needs a guaranteed-frequent short mode,
   * not just a wider tail on the existing one.
   */
  burstChance?: number;
  burstMinDuration?: number;
  burstMaxDuration?: number;
  /**
   * Burst quests get their OWN reward range rather than a proportional slice
   * of the full range. A strict proportional slice was tried first and
   * measured directly: it rounded to 1-2 XP per burst quest, which is
   * mathematically fair but reads as insulting rather than "numbers going
   * up" -- exactly what this was supposed to deliver. Onboarding rewards get
   * to be a little generous on purpose.
   */
  burstMinGold?: number;
  burstMaxGold?: number;
  burstMinXp?: number;
  burstMaxXp?: number;
  /**
   * A third duration mode, same shape as burst (own chance, own duration
   * range, own reward range) but landing in the gap burst and the normal
   * range left open -- burst tops out at 8 minutes, and the normal range
   * starts at a full hour, so there was nowhere for a genuinely "half an
   * hour, check back on your break" contract to live. Rolled independently
   * of burst (burst is checked first; medium only gets a chance if burst
   * didn't hit), so the two never compete for the same slot on a given
   * offer. Subject to the same live per-hour cap burst gets (see
   * balance.ts's fastQuestCapsPerHour) for the same reason: an explicit
   * reward range read as more satisfying than a proportional slice of the
   * full range when burst was first added, but that same generosity needs
   * the same guardrail against becoming the dominant strategy.
   */
  mediumChance?: number;
  mediumMinDuration?: number;
  mediumMaxDuration?: number;
  mediumMinGold?: number;
  mediumMaxGold?: number;
  mediumMinXp?: number;
  mediumMaxXp?: number;
}

/**
 * DIFFICULTIES lives in json/difficulties.json so it can be edited via
 * tools/devtool without touching TypeScript -- same pattern
 * QUEST_TEMPLATES/QUEST_PREFIXES/QUEST_CHAINS above already use. This was
 * the single largest remaining DevTool coverage gap (see
 * guild-idler-status.md's backlog), tracked separately from the
 * quest-chains migration specifically because of its own scope: ~100
 * tunable values across 5 tiers, with dense balance rationale attached to
 * several of them individually (the burst-floor and Epic/Legendary
 * xpMultiplier fixes below).
 *
 * Duration fields use the same "friendly unit on disk, converted to ms at
 * import" convention raid-encounters.json (durationHours) and
 * quest-chains.json (durationMinutes) already established: the main
 * min/maxDuration range is always a whole number of hours across all 5
 * tiers, so it's stored as *Hours; burst/medium durations are always a
 * whole number of minutes, so those are stored as *Minutes. Both convert
 * to the millisecond values DifficultyConfig actually needs below.
 *
 * Per-tier balance history worth keeping, since it doesn't fit anywhere
 * in a JSON file with no comments (full detail also in
 * guild-idler-status.md's migration writeup):
 * - Easy's burst floor was bumped from 90s to 2min -- a sub-2-minute
 *   duration divided into any positive-integer reward implies a per-hour
 *   rate no live cap can safely contain. Confirmed by direct simulation,
 *   not assumed.
 * - Easy's medium tier is rolled only when burst doesn't hit (45% burst,
 *   then 35% of the remainder), Normal's less often (25%) since Normal is
 *   already a step up from "quick check-in" territory.
 * - Epic's xpMultiplier was raised 11 -> 12 and Legendary's 26 -> 30 --
 *   verified directly that both tiers' xp/hr had fallen BELOW Hard's at
 *   their old values, the opposite of what progressing through
 *   difficulty should feel like. The live per-hour cap in balance.ts is
 *   what keeps burst/medium's own explicit reward ranges honest against
 *   whichever tier ends up paying the most per hour.
 */
interface DifficultyConfigJson {
  id: Difficulty;
  label: string;
  baseSuccess: number;
  minDurationHours: number;
  maxDurationHours: number;
  minGold: number;
  maxGold: number;
  xpMultiplier: number;
  lootChance: number;
  reqLevel: number;
  weight: number;
  color: string;
  burstChance?: number;
  burstMinDurationMinutes?: number;
  burstMaxDurationMinutes?: number;
  burstMinGold?: number;
  burstMaxGold?: number;
  burstMinXp?: number;
  burstMaxXp?: number;
  mediumChance?: number;
  mediumMinDurationMinutes?: number;
  mediumMaxDurationMinutes?: number;
  mediumMinGold?: number;
  mediumMaxGold?: number;
  mediumMinXp?: number;
  mediumMaxXp?: number;
}

import difficultiesJson from './json/difficulties.json';
export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = Object.fromEntries(
  (difficultiesJson as DifficultyConfigJson[]).map((d): [Difficulty, DifficultyConfig] => [
    d.id,
    {
      id: d.id, label: d.label, baseSuccess: d.baseSuccess,
      minDuration: d.minDurationHours * HOUR, maxDuration: d.maxDurationHours * HOUR,
      minGold: d.minGold, maxGold: d.maxGold, xpMultiplier: d.xpMultiplier,
      lootChance: d.lootChance, reqLevel: d.reqLevel, weight: d.weight, color: d.color,
      // Gated on `> 0`, not `!== undefined` -- the DevTool's own generic
      // number-field editor always renders/saves an untouched optional
      // number as 0 rather than leaving it absent (see app.js's
      // fieldControl/readField), so simply opening Hard/Epic/Legendary in
      // the editor and hitting Save would otherwise write a spurious
      // burstChance: 0 (and matching 0-value siblings) into the JSON. A
      // 0% burst/medium chance is functionally identical to the field
      // being absent either way, so this guard is free insurance against
      // that DevTool quirk, not a behavior change for real data.
      ...(d.burstChance !== undefined && d.burstChance > 0 ? {
        burstChance: d.burstChance,
        burstMinDuration: d.burstMinDurationMinutes! * MINUTE,
        burstMaxDuration: d.burstMaxDurationMinutes! * MINUTE,
        burstMinGold: d.burstMinGold, burstMaxGold: d.burstMaxGold,
        burstMinXp: d.burstMinXp, burstMaxXp: d.burstMaxXp,
      } : {}),
      ...(d.mediumChance !== undefined && d.mediumChance > 0 ? {
        mediumChance: d.mediumChance,
        mediumMinDuration: d.mediumMinDurationMinutes! * MINUTE,
        mediumMaxDuration: d.mediumMaxDurationMinutes! * MINUTE,
        mediumMinGold: d.mediumMinGold, mediumMaxGold: d.mediumMaxGold,
        mediumMinXp: d.mediumMinXp, mediumMaxXp: d.mediumMaxXp,
      } : {}),
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
  banner?: { path?: string; focusX?: number; focusY?: number };
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
   * unconditionally before this). Same shape as RaidDef.banner in types.ts.
   */
  banner?: { path?: string; focusX?: number; focusY?: number };
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
  };
}
