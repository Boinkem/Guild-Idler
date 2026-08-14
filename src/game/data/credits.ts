/**
 * Asset credits shown on the Settings tab -- see guild-idler-status.md's
 * Steam-launch checklist for the license-confirmation pass this draws on
 * ("Asset licensing -- confirmed in writing, resolved"). None of the four
 * packs currently in use require credit, but crediting anyway costs
 * nothing once there's an actual surface to put it on, and several of the
 * license terms explicitly say credit is appreciated.
 *
 * Lives in json/credits.json (devtool-editable, new `credits` content
 * type) rather than a hardcoded array, same reasoning as every other
 * small flat content list in this game -- a pack swap, a name correction,
 * or a new pack added later shouldn't need a code patch.
 *
 * `packName`/`creator` ship blank -- the license terms themselves were
 * confirmed directly against the real text, but the specific marketplace
 * listing name and creator/storefront name for each pack weren't
 * re-verified as part of this pass. Fill both in via the devtool's
 * `credits` tab once confirmed; the Settings screen renders the entry
 * either way rather than hiding a not-yet-filled-in row, since the
 * license summary itself is still real and worth showing.
 */
export interface CreditEntry {
  id: string;
  category: string;
  packName: string;
  creator: string;
  licenseSummary: string;
  creditRequired: boolean;
}

import creditsJson from './json/credits.json';
export const CREDITS: CreditEntry[] = creditsJson as CreditEntry[];
