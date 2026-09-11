import { PetDef, Rarity } from '../types';
import { Tuning } from './tuning';

/**
 * Pets live in json/pets.json so the roster can grow via the devtool
 * without touching TypeScript -- same pattern as equipment.json.
 */
import petsJson from './json/pets.json';
export const PETS: PetDef[] = petsJson as PetDef[];

export const PET_BY_ID: Record<string, PetDef> = Object.fromEntries(
  PETS.map((p) => [p.id, p]),
);

/** The general random pool -- every pet NOT flagged dedicatedOnly. */
export const GENERAL_PET_POOL: PetDef[] = PETS.filter((p) => !p.dedicatedOnly);

/**
 * Picks a species for a freshly-hatched egg. A dedicated egg
 * (EggInstance.dedicatedPetId set) always resolves to that exact species;
 * an ordinary egg rolls uniformly from the general pool. Falls back to the
 * first general-pool entry if the pool is somehow empty (devtool data
 * drift safety, same defensive pattern raid/loot resolution already uses).
 *
 * `knownPets` defaults to the base roster (PETS) so every existing caller
 * keeps working identically -- but PetManager.hatch (patch 0374) passes
 * DlcManager.allPets() instead, so a dedicated DLC pet id (e.g. the
 * founder pack's Ruby Dragonling) actually resolves instead of silently
 * falling through to a random base-roster pick. This module deliberately
 * doesn't import DlcManager itself to supply that default -- DlcManager
 * already imports PETS from here, and importing it back would make this
 * a circular dependency for no real benefit; the caller supplying the
 * merged pool is simpler and keeps this file pure base-roster data.
 */
export function pickHatchedPetDefId(dedicatedPetId: string | undefined, knownPets: PetDef[] = PETS): string {
  if (dedicatedPetId && knownPets.some((p) => p.id === dedicatedPetId)) return dedicatedPetId;
  const pool = knownPets.filter((p) => !p.dedicatedOnly);
  const usable = pool.length > 0 ? pool : knownPets;
  return usable[Math.floor(Math.random() * usable.length)]?.id ?? usable[0]?.id ?? '';
}

/**
 * How much hero-XP an egg of each rarity needs before it hatches. Read from
 * the tuning registry (category `pets`) so these are devtool-adjustable
 * without a code change, same as every other numeric knob in this game.
 */
export function hatchXpThreshold(rarity: Rarity): number {
  return Tuning.get(`pets.egg.${rarity}.hatchXpThreshold`);
}

/** Base incubation slots before any Nest Expansion levels. */
export const BASE_INCUBATION_SLOTS = Tuning.get('pets.baseIncubationSlots');

/** Flat % chance an ordinary successful quest at this difficulty drops an
 *  egg into storage -- see the individual tuning entries for why each
 *  tier's rarity is fixed rather than randomised within a range. */
export function questEggDropChance(difficulty: string): number {
  return Tuning.get(`pets.questEggDropChance.${difficulty}`);
}
