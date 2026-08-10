import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GameEngine } from '../game/engine';
import { QuestResult } from '../game/types';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { playSound } from '../game/sound';
import { formatGold, RARITY_COLOR } from '../game/util';
import { RarityPill } from './RarityPill';
import { useCountUp } from './useCountUp';

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
/** Extra particles layered on top of COIN_PARTICLES/XP_PARTICLES for a
 * Critical Burst -- same fly-and-fade language, just a fuller burst so a
 * crit visibly reads as "more" rather than only the text turning gold. */
const CRIT_EXTRA_COIN_PARTICLES = [
  { dx: -80, dy: -30, rot: -30, delay: 60 },
  { dx: 80, dy: -30, rot: 30, delay: 100 },
  { dx: 0, dy: -50, rot: 0, delay: 20 },
];
/** A legendary item dropping gets its own star burst, same fly-and-fade
 * shape as the coin/XP particles but wider and slower (bigger moment,
 * bigger spread) -- fires once per result regardless of how many
 * legendary items actually dropped, since stacking multiple full bursts
 * would read as chaotic rather than special. */
const LEGENDARY_PARTICLES = [
  { dx: -70, dy: -100, rot: -20, delay: 0 },
  { dx: -30, dy: -130, rot: -8, delay: 60 },
  { dx: 10, dy: -140, rot: 4, delay: 20 },
  { dx: 50, dy: -125, rot: 14, delay: 100 },
  { dx: 85, dy: -85, rot: 26, delay: 40 },
];

/**
 * Shown when a quest resolves while the player is watching. Split into an
 * outer component that just decides whether to show anything, and an inner
 * card keyed by result.questId.
 *
 * The key matters: Auto-Chain can resolve a fresh quest (a new lastResult)
 * before the previous card's ~640ms dismiss animation finishes -- e.g. a
 * hero mid-streak finishing back to back. Without the key, React reuses the
 * same component instance across that swap, so its `dismissing` state (and
 * the pending dismiss timeout from the *previous* result) carried over onto
 * the new one: the card could get stuck faded to invisible mid-pop-out
 * while the still-fully-opaque .overlay behind it kept blocking every
 * click, with no visible dialog left to dismiss it. The key forces a full
 * unmount/remount per result instead, so a new result always starts clean,
 * and the effect below cancels any in-flight timeout from the one it
 * replaced rather than letting it fire against state it no longer owns.
 */
export function QuestResultModal({ onViewLore, onNeedsSpace }: { onViewLore?: () => void; onNeedsSpace?: () => Promise<void> | void }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const result = engine.lastResult;

  useEffect(() => {
    if (result && !settings.questResultPopups) engine.dismissResult();
  }, [result, settings.questResultPopups, engine]);

  if (!result || !settings.questResultPopups) return null;

  return <QuestResultCard key={result.questId} result={result} engine={engine} onViewLore={onViewLore} onNeedsSpace={onNeedsSpace} />;
}

function QuestResultCard({ result, engine, onViewLore, onNeedsSpace }: {
  result: QuestResult; engine: GameEngine; onViewLore?: () => void; onNeedsSpace?: () => Promise<void> | void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const hasLegendary = result.loot.some((item) => item.rarity === 'legendary');
  // One-shot count-up from 0 -- this card mounts once per result with the
  // final reward already known, so it should count up to it on arrival
  // rather than appearing pre-finished. Slightly longer than the default
  // duration so it doesn't finish before the card's own pop-in animation
  // does.
  const displayGold = useCountUp(result.gold, { from: 0, durationMs: 700 });
  const displayXp = useCountUp(result.xp, { from: 0, durationMs: 700 });

  // This card renders full detail regardless of whether the idle
  // companion window (260x300, see IDLE_SIZE in electron/main.ts) or the
  // full menu is what's showing -- unlike ChainCompleteModal/
  // RaidResultModal/HatchReadyModal, a quest result is frequent/routine
  // enough that it shouldn't be gated behind the full menu being open
  // already. But the companion window is small, and this card's content
  // (reward burst, loot list, chain/level-up text, dismiss button) can
  // easily run taller than it -- .modal's own `max-height: 100%;
  // overflow-y: auto;` then forced the player to scroll INSIDE the tiny
  // window just to reach the dismiss button, which was the reported bug.
  // Fixed the same way GuildNamingModal already requests more space:
  // `onNeedsSpace` resolves once Electron's own window resize has
  // actually finished, so the window grows to fit the card instead of the
  // card needing to shrink or scroll to fit the window. Once per result
  // (mount), not on every re-render.
  useEffect(() => {
    void onNeedsSpace?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.questId]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    playSound(result.critBonus || hasLegendary ? 'legendary_drop' : 'collect');
    timeoutRef.current = window.setTimeout(() => engine.dismissResult(), DISMISS_DELAY_MS);
  };

  const viewLore = () => {
    engine.requestTab('lore');
    onViewLore?.();
    handleDismiss();
  };

  return (
    <div className="overlay" onClick={handleDismiss}>
      <div className={`modal ${dismissing ? 'dismissing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h3>{result.heroName} is back</h3>
        <p className="small muted" style={{ marginTop: 0 }}>{result.questName}</p>

        <p className={result.success ? 'good' : 'bad'} style={{ fontSize: 12 }}>
          {result.success ? 'The contract is fulfilled.' : 'The contract failed.'}
        </p>

        <div className={`reward-burst ${result.critBonus ? 'crit' : ''}`}>
          {result.xp > 0 && <span className={`burst-xp ${result.critBonus ? 'crit' : ''}`}>+{displayXp} XP</span>}
          {result.gold > 0 && <span className={`burst-gold ${result.critBonus ? 'crit' : ''}`}>+{formatGold(displayGold)} gold</span>}
        </div>
        {result.critBonus && <p className="crit-burst-label">⚡ Critical Burst!</p>}
        {hasLegendary && <p className="legendary-drop-label">★ Legendary find!</p>}
        {result.levelsGained > 0 && <p className="good burst-levelup">Level up ×{result.levelsGained}!</p>}
        {result.dailyBurstBonus && (
          <p className="good" style={{ fontSize: '0.75rem' }}>
            ✨ First burst of the day -- reward boosted!
          </p>
        )}

        {result.loot.length > 0 && (
          <>
            <div className="section-heading">Loot</div>
            {result.loot.map((item) => (
              <div key={item.defId} className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 2 }}>
                <span
                  className={item.rarity === 'legendary' ? 'legendary-loot-name' : undefined}
                  style={{ fontSize: 11, color: RARITY_COLOR[item.rarity] }}
                >
                  {item.name}
                </span>
                <RarityPill rarity={item.rarity} />
              </div>
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

        {result.chainAdvanced?.completed && onViewLore && (
          <button className="btn-ghost" onClick={viewLore} style={{ marginBottom: 8 }}>
            View in Lore →
          </button>
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
            {result.gold > 0 && result.critBonus && CRIT_EXTRA_COIN_PARTICLES.map((p, i) => (
              <span
                key={`crit-coin-${i}`}
                className="collect-particle coin crit"
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
      </div>
    </div>
  );
}
