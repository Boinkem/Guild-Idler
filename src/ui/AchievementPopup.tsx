import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';

const AUTO_DISMISS_MS = 4500;

/** Small, compact spread -- this popup is a fixed corner card (max 280px),
 *  not a full-screen modal, so the burst is scaled down to match rather
 *  than reusing one of the wider result-modal bursts. Anchored on the
 *  glyph specifically (see achievement-popup-glyph-wrap below), not the
 *  whole card, so it reads as "the star icon is doing something" rather
 *  than particles flying out from an arbitrary corner. */
const ACHIEVEMENT_BURST: { dx: number; dy: number; rot: number }[] = [
  { dx: -18, dy: -22, rot: -20 },
  { dx: 14, dy: -26, rot: 18 },
  { dx: 24, dy: -2, rot: -14 },
  { dx: -22, dy: 4, rot: 12 },
  { dx: -4, dy: 22, rot: -8 },
];

/**
 * A dedicated visual moment for achievement unlocks -- these are
 * Steam-tracked, so they deserve more weight than the plain-text toast
 * queue everything else shares. Deliberately non-blocking though: no
 * backdrop, no click-to-dismiss required, just a fixed corner card that
 * announces itself and clears on its own. An achievement is something
 * that happened, not a decision the player needs to act on, so it should
 * never interrupt play the way ChainCompleteModal/RaidResultModal do.
 *
 * Sits in the opposite corner from Toast (top-right vs. bottom-center) so
 * the two can never visually collide if both fire close together.
 */
export function AchievementPopup() {
  const engine = useEngine();
  const achievement = engine.currentAchievement;

  useEffect(() => {
    if (!achievement) return;
    const id = window.setTimeout(() => engine.dismissAchievement(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [achievement, engine]);

  if (!achievement) return null;

  return (
    <div key={achievement.id} className="achievement-popup achievement-popup-pop" role="status">
      <span className="achievement-popup-glyph-wrap" aria-hidden="true">
        <span className="achievement-popup-glyph">✦</span>
        {ACHIEVEMENT_BURST.map((s, i) => (
          <span
            key={i}
            className="achievement-popup-star"
            style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--rot': `${s.rot}deg`, animationDelay: `${120 + i * 40}ms` } as CSSProperties}
          >
            ★
          </span>
        ))}
      </span>
      <div className="achievement-popup-body">
        <div className="achievement-popup-kicker">Achievement Unlocked</div>
        <div className="achievement-popup-name">{achievement.name}</div>
        <div className="achievement-popup-desc">{achievement.description}</div>
      </div>
    </div>
  );
}
