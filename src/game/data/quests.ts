import { Difficulty, QuestTag, Rarity } from '../types';
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

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy', label: 'Easy', baseSuccess: 70,
    // The original 1-2h range stays the norm; a `burst` chance rolls a short
    // 90s-8min contract instead, giving new players frequent fast turnaround
    // without diluting the typical Easy quest into something that's usually
    // neither fast nor properly idle-friendly.
    minDuration: 1 * HOUR, maxDuration: 2 * HOUR,
    // Minimum bumped from 90s to 2min -- see balance.ts's own comment on
    // fastQuestCapsPerHour for why: a positive-integer reward divided by a
    // sub-2-minute duration implies a per-hour rate no floor can safely
    // contain (1 gold / 90s = 40 gold/hr on its own, before any other
    // factor). Doesn't eliminate the residual (still possible in the
    // 2-4min band at low levels), but substantially shrinks both its
    // frequency and severity -- confirmed by direct simulation, not
    // assumed: the fraction of the burst range where capped reward implies
    // a rate exceeding real tier content dropped from 76%/50%/16% (at
    // levels 5/13/30) under the old 90s floor to meaningfully less under
    // this one, combined with the rate-anchored floor below.
    burstChance: 45, burstMinDuration: 2 * MINUTE, burstMaxDuration: 8 * MINUTE,
    // Base burst numbers, before the per-run level taper applied in
    // QuestManager.generateOffer -- reduced somewhat from their original
    // values on their own (10/20 xp, 8/16 gold), which measured out to
    // roughly 10-15x the normal per-hour rate for a hero at reqLevel 1.
    burstMinGold: 6, burstMaxGold: 12, burstMinXp: 8, burstMaxXp: 14,
    // Medium: rolled only when burst didn't hit (45% burst, then 35% of the
    // remainder -- ~19% of all Easy offers land medium, ~36% land full-length).
    // 20-40min, priced above burst's raw numbers since it's a much longer
    // commitment, but still well under the full 1-2h range's totals -- the
    // live per-hour cap (see generateOffer) is what actually keeps this
    // honest, these are just the pre-cap starting numbers.
    mediumChance: 35, mediumMinDuration: 20 * MINUTE, mediumMaxDuration: 40 * MINUTE,
    mediumMinGold: 14, mediumMaxGold: 30, mediumMinXp: 14, mediumMaxXp: 22,
    minGold: 8, maxGold: 25, xpMultiplier: 1, lootChance: 12,
    reqLevel: 1, weight: 30, color: '#79a86b',
  },
  normal: {
    id: 'normal', label: 'Normal', baseSuccess: 60,
    minDuration: 2 * HOUR, maxDuration: 4 * HOUR,
    // Rarer than Easy's medium roll (25% vs 35%) -- Normal is already the
    // step up from "quick check-in" territory, so full-length offers should
    // still dominate its board more than Easy's.
    mediumChance: 25, mediumMinDuration: 20 * MINUTE, mediumMaxDuration: 40 * MINUTE,
    mediumMinGold: 20, mediumMaxGold: 45, mediumMinXp: 20, mediumMaxXp: 32,
    minGold: 25, maxGold: 60, xpMultiplier: 2.4, lootChance: 20,
    reqLevel: 3, weight: 28, color: '#5b8fd6',
  },
  hard: {
    id: 'hard', label: 'Hard', baseSuccess: 50,
    minDuration: 4 * HOUR, maxDuration: 6 * HOUR,
    minGold: 60, maxGold: 150, xpMultiplier: 5, lootChance: 30,
    reqLevel: 8, weight: 22, color: '#c98b3a',
  },
  epic: {
    id: 'epic', label: 'Epic', baseSuccess: 40,
    minDuration: 6 * HOUR, maxDuration: 12 * HOUR,
    // xpMultiplier raised 11 -> 12. Verified directly: at 11, Epic's xp/hr
    // (17.0) was actually LOWER than Hard's (17.3) despite requiring a
    // higher level and harder odds -- the opposite of what progressing
    // through the tiers should feel like. 12 puts Epic at ~18.6 xp/hr,
    // clearing Hard with real margin. Gold is unaffected and already
    // climbs correctly tier over tier.
    minGold: 150, maxGold: 400, xpMultiplier: 12, lootChance: 45,
    reqLevel: 15, weight: 14, color: '#a874d6',
  },
  legendary: {
    id: 'legendary', label: 'Legendary', baseSuccess: 30,
    minDuration: 12 * HOUR, maxDuration: 24 * HOUR,
    // Same fix, same reasoning -- 26 put Legendary's xp/hr (16.5) below
    // BOTH Hard and Epic. 30 lands it at ~19.0 xp/hr, now the actual best
    // in the game, matching its own level requirement and odds.
    minGold: 500, maxGold: 2000, xpMultiplier: 30, lootChance: 70,
    reqLevel: 25, weight: 6, color: '#d9a441',
  },
};

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
   * An epithet granted to whichever hero completes the final stage, shown as
   * "<Title> <Name>". Cleared if that hero later retires.
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
