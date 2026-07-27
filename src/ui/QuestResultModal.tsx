import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { playSound } from '../game/sound';
import { formatGold, RARITY_COLOR } from '../game/util';

/** How long the pop-out + coin/XP burst plays before the modal actually
 * unmounts. Matches the CSS: modal-pop-out is 320ms, collect-fly is 750ms
 * (staggered up to ~120ms), so this gives the longest particle time to
 * finish fading rather than getting cut off mid-flight. */
const DISMISS_DELAY_MS = 640;

const COIN_PARTICLES = [
  { dx: -46, dy: -92, rot: -18, delay: 0 },
  { dx: -6, dy: -112, rot: 8, delay: 50 },
  { dx: 40, dy: -88, rot: 20, delay: 20 },
  { dx: 62, dy: -60, rot: 26, delay: 110 },
  { dx: -60, dy: -55, rot: -24, delay: 90 },
];
const XP_PARTICLES = [
  { dx: -22, dy: -104, rot: -10, delay: 30 },
  { dx: 24, dy: -100, rot: 12, delay: 70 },
  { dx: 2, dy: -118, rot: 2, delay: 130 },
];

/** Shown when a quest resolves while the player is watching. */
export function QuestResultModal() {
  const engine = useEngine();
  const { settings } = useSettings();
  const result = engine.lastResult;
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (result && !settings.questResultPopups) engine.dismissResult();
  }, [result, settings.questResultPopups, engine]);

  if (!result || !settings.questResultPopups) return null;

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    playSound('collect');
    window.setTimeout(() => engine.dismissResult(), DISMISS_DELAY_MS);
  };

  return (
    <div className="overlay" onClick={handleDismiss}>
      <div className={`modal ${dismissing ? 'dismissing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h3>{result.heroName} is back</h3>
        <p className="small muted" style={{ marginTop: 0 }}>{result.questName}</p>

        <p className={result.success ? 'good' : 'bad'} style={{ fontSize: 12 }}>
          {result.success ? 'The contract is fulfilled.' : 'The contract failed.'}
        </p>

        <div className="reward-burst">
          {result.xp > 0 && <span className="burst-xp">+{result.xp} XP</span>}
          {result.gold > 0 && <span className="burst-gold">+{formatGold(result.gold)} gold</span>}
        </div>
        {result.levelsGained > 0 && <p className="good burst-levelup">Level up ×{result.levelsGained}!</p>}

        {result.loot.length > 0 && (
          <>
            <div className="section-heading">Loot</div>
            {result.loot.map((item) => (
              <div key={item.defId} style={{ color: RARITY_COLOR[item.rarity], fontSize: 11 }}>◇ {item.name}</div>
            ))}
          </>
        )}

        {result.events.length > 0 && (
          <>
            <div className="section-heading">On the road</div>
            {result.events.map((event) => (
              <div key={event.id} style={{ marginBottom: 6 }}>
                <div className={`small ${event.kind === 'positive' ? 'good' : event.kind === 'negative' ? 'bad' : ''}`}>
                  {event.name}
                </div>
                <div className="tiny muted">{event.description}</div>
              </div>
            ))}
          </>
        )}

        {(result.injury || result.brokenItems.length > 0) && (
          <>
            <div className="section-heading">Damage report</div>
            {result.injury && (
              <div className="small bad">{result.injury.name} — {result.injury.description}</div>
            )}
            {result.brokenItems.length > 0 && (
              <div className="small bad">Broken: {result.brokenItems.join(', ')}</div>
            )}
          </>
        )}

        {result.chainAdvanced && (
          <p className="small" style={{ color: 'var(--brass)' }}>
            {result.chainAdvanced.completed
              ? 'The expedition is complete. Rewards delivered to the guild.'
              : `Expedition progress: stage ${result.chainAdvanced.stage + 1} of ${result.chainAdvanced.totalStages}.`}
          </p>
        )}

        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={handleDismiss} disabled={dismissing}>
            {result.success ? 'Good work' : 'Understood'}
          </button>
        </div>

        {/* Fires once, right as the card pops out -- gold coins and an XP
            sparkle flying up off the card and fading, matched to the
            'collect' sound cue. Only shows the kinds of reward actually
            earned, so a failed quest with nothing to show doesn't get a
            coin burst it didn't earn. */}
        {dismissing && (
          <div className="collect-burst" aria-hidden="true">
            {result.gold > 0 && COIN_PARTICLES.map((p, i) => (
              <span
                key={`coin-${i}`}
                className="collect-particle coin"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ◆
              </span>
            ))}
            {result.xp > 0 && XP_PARTICLES.map((p, i) => (
              <span
                key={`xp-${i}`}
                className="collect-particle xp"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ✦
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
