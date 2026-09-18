import { GameState, MailboxEntry } from '../types';
import { uid } from '../rng';
import { ModifierManager } from './ModifierManager';

/**
 * Auction House mailbox -- see guild-idler-status.md's Auction House
 * entry for the full design, and MailboxEntry's own comment (types.ts)
 * for the "both purchased items and sale gold route through here"
 * revision from the original seller-gold-only design.
 *
 * Nothing populates a real mailbox entry yet -- that's wired in once the
 * actual buy/sell backend calls exist (later build-order steps). This
 * manager is the claim side, buildable and fully testable now: `grant*`
 * exists for that testing purpose (TestingPanel.tsx, engine.ts's
 * test* methods), not as a stand-in for the real listing/purchase flow.
 */
export const MailboxManager = {
  count(state: GameState): number {
    return state.mailbox.length;
  },

  /**
   * Claims a single entry. Returns null on success, or a player-facing
   * error string on failure -- same "string error, not a thrown
   * exception" shape GuildManager.buyUpgrade already uses, so callers
   * don't need a try/catch to show a sensible message.
   *
   * Gold Storage Cap interaction -- locked decision (see
   * guild-idler-status.md's Auction House entry): claiming is blocked
   * outright, not partial-claimed and not silently capped, whenever
   * claiming in full would push the player over their existing cap.
   * The entry stays in the mailbox, unclaimed, until there's room.
   */
  claim(state: GameState, entryId: string): string | null {
    const index = state.mailbox.findIndex((e) => e.id === entryId);
    if (index === -1) return 'That mailbox entry is gone -- try refreshing.';
    const entry = state.mailbox[index];

    if (entry.type === 'gold') {
      const amount = entry.amount ?? 0;
      const cap = ModifierManager.goldStorage(state);
      if (state.gold + amount > cap) {
        return "Claiming this would put you over your Gold Storage Cap -- spend some gold first, then come back.";
      }
      state.gold += amount;
    } else if (entry.type === 'scrap') {
      // No Scrap Storage Cap exists (checked directly, not assumed) --
      // unlike gold, this is a plain uncapped add.
      state.scrap += entry.amount ?? 0;
    } else if (entry.type === 'equipment') {
      if (!entry.item) return 'That mailbox entry is malformed -- nothing to claim.';
      state.stash.push(entry.item);
    } else if (entry.type === 'consumable') {
      if (!entry.consumableId) return 'That mailbox entry is malformed -- nothing to claim.';
      state.inventory[entry.consumableId] = (state.inventory[entry.consumableId] ?? 0) + (entry.amount ?? 1);
    }

    state.mailbox.splice(index, 1);
    return null;
  },

  /**
   * Claims everything claimable in one pass -- skips (and leaves
   * in-place) any gold entry that would exceed the storage cap, same
   * per-entry rule `claim` enforces, rather than failing the whole
   * batch over one blocked entry. Returns how many were actually
   * claimed and how many were skipped, so the UI can say something more
   * useful than a bare "done" -- plus the ids of any claimed entries
   * that came from the real server (patch 0410), so the caller
   * (engine.ts's claimAllMailbox) knows which ones need a server-side
   * acknowledgment, without engine.ts having to re-scan `state.mailbox`
   * itself after every entry's already been spliced out of it.
   */
  claimAll(state: GameState): { claimed: number; skipped: number; claimedServerIds: string[] } {
    let claimed = 0;
    let skipped = 0;
    const claimedServerIds: string[] = [];
    // Snapshot both id AND fromServer up front, not just id -- claim()
    // mutates state.mailbox in place (splice), so by the time an entry
    // is claimed it's already gone from the array and its fromServer
    // flag would be unrecoverable otherwise.
    const snapshot = state.mailbox.map((e) => ({ id: e.id, fromServer: e.fromServer }));
    for (const { id, fromServer } of snapshot) {
      const err = MailboxManager.claim(state, id);
      if (err) {
        skipped += 1;
      } else {
        claimed += 1;
        if (fromServer) claimedServerIds.push(id);
      }
    }
    return { claimed, skipped, claimedServerIds };
  },

  /** Testing-only entry point -- see this module's own header comment.
   *  Not called from any real gameplay path. */
  grantTestEntry(state: GameState, entry: Omit<MailboxEntry, 'id' | 'receivedAt'>, now = Date.now()): void {
    state.mailbox.push({ ...entry, id: uid('mail'), receivedAt: now });
  },
};
