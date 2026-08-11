import { PeddlerCardDef, PeddlerCardTier } from '../types';

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
