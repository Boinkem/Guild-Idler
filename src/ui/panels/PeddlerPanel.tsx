import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { PeddlerManager } from '../../game/managers/PeddlerManager';
import { formatGold, formatDuration } from '../../game/util';
import { GrimsbySprite } from '../sprites/GrimsbySprite';
import { PeddlerCardModal } from '../PeddlerCardModal';

/**
 * Same "vendor-card" presentation the Blacksmith/Alchemist/Enchanter
 * already use (VendorsPanel.tsx) -- sprite + name on a dark card,
 * blurb, action button -- rather than a bespoke full-scene background.
 * The actual card game lives in its own modal (PeddlerCardModal), same
 * "tab is a plain destination, the special moment is its own overlay"
 * shape CraftingStation/EnhanceStation etc. already use from each
 * vendor's own page. peddler-bg.png stays as the tab's faded backdrop
 * (wired at the MenuWindow level, same as hatchery-bg.jpg/raids-bg.jpg)
 * -- it doesn't also need to be a bold foreground element here too.
 */
export function PeddlerPanel() {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow(1000);
  const [showModal, setShowModal] = useState(false);

  const present = PeddlerManager.isPresent(state);
  const fee = PeddlerManager.feeCost(state);
  const canAfford = state.gold >= fee;
  const charmCount = state.inventory.beckoning_charm ?? 0;

  return (
    <>
      <h2>Grimsby</h2>
      <p className="subtitle">
        A cart, a cart, and absolutely nothing more, according to him. Pay for a card, pick one, see what
        happens -- he swears the odds are fair. He would say that either way.
      </p>

      <div className="card vendor-card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <GrimsbySprite animation="idle" height={144} />
          <div style={{ flex: 1 }}>
            <div className="spread">
              <span className="card-title">Grimsby</span>
              {present && (
                <span className="tiny muted">
                  {formatDuration(Math.max(0, (state.grimsbyLeavesAt ?? now) - now))} left
                </span>
              )}
            </div>

            {present ? (
              <>
                <p className="card-flavour">
                  "Well? Card's a card. Fair chance, for a fair price."
                </p>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="btn-primary"
                    disabled={!canAfford}
                    onClick={() => setShowModal(true)}
                    title={canAfford ? undefined : 'Not enough gold'}
                  >
                    Pick Your Card -- {formatGold(fee)} gold
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="card-flavour muted">
                  The cart's not here right now. He turns up unannounced, every so often, and doesn't
                  stick around long once he does.
                </p>
                {charmCount > 0 && (
                  <button onClick={() => engine.usePeddlerCharm('beckoning_charm')}>
                    Use a Beckoning Charm ({charmCount})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showModal && <PeddlerCardModal onClose={() => setShowModal(false)} />}
    </>
  );
}
