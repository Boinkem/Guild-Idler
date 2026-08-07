import { useState } from 'react';
import { Rarity } from '../game/types';

/**
 * A static (non-animated) per-rarity egg icon -- deliberately not the
 * PetSprite/manifest animation pipeline. Storage eggs are shown at rest;
 * the only egg that ever animates is whichever one is actively hatching,
 * which gets its own dedicated moment rather than spending animation
 * budget on eggs just sitting in storage (see the Pets/Hatchery status
 * writeup for this decision).
 *
 * Path convention: public/pets/egg/<rarity>/icon.png. Same "renders
 * nothing but a glyph until the file exists" fallback as every other art
 * asset in this game -- no manifest needed since there's exactly one
 * static frame per rarity, not an animation strip.
 */
export function EggIcon({ rarity, size = 40, className }: { rarity: Rarity; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={className} style={{ fontSize: size * 0.6, lineHeight: 1 }}>🥚</span>;
  }
  return (
    <img
      className={className}
      src={`./pets/egg/${rarity}/icon.png`}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated' }}
    />
  );
}
