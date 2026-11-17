import type { GameState } from '../types';
import { DEMO_BUILD } from '../demo';
import type { RealmEvent } from '../auctionHouse';
import { uuidv4 } from '../rng';

/**
 * Realm Threat, patch 0477 -- the local half: counting Ward as quests and
 * raids finish, and packaging it for the server.
 *
 * WHAT THIS PATCH BUILDS: one-off server EVENTS (the Next Fest Breach and
 * its test runs) -- a single shared bar, personal tiers, guild titles as
 * rewards. The month-long, four-chapter campaign from the design doc
 * ("Realm Threat -- complete system spec") is not built yet; events use
 * its Ward rules, tables and sync pattern so that build extends this one.
 *
 * Everything here is plain state arithmetic, no network. The window an
 * event's Ward counts in is copied into the save whenever the server
 * reports it (onCurrent), so quests that finish offline -- resolved in a
 * burst on the next launch -- are counted by their own finish time.
 *
 * The server can't verify any of this (same accepted risk as the Auction
 * House); it caps each player and each batch, and rewards are cosmetic.
 */

export const EMPTY_REALM_THREAT: GameState['realmThreat'] = {
  campaignId: 0, opensAt: 0, endsAt: 0, finalisesAt: 0,
  unsent: 0, pending: null, points: 0, tier: 0, seenResultFor: 0, wardTotal: 0,
};

export const RealmThreatManager = {
  /** May this build add Ward to this event? The demo only when the event
   *  says so (the full campaign will be view-only there). */
  canContribute(event: RealmEvent): boolean {
    return DEMO_BUILD ? event.allowDemo : true;
  },

  /**
   * A quest or raid just finished at `at`. Adds to the unsent tally when
   * that moment falls inside the window of the event this save knows
   * about. Called from QuestManager.resolve and RaidManager.resolve --
   * the same path offline catch-up runs through, so offline Ward is
   * counted once with nothing special here.
   */
  addWard(state: GameState, points: number, at: number): void {
    const rt = state.realmThreat;
    if (!rt || rt.campaignId === 0 || points <= 0) return;
    if (at < rt.opensAt || at >= rt.endsAt) return;
    rt.unsent += points;
    rt.wardTotal += points;
  },

  /** The server's view of the current event (null = nothing scheduled).
   *  A different event than the one stored drops whatever was unsent for
   *  the old one -- an accepted loss of at most one sync's Ward. */
  onCurrent(state: GameState, event: RealmEvent | null): void {
    const rt = state.realmThreat;
    const usable = event && RealmThreatManager.canContribute(event) ? event : null;
    if (!usable) {
      if (rt.campaignId !== 0) Object.assign(rt, { campaignId: 0, opensAt: 0, endsAt: 0, finalisesAt: 0, unsent: 0, pending: null });
      return;
    }
    if (usable.id !== rt.campaignId) {
      Object.assign(rt, { campaignId: usable.id, unsent: 0, pending: null, points: 0, tier: 0 });
    }
    rt.opensAt = new Date(usable.opensAt).getTime();
    rt.endsAt = new Date(usable.endsAt).getTime();
    rt.finalisesAt = new Date(usable.finalisesAt).getTime();
  },

  /**
   * The batch to send, or null if there is nothing. An unconfirmed batch
   * is returned again with its SAME key (the server ignores a key it has
   * already applied), so a crash or a lost reply between send and save
   * can never double-count. The caller must save before sending.
   */
  buildBatch(state: GameState): NonNullable<GameState['realmThreat']['pending']> | null {
    const rt = state.realmThreat;
    if (rt.campaignId === 0) return null;
    if (rt.pending && rt.pending.campaignId !== rt.campaignId) rt.pending = null;
    if (rt.pending) return rt.pending;
    if (rt.unsent <= 0) return null;
    rt.pending = { batchKey: uuidv4(), points: rt.unsent, campaignId: rt.campaignId };
    rt.unsent = 0;
    return rt.pending;
  },

  /** The server answered for the pending batch (applied, or said the
   *  event is no longer taking Ward): it is done either way. */
  settleBatch(state: GameState, confirmed?: { points: number; tier: number }): void {
    const rt = state.realmThreat;
    rt.pending = null;
    if (confirmed) { rt.points = confirmed.points; rt.tier = confirmed.tier; }
  },

  /** Ward counted locally that the server hasn't confirmed yet. */
  onItsWay(state: GameState): number {
    const rt = state.realmThreat;
    return rt.unsent + (rt.pending?.points ?? 0);
  },
};
