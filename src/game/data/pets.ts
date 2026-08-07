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
 * an ordinary egg rolls uniformly from GENERAL_PET_POOL. Falls back to the
 * first general-pool entry if the pool is somehow empty (devtool data
 * drift safety, same defensive pattern raid/loot resolution already uses).
 */
export function pickHatchedPetDefId(dedicatedPetId: string | undefined): string {
  if (dedicatedPetId && PET_BY_ID[dedicatedPetId]) return dedicatedPetId;
  const pool = GENERAL_PET_POOL.length > 0 ? GENERAL_PET_POOL : PETS;
  return pool[Math.floor(Math.random() * pool.length)]?.id ?? pool[0]?.id ?? '';
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
