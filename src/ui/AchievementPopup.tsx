import { useEffect } from 'react';
import { useEngine } from './useEngine';

const AUTO_DISMISS_MS = 4500;

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
      <span className="achievement-popup-glyph" aria-hidden="true">✦</span>
      <div className="achievement-popup-body">
        <div className="achievement-popup-kicker">Achievement Unlocked</div>
        <div className="achievement-popup-name">{achievement.name}</div>
        <div className="achievement-popup-desc">{achievement.description}</div>
      </div>
    </div>
  );
}
