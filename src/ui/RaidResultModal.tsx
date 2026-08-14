import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GameEngine } from '../game/engine';
import { RaidResult } from '../game/types';
import { useEngine } from './useEngine';
import { playSound } from '../game/sound';
import { RarityPill } from './RarityPill';
import { formatGold, RARITY_COLOR } from '../game/util';
import { useCountUp } from './useCountUp';
import { measureFlyOffset } from './flyTarget';

const DISMISS_DELAY_MS = 640;
/** Same dismiss timing as QuestResultModal, for the same reason -- gives the
 *  longest particle time to finish fading rather than getting cut off. */

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
/** Same legendary star burst as QuestResultModal -- raids are the single
 *  biggest time commitment in the game, so a legendary drop here deserves
 *  at least the same celebration an ordinary quest's legendary drop
 *  already gets, not less. */
const LEGENDARY_PARTICLES = [
  { dx: -70, dy: -100, rot: -20, delay: 0 },
  { dx: -30, dy: -130, rot: -8, delay: 60 },
  { dx: 10, dy: -140, rot: 4, delay: 20 },
  { dx: 50, dy: -125, rot: 14, delay: 100 },
  { dx: 85, dy: -85, rot: 26, delay: 40 },
];

/**
 * Shown when a raid resolves. Always mounted regardless of view mode, only
 * renders while `active` (menu open, properly sized) -- same reasoning as
 * every other transient result modal this session; IdleView shows a
 * compact banner instead and opens the menu on click.
 *
 * Brought up to QuestResultModal's own standard as part of a wider pass --
 * raids are the single biggest time commitment in the game and had
 * meaningfully less payoff feedback than an ordinary quest, which read as
 * backwards. Same split (outer decide-to-show, inner keyed card) and same
 * particle burst, just keyed on raidId+resolvedAt instead of a questId --
 * raids can't overlap the way Auto-Chain quests can (only one at a time,
 * hours long), so the remount-safety this key provides is cheap insurance
 * rather than a fix for a real collision case here.
 */
export function RaidResultModal({ active, onViewLore }: { active: boolean; onViewLore: () => void }) {
  const engine = useEngine();
  const result = engine.lastRaidResult;
  if (!active || !result) return null;

  return (
    <RaidResultCard key={`${result.raidId}-${result.resolvedAt}`} result={result} engine={engine} onViewLore={onViewLore} />
  );
}

function RaidResultCard({ result, engine, onViewLore }: { result: RaidResult; engine: GameEngine; onViewLore: () => void }) {
  const [dismissing, setDismissing] = useState(false);
  const rewardBurstRef = useRef<HTMLDivElement>(null);
  const [goldFlight, setGoldFlight] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const hasLegendary = result.loot.some((item) => item.rarity === 'legendary');
  // Same one-shot 0 -> final-value count-up as QuestResultModal's own,
  // for the same reason -- a raid's payoff deserves at least the same
  // treatment an ordinary quest's does, arguably more given the time
  // investment.
  const displayGold = useCountUp(result.gold, { from: 0, durationMs: 700 });
  // Gold-only (no XP flight, unlike QuestResultModal's own version) --
  // a raid's reward XP goes to the whole party (result.heroIds), not
  // one specific hero, so there's no single obvious XP bar to aim at
  // the way a solo quest result has.
  const displayXp = useCountUp(result.xp, { from: 0, durationMs: 700 });

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    playSound(hasLegendary ? 'legendary_drop' : 'collect');
    if (rewardBurstRef.current && result.gold > 0) {
      const originRect = rewardBurstRef.current.getBoundingClientRect();
      const offset = measureFlyOffset(rewardBurstRef.current, 'gold');
      if (offset) setGoldFlight({ x: originRect.left + originRect.width / 2, y: originRect.top, ...offset });
    }
    timeoutRef.current = window.setTimeout(() => engine.dismissRaidResult(), DISMISS_DELAY_MS);
  };

  const viewLore = () => {
    engine.requestTab('lore');
    onViewLore();
    handleDismiss();
  };

  return (
    <div className="overlay" onClick={handleDismiss}>
      <div
        className={`modal raid-result-modal ${result.fullClear ? 'raid-full-clear' : ''} ${dismissing ? 'dismissing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{result.raidName} — {result.difficulty[0].toUpperCase()}{result.difficulty.slice(1)}</h3>
        <p className={`small ${result.fullClear ? 'good' : result.encountersCleared > 0 ? '' : 'bad'}`} style={{ marginTop: 0 }}>
          {result.fullClear
            ? 'Full clear.'
            : result.encountersCleared > 0
              ? `Cleared ${result.encountersCleared} of ${result.totalEncounters} encounters before the party had to fall back.`
              : 'The party was turned back at the first encounter.'}
        </p>

        <div ref={rewardBurstRef} className="reward-burst">
          {result.xp > 0 && <span className="burst-xp">+{displayXp} XP</span>}
          {result.gold > 0 && <span className="burst-gold">+{formatGold(displayGold)} gold</span>}
        </div>
        {hasLegendary && <p className="legendary-drop-label">★ Legendary find!</p>}

        {result.loot.length > 0 && (
          <>
            <div className="section-heading">Loot</div>
            <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
              {result.loot.map((item, i) => (
                <span key={`${item.defId}-${i}`} className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <span
                    className={`tiny ${item.rarity === 'legendary' ? 'legendary-loot-name' : ''}`}
                    style={{ color: RARITY_COLOR[item.rarity] }}
                  >
                    {item.name}
                  </span>
                  <RarityPill rarity={item.rarity} />
                </span>
              ))}
            </div>
          </>
        )}

        {result.injuries.length > 0 && (
          <>
            <div className="section-heading">Damage report</div>
            {result.injuries.map((i) => (
              <div key={i.heroId} className="small bad">{i.heroName}: {i.injury.name}</div>
            ))}
          </>
        )}

        <div className="row end" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn-primary" onClick={handleDismiss} disabled={dismissing}>Close</button>
          <button className="btn-primary" onClick={viewLore} disabled={dismissing}>View in Lore</button>
        </div>

        {dismissing && (
          <div className="collect-burst" aria-hidden="true">
            {/* Same particle burst as QuestResultModal, same reasoning --
                only shows the kinds of reward actually earned. */}
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
            {hasLegendary && LEGENDARY_PARTICLES.map((p, i) => (
              <span
                key={`legendary-${i}`}
                className="collect-particle legendary"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ★
              </span>
            ))}
          </div>
        )}

        {dismissing && goldFlight && (
          <span
            // Flies to the header's gold display, the real measured
            // distance -- same mechanism QuestResultModal's own gold
            // flight uses, see that component for the fuller
            // explanation. Silently renders nothing if the header
            // wasn't mounted to measure against (idle mode has no
            // header).
            className="fly-particle"
            aria-hidden="true"
            style={{
              position: 'fixed', left: goldFlight.x, top: goldFlight.y,
              '--fly-dx': `${goldFlight.dx}px`, '--fly-dy': `${goldFlight.dy}px`,
              animationDuration: `${DISMISS_DELAY_MS}ms`, fontSize: '1.1rem', color: 'var(--brass)',
            } as CSSProperties}
          >
            ◆
          </span>
        )}
      </div>
    </div>
  );
}
