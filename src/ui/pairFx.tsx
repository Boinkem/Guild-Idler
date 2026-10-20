import type { Hero, Pet } from '../game/types';
import { HeroSprite } from './sprites/HeroSprite';
import { PetSprite } from './sprites/PetSprite';
import { at } from './resultFx';

/**
 * Patch 0428 -- pairing a pet with a hero (Design canvas "Pairing a pet
 * with a hero", signed off). Played as a short stage over the top of the
 * pet's Hatchery card:
 *
 *  - an outgoing hero (unpair, or a swap) says "See you!" and walks off;
 *  - an incoming hero walks in from the right and stops beside the pet,
 *    the pet hops, a heart pops, a dotted tether draws between them and a
 *    PAIRED ribbon drops (the card's happiness bar wakes up as well, see
 *    HatcheryPanel).
 *
 * Purely a timeline (`at()` delays), re-keyed per change; the card removes
 * it once `pairFxDuration` has passed. Never mounted with motion off.
 */
export interface PairFx { key: number; from: Hero | null; to: Hero | null }

const LEAVE_MS = 1000;

export function pairFxDuration(fx: PairFx): number {
  return (fx.from ? LEAVE_MS : 0) + (fx.to ? 2500 : 300);
}

export function PairStage({ fx, pet, species }: { fx: PairFx; pet: Pet; species: string }) {
  const t0 = fx.from ? LEAVE_MS : 0;
  return (
    <div className="ppx-stage fx-pair" key={fx.key} aria-hidden="true">
      <span className="ppx-ground" />
      <span className={`ppx-pet ${fx.to ? 'hop' : ''}`} style={fx.to ? at(t0 + 700) : undefined}>
        <PetSprite species={species} rarity={pet.rarity} animation="idle" height={56} />
      </span>
      {fx.from && (
        <>
          <span className="ppx-bye" style={at(0)}>See you!</span>
          <span className="ppx-hero leave" style={at(300)}>
            <HeroSprite heroClass={fx.from.heroClass} skin={fx.from.skin} animation="walk" height={56} />
          </span>
        </>
      )}
      {fx.to && (
        <>
          <span className="ppx-hero arrive" style={at(t0)}>
            <span className="ppx-walking" style={at(t0 + 700)}>
              <HeroSprite heroClass={fx.to.heroClass} skin={fx.to.skin} animation="walk" height={56} flip />
            </span>
            <span className="ppx-standing" style={at(t0 + 700)}>
              <HeroSprite heroClass={fx.to.heroClass} skin={fx.to.skin} animation="idle" height={56} flip />
            </span>
          </span>
          <span className="ppx-tether" style={at(t0 + 850)} />
          <svg className="ppx-heart" style={at(t0 + 800)} viewBox="0 0 22 20" fill="currentColor">
            <path d="M11 19C5 14 1 10.5 1 6.5 1 3.5 3.4 1 6.3 1c2 0 3.7 1.1 4.7 2.8C12 2.1 13.7 1 15.7 1 18.6 1 21 3.5 21 6.5 21 10.5 17 14 11 19z" />
          </svg>
          <span className="ppx-ribbon" style={at(t0 + 1000)}>Paired with {fx.to.name}</span>
        </>
      )}
    </div>
  );
}
