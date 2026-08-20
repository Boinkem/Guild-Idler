import { useEngine } from './useEngine';
import { PeddlerManager } from '../game/managers/PeddlerManager';
import { formatGold } from '../game/util';
import { GrimsbySprite, GrimsbyAnimation } from './sprites/GrimsbySprite';

/**
 * Grimsby's third game -- a repeating push-your-luck: buy in, then each
 * round is either Settle (bank the tab and stop) or Run it up (pay the
 * tier's buy-in again, roll for the next round -- success grows the tab
 * further, a bust wipes it ENTIRELY, no partial refund, by direct design
 * request). Gated behind Permanent Spot (see PeddlerPanel's own locked
 * card) -- this is the one game where the tension is explicitly
 * Grimsby's own patience, so it only makes sense once he's actually
 * settled in.
 *
 * Same "vendor-table" backdrop template as PeddlerCardModal/
 * PeddlerDiceModal, per established convention, rather than a bespoke
 * scene. No ceiling on rounds -- pushes indefinitely toward the
 * success-chance floor, by design.
 */

/** Grimsby's own reaction to how far a tab has been pushed -- reuses
 *  existing sprite animations rather than needing new art (see
 *  GrimsbySprite's own animation list). Purely a mood readout; the
 *  actual odds are never shown numerically, same "he doesn't tell you
 *  the exact percentage" restraint Pick Your Card's own tiers already
 *  keep. */
function moodFor(round: number): { animation: GrimsbyAnimation; label: string } {
  if (round <= 1) return { animation: 'idle', label: 'Patient.' };
  if (round <= 3) return { animation: 'idle2', label: 'Getting impatient.' };
  return { animation: 'dialogue', label: 'About done with you.' };
}

export function PeddlerTabModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const tab = state.peddlerTab;
  const runResult = engine.lastGrimsbyTabResult;

  const tierCount = PeddlerManager.tabTierCount();
  const tiers = Array.from({ length: tierCount }, (_, i) => i);
  const present = PeddlerManager.isPresent(state);

  const handleClose = () => {
    if (runResult) engine.dismissGrimsbyTabResult();
    onClose();
  };

  const mood = tab ? moodFor(tab.round) : { animation: 'idle' as GrimsbyAnimation, label: '' };
  const nextBuyIn = tab ? PeddlerManager.tabTierBuyIn(tab.tier) : 0;
  const canPush = !!tab && present && state.gold >= nextBuyIn;

  return (
    <div className="overlay" onClick={handleClose}>
      <div
        className="modal peddler-modal"
        style={{ backgroundImage: 'url(./lore/peddler-table.png)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="peddler-modal-header">
          <GrimsbySprite animation={runResult && !runResult.success ? 'idle' : mood.animation} height={140} />
        </div>

        <div className="peddler-modal-body">
          {!tab && (
            <>
              <p className="peddler-corner-comment tiny muted">
                Name your tier, and he opens a tab. Push it further any time after that, or settle up
                and walk away with whatever's on it -- but a bad push wipes the whole tab, not just
                that round.
              </p>
              <div className="row wrap" style={{ gap: 6, justifyContent: 'center' }}>
                {tiers.map((tier) => {
                  const buyIn = PeddlerManager.tabTierBuyIn(tier);
                  const canAfford = present && state.gold >= buyIn;
                  return (
                    <button
                      key={tier}
                      type="button"
                      className="btn-purple"
                      disabled={!canAfford}
                      onClick={() => engine.openGrimsbyTab(tier)}
                      title={present ? (canAfford ? undefined : 'Not enough gold') : 'He’s not here right now'}
                    >
                      Open tab -- {formatGold(buyIn)} gold
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {tab && (
            <>
              {runResult && (
                <p
                  className="peddler-corner-comment tiny"
                  style={{ color: runResult.success ? 'var(--brass)' : 'var(--muted)' }}
                >
                  <b>{runResult.success ? 'Held.' : "Tab's closed."}</b>{' '}
                  {runResult.success
                    ? `Tab climbs to ${formatGold(runResult.value)}g.`
                    : "I'll forget this one if you will."}
                  {runResult.rebate > 0 && ` (+${formatGold(runResult.rebate)}g loyalty)`}
                </p>
              )}

              <p className="tiny muted" style={{ textAlign: 'center' }}>{mood.label}</p>

              <div className="card" style={{ padding: '8px 12px', margin: '0 auto', maxWidth: 220 }}>
                {Array.from({ length: tab.round }, (_, i) => i + 1).map((round) => (
                  <div key={round} className="spread tiny" style={{ fontFamily: 'monospace' }}>
                    <span className="muted">Round {round}</span>
                    <span>{formatGold(round === tab.round ? tab.value : 0)}</span>
                  </div>
                ))}
              </div>

              <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-purple"
                  disabled={!canPush}
                  onClick={() => engine.runUpGrimsbyTab()}
                  title={canPush ? undefined : (!present ? 'He’s not here right now' : 'Not enough gold')}
                >
                  Run it up -- {formatGold(nextBuyIn)} gold
                </button>
                <button type="button" className="btn-green" onClick={() => engine.settleGrimsbyTab()}>
                  Settle -- {formatGold(tab.value)} gold
                </button>
              </div>
            </>
          )}
        </div>

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
