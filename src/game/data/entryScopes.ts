/**
 * Patch 0428 -- the lists whose new entries "ink in" the first time
 * they're shown (ui/entryInk.tsx). Each is a scope in GameState.entryMarks.
 */
export const ENTRY_SCOPES = [
  'dq-board', 'lore-quests', 'lore-raids', 'lore-collection',
  // Patch 0465 -- "first time you see it" moments (ui/firstSeen.ts):
  // a raid opening up, a raid difficulty becoming available, a first
  // full clear of a raid at a difficulty, an achievement card, a
  // tombstone style you own but haven't looked at, a new guild rank.
  'raid-unlock', 'raid-diff', 'raid-clear', 'achievements', 'tombstones', 'guild-rank',
  // Patch 0466 -- a hero class that became recruitable since you last
  // looked (tier reached or milestone met): NEW tag + glow on its chip.
  'recruit-unlock',
] as const;
export type EntryScope = typeof ENTRY_SCOPES[number];
