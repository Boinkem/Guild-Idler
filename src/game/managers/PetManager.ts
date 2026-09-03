import { EggInstance, GameState, Hero, MaterialId, Pet, PetBonusType, Rarity } from '../types';
import { uid } from '../rng';
import { clamp, RARITY_ORDER } from '../util';
import { Tuning } from '../data/tuning';
import { PET_BY_ID, hatchXpThreshold, pickHatchedPetDefId } from '../data/pets';
import { kennelHealTimeMinutes } from '../data/progression';
import { ModifierManager } from './ModifierManager';

const PET_TREAT_ID = 'pet_treat';

export const PetManager = {
  /**
   * Adds a freshly-dropped or -granted egg to storage (unequipped) --
   * always succeeds, unbounded, same as EquipmentManager pushing onto
   * state.stash. An egg does nothing until equipped into a Nest via
   * equipEgg below; this is a deliberate change from the original
   * "auto-incubate on grant" behaviour (see the Hatchery/Pets status
   * writeup) so a drop arriving while every Nest is full is never simply
   * lost the way it used to be.
   */
  grantEgg(state: GameState, rarity: Rarity, dedicatedPetId?: string, now = Date.now()): void {
    const egg: EggInstance = { uid: uid('egg'), rarity, dedicatedPetId, hatchXp: 0, startedAt: now };
    state.eggStorage.push(egg);
  },

  /** Moves an egg from storage into an open Nest slot -- same
   *  stash-to-hero-slot shape EquipmentManager.equip already uses. Fails
   *  if every Nest is already occupied; storage itself never fills up, so
   *  there's no equivalent "displaced item" case to handle. */
  equipEgg(state: GameState, eggUid: string, now = Date.now()): string | null {
    const egg = state.eggStorage.find((e) => e.uid === eggUid);
    if (!egg) return 'No such egg.';
    if (state.incubatingEggs.length >= ModifierManager.incubationSlots(state)) return 'Every nest is already occupied.';
    state.eggStorage = state.eggStorage.filter((e) => e.uid !== eggUid);
    egg.startedAt = now; // re-stamped on equip, not on original grant -- hatch pacing starts from when it actually begins incubating
    state.incubatingEggs.push(egg);
    return null;
  },

  /** Moves an egg back to storage, pausing it -- hatchXp already earned is
   *  kept, not reset, same "unequipping doesn't destroy the item" logic
   *  as gear. */
  unequipEgg(state: GameState, eggUid: string): void {
    const egg = state.incubatingEggs.find((e) => e.uid === eggUid);
    if (!egg) return;
    state.incubatingEggs = state.incubatingEggs.filter((e) => e.uid !== eggUid);
    state.eggStorage.push(egg);
  },

  /**
   * Adds hero-XP progress to every currently-incubating egg at once
   * (account-wide, not tied to a specific hero -- see the open question
   * recorded in guild-idler-status.md). Called from QuestManager.resolve
   * right alongside HeroManager.grantXp, so hatch progress keeps pace with
   * ordinary play with no separate tick needed.
   *
   * Deliberately does NOT hatch anything itself -- an egg crossing its
   * threshold just becomes eligible (see isReady below) and stays
   * incubating, showing "Ready to Hatch!" on its Nest card until the
   * player opens it themselves via hatchReadyEgg. Returns eggs that
   * crossed the threshold on THIS call specifically (not every already-
   * ready egg), so the caller can raise pendingHatchReadyNotice exactly
   * once per egg rather than every subsequent quest while it sits waiting.
   */
  addHatchXp(state: GameState, xp: number): EggInstance[] {
    if (xp <= 0 || state.incubatingEggs.length === 0) return [];
    const newlyReady: EggInstance[] = [];
    for (const egg of state.incubatingEggs) {
      const wasReady = PetManager.isReady(egg);
      egg.hatchXp += xp;
      if (!wasReady && PetManager.isReady(egg)) newlyReady.push(egg);
    }
    return newlyReady;
  },

  /** Whether an egg has earned enough hatchXp to be opened -- pure and
   *  cheap, safe to call from render (see EggCard's "Ready to Hatch!"
   *  label) rather than needing a stored flag kept in sync. */
  isReady(egg: EggInstance): boolean {
    return egg.hatchXp >= hatchXpThreshold(egg.rarity);
  },

  /**
   * The actual hatch, explicitly triggered by the player opening a ready
   * egg (see HatcheryPanel's EggCard) rather than happening automatically
   * the instant hatchXp crosses the threshold -- the "Ready to Hatch!" ->
   * click -> reveal beat is the point, not a technicality. Returns null
   * (no state change) if the egg doesn't exist or isn't actually ready
   * yet -- defensive against a stale UI click racing a state change, not
   * expected to trigger in normal play since the button that calls this
   * is itself gated on isReady.
   */
  hatchReadyEgg(state: GameState, eggUid: string, now = Date.now()): Pet | null {
    const egg = state.incubatingEggs.find((e) => e.uid === eggUid);
    if (!egg || !PetManager.isReady(egg)) return null;
    state.incubatingEggs = state.incubatingEggs.filter((e) => e.uid !== eggUid);
    return PetManager.hatch(state, egg, now);
  },

  /** Rolls a species, a rarity-scaled bonus, and adds the resulting Pet to state.pets. */
  hatch(state: GameState, egg: EggInstance, now: number): Pet {
    const defId = pickHatchedPetDefId(egg.dedicatedPetId);
    const def = PET_BY_ID[defId];
    const bonusTypes: PetBonusType[] = ['success', 'gold', 'xp', 'loot'];
    const bonusType = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
    // PetDef.minRarity (Mimic, patch 0250) floors the DISPLAYED rarity of
    // the hatched Pet only -- the egg's own rarity (already fixed at grant
    // time, drives hatchXpThreshold, unrelated to which species eventually
    // rolls) is left untouched. Never lowers: a Legendary egg that happens
    // to roll a min-rarity species still hatches Legendary. Computed here,
    // before the bonus roll below, so a Mimic-floored rarity also floors
    // the bonus range it rolls against -- a min-rarity species shouldn't
    // roll Common-tier power just because the egg it came from was.
    const rarity = (def?.minRarity && RARITY_ORDER.indexOf(egg.rarity) < RARITY_ORDER.indexOf(def.minRarity))
      ? def.minRarity
      : egg.rarity;
    // Rarity-scaled bonus roll (patch 0280) -- baseBonusValueMin/Max are
    // the Common baseline; each rarity step above Common adds a flat
    // rarityBonusStepPerTier to BOTH ends, same additive shape
    // bonusGrowthPerLevel already uses per level. Before this, every pet
    // rolled from the exact same flat range regardless of rarity --
    // rarity was purely cosmetic for a pet's actual power. See
    // pets.rarityBonusStepPerTier's own tuning description for the
    // resulting Common-to-Legendary spread.
    const rarityStep = RARITY_ORDER.indexOf(rarity) * Tuning.get('pets.rarityBonusStepPerTier');
    const min = Tuning.get('pets.baseBonusValueMin') + rarityStep;
    const max = Tuning.get('pets.baseBonusValueMax') + rarityStep;
    const baseBonusValue = Math.round((min + Math.random() * (max - min)) * 10) / 10;
    const pet: Pet = {
      uid: uid('pet'),
      defId,
      name: def?.name ?? 'Unnamed',
      rarity,
      bonusType,
      baseBonusValue,
      xp: 0,
      happiness: 100,
      happinessUpdatedAt: now,
      hatchedAt: now,
    };
    state.pets.push(pet);
    return pet;
  },

  /** Simple flat xp-per-level curve, deliberately not the hero's
   *  exponential xpForLevel -- pet leveling is a slow, steady background
   *  thing, not something meant to be optimized the way hero xp is. */
  levelForXp(xp: number): number {
    return Math.floor(xp / Tuning.get('pets.xpPerLevel'));
  },

  /**
   * Happiness decays lazily from happinessUpdatedAt rather than being
   * ticked every second -- correct across offline gaps for free, same
   * "store an absolute timestamp, compute on read" approach as
   * Injury.healsAt. Never returns above the stored value or below 0.
   *
   * `paired` (patch 0303) freezes decay entirely while a pet isn't
   * paired with any hero -- an unpaired pet's happiness never feeds into
   * anything (effectiveBonus/petModsForHero are only ever read for the
   * one pet paired with the current hero, see ModifierManager.petModsForHero's
   * own `if (!hero.equippedPetId) return {}` guard), so letting it
   * silently decay was pure busywork: a pet sitting in the Unpaired
   * bucket would need "catching up" on feeding the moment it was finally
   * paired, for a stat that did nothing the whole time it sat there.
   * Defaults to true so a caller that doesn't know/care about pairing
   * (there are none left after this patch, but keeping the default safe
   * rather than a breaking required param) still gets the old behavior.
   */
  currentHappiness(pet: Pet, paired = true, now = Date.now()): number {
    if (!paired) return pet.happiness;
    const hoursElapsed = Math.max(0, now - pet.happinessUpdatedAt) / (60 * 60 * 1000);
    const decay = hoursElapsed * Tuning.get('pets.happinessDecayPerHour');
    return clamp(pet.happiness - decay, 0, 100);
  },

  /**
   * The pet's actual contribution right now: baseBonusValue plus level
   * growth, scaled down by current happiness but never below the
   * happiness floor -- a neglected pet still helps a little, it's just not
   * at its best. See pets.happinessFloorPercent's tuning description.
   *
   * `paired` (patch 0303) threads straight through to currentHappiness's
   * own decay-freeze -- ModifierManager.petModsForHero always passes true
   * (its own equippedPetId guard means it's never called otherwise), and
   * HatcheryPanel's card passes whatever this exact pet's own pairing
   * state actually is, so an Unpaired card's bonus preview and its
   * Happiness bar always agree on whether decay is even running.
   */
  effectiveBonus(pet: Pet, paired: boolean, now = Date.now()): number {
    const level = PetManager.levelForXp(pet.xp);
    const grown = pet.baseBonusValue + level * Tuning.get('pets.bonusGrowthPerLevel');
    const happiness = PetManager.currentHappiness(pet, paired, now);
    const floor = Tuning.get('pets.happinessFloorPercent');
    const factor = Math.max(floor, happiness) / 100;
    return grown * factor;
  },

  /**
   * Grants each hero's own paired pet its share of a quest's raw xp
   * reward -- per-hero now, not every equipped pet guild-wide (see
   * Hero.equippedPetId's own comment for why). Only the specific hero
   * who actually went on this quest can feed their own pet; a pet paired
   * with a different, idle hero gains nothing from this send. Called
   * alongside HeroManager.grantXp, same call site as addHatchXp above.
   */
  grantEquippedXp(state: GameState, hero: Hero, questXp: number): void {
    if (questXp <= 0 || !hero.equippedPetId) return;
    const pet = state.pets.find((p) => p.uid === hero.equippedPetId);
    if (!pet) return;
    const share = Math.floor(questXp * (Tuning.get('pets.xpShareOfQuestXpPercent') / 100));
    if (share > 0) pet.xp += share;
  },

  rename(state: GameState, petUid: string, name: string): string | null {
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    const trimmed = name.trim();
    if (!trimmed) return 'A pet needs a name.';
    pet.name = trimmed.slice(0, 24);
    return null;
  },

  /**
   * Pairs a pet with a specific hero -- replacing the old guild-wide
   * equip entirely (see Hero.equippedPetId). If the pet was already
   * paired with a different hero, it's moved rather than duplicated. The
   * ModifierManager.petSlots(state) cap now counts heroes-with-a-pet
   * across the roster instead of a flat list length, but the cap concept
   * itself is unchanged.
   */
  equip(state: GameState, heroId: string, petUid: string): string | null {
    const hero = state.heroes.find((h) => h.id === heroId);
    if (!hero) return 'No such hero.';
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    if (PetManager.isFallen(pet)) return `${pet.name} is Fallen and needs to be revived first.`;
    if (hero.equippedPetId === petUid) return null;
    // Only a genuinely new pairing counts against the cap -- moving a
    // pet that's already equipped somewhere else is a net-zero change in
    // the total (one hero loses it, one gains it), not a new slot use.
    // Checking whether THIS pet is already equipped anywhere (not just
    // whether the TARGET hero has a different pet) is what the original
    // version of this got wrong -- confirmed by an actual repro: moving
    // an equipped pet to a second hero incorrectly hit the cap.
    const petAlreadyEquippedElsewhere = state.heroes.some((h) => h.equippedPetId === petUid);
    if (!petAlreadyEquippedElsewhere) {
      const totalEquipped = state.heroes.filter((h) => h.equippedPetId).length;
      if (totalEquipped >= ModifierManager.petSlots(state)) return 'Every companion slot is already full.';
    }
    for (const h of state.heroes) {
      if (h.equippedPetId === petUid) h.equippedPetId = undefined;
    }
    hero.equippedPetId = petUid;
    return null;
  },

  unequip(state: GameState, heroId: string): void {
    const hero = state.heroes.find((h) => h.id === heroId);
    if (hero) hero.equippedPetId = undefined;
  },

  /** Cheaper, smaller-gain feed option -- consumes pets.feedMaterialBatchSize
   *  of one chosen raw Harvest material. */
  feedMaterial(state: GameState, petUid: string, materialId: MaterialId, now = Date.now()): string | null {
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    const batch = Tuning.get('pets.feedMaterialBatchSize');
    if (state.materials[materialId] < batch) return 'Not enough in the Warehouse.';
    state.materials[materialId] -= batch;
    const paired = state.heroes.some((h) => h.equippedPetId === petUid);
    PetManager.applyFeed(pet, Tuning.get('pets.feedMaterialHappinessGain'), paired, now);
    return null;
  },

  /** Pricier, bigger-gain feed option -- consumes 1 crafted Pet Treat from inventory. */
  feedCrafted(state: GameState, petUid: string, now = Date.now()): string | null {
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    if ((state.inventory[PET_TREAT_ID] ?? 0) < 1) return "You don't have any Pet Treats.";
    state.inventory[PET_TREAT_ID] -= 1;
    const paired = state.heroes.some((h) => h.equippedPetId === petUid);
    PetManager.applyFeed(pet, Tuning.get('pets.feedCraftedHappinessGain'), paired, now);
    return null;
  },

  /** `paired` (patch 0303) -- same decay-freeze reasoning currentHappiness's
   *  own comment gives: an unpaired pet's happiness is already frozen at
   *  whatever it last was, so feeding one just adds the gain directly
   *  rather than first "catching up" a decay that was never actually
   *  supposed to have happened. */
  applyFeed(pet: Pet, gain: number, paired: boolean, now: number): void {
    const current = PetManager.currentHappiness(pet, paired, now);
    pet.happiness = clamp(current + gain, 0, 100);
    pet.happinessUpdatedAt = now;
  },

  /* ---------------------------- pet health --------------------------- */
  /* Mirrors HeroManager's Health/Fallen block exactly in shape -- see
   * guild-idler-status.md's Pet Health/Fallen entry for the full design.
   * Kept independent rather than sharing code with HeroManager since a
   * Pet has no stats/level in the hero sense (levelForXp above is a
   * flat, slow curve, deliberately not xpForLevel) and the failure mode
   * is simpler (zero contribution while Fallen, no soft success penalty
   * to compute since a pet doesn't roll its own success). */

  /** Max Health -- base + a flat per-level term (levelForXp's flat curve,
   *  not endurance -- pets have no stats), plus any petHealth mod from
   *  Companion Vitality / a future Companion Legacy Renown Perk. */
  maxHealth(state: GameState, pet: Pet): number {
    const level = PetManager.levelForXp(pet.xp);
    const base = Tuning.get('pets.maxHealthBase') + level * Tuning.get('pets.maxHealthPerLevel');
    const bonus = ModifierManager.global(state).petHealth ?? 0;
    return Math.round(base + bonus);
  },

  currentHealth(state: GameState, pet: Pet): number {
    const max = PetManager.maxHealth(state, pet);
    return Math.min(pet.health ?? max, max);
  },

  healthPercent(state: GameState, pet: Pet): number {
    const max = PetManager.maxHealth(state, pet);
    if (max <= 0) return 0;
    return (PetManager.currentHealth(state, pet) / max) * 100;
  },

  isFallen(pet: Pet): boolean {
    return (pet.health ?? 1) <= 0;
  },

  /**
   * Applies the SAME damagePercent its paired hero just took (see
   * QuestManager.resolve) to the pet's own Max Health -- not a separate
   * roll, not scaled by anything pet-specific. No floor, same as Hero.
   */
  applyHealthDamage(state: GameState, pet: Pet, damagePercent: number): void {
    if (PetManager.isFallen(pet)) return;
    const max = PetManager.maxHealth(state, pet);
    const current = PetManager.currentHealth(state, pet);
    const damage = (damagePercent / 100) * max;
    const remaining = Math.max(0, current - damage);
    pet.health = remaining;
    if (remaining <= 0) pet.fallenAt = Date.now();
  },

  /** Continuous-rate regen, same reasoning as HeroManager.regenHealth --
   *  Kennel's own heal-time floor can drop below a fixed tick interval,
   *  so this can't be tick-based. No on-quest/idle rate split the way
   *  heroes get -- a pet is either paired with a hero (in which case it's
   *  "with" them regardless of questing) or benched entirely, so there's
   *  no separate "resting at the guild" state to give a faster rate. */
  regenHealth(state: GameState, pet: Pet, elapsedMs: number, kennelLevel: number): void {
    if (PetManager.isFallen(pet)) return;
    const max = PetManager.maxHealth(state, pet);
    const current = PetManager.currentHealth(state, pet);
    if (current >= max) { pet.health = max; return; }
    const healTimeMinutes = kennelHealTimeMinutes(kennelLevel);
    const percentPerMinute = 100 / healTimeMinutes;
    const regen = (elapsedMs / 60_000) * percentPerMinute * (max / 100);
    pet.health = Math.min(max, current + regen);
  },

  /** Gold cost to instantly revive a Fallen pet -- smaller scale than a
   *  hero's, see pets.revivalCostBase/PerLevel. discountPercent comes
   *  from Kennel Keeper's Favor (ModifierManager.global(state).petRevivalDiscount). */
  revivalCost(pet: Pet, discountPercent = 0): number {
    const level = PetManager.levelForXp(pet.xp);
    const base = Tuning.get('pets.revivalCostBase') + level * Tuning.get('pets.revivalCostPerLevel');
    return Math.round(base * (1 - Math.min(100, Math.max(0, discountPercent)) / 100));
  },

  revive(state: GameState, pet: Pet): void {
    pet.health = PetManager.maxHealth(state, pet);
    pet.fallenAt = null;
  },

  /** Mirrors HeroManager.autoReviveDue -- only reachable at all once
   *  kennelAutoReviveUnlocked(level) is true (Kennel at max level). */
  autoReviveDue(pet: Pet, now: number): boolean {
    if (!PetManager.isFallen(pet) || !pet.fallenAt) return false;
    const hours = Tuning.get('guild_facility.kennel.autoReviveHours');
    return now - pet.fallenAt >= hours * 60 * 60_000;
  },
};

export { PET_TREAT_ID };
