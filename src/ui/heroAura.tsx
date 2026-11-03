import type { CSSProperties } from 'react';
import type { Hero } from '../game/types';
import { HERO_CLASSES } from '../game/data/progression';
import { levelTierName } from '../game/power';
import { heroPortraitSrc, heroPortraitStyle } from './panels/HeroesPanel';

/**
 * Patch 0466 -- the hero's class portrait on the Inventory header,
 * wearing a power aura in their level tier's colour (the same tiers The
 * Guild's hero rings use: power.ts levelTierName). Common and Uncommon
 * only glow; from Rare up, lightning arcs crackle round the frame --
 * two small ones at Rare, four bigger at Epic (plus a shimmer over the
 * art), six large ones at Legendary (plus orbiting sparks, a much
 * bigger glow and outlines rippling outward). Design canvas "Guildbound
 * Ambient Motion", board G. All CSS (`.amb-aura*` in app.css), so
 * Reduce motion and the hidden-window pause both apply.
 */

const BOLT_MAIN = 'M2 12 L10 6 L16 14 L24 5 L31 13 L39 7 L46 12 L54 8';
const BOLT_ALT = 'M2 10 L9 14 L17 5 L23 12 L32 6 L38 14 L47 8 L54 11';

/** Where each arc sits round the frame (px from the stage, rotation),
 *  per tier. Sizes grow with the tier. */
const BOLTS: Record<string, { w: number; style: CSSProperties }[]> = {
  Rare: [
    { w: 56, style: { left: 8, top: 18, transform: 'rotate(-20deg)' } },
    { w: 50, style: { right: 6, bottom: 16, transform: 'rotate(160deg)' } },
  ],
  Epic: [
    { w: 70, style: { left: -2, top: 16, transform: 'rotate(-25deg)' } },
    { w: 64, style: { right: -4, top: 30, transform: 'rotate(70deg)' } },
    { w: 70, style: { right: 0, bottom: 14, transform: 'rotate(160deg)' } },
    { w: 60, style: { left: 0, bottom: 26, transform: 'rotate(250deg)' } },
  ],
  Legendary: [
    { w: 84, style: { left: -16, top: 8, transform: 'rotate(-30deg)' } },
    { w: 76, style: { right: -16, top: 12, transform: 'rotate(30deg)' } },
    { w: 84, style: { right: -20, bottom: 30, transform: 'rotate(100deg)' } },
    { w: 80, style: { left: 50, bottom: -6, transform: 'rotate(180deg)' } },
    { w: 84, style: { left: -20, bottom: 34, transform: 'rotate(260deg)' } },
    { w: 70, style: { left: 64, top: -8, transform: 'rotate(-5deg)' } },
  ],
};

export function HeroPowerPortrait({ hero }: { hero: Hero }) {
  const cls = HERO_CLASSES[hero.heroClass];
  const tier = levelTierName(hero.level);
  const bolts = BOLTS[tier] ?? [];
  const showSheen = tier === 'Epic' || tier === 'Legendary';
  return (
    <div className={`amb-aura amb-aura-${tier.toLowerCase()}`} title={`${hero.name} -- ${tier} power (level ${hero.level})`}>
      <div className="amb-aura-stage">
        <span className="amb-aura-glow" aria-hidden="true" />
        {tier === 'Legendary' && <><span className="amb-aura-ring" aria-hidden="true" /><span className="amb-aura-ring r2" aria-hidden="true" /></>}
        <div
          className="amb-aura-frame"
          role="img"
          aria-label={`${hero.name}, ${cls?.name ?? hero.heroClass}`}
          style={{ backgroundImage: `url(${heroPortraitSrc(hero.heroClass, cls?.portrait)})`, ...heroPortraitStyle(cls?.portrait) }}
        >
          {showSheen && <span className="amb-aura-sheen" aria-hidden="true" />}
        </div>
        {bolts.map((b, i) => (
          <svg
            key={`${tier}-${i}`}
            className={`amb-aura-bolt z${i + 1}`}
            width={b.w}
            height={Math.round(b.w * 0.38)}
            viewBox="0 0 56 22"
            aria-hidden="true"
            style={b.style}
          >
            <path className="main" d={BOLT_MAIN} />
            <path className="alt" d={BOLT_ALT} />
          </svg>
        ))}
        {tier === 'Legendary' && (
          <>
            <span className="amb-aura-orb" aria-hidden="true"><i /><i /></span>
            <span className="amb-aura-orb o2" aria-hidden="true"><i /><i /></span>
          </>
        )}
      </div>
      <span className="amb-aura-tier">{tier}</span>
    </div>
  );
}
