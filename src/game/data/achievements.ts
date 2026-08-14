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
  /**
   * BardTrack id this achievement also grants the moment it unlocks, or
   * '' for the vast majority of achievements that grant nothing extra.
   * The actual grant happens in engine.ts's reportAchievements, not here
   * -- this file just carries the mapping so it stays devtool-editable
   * (tools/devtool's `achievements` schema) same as name/description/
   * hidden. See music.ts's own top comment for why bard tracks moved
   * from a bought facility to scattered achievement rewards.
   */
  unlocksTrackId: string;
}

import achievementsJson from './json/achievements.json';
export const ACHIEVEMENTS: AchievementDef[] = achievementsJson as AchievementDef[];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
