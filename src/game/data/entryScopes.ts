/**
 * Patch 0428 -- the lists whose new entries "ink in" the first time
 * they're shown (ui/entryInk.tsx). Each is a scope in GameState.entryMarks.
 */
export const ENTRY_SCOPES = ['dq-board', 'lore-quests', 'lore-raids', 'lore-collection'] as const;
export type EntryScope = typeof ENTRY_SCOPES[number];
