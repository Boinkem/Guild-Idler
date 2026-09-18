import { useEffect, useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { backgroundSrc } from '../../game/settings';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AH_READY, AhConnectionStatus, checkAhConnection } from '../../game/auctionHouse';
import { MailboxModal } from '../MailboxModal';

/**
 * Auction House panel shell -- build-order item 2 from the ranked list
 * in guild-idler-status.md's Auction House entry (patch 0401). No real
 * listings yet; this is the locked state (mirrors BlackMarketStock/
 * RaidsPanel's own "Go to Guild Hall" pattern, VendorsPanel.tsx /
 * RaidsPanel.tsx) plus the "needs a connection" offline state the design
 * doc calls for, for whenever the backend genuinely isn't reachable --
 * which, honestly, is always true right now, since DNS/AH_ENABLED
 * aren't live yet (see server/README.md). Building the offline state now
 * isn't wasted work: it's the actual correct production behaviour the
 * moment this ships, and stays correct without any further change once
 * the backend comes online for real -- see auctionHouse.ts's AH_READY.
 *
 * Mailbox button lives here too (patch 0403), deliberately NOT gated on
 * connection status -- claiming is pure local save data, no network call
 * involved, so it stays usable even while the browse/buy/sell side of
 * the panel correctly shows "needs a connection".
 */
export function AuctionHousePanel() {
  const engine = useEngine();
  const state = engine.state;
  const { settings } = useSettings();
  const unlocked = ModifierManager.hasUnlock(state, 'auctionHouse');
  const [status, setStatus] = useState<AhConnectionStatus>(AH_READY ? 'checking' : 'offline');
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const mailboxCount = state.mailbox.length;

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setStatus(AH_READY ? 'checking' : 'offline');
    checkAhConnection().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => { cancelled = true; };
  }, [unlocked]);

  /**
   * Mailbox sync (patch 0410) -- fires once whenever the connection check
   * above confirms 'online', pulling any real unclaimed server mailbox
   * rows down into local state. This is the first time
   * verifyAuctionHouseAuth's full Steam-auth round trip (patch 0407) runs
   * from a real gameplay trigger rather than only TestingPanel's button --
   * opening this panel while genuinely connected IS the natural "prove
   * who I am" moment, no separate login step needed anywhere in this
   * game. Silent on failure by design -- see engine.syncMailboxFromServer's
   * own comment for why.
   */
  useEffect(() => {
    if (status !== 'online') return;
    void engine.syncMailboxFromServer();
  }, [status, engine]);

  useEffect(() => {
    engine.acknowledgeTab('auction_house');
  }, [engine]);

  if (!unlocked) {
    return (
      <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/auction-house.jpg', settings.backgroundMood)})` }}>
        <div className="tab-scene-content">
          <h2>Auction House</h2>
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              A standing agreement with a neutral broker to run buy/sell postings between guilds --
              list gear and consumables for other players to find, gold for gold.
            </p>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              Requires the Auction House Charter upgrade -- check the Guild Hall tab.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => engine.requestTab('guild', 'auction_house_charter')}
          >
            Go to Guild Hall →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/auction-house.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
        <div className="spread" style={{ alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Auction House</h2>
          <button className="btn-ghost mailbox-btn" onClick={() => setMailboxOpen(true)}>
            📬 Mailbox
            {mailboxCount > 0 && <span className="btn-count-badge">{mailboxCount > 99 ? '99+' : mailboxCount}</span>}
          </button>
        </div>

        {status === 'online' ? (
          // Real listings/browse/buy UI -- not built yet, later build-
          // order steps. Reaching this branch means the backend is
          // genuinely live and enabled, which isn't possible yet -- see
          // AH_READY's own comment in auctionHouse.ts. The mailbox above
          // doesn't wait on this -- see this file's own header comment.
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              Connected -- but there's nothing to show yet. Listings and browsing are still
              being built.
            </p>
          </div>
        ) : (
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              {status === 'checking'
                ? 'Connecting...'
                : "The Auction House needs a connection, and can't reach one right now."}
            </p>
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>
              Everything else in the guild works exactly as it always has -- this is the only
              part of the game that needs the internet. Your mailbox above still works.
            </p>
          </div>
        )}
      </div>

      {mailboxOpen && <MailboxModal onClose={() => setMailboxOpen(false)} />}
    </div>
  );
}
