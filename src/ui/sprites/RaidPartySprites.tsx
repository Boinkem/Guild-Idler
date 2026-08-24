import { useMemo } from 'react';
import { HeroSprite } from './HeroSprite';
import { Hero } from '../../game/types';

/**
 * Party-size scale factor for raid sprites. Follow-up to patch 0245's own
 * "if this ever needs a scale control, it's a follow-up once there's real
 * feedback on how a 9-wide row actually looks in practice, not a guess
 * baked in up front" note -- that feedback landed: a full-height row of
 * six or nine sprites crowded the corner companion (and widened its OS
 * window well past what a corner-of-screen companion should ever ask
 * for). Stepped rather than a continuous curve -- raid party sizes are a
 * fixed set (Normal 3 / Heroic 6 / Legendary 9, RaidDef's own size
 * tiers), so a lookup matching those exact tiers reads as an intentional
 * choice rather than a formula that happens to land on the same numbers.
 * Exported so IdleView's own window-width estimate can scale by the same
 * factor it actually renders at, rather than requesting room for
 * full-height sprites that no longer exist.
 */
export function raidPartyScale(count: number): number {
  if (count <= 3) return 0.6;
  return 0.3;
}

/**
 * A row of running party-member sprites -- shared by the idle companion
 * (IdleView, gated behind Settings > Raid party view) and the Raids tab's
 * own ActiveRaidCard, so "your party is out on a raid" reads the same way
 * in both places rather than two different implementations drifting apart.
 *
 * Scaled down by party size via `raidPartyScale` (see above) -- a
 * Legendary-size (9) party renders at 30% of the passed-in `height`, a
 * Normal-size (3) party at 60%. The row still wraps/widens to fit
 * whatever it's given; scaling per-sprite just keeps a bigger party from
 * demanding more screen real estate than a smaller one for the same
 * reason a Normal party currently doesn't.
 *
 * No actual horizontal travel -- every sprite runs in place
 * (animation="run", HeroSprite's own walk fallback applies per-class same
 * as everywhere else), formation is the row layout itself, not motion.
 */
export function RaidPartySprites({
  heroes, height, className,
}: {
  heroes: Pick<Hero, 'heroClass' | 'skin' | 'name'>[];
  height: number;
  className?: string;
}) {
  const spriteHeight = Math.round(height * raidPartyScale(heroes.length));
  // One random phase per hero, generated once per party (not re-rolled on
  // every render) -- see HeroSprite's own framePhase comment for why this
  // matters: without it, every sprite in the row mounts in the same React
  // commit and shares the same per-animation frame rate, so they'd all
  // step through identical frames in lockstep and the row would read as
  // one sprite copy-pasted several times rather than several individuals
  // running together.
  const phases = useMemo(
    () => heroes.map(() => Math.random()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heroes.length],
  );

  if (heroes.length === 0) return null;

  return (
    <div className={`raid-party-row ${className ?? ''}`}>
      {heroes.map((hero, i) => (
        <HeroSprite
          key={`${hero.name}-${i}`}
          heroClass={hero.heroClass}
          skin={hero.skin}
          animation="run"
          height={spriteHeight}
          framePhase={phases[i]}
          title={hero.name}
          className="raid-party-sprite"
        />
      ))}
    </div>
  );
}
