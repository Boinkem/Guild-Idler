import { useMemo } from 'react';
import { HeroSprite } from './HeroSprite';
import { Hero } from '../../game/types';

/**
 * A row of running party-member sprites -- shared by the idle companion
 * (IdleView, gated behind Settings > Raid party view) and the Raids tab's
 * own ActiveRaidCard, so "your party is out on a raid" reads the same way
 * in both places rather than two different implementations drifting apart.
 *
 * Deliberately NOT scaled down per party size (Normal/Heroic/Legendary
 * raids run 3/6/9 heroes respectively) -- standard sprite height
 * regardless of headcount, the row just gets wider for a bigger party.
 * Direct design call: the companion window already sizes itself to its
 * content rather than a fixed canvas (see CompanionBackdropId's own
 * comment in settings.ts), so widening is the natural behavior here
 * rather than fighting it with auto-shrink logic that would make a
 * Legendary party's sprites noticeably smaller than a Normal party's for
 * no reason a player asked for. If this ever needs a scale control, it's
 * a follow-up once there's real feedback on how a 9-wide row actually
 * looks in practice, not a guess baked in up front.
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
          height={height}
          framePhase={phases[i]}
          title={hero.name}
          className="raid-party-sprite"
        />
      ))}
    </div>
  );
}
