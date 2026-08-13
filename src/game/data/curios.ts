import { CurioDef } from '../types';
import { Tuning } from './tuning';

/**
 * Curios live in json/curios.json so they can be edited via tools/devtool
 * without touching TypeScript -- same reasoning and pattern equipment.ts/
 * consumables.ts already use for their own data. See CurioDef's own doc
 * comment in types.ts for why this is a fully open-ended list (like
 * equipment/consumables) rather than a fixed small set (like materials).
 */
import curiosJson from './json/curios.json';
export const CURIOS: CurioDef[] = curiosJson as CurioDef[];

export const CURIO_BY_ID: Record<string, CurioDef> = Object.fromEntries(
  CURIOS.map((c) => [c.id, c]),
);

/** Same shape as pets.ts's own questEggDropChance -- see
 *  quest.curioDropChance.* in tuning.json for the actual per-difficulty
 *  values and their own descriptions. */
export function questCurioDropChance(difficulty: string): number {
  return Tuning.get(`quest.curioDropChance.${difficulty}`);
}
