/**
 * Achievement display metadata lives in json/achievements.json so names and
 * flavour text can be edited via tools/devtool without touching TypeScript.
 *
 * The trigger LOGIC for each achievement — the actual condition that unlocks
 * it — is not data-driven and lives in AchievementManager.ts instead. Some
 * conditions ("recruit every class", "win a sub-30% quest") aren't safely
 * expressible as a generic form field, so this is a deliberate split: the
 * devtool can rename an achievement or rewrite its description freely, but
 * adding a *new* achievement here does nothing on its own until a matching
 * check is added in code. Documented in DEVTOOL.md.
 */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Steam hides the name/description of a locked hidden achievement. */
  hidden: boolean;
}

import achievementsJson from './json/achievements.json';
export const ACHIEVEMENTS: AchievementDef[] = achievementsJson as AchievementDef[];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
