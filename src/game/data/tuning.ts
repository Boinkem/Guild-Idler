import tuningJson from './json/tuning.json';

/**
 * A flat registry of individually-tunable numeric coefficients, editable
 * live via the devtool without touching code -- e.g. Raid Speed's cost
 * curve, or Legendary's durationMultiplier. Deliberately starting small and
 * scoped to raid-related values as the proof case, not migrating every
 * numeric constant in the game at once. More content types (quests,
 * stats, etc.) can register entries here the same way later.
 *
 * Same array-of-objects shape as every other devtool content type
 * (equipment, quests, raids, raid-encounters), so it gets a fully working
 * devtool UI for free via the existing generic schema-driven editor --
 * no new devtool frontend code needed for this first pass. A dedicated,
 * denser tuning-specific UI (search/filter, inline current-vs-default,
 * grouped by category) is a natural follow-up once this basic version is
 * proven out, same evolution the icon and loot pickers went through.
 */
export interface TuningEntry {
  id: string;
  label: string;
  category: string;
  value: number;
  default: number;
  min?: number;
  max?: number;
  description: string;
}

export const TUNING: TuningEntry[] = tuningJson as TuningEntry[];
export const TUNING_BY_ID: Record<string, TuningEntry> = Object.fromEntries(
  TUNING.map((t) => [t.id, t]),
);

/**
 * Reads a tuned coefficient by id. Falls back to 0 with a console warning
 * if the id doesn't exist in the registry -- a missing entry is a real
 * data bug (a call site referencing an id that was never registered, or a
 * typo), not something that should silently produce a plausible-looking
 * wrong number.
 */
export const Tuning = {
  get(id: string): number {
    const entry = TUNING_BY_ID[id];
    if (!entry) {
      console.warn(`Tuning.get: no registered entry for "${id}" -- returning 0.`);
      return 0;
    }
    return entry.value;
  },
};
