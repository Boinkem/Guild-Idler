import { PeddlerCardDef, PeddlerCardTier, PeddlerConfigDef } from '../types';

/**
 * Grimsby's card outcome pool lives in json/peddler-cards.json, same
 * "editable via tools/devtool without touching TypeScript" reasoning as
 * every other content type. This file just types and re-exports it, plus
 * a small grouping helper PeddlerManager uses for the tier -> entry roll.
 * See PeddlerCardDef's own doc comment in types.ts for the full two-level
 * selection design (tier from Tuning, specific entry from here).
 */
import peddlerCardsJson from './json/peddler-cards.json';
export const PEDDLER_CARDS: PeddlerCardDef[] = peddlerCardsJson as PeddlerCardDef[];

export const PEDDLER_CARDS_BY_TIER: Record<PeddlerCardTier, PeddlerCardDef[]> = {
  bust: [], refund: [], modest: [], good: [], jackpot: [],
};
for (const card of PEDDLER_CARDS) {
  PEDDLER_CARDS_BY_TIER[card.tier].push(card);
}

/**
 * Single-row settings table -- see PeddlerConfigDef's own doc comment in
 * types.ts for why this is an array of one rather than a bare object.
 * `PEDDLER_CONFIG` resolves straight to that one row so call sites
 * (PeddlerCardModal.tsx) never have to know or care that it's array-
 * backed under the hood -- same "the JSON shape is a DevTool
 * implementation detail, not something the game reads directly" idea
 * PEDDLER_CARDS_BY_TIER already applies just above.
 */
import peddlerConfigJson from './json/peddler-config.json';
export const PEDDLER_CONFIG: PeddlerConfigDef =
  (peddlerConfigJson as PeddlerConfigDef[])[0] ?? { id: 'default' };
