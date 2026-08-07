import { EggInstance, GameState, MaterialId, Pet, PetBonusType, Rarity } from '../types';
import { uid } from '../rng';
import { clamp } from '../util';
import { Tuning } from '../data/tuning';
import { PET_BY_ID, hatchXpThreshold, pickHatchedPetDefId } from '../data/pets';
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
   * recorded in guild-idler-status.md) and hatches any that cross their
   * threshold. Called from QuestManager.resolve right alongside
   * HeroManager.grantXp, so hatching keeps pace with ordinary play with no
   * separate tick needed. Returns the pets that hatched this call, if any,
   * so the caller can toast/celebrate.
   */
  addHatchXp(state: GameState, xp: number, now = Date.now()): Pet[] {
    if (xp <= 0 || state.incubatingEggs.length === 0) return [];
    const hatched: Pet[] = [];
    const stillIncubating: EggInstance[] = [];
    for (const egg of state.incubatingEggs) {
      egg.hatchXp += xp;
      if (egg.hatchXp >= hatchXpThreshold(egg.rarity)) {
        hatched.push(PetManager.hatch(state, egg, now));
      } else {
        stillIncubating.push(egg);
      }
    }
    state.incubatingEggs = stillIncubating;
    return hatched;
  },

  /** Rolls a species and a bonus, and adds the resulting Pet to state.pets. */
  hatch(state: GameState, egg: EggInstance, now: number): Pet {
    const defId = pickHatchedPetDefId(egg.dedicatedPetId);
    const def = PET_BY_ID[defId];
    const bonusTypes: PetBonusType[] = ['success', 'gold', 'xp', 'loot'];
    const bonusType = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
    const min = Tuning.get('pets.baseBonusValueMin');
    const max = Tuning.get('pets.baseBonusValueMax');
    const baseBonusValue = Math.round((min + Math.random() * (max - min)) * 10) / 10;
    const pet: Pet = {
      uid: uid('pet'),
      defId,
      name: def?.name ?? 'Unnamed',
      rarity: egg.rarity,
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
   */
  currentHappiness(pet: Pet, now = Date.now()): number {
    const hoursElapsed = Math.max(0, now - pet.happinessUpdatedAt) / (60 * 60 * 1000);
    const decay = hoursElapsed * Tuning.get('pets.happinessDecayPerHour');
    return clamp(pet.happiness - decay, 0, 100);
  },

  /**
   * The pet's actual contribution right now: baseBonusValue plus level
   * growth, scaled down by current happiness but never below the
   * happiness floor -- a neglected pet still helps a little, it's just not
   * at its best. See pets.happinessFloorPercent's tuning description.
   */
  effectiveBonus(pet: Pet, now = Date.now()): number {
    const level = PetManager.levelForXp(pet.xp);
    const grown = pet.baseBonusValue + level * Tuning.get('pets.bonusGrowthPerLevel');
    const happiness = PetManager.currentHappiness(pet, now);
    const floor = Tuning.get('pets.happinessFloorPercent');
    const factor = Math.max(floor, happiness) / 100;
    return grown * factor;
  },

  /**
   * Grants each currently-equipped pet its share of a quest's raw xp
   * reward. Benched pets gain nothing -- this is the actual reason to
   * equip one rather than leaving every hatched pet in a drawer. Called
   * alongside HeroManager.grantXp, same call site as addHatchXp above.
   */
  grantEquippedXp(state: GameState, questXp: number): void {
    if (questXp <= 0 || state.equippedPetIds.length === 0) return;
    const share = Math.floor(questXp * (Tuning.get('pets.xpShareOfQuestXpPercent') / 100));
    if (share <= 0) return;
    for (const petId of state.equippedPetIds) {
      const pet = state.pets.find((p) => p.uid === petId);
      if (pet) pet.xp += share;
    }
  },

  rename(state: GameState, petUid: string, name: string): string | null {
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    const trimmed = name.trim();
    if (!trimmed) return 'A pet needs a name.';
    pet.name = trimmed.slice(0, 24);
    return null;
  },

  equip(state: GameState, petUid: string): string | null {
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    if (state.equippedPetIds.includes(petUid)) return null;
    if (state.equippedPetIds.length >= ModifierManager.petSlots(state)) return 'Every companion slot is already full.';
    state.equippedPetIds.push(petUid);
    return null;
  },

  unequip(state: GameState, petUid: string): void {
    state.equippedPetIds = state.equippedPetIds.filter((id) => id !== petUid);
  },

  /** Cheaper, smaller-gain feed option -- consumes pets.feedMaterialBatchSize
   *  of one chosen raw Harvest material. */
  feedMaterial(state: GameState, petUid: string, materialId: MaterialId, now = Date.now()): string | null {
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    const batch = Tuning.get('pets.feedMaterialBatchSize');
    if (state.materials[materialId] < batch) return 'Not enough in the Warehouse.';
    state.materials[materialId] -= batch;
    PetManager.applyFeed(pet, Tuning.get('pets.feedMaterialHappinessGain'), now);
    return null;
  },

  /** Pricier, bigger-gain feed option -- consumes 1 crafted Pet Treat from inventory. */
  feedCrafted(state: GameState, petUid: string, now = Date.now()): string | null {
    const pet = state.pets.find((p) => p.uid === petUid);
    if (!pet) return 'No such pet.';
    if ((state.inventory[PET_TREAT_ID] ?? 0) < 1) return "You don't have any Pet Treats.";
    state.inventory[PET_TREAT_ID] -= 1;
    PetManager.applyFeed(pet, Tuning.get('pets.feedCraftedHappinessGain'), now);
    return null;
  },

  applyFeed(pet: Pet, gain: number, now: number): void {
    const current = PetManager.currentHappiness(pet, now);
    pet.happiness = clamp(current + gain, 0, 100);
    pet.happinessUpdatedAt = now;
  },
};

export { PET_TREAT_ID };
