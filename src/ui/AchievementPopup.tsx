import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { BARD_TRACK_BY_ID } from '../game/data/bard';
import { AchievementDef } from '../game/data/achievements';
import { fxMs } from './purchaseFx';

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
 *
 * Patch 0424 -- rebuilt from the Claude Design board: the toast slides in
 * from the corner, a medal drops and spins twice before settling with a
 * star burst, the "Achievement unlocked" ribbon unfurls with a shine,
 * and a reward line pops in when the achievement grants a bard track
 * (notes float up) or a guild title. A thin bar drains for its 4.5s.
 * Several unlocking together now stack down the corner a beat apart
 * (engine.visibleAchievements, up to three) instead of queueing 4.5s each.
 */

export function AchievementPopup() {
  const engine = useEngine();
  const list = engine.visibleAchievements;
  if (list.length === 0) return null;
  return (
    <div className="achievement-stack">
      {list.map((a) => <AchievementToast key={a.id} achievement={a} onDone={() => engine.dismissAchievementId(a.id)} />)}
    </div>
  );
}

function AchievementToast({ achievement, onDone }: { achievement: AchievementDef; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // Real time, not fxMs: reading time shouldn't shrink at a fast
    // animation speed. The exit slide is short and does scale.
    let done: number | undefined;
    const out = window.setTimeout(() => {
      setLeaving(true);
      done = window.setTimeout(onDone, fxMs(380));
    }, AUTO_DISMISS_MS);
    return () => { window.clearTimeout(out); if (done !== undefined) window.clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const track = achievement.unlocksTrackId ? BARD_TRACK_BY_ID[achievement.unlocksTrackId] : undefined;
  const title = achievement.grantsGuildTitle;
  return (
    <div className={`achievement-popup afx-toast ${leaving ? 'afx-leaving' : ''}`} role="status">
      <span className="afx-medal" aria-hidden="true">
        <span className="afx-ribbons" />
        <span className="afx-coin">✦</span>
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`afx-star s${i}`} />)}
      </span>
      <div className="achievement-popup-body">
        <span className="afx-kick">Achievement unlocked</span>
        <div className="achievement-popup-name afx-name">{achievement.name}</div>
        <div className="achievement-popup-desc afx-desc">{achievement.description}</div>
        {track && <div className="afx-reward track">♪ <span>New bard track: "{track.name}"</span></div>}
        {title && <div className="afx-reward title">⚑ <span>The guild is now known as {title}</span></div>}
      </div>
      {track && <><span className="afx-note n1" aria-hidden="true">♪</span><span className="afx-note n2" aria-hidden="true">♫</span></>}
      <span className="afx-timer" style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }} aria-hidden="true" />
    </div>
  );
}
