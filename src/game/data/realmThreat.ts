import type { QuestOffer, RaidDifficulty } from '../types';
import realmCampaigns from './json/realm-campaigns.json';

/**
 * Realm Threat, patch 0477 -- Ward maths and campaign text. See
 * RealmThreatManager.ts for what this patch does and doesn't build.
 *
 * Ward follows the design doc exactly (spec section 4.1): it is earned by
 * TIME spent questing, so Ward per hour is the same at every level and
 * difficulty, and a level-5 guild matters as much as a level-50 one.
 */
export const WARD_MINUTES_PER_POINT = 90;
export const RAID_WARD: Record<RaidDifficulty, number> = { normal: 10, heroic: 20, mythic: 35, legendary: 50 };

/** Ward for one finished quest. `fast` is QuestManager.isFastOffer(offer)
 *  -- passed in rather than imported, so this file has no manager
 *  dependencies. Fast/burst quests earn none (they would reward spam
 *  clicking); a failed quest earns half, rounded down. */
export function wardForQuest(offer: Pick<QuestOffer, 'duration'>, success: boolean, fast: boolean): number {
  if (fast) return 0;
  const base = Math.max(1, Math.round(offer.duration / (WARD_MINUTES_PER_POINT * 60_000)));
  return success ? base : Math.floor(base / 2);
}

/** Ward for one finished raid: flat per difficulty, half on anything short
 *  of a full clear. */
export function wardForRaid(difficulty: RaidDifficulty, fullClear: boolean): number {
  const base = RAID_WARD[difficulty] ?? 0;
  return fullClear ? base : Math.floor(base / 2);
}

/** Realm milestones on the shared bar, in percent of the target. */
export const REALM_MILESTONES = [25, 50, 75, 100] as const;

export interface RealmCampaignText {
  name: string;
  kicker: string;
  paceLabel: string;
  blurb: string;
  teaserBlurb: string;
  tierNames: string[];
  sealedHeadline: string;
  heldOpenHeadline: string;
  winText: string;
  loseText: string;
}

const TEXT = realmCampaigns as Record<string, Partial<RealmCampaignText>>;

/** Shown for a campaign key this build has no text for (the server can
 *  schedule one newer than the client): generic, never broken. */
const FALLBACK: RealmCampaignText = {
  name: 'A threat stirs in the realm',
  kicker: 'Server event',
  paceLabel: 'THE THREAT GROWS',
  blurb: 'Every guild in the realm is being called on at once. Every quest your heroes finish adds Ward to the line.',
  teaserBlurb: 'Something is coming for the whole realm. When it arrives, every quest your heroes finish will add Ward to the line.',
  tierNames: ['Sentry', 'Warden', 'Shield of the Realm'],
  sealedHeadline: 'The threat is sealed',
  heldOpenHeadline: 'The threat held open',
  winText: 'The realm held together, and the threat is sealed.',
  loseText: 'The realm held the line, but the threat is not gone.',
};

export function realmCampaignText(campaignKey: string): RealmCampaignText {
  return { ...FALLBACK, ...(TEXT[campaignKey] ?? {}) };
}

/** Name for tier `index` (0-based); past the named ones, "Tier N". */
export function realmTierName(text: RealmCampaignText, index: number): string {
  return text.tierNames[index] ?? `Tier ${index + 1}`;
}
