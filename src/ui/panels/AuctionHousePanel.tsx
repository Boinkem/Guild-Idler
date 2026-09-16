import { useEffect, useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { backgroundSrc } from '../../game/settings';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AH_READY, AhConnectionStatus, checkAhConnection } from '../../game/auctionHouse';

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
 */
export function AuctionHousePanel() {
  const engine = useEngine();
  const state = engine.state;
  const { settings } = useSettings();
  const unlocked = ModifierManager.hasUnlock(state, 'auctionHouse');
  const [status, setStatus] = useState<AhConnectionStatus>(AH_READY ? 'checking' : 'offline');

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setStatus(AH_READY ? 'checking' : 'offline');
    checkAhConnection().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => { cancelled = true; };
  }, [unlocked]);

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
        <h2>Auction House</h2>

        {status === 'online' ? (
          // Real listings/browse/buy/mailbox UI -- not built yet, later
          // build-order steps. Reaching this branch means the backend is
          // genuinely live and enabled, which isn't possible yet -- see
          // AH_READY's own comment in auctionHouse.ts.
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              Connected -- but there's nothing to show yet. Listings, browsing, and the mailbox
              are still being built.
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
              part of the game that needs the internet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
