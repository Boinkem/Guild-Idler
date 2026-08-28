import { useEffect, useRef, useState } from 'react';
import { GEAR_SCORE_TIERS, gearScoreTier } from '../game/data/equipment';

/**
 * A hero's Gear Score, colour-banded the same way RarityPill colours an
 * item -- see gearScoreTier in data/equipment.ts. Fires a brief glow pulse
 * the moment the score crosses into a new tier (e.g. Rare -> Epic), same
 * "flash once on the actual moment of crossing" precedent as useMaxFlash
 * in maxFlash.tsx, just a colour pulse instead of a star burst since this
 * can happen repeatedly over a playthrough rather than once per item.
 *
 * Tracks its own previous tier via a ref rather than a shared hook --
 * each badge instance is scoped to one hero, so there's nothing to
 * coordinate across panels.
 */
export function GearScoreBadge({
  score, size = 'normal', showProgress = false,
}: {
  score: number; size?: 'small' | 'normal'; showProgress?: boolean;
}) {
  // Patch 0287: gearScoreForInstance's own /6 conversion and +N multiplier
  // (see its doc comment in data/equipment.ts) mean the raw sum handed in
  // here is essentially never a whole number -- every caller was passing
  // it straight through unrounded, so this badge could show something like
  // "⛨ 29.2123213" instead of a clean "⛨ 29". Rounded once, here, rather
  // than at each of the three call sites (EquipmentPanel/HeroesPanel x2) --
  // tier/nextTier/progress below are still computed off the exact raw
  // `score` so the progress bar and tier-crossing flash stay precise; only
  // the number actually shown to the player is rounded.
  const displayScore = Math.round(score);
  const tier = gearScoreTier(score);
  const nextTier = GEAR_SCORE_TIERS[tier.index + 1];
  const prevIndexRef = useRef<number | null>(null);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    const prev = prevIndexRef.current;
    if (prev !== null && tier.index > prev) {
      setFlashing(true);
      const id = window.setTimeout(() => setFlashing(false), 900);
      prevIndexRef.current = tier.index;
      return () => window.clearTimeout(id);
    }
    prevIndexRef.current = tier.index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier.index]);

  // Progress within the current tier band toward the next one -- omitted
  // entirely at Legendary (nothing further to progress toward).
  const progress = nextTier ? Math.min(1, (score - tier.min) / (nextTier.min - tier.min)) : 1;

  return (
    <span className="gear-score-wrap">
      <span
        className={`gear-score-badge ${size === 'small' ? 'gear-score-badge-small' : ''} ${flashing ? 'gear-score-tierup' : ''}`}
        style={{ '--gear-score-color': tier.color } as React.CSSProperties}
        title={`Gear Score ${displayScore}, ${tier.name}${nextTier ? ` (${Math.ceil(nextTier.min - score)} to ${nextTier.name})` : ' (max tier)'}`}
      >
        ⛨ {displayScore}
      </span>
      {showProgress && (
        <div className="bar gear-score-bar" title={nextTier ? `${Math.ceil(nextTier.min - score)} more to ${nextTier.name}` : 'Max tier reached'}>
          <span style={{ width: `${progress * 100}%`, background: tier.color }} />
        </div>
      )}
    </span>
  );
}
