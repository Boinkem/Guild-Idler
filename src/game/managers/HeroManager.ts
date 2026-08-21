import { EQUIPMENT_BY_ID, gearScoreForItem, SET_BY_ID } from '../data/equipment';
import { INJURIES } from '../data/items';
import { HERO_CLASSES, RECRUIT_START_LEVEL, MAX_HERO_LEVEL, xpForLevel, infirmaryHealTimeMinutes, roleUnlockCost, roleSwapCost } from '../data/progression';
import { DIFFICULTY_ORDER } from '../data/quests';
import { Tuning } from '../data/tuning';
import { Difficulty, GameState, Hero, HeroClass, Injury, Modifiers, Role, Stats } from '../types';
import { Rng, uid } from '../rng';
import { MINUTE, scaleMods, sumMods, clamp } from '../util';
import { ModifierManager } from './ModifierManager';

export const HeroManager = {
  create(heroClass: HeroClass, rng: Rng, nameOverride?: string): Hero {
    const def = HERO_CLASSES[heroClass];
    const startLevel = RECRUIT_START_LEVEL[def.tier] ?? 1;

    // Grow base stats up to the starting level so a tier-3 hire isn't a level-1
    // weakling despite the price. Each level applies the class growth once.
    const stats = { ...def.baseStats };
    for (let lvl = 1; lvl < startLevel; lvl++) {
      stats.strength += def.growth.strength;
      stats.endurance += def.growth.endurance;
      stats.luck += def.growth.luck;
      stats.wisdom += def.growth.wisdom;
    }

    return {
      id: uid('hero'),
      name: nameOverride ?? rng.pick(def.names),
      heroClass,
      level: startLevel,
      xp: 0,
      stats,
      statPoints: startLevel - 1,
      equipment: {},
      injuries: [],
      status: 'idle',
      activeQuestId: null,
      questsCompleted: 0,
      questsSucceeded: 0,
      raidsParticipated: 0,
      raidsSucceeded: 0,
      goldEarnedLifetime: 0,
      xpEarnedLifetime: 0,
      skin: 'original',
      ascension: 0,
      autoChainCount: 0,
      autoChainTarget: null,
      autoChainMinutesRemaining: null,
      bonusStats: { strength: 0, endurance: 0, luck: 0, wisdom: 0 },
      titles: [],
      activeTitle: null,
    };
  },

  /**
   * The stats a hero of this class would have at a given level with zero
   * investment -- no equipment, no bonusStats, no spent stat points. Same
   * automatic per-level growth math create()/grantXp already apply, just
   * evaluated directly for an arbitrary level instead of by simulating
   * every level-up in sequence. Used to anchor success chance to a quest's
   * own reqLevel rather than the hero's raw level -- see
   * QuestManager.previewSuccess's comment for why.
   */
  baselineStats(heroClass: HeroClass, level: number): Stats {
    const def = HERO_CLASSES[heroClass];
    const levels = Math.max(0, level - 1);
    return {
      strength: def.baseStats.strength + def.growth.strength * levels,
      endurance: def.baseStats.endurance + def.growth.endurance * levels,
      luck: def.baseStats.luck + def.growth.luck * levels,
      wisdom: def.baseStats.wisdom + def.growth.wisdom * levels,
    };
  },

  xpToNext(hero: Hero): number {
    return xpForLevel(hero.level);
  },

  /** The class's fixed native role -- see types.ts's Role for the full
   *  reasoning. Falls back to 'melee' only for a malformed/unknown
   *  heroClass id, which shouldn't happen outside a corrupted save. */
  nativeRole(heroClass: HeroClass): Role {
    return HERO_CLASSES[heroClass]?.role ?? 'melee';
  },

  /** A hero's currently active role -- defaults to the class's native
   *  role for any hero who's never been trained (hero.role is optional/
   *  undefined until HeroManager.trainRole first sets it), same
   *  defensive-optional convention as Hero.role's own comment in
   *  types.ts describes. This is the one place that default should be
   *  applied -- callers should never repeat the `?? nativeRole` fallback
   *  themselves. */
  activeRole(hero: Hero): Role {
    return hero.role ?? HeroManager.nativeRole(hero.heroClass);
  },

  /** Every role this hero has ever paid the Training unlock cost for --
   *  same optional/computed-default shape as activeRole above, always
   *  includes the native role even for a hero who's never trained at
   *  all. */
  unlockedRoles(hero: Hero): Role[] {
    return hero.unlockedRoles ?? [HeroManager.nativeRole(hero.heroClass)];
  },

  /**
   * The name shown for this hero's current build -- the native role's
   * own flavour name (== the class's own `name`) until trained into
   * something else, at which point it swaps to that role's flavour name
   * instead (e.g. a Wizard trained into Melee shows "Arcane Swordster").
   * Falls back to the class's own name if roleFlavors is somehow missing
   * an entry (a malformed DLC class def, say) rather than showing
   * nothing. The one place HeroesPanel's hero-card summary line reads
   * from -- see guild-idler-status.md's hero-roles backlog entry.
   */
  roleDisplayName(hero: Hero): string {
    const def = HERO_CLASSES[hero.heroClass];
    if (!def) return hero.heroClass;
    return def.roleFlavors?.[HeroManager.activeRole(hero)] ?? def.name;
  },

  /**
   * Gold cost to train this hero into `role` right now -- the small
   * repeatable swap price if `role` is already in unlockedRoles, the
   * larger one-time unlock price otherwise. See roleUnlockCost/
   * roleSwapCost (progression.ts) for the actual curves.
   */
  roleCost(hero: Hero, role: Role): number {
    const unlocked = HeroManager.unlockedRoles(hero).includes(role);
    return unlocked ? roleSwapCost(hero.level) : roleUnlockCost(hero.level);
  },

  /**
   * Switches a hero's active role, spending roleCost(hero, role) and
   * permanently adding it to unlockedRoles the first time. The only
   * mutation path for Hero.role/unlockedRoles -- see GameEngine.trainRole
   * for the UI-facing action that calls this.
   */
  trainRole(state: GameState, hero: Hero, role: Role): string | null {
    if (HeroManager.activeRole(hero) === role) return 'Already trained in that role.';
    const cost = HeroManager.roleCost(hero, role);
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    const unlocked = HeroManager.unlockedRoles(hero);
    if (!unlocked.includes(role)) hero.unlockedRoles = [...unlocked, role];
    hero.role = role;
    return null;
  },

  /**
   * Adds a newly-earned title to a hero's collection and switches the
   * displayed one to it, unless the hero already holds it (re-clearing a
   * raid, or -- not currently possible, but harmless if it ever is --
   * somehow re-completing a chain). Returns true if the title was
   * actually new, so a caller (QuestManager.resolve, RaidManager.resolve)
   * can decide whether a celebration should mention it.
   */
  grantTitle(hero: Hero, title: string): boolean {
    if (hero.titles.includes(title)) return false;
    hero.titles.push(title);
    hero.activeTitle = title;
    return true;
  },

  /** The title actually shown next to this hero's name -- just
   *  activeTitle, directly. Used to fall back to the most recently earned
   *  title whenever activeTitle was null, on the theory that a hero with
   *  titles but no activeTitle only happens via an old save's migration
   *  (see SaveManager migration 35->36) -- but that migration only ever
   *  leaves activeTitle null when titles is ALSO empty (an old save with
   *  no title at all), never "has titles, no active one." Every real path
   *  that adds a title (grantTitle) already sets activeTitle in the same
   *  step, so the only way activeTitle is null while titles is non-empty
   *  is the player deliberately picking "None" from the title dropdown
   *  (see engine.setActiveTitle) -- and the old fallback was silently
   *  overriding exactly that choice, showing the last-earned title again
   *  regardless of what was picked. Bug: "changing a hero's title to None
   *  doesn't remove it." */
  displayTitle(hero: Hero): string | null {
    return hero.activeTitle;
  },

  /**
   * True once a hero has hit the hard level cap (MAX_HERO_LEVEL,
   * currently 55) -- the one place that check lives, so grantXp and every
   * UI display of "how close to the next level" agree on the same
   * definition rather than each re-deriving `hero.level >= 55` themselves.
   */
  isMaxLevel(hero: Hero): boolean {
    return hero.level >= MAX_HERO_LEVEL;
  },

  /**
   * Adds xp and applies as many level-ups as it earns, up to MAX_HERO_LEVEL.
   * Returns levels gained.
   *
   * Previously uncapped -- a hero could level indefinitely past 55 given
   * enough XP, even though the curve itself (xpCurveMultiplier, see
   * progression.ts) already "holds flat above the highest breakpoint
   * rather than extrapolating past it," and every design writeup already
   * talked about 55 as *the* level cap. Requested directly: push
   * retirement to require the level cap (PRESTIGE_MIN_LEVEL retuned to
   * 55 in tuning.json) specifically so a retiring hero is always fully
   * leveled, which only means something if 55 is an actual ceiling and
   * not just where the curve happens to flatten out. A hero already at
   * the cap short-circuits before touching `hero.xp` at all -- XP earned
   * past the cap doesn't quietly pile up in the background waiting for a
   * cap increase that isn't currently planned; it's simply not banked.
   */
  grantXp(hero: Hero, amount: number): number {
    if (HeroManager.isMaxLevel(hero)) return 0;
    hero.xp += Math.max(0, Math.floor(amount));
    let gained = 0;
    while (hero.level < MAX_HERO_LEVEL && hero.xp >= xpForLevel(hero.level)) {
      hero.xp -= xpForLevel(hero.level);
      hero.level += 1;
      gained += 1;
      const growth = HERO_CLASSES[hero.heroClass].growth;
      hero.stats = {
        strength: hero.stats.strength + growth.strength,
        endurance: hero.stats.endurance + growth.endurance,
        luck: hero.stats.luck + growth.luck,
        wisdom: hero.stats.wisdom + growth.wisdom,
      };
      hero.statPoints += 1;
    }
    // Hit the cap exactly this call -- whatever xp remained after the last
    // level-up (there's no level 56 to carry it toward) is dropped rather
    // than left sitting there forever, so a maxed hero's XP bar reads as
    // genuinely full/done rather than stalled at some arbitrary partial
    // fill it can never move past.
    if (hero.level >= MAX_HERO_LEVEL) hero.xp = 0;
    return gained;
  },

  /**
   * Gear relevance decay (patch 0214, `rolledItemLevel` fix patch 0215)
   * -- how much of an equipped item's stats/mods actually apply, given
   * how far the hero has leveled past the item's own effective level.
   * `clamp(itemLevel / hero.level, floor, 1)`: an item at or above the
   * hero's current level always gives full value; every level the hero
   * climbs past it shrinks the ratio, down to `gear_relevance.floor`
   * (never all the way to zero -- outleveled gear should read as "time
   * to upgrade," not "worthless junk"). Same mechanism WoW's itemLevel-
   * vs-character-level squish uses. Applies to every equipped item
   * regardless of source -- procedural drops, Sets, and hand-authored
   * legendaries alike (deliberate, see guild-idler-status.md's patch
   * 0214 writeup: Sets are no longer "acquire once, BiS forever" now
   * that everything drops within a rolling level window).
   *
   * Callers pass `item.rolledItemLevel ?? def.reqLevel` as `itemReqLevel`
   * -- NOT `def.reqLevel` alone. `def.reqLevel` is the shared template's
   * equip-*minimum*, correct as a power-level stand-in for hand-authored
   * gear (the two happen to be the same authored number there) but wrong
   * for procedural gear, whose real power comes from whatever level it
   * actually rolled at (often much higher than a template's low equip
   * floor). `rolledItemLevel` is set once at generation
   * (EquipmentManager.instantiate) and updated by Blacksmith re-leveling
   * (patch 0215, EquipmentManager.relevel) -- this was a real bug in the
   * original patch 0214 rollout, caught while designing re-leveling.
   */
  gearRelevance(itemReqLevel: number, heroLevel: number): number {
    if (heroLevel <= 0) return 1;
    const floor = Tuning.get('gear_relevance.floor');
    return clamp(itemReqLevel / heroLevel, floor, 1);
  },

  /** Stats coming from equipped, unbroken gear -- including any Enchanting on top. */
  equipmentStats(hero: Hero): Stats {
    const total: Stats = { strength: 0, endurance: 0, luck: 0, wisdom: 0 };
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) continue;
      const scale = (1 + item.plus * 0.15) * HeroManager.gearRelevance(item.rolledItemLevel ?? def.reqLevel, hero.level);
      const base = def.stats;
      const enchant = item.enchantStats;
      if (!base && !enchant) continue;
      total.strength += ((base?.strength ?? 0) + (enchant?.strength ?? 0)) * scale;
      total.endurance += ((base?.endurance ?? 0) + (enchant?.endurance ?? 0)) * scale;
      total.luck += ((base?.luck ?? 0) + (enchant?.luck ?? 0)) * scale;
      total.wisdom += ((base?.wisdom ?? 0) + (enchant?.wisdom ?? 0)) * scale;
    }
    return total;
  },

  /**
   * Sum of gearScoreForItem() across every equipped item (see its own
   * comment in data/equipment.ts -- GEAR_SCORE_BY_RARITY's flat rarity
   * base plus a small reqLevel-scaled bonus, capped so it can never cross
   * into the next rarity's own base, unless an item sets gearScoreOverride
   * to skip the formula entirely). This is a badge of "how well is this
   * hero geared", separate from and in addition to the combat-stat bonus
   * gear already grants via equipmentStats(). Broken/zero-durability items
   * still count: the badge represents what's equipped, not what's
   * currently usable.
   */
  gearScore(hero: Hero): number {
    let total = 0;
    for (const item of Object.values(hero.equipment)) {
      if (!item) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) continue;
      total += gearScoreForItem(def);
    }
    return total;
  },

  totalStats(hero: Hero): Stats {
    const gear = HeroManager.equipmentStats(hero);
    const bonus = hero.bonusStats ?? { strength: 0, endurance: 0, luck: 0, wisdom: 0 };
    return {
      strength: hero.stats.strength + gear.strength + bonus.strength,
      endurance: hero.stats.endurance + gear.endurance + bonus.endurance,
      luck: hero.stats.luck + gear.luck + bonus.luck,
      wisdom: hero.stats.wisdom + gear.wisdom + bonus.wisdom,
    };
  },

  /* ------------------------------- health -------------------------------- */

  /**
   * Max Health -- a base floor, plus sqrt(endurance) (same shape
   * statMods already uses for injuryResist) and a flat per-level term,
   * plus any flat `health` bonus gear rolls (EquipmentDef.mods.health,
   * summed the normal way via equipmentMods). Since Health damage is
   * always expressed as a % of this max rather than a flat amount, these
   * coefficients mostly govern feel/display -- see
   * guild-idler-status.md's Health stat + Fallen/death mechanic section.
   */
  maxHealth(hero: Hero): number {
    const endurance = HeroManager.totalStats(hero).endurance;
    const base = Tuning.get('health.maxHealthBase')
      + Math.sqrt(endurance) * Tuning.get('health.maxHealthEnduranceCoefficient')
      + hero.level * Tuning.get('health.maxHealthLevelCoefficient');
    const gearBonus = HeroManager.equipmentMods(hero).health ?? 0;
    return Math.round(base + gearBonus);
  },

  /**
   * Current Health, defaulting to full whenever `hero.health` is
   * undefined -- see Hero.health's own comment for why this is the one
   * place that default should be applied. Also clamps to the current
   * max, so a Health value stored while more heavily geared doesn't
   * read as "healed above max" after gear changes lower it back down.
   */
  currentHealth(hero: Hero): number {
    const max = HeroManager.maxHealth(hero);
    return Math.min(hero.health ?? max, max);
  },

  healthPercent(hero: Hero): number {
    const max = HeroManager.maxHealth(hero);
    if (max <= 0) return 0;
    return (HeroManager.currentHealth(hero) / max) * 100;
  },

  /**
   * Applies Health damage as a percent of max, piggybacking on the
   * existing injury roll rather than a separate trigger -- see
   * items.ts's healthDamagePercentForInjuryDef for where the percent
   * itself comes from. No floor: reaching (or going below, in one hit)
   * 0 flips the hero to 'fallen' -- see the Fallen state's own comment
   * on HeroStatus and reviveHero/checkAutoRevive below. Deliberately
   * does nothing if the hero is already fallen -- damage can't stack
   * past 0 in a way that matters.
   */
  applyHealthDamage(hero: Hero, damagePercent: number): void {
    if (hero.status === 'fallen') return;
    const max = HeroManager.maxHealth(hero);
    const current = HeroManager.currentHealth(hero);
    const damage = (damagePercent / 100) * max;
    const remaining = Math.max(0, current - damage);
    hero.health = remaining;
    if (remaining <= 0) {
      hero.status = 'fallen';
      hero.fallenAt = Date.now();
    }
  },

  /**
   * Passive regen -- a continuous rate derived from the current target
   * heal time (100% / minutes), NOT a fixed tick. A fixed-interval tick
   * (the original plan reused the dormant REST_TICK constant) can't work
   * once Infirmary's heal time drops to 10 minutes at max level while
   * REST_TICK was a fixed 30 -- see guild-idler-status.md's correction
   * note. `elapsedMs` is whatever real time has actually passed since
   * the last tick/offline-catchup calculation, same "compute from
   * elapsed time, not a counted tick" approach QuestManager's offline
   * resolution already uses elsewhere. Rate is halved to
   * health.questRegenFraction while `questing` is true, so a long quest
   * isn't a total recovery freeze, just slower than resting at the guild.
   * No-ops for a Fallen hero -- Health regen is irrelevant until revived.
   */
  regenHealth(hero: Hero, elapsedMs: number, infirmaryLevel: number, questing: boolean): void {
    if (hero.status === 'fallen') return;
    const max = HeroManager.maxHealth(hero);
    const current = HeroManager.currentHealth(hero);
    if (current >= max) {
      hero.health = max;
      return;
    }
    const healTimeMinutes = infirmaryHealTimeMinutes(infirmaryLevel);
    const fraction = questing ? Tuning.get('health.questRegenFraction') : 1;
    const percentPerMinute = (100 / healTimeMinutes) * fraction;
    const regen = (elapsedMs / MINUTE) * percentPerMinute * (max / 100);
    hero.health = Math.min(max, current + regen);
  },

  /**
   * Milliseconds until this hero reaches full Health at the CURRENT regen
   * rate (Infirmary level + questing/idle status) -- a pure display helper,
   * the same rate formula regenHealth uses, solved for time-to-target
   * instead of amount-per-elapsed. Not persisted and not authoritative:
   * regenHealth itself still ticks off real elapsed time each frame/offline
   * catch-up, this just projects "at this instant's rate, how long until
   * full" for the Auto Heal countdown bar in HeroesPanel. Returns 0 once
   * already at max, and 0 for a Fallen hero (regen doesn't apply to them --
   * see autoReviveDue's own timer for what actually brings a Fallen hero
   * back). Recomputed live on every render via useNow, so an Infirmary
   * upgrade or the hero leaving/returning from a quest is reflected
   * immediately rather than the countdown drifting stale.
   */
  healthRegenEtaMs(hero: Hero, infirmaryLevel: number): number {
    if (hero.status === 'fallen') return 0;
    const max = HeroManager.maxHealth(hero);
    const current = HeroManager.currentHealth(hero);
    if (current >= max) return 0;
    const healTimeMinutes = infirmaryHealTimeMinutes(infirmaryLevel);
    const fraction = hero.status === 'questing' ? Tuning.get('health.questRegenFraction') : 1;
    const percentPerMinute = (100 / healTimeMinutes) * fraction;
    if (percentPerMinute <= 0) return Infinity;
    const remainingPercent = 100 - (current / max) * 100;
    return (remainingPercent / percentPerMinute) * MINUTE;
  },

  /**
   * Gold cost to instantly revive a Fallen hero -- see
   * fallen.revivalCostBase/PerLevel. `discountPercent` comes from
   * Undertaker's Favor (ModifierManager.global(state).revivalDiscount) --
   * a parameter rather than reading state directly here, so HeroManager
   * doesn't need a GameState/ModifierManager import for one field. Callers
   * (engine.reviveHero, the Revive button, reviveAllFallen) all pass it
   * through the same way.
   */
  revivalCost(hero: Hero, discountPercent = 0): number {
    const base = Tuning.get('fallen.revivalCostBase') + hero.level * Tuning.get('fallen.revivalCostPerLevel');
    return Math.round(base * (1 - Math.min(100, Math.max(0, discountPercent)) / 100));
  },

  /**
   * Brings a Fallen hero back at full Health -- shared by both the paid
   * instant-revive path and the free auto-revive path once Infirmary
   * hits max level. Deliberately does NOT touch level/xp/gear/ascension
   * -- nothing permanent was lost, see guild-idler-status.md.
   */
  revive(hero: Hero): void {
    hero.status = 'idle';
    hero.health = HeroManager.maxHealth(hero);
    hero.fallenAt = null;
  },

  /**
   * True once a Fallen hero has waited out Infirmary's free auto-revive
   * timer -- only reachable at all once infirmaryAutoReviveUnlocked(level)
   * is true; below max Infirmary level there is no free path, only
   * paid (see revivalCost above). Checked from the engine tick, same
   * "compute from elapsed real time" shape regenHealth already uses.
   */
  autoReviveDue(hero: Hero, now: number): boolean {
    if (hero.status !== 'fallen' || !hero.fallenAt) return false;
    const hours = Tuning.get('guild_facility.infirmary.autoReviveHours');
    return now - hero.fallenAt >= hours * 60 * MINUTE;
  },

  /**
   * Stats convert to modifiers on a deliberately gentle curve so that gear and
   * upgrades stay relevant deep into the game.
   */
  /**
   * loot is deliberately absent here now -- Luck's contribution to rare-loot
   * odds moved to its own function (personalLootBonus below), applied as a
   * separate multiplicative stage rather than summed into this pool. It
   * used to be diluted into the same additive total as the difficulty
   * tier's own flat lootChance and every account-wide bonus combined --
   * two heroes with wildly different Luck investment (27 vs 79, confirmed
   * directly) came out within a rounding error of each other, because a
   * ~4-point gap barely registers inside a 120+ point sum. Equipment,
   * guild, and renown loot bonuses still flow through the normal Modifiers
   * pool same as before; only the Luck *stat's* own contribution moved.
   *
   * speed's curve was also raised (0.5 exponent/0.6 coefficient -> 0.7/1.3)
   * for the same underlying reason -- even a heavily-invested 93 Endurance
   * only saved ~10 minutes off a 3-hour quest under the old curve.
   */
  statMods(stats: Stats): Partial<Modifiers> {
    return {
      success: Math.sqrt(stats.strength) * 1.6 + Math.sqrt(stats.endurance) * 0.8,
      gold: Math.sqrt(stats.luck) * 2.2,
      xp: Math.sqrt(stats.wisdom) * 2.6,
      injuryResist: Math.sqrt(stats.endurance) * 2.0,
      speed: Math.pow(stats.endurance, 0.7) * 1.3,
    };
  },

  /**
   * Luck's own rare-loot contribution, applied as an independent
   * multiplicative stage on top of (difficulty tier + every account-wide
   * loot bonus) rather than summed into the same pool as those -- see the
   * comment on statMods above for why. Curve tuned so a balanced-stat
   * level-55 hero (~40 Luck) lands close to a 10% legendary chance on an
   * Epic-tier quest, while a genuinely Luck-dumped build still comes out
   * meaningfully (~2x) ahead of one that mostly ignored it, and even an
   * extreme min-max build stays well short of the 90% clamp.
   */
  personalLootBonus(stats: Stats): number {
    return Math.pow(stats.luck, 0.9) * 7.2;
  },

  equipmentMods(hero: Hero): Partial<Modifiers> {
    const sources: Partial<Modifiers>[] = [];
    const setCounts: Record<string, number> = {};
    const setRelevance: Record<string, number[]> = {};
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) continue;
      const relevance = HeroManager.gearRelevance(item.rolledItemLevel ?? def.reqLevel, hero.level);
      // Crafted items carry their own chosen mods (EquipmentItem.customMods)
      // instead of the def's -- see that field's own comment in types.ts.
      sources.push(scaleMods(item.customMods ?? def.mods, (1 + item.plus * 0.15) * relevance));
      if (def.setId) {
        setCounts[def.setId] = (setCounts[def.setId] ?? 0) + 1;
        (setRelevance[def.setId] ??= []).push(relevance);
      }
    }
    for (const [setId, count] of Object.entries(setCounts)) {
      const set = SET_BY_ID[setId];
      if (!set) continue;
      // A set bonus doesn't have one single reqLevel of its own (it's
      // earned across several pieces, potentially picked up at different
      // levels) -- averaging the equipped pieces' own relevance is the
      // simplest coherent stand-in, and in practice a set's pieces are
      // usually acquired together so this rarely diverges much from any
      // one piece's own factor.
      const avgRelevance = setRelevance[setId].reduce((a, b) => a + b, 0) / setRelevance[setId].length;
      for (const bonus of set.bonuses) {
        if (count >= bonus.count) sources.push(scaleMods(bonus.mods, avgRelevance));
      }
    }
    return sumMods(...sources);
  },

  /**
   * `mods` is included alongside the flavor `label` (e.g. "Wyrmbane") so a
   * caller can describe what a bonus actually DOES, not just its name --
   * see describeMods() in util.ts, and EquipmentPanel.tsx's own "Active Set
   * Bonuses" mouseover, which is what this was added for.
   */
  activeSetBonuses(hero: Hero): { setName: string; label: string; mods: Partial<Modifiers> }[] {
    const setCounts: Record<string, number> = {};
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (def?.setId) setCounts[def.setId] = (setCounts[def.setId] ?? 0) + 1;
    }
    const out: { setName: string; label: string; mods: Partial<Modifiers> }[] = [];
    for (const [setId, count] of Object.entries(setCounts)) {
      const set = SET_BY_ID[setId];
      if (!set) continue;
      for (const bonus of set.bonuses) {
        if (count >= bonus.count) out.push({ setName: set.name, label: `${bonus.label} (${bonus.count})`, mods: bonus.mods });
      }
    }
    return out;
  },

  injuryMods(hero: Hero, now: number): Partial<Modifiers> {
    return sumMods(...hero.injuries.filter((i) => i.healsAt > now).map((i) => i.mods));
  },

  /**
   * Success points lost to missing Health, folded in the same way
   * injuryMods already is -- a soft penalty, never a hard gate, so a
   * hero at low Health is worse odds but never literally unsendable
   * (that's what avoids the "auto-fail on 0 health" problem this system
   * was designed around). Zero once fully healed.
   */
  healthMods(hero: Hero): Partial<Modifiers> {
    const missing = 100 - HeroManager.healthPercent(hero);
    if (missing <= 0) return {};
    return { success: -missing * Tuning.get('health.successPenaltyPerMissingPercent') };
  },

  /**
   * Everything the hero personally contributes, before guild/upgrade
   * bonuses -- now including its own paired pet's bonus (see
   * ModifierManager.petModsForHero), since a pet is no longer a
   * guild-wide passive the way it used to be. Signature grew a `state`
   * param purely for that lookup (pets live in state.pets, not on the
   * hero object) -- every call site already had `state` in scope.
   */
  heroMods(state: GameState, hero: Hero, now: number): Modifiers {
    const classDef = HERO_CLASSES[hero.heroClass];
    return sumMods(
      classDef.mods,
      HeroManager.statMods(HeroManager.totalStats(hero)),
      HeroManager.equipmentMods(hero),
      HeroManager.injuryMods(hero, now),
      HeroManager.healthMods(hero),
      ModifierManager.petModsForHero(state, hero, now),
      { success: hero.level * 0.4 },
    );
  },

  rollInjury(rng: Rng, difficulty: Difficulty = 'normal'): Injury {
    const tierIndex = DIFFICULTY_ORDER.indexOf(difficulty);
    const eligible = INJURIES.filter((i) => {
      if (!i.minDifficulty) return true;
      return DIFFICULTY_ORDER.indexOf(i.minDifficulty) <= tierIndex;
    });
    const pool = eligible.length > 0 ? eligible : INJURIES;
    const def = rng.weighted(pool.map((i) => ({ item: i, weight: i.weight })));
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      healsAt: Date.now() + def.durationMs,
      mods: def.mods,
      treatmentCost: def.treatmentCost,
    };
  },

  /** Injuries whose timers have elapsed simply fall off. */
  pruneInjuries(hero: Hero, now: number): void {
    hero.injuries = hero.injuries.filter((i) => i.healsAt > now);
  },
};
