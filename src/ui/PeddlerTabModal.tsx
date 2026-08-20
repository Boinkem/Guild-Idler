import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { PeddlerManager } from '../game/managers/PeddlerManager';
import { formatGold } from '../game/util';
import { GrimsbySprite } from './sprites/GrimsbySprite';
import { measureFlyOffset } from './flyTarget';
import { RewardGlowParticle } from './RewardGlowParticle';

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

/**
 * Bust/settle particle count -- more flourish for a run that actually
 * went somewhere, same "reads as more of a deal for a better pull"
 * reasoning PeddlerCardModal's own BURST_PARTICLE_COUNT already
 * established, keyed off the same round-5-is-a-jackpot threshold the
 * stats/achievement side of this game already uses (see
 * peddler.tab.jackpotRound).
 */
function settleParticleCount(round: number): number {
  if (round >= 5) return 5;
  if (round >= 3) return 3;
  return 2;
}

export function PeddlerTabModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const tab = state.peddlerTab;
  const runResult = engine.lastGrimsbyTabResult;

  const tierCount = PeddlerManager.tabTierCount();
  const tiers = Array.from({ length: tierCount }, (_, i) => i);
  const present = PeddlerManager.isPresent(state);

  // Grimsby stays on 'idle' for the entire time a tab is being played --
  // open, pushed once, pushed ten times, doesn't matter -- and only
  // switches to 'idle2' (crossed arms), played once and frozen on its
  // last frame rather than looping, the moment a tab actually CLOSES,
  // whether that's a bust or a deliberate Settle. Direct correction from
  // an earlier version of this file, which switched pose mid-round based
  // on how far the tab had been pushed -- that read as him reacting to
  // progress itself, when the actual ask was for the close specifically
  // to be the one beat that changes his pose.
  const [closedPose, setClosedPose] = useState(false);

  const settleBtnRef = useRef<HTMLButtonElement>(null);
  const [burstParticles, setBurstParticles] = useState<{
    x: number; y: number; dx: number; dy: number; color: string; delay: number;
  }[] | null>(null);

  // A bust is detected here (not just left to the button handler) because
  // it can also happen from a tab this component didn't personally open
  // in this mount -- reacting to the result itself, not the click, is
  // what stays correct regardless of how the tab got here.
  useEffect(() => {
    if (runResult && !runResult.success) setClosedPose(true);
  }, [runResult]);

  const handleOpen = (tier: number) => {
    setClosedPose(false);
    setBurstParticles(null);
    engine.openGrimsbyTab(tier);
  };

  const handleSettle = () => {
    if (!tab) return;
    setClosedPose(true);
    // Measured and captured BEFORE calling settleGrimsbyTab -- that call
    // nulls state.peddlerTab immediately, so tab.round/tab.value need to
    // be read now, not after. Same "measure the real on-screen distance,
    // skip gracefully if the target isn't mounted" shape PeddlerCardModal's
    // own reward flight already uses (see flyTarget.ts).
    if (settleBtnRef.current) {
      const offset = measureFlyOffset(settleBtnRef.current, 'gold');
      if (offset) {
        const rect = settleBtnRef.current.getBoundingClientRect();
        const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const count = settleParticleCount(tab.round);
        setBurstParticles(Array.from({ length: count }, (_, i) => ({
          ...origin, dx: offset.dx, dy: offset.dy, color: 'var(--brass)', delay: i * 90,
        })));
      }
    }
    engine.settleGrimsbyTab();
  };

  const handleClose = () => {
    if (runResult) engine.dismissGrimsbyTabResult();
    onClose();
  };

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
          <GrimsbySprite animation={closedPose ? 'idle2' : 'idle'} once={closedPose} height={140} />
        </div>

        <div className="peddler-modal-body">
          {/* Lives above the tab/tier-select split below, not nested inside
              it -- a bust sets state.peddlerTab to null the instant it
              happens, so a result message nested under `{tab && ...}` would
              vanish the same render it needed to show, dropping straight
              back to the tier-select screen with nothing said. This is
              exactly that bug, fixed. */}
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
                      onClick={() => handleOpen(tier)}
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
                <button ref={settleBtnRef} type="button" className="btn-green" onClick={handleSettle}>
                  Settle -- {formatGold(tab.value)} gold
                </button>
              </div>
            </>
          )}

          {burstParticles && burstParticles.map((p, i) => (
            <RewardGlowParticle
              key={i}
              x={p.x} y={p.y} dx={p.dx} dy={p.dy}
              color={p.color} delay={p.delay}
              durationMs={700}
            />
          ))}
        </div>

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
