import { ConsumableDef, Difficulty, Injury } from '../types';
import { HOUR, MINUTE } from '../util';

/**
 * Consumables live in json/consumables.json so they can be edited via
 * tools/devtool without touching TypeScript.
 */
import consumablesJson from './json/consumables.json';
export const CONSUMABLES: ConsumableDef[] = consumablesJson as ConsumableDef[];

export const CONSUMABLE_BY_ID: Record<string, ConsumableDef> = Object.fromEntries(
  CONSUMABLES.map((c) => [c.id, c]),
);

/** Injury templates. `healsAt` is filled in when the injury is applied. */
export interface InjuryDef {
  id: string;
  name: string;
  description: string;
  durationMs: number;
  mods: Injury['mods'];
  treatmentCost: number;
  weight: number;
  /** Reserves the grimmer injuries for quests that deserve them. */
  minDifficulty?: Difficulty;
}

/**
 * Injuries live in json/injuries.json so they can be edited via tools/devtool.
 * The JSON stores `durationHours` (easier to read and edit than raw
 * milliseconds); this is where it's converted to the `durationMs` the rest of
 * the game expects.
 */
import injuriesJson from './json/injuries.json';
interface InjuryJson {
  id: string;
  name: string;
  description: string;
  durationHours: number;
  mods: Injury['mods'];
  treatmentCost: number;
  weight: number;
  minDifficulty?: Difficulty;
}
export const INJURIES: InjuryDef[] = (injuriesJson as InjuryJson[]).map((j) => ({
  id: j.id,
  name: j.name,
  description: j.description,
  durationMs: j.durationHours * HOUR,
  mods: j.mods,
  treatmentCost: j.treatmentCost,
  weight: j.weight,
  minDifficulty: j.minDifficulty,
}));

export const REST_TICK = 30 * MINUTE;
