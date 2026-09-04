import {
  HERO_RENOWN_BY_ID, HERO_RENOWN_PERKS, PRESTIGE_MIN_LEVEL, RENOWN_BY_ID, RENOWN_PERKS,
  ascensionRank, renownCost, renownEffectiveMaxLevel,
} from '../data/progression';
import { GameState, Hero, HeroRenownPerkDef } from '../types';
import { HeroManager } from './HeroManager';

/**
 * Prestige/Retirement Rework (patch 0317). Classic Retire -- level-cap
 * the hero, wipe them, get Renown + a streak bonus -- is cut entirely.
 * It read as destroying an asset for a currency, not a reward (direct
 * playtest feedback), and patch 0179 already had to patch around a
 * side-effect of pinning it to the level cap, a sign this was overdue
 * for a rework rather than a fresh problem. See
 * guild-idler-status.md's patch-0317 entry for the full writeup.
 *
 * Early Retirement (below) is now the ONLY way to remove a hero from
 * the roster -- still reward-free by design, still available at any
 * level, unchanged from before this patch. Renown income moves
 * entirely to playing capped heroes through top-tier raids/Replay
 * Memories instead (see renownForRaidClear/renownForChainReplayClear
 * in progression.ts, and RaidManager.resolve/QuestManager's chain-
 * replay resolution for where it's actually granted).
 */
export const PrestigeManager = {
  canEarlyRetire(hero: Hero): boolean {
    return hero.status !== 'questing';
  },

  /**
   * Frees up a hero slot immediately, at any level, with no reward at all
   * -- no renown, no ascension, no prestige streak credit (the streak
   * system itself is gone as of this patch too). As of patch 0317 this
   * is the only way to remove a hero from the roster; there is no
   * "better" alternative sitting next to it anymore. Unlike the old
   * classic Retire, which replaced the hero in place (same slot, same
   * id, reset to level 1), this removes them from the roster outright,
   * actually shrinking `state.heroes` so the freed slot can be spent on
   * a different recruit.
   */
  earlyRetire(state: GameState, hero: Hero): { error: string } | null {
    if (hero.status === 'questing') return { error: `${hero.name} is out on a quest.` };
    for (const item of Object.values(hero.equipment)) {
      if (item) state.stash.push(item);
    }
    state.heroes = state.heroes.filter((h) => h.id !== hero.id);
    return null;
  },

  /** Display label for a hero's ascension rank (from the old classic-
   *  Retire system, frozen as of patch 0317), or null if never ascended. */
  rankFor(hero: Hero): string | null {
    return ascensionRank(hero.ascension);
  },

  /* ------------------------------ guild-wide tree ----------------------------- */

  perkLevel(state: GameState, id: string): number {
    return state.renownPerks[id] ?? 0;
  },

  nextPerkCost(state: GameState, id: string): number | null {
    const def = RENOWN_BY_ID[id];
    const level = PrestigeManager.perkLevel(state, id);
    if (!def || level >= renownEffectiveMaxLevel(def)) return null;
    return renownCost(def, level);
  },

  /** True once the base tier is maxed but a tier2 extension exists and isn't maxed yet. */
  perkInTier2(state: GameState, id: string): boolean {
    const def = RENOWN_BY_ID[id];
    if (!def?.tier2) return false;
    const level = PrestigeManager.perkLevel(state, id);
    return level >= def.maxLevel && level < def.tier2.maxLevel;
  },

  /** True once the base tier is maxed and tier2 exists but hasn't been touched yet — used to surface the unlock flavour once. */
  perkTier2JustUnlocked(state: GameState, id: string): boolean {
    const def = RENOWN_BY_ID[id];
    if (!def?.tier2) return false;
    return PrestigeManager.perkLevel(state, id) === def.maxLevel;
  },

  buyPerk(state: GameState, id: string): string | null {
    const def = RENOWN_BY_ID[id];
    if (!def) return 'Unknown perk.';
    const level = PrestigeManager.perkLevel(state, id);
    const cap = renownEffectiveMaxLevel(def);
    if (level >= cap) return 'Already at maximum.';
    const cost = renownCost(def, level);
    if (state.renown < cost) return 'Not enough Heroic Renown.';
    state.renown -= cost;
    state.renownPerks[id] = level + 1;
    return null;
  },

  perks() {
    return RENOWN_PERKS;
  },

  /* ------------------------------- per-hero tree ------------------------------ */

  /**
   * New in patch 0317, alongside the guild-wide tree above. Same shape,
   * scoped to one hero instead of the whole guild -- see
   * HeroRenownPerkDef's own comment in types.ts for the full reasoning
   * (single shared Renown currency, no second pool). Gated behind
   * MAX_HERO_LEVEL (PRESTIGE_MIN_LEVEL, same constant the old classic-
   * Retire gate used) -- framed as "extra power through endgame" for a
   * hero who's done leveling, so a mid-level hero can't sink Renown into
   * a perk they'll outgrow the moment they hit the cap anyway.
   */
  heroPerkEligible(hero: Hero): boolean {
    return hero.level >= PRESTIGE_MIN_LEVEL;
  },

  /**
   * New in patch 0318, alongside the tree's real content -- three of the
   * five perks are role-flavored and gated behind the hero actually
   * having that role (HeroManager.unlockedRoles(hero), which always
   * includes the class's native role for free -- see
   * HeroRenownPerkDef.requiresRole's own comment in types.ts). The two
   * universal perks (undefined requiresRole) pass unconditionally here.
   */
  heroPerkRoleEligible(hero: Hero, def: HeroRenownPerkDef): boolean {
    if (!def.requiresRole) return true;
    return HeroManager.unlockedRoles(hero).includes(def.requiresRole);
  },

  heroPerkLevel(hero: Hero, id: string): number {
    return hero.renownPerks?.[id] ?? 0;
  },

  nextHeroPerkCost(hero: Hero, id: string): number | null {
    const def = HERO_RENOWN_BY_ID[id];
    const level = PrestigeManager.heroPerkLevel(hero, id);
    if (!def || level >= def.maxLevel) return null;
    // HeroRenownPerkDef has no tier2/heroSlotsPerLevel, but every field
    // renownCost actually reads (cost/costGrowth/maxLevel) is present, so
    // it structurally satisfies RenownPerkDef and reuses the exact same
    // cost curve (including earlyTierDiscount) the guild-wide tree gets.
    return renownCost(def, level);
  },

  buyHeroPerk(state: GameState, hero: Hero, id: string): string | null {
    const def = HERO_RENOWN_BY_ID[id];
    if (!def) return 'Unknown perk.';
    if (!PrestigeManager.heroPerkEligible(hero)) {
      return `${hero.name} needs to reach level ${PRESTIGE_MIN_LEVEL} first.`;
    }
    if (!PrestigeManager.heroPerkRoleEligible(hero, def)) {
      return `${hero.name} needs to train the ${def.requiresRole} role first.`;
    }
    const level = PrestigeManager.heroPerkLevel(hero, id);
    if (level >= def.maxLevel) return 'Already at maximum.';
    const cost = PrestigeManager.nextHeroPerkCost(hero, id);
    if (cost === null) return 'Already at maximum.';
    if (state.renown < cost) return 'Not enough Heroic Renown.';
    state.renown -= cost;
    hero.renownPerks = { ...(hero.renownPerks ?? {}), [id]: level + 1 };
    return null;
  },

  heroPerks() {
    return HERO_RENOWN_PERKS;
  },
};
