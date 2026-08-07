import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Rarity } from '../../game/types';

/**
 * Renders pet sprite packs -- same manifest-driven, per-animation-strip
 * approach as HeroSprite.tsx, just keyed by species id instead of
 * HeroClass, and by Rarity instead of HeroSkin (a pet's rarity IS its
 * recolour tier, see tools/import_pets.py). The art itself is gitignored
 * (licensed, not redistributable), so this degrades gracefully when absent
 * -- same convention as every other art asset in this game.
 *
 * Generate the art with:
 *   python3 tools/import_pets.py --src <folder with the raw sheets> --out public/pets
 */

export type PetAnimation =
  | 'idle' | 'idle2' | 'movement' | 'sleep' | 'damage'
  | 'catch' | 'perched' | 'sitting' | 'laying' | 'eating' | 'walking' | 'flying';

interface SpeciesManifest {
  frameW: number;
  frameH: number;
  animations: Partial<Record<PetAnimation, number>>;
}

type Manifest = Record<string, SpeciesManifest>;

const DEFAULT_FPS: Partial<Record<PetAnimation, number>> = {
  idle: 6, idle2: 6, movement: 10, sleep: 4, damage: 8, catch: 10,
  perched: 5, sitting: 6, laying: 4, eating: 8, walking: 6, flying: 10,
};

let manifestCache: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;

function loadManifest(): Promise<Manifest> {
  if (manifestCache) return Promise.resolve(manifestCache);
  if (!manifestPromise) {
    manifestPromise = fetch('./pets/manifest.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: Manifest) => { manifestCache = m; return m; })
      .catch(() => { manifestCache = {}; return {}; });
  }
  return manifestPromise;
}

function useManifest(): Manifest | null {
  const [manifest, setManifest] = useState<Manifest | null>(manifestCache);
  useEffect(() => {
    if (manifestCache) { setManifest(manifestCache); return; }
    let live = true;
    void loadManifest().then((m) => { if (live) setManifest(m); });
    return () => { live = false; };
  }, []);
  return manifest;
}

/** Falls back to whichever animation the species actually has, same
 *  "nearest available" resolution HeroSprite already does for classes with
 *  a smaller animation set than the samurai's full ten. */
function resolveAnimation(char: SpeciesManifest, requested: PetAnimation): PetAnimation {
  if (char.animations[requested]) return requested;
  if ((requested === 'sitting' || requested === 'laying') && char.animations.sleep) return 'sleep';
  if (requested === 'perched' && char.animations.idle) return 'idle';
  if (requested === 'walking' && char.animations.movement) return 'movement';
  if (requested === 'flying' && char.animations.movement) return 'movement';
  if (requested === 'eating' && char.animations.catch) return 'catch';
  return char.animations.idle ? 'idle' : (Object.keys(char.animations)[0] as PetAnimation);
}

export interface PetSpriteProps {
  /** PetDef.spriteFolder -- the species id, e.g. 'ember_kit'. */
  species: string;
  rarity?: Rarity;
  animation?: PetAnimation;
  height?: number;
  fps?: number;
  once?: boolean;
  onComplete?: () => void;
  flip?: boolean;
  className?: string;
  title?: string;
  /** Fallback shown while the manifest loads or if this species has no art
   *  yet -- same "glyph until real art exists" convention as everywhere
   *  else, kept as a prop rather than baked in since callers already know
   *  their own PetDef.glyph. */
  fallback?: React.ReactNode;
}

export function PetSprite({
  species, rarity = 'common', animation = 'idle', height = 48, fps, once = false,
  onComplete, flip = false, className, title, fallback,
}: PetSpriteProps) {
  const manifest = useManifest();
  const char = manifest?.[species];

  const resolved = useMemo<PetAnimation | null>(
    () => (char ? resolveAnimation(char, animation) : null),
    [char, animation],
  );

  const frames = (resolved && char?.animations[resolved]) ?? 1;
  const rate = fps ?? (resolved ? DEFAULT_FPS[resolved] : undefined) ?? 8;
  const [index, setIndex] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => { setIndex(0); doneRef.current = false; }, [resolved, species, rarity]);

  useEffect(() => {
    if (!char || frames <= 1) return;
    const id = window.setInterval(() => {
      setIndex((cur) => {
        const next = cur + 1;
        if (next >= frames) {
          if (once) {
            if (!doneRef.current) { doneRef.current = true; onComplete?.(); }
            return frames - 1;
          }
          return 0;
        }
        return next;
      });
    }, 1000 / rate);
    return () => window.clearInterval(id);
  }, [char, frames, rate, once, onComplete]);

  if (manifest === null) {
    return <div className={className} style={{ height, width: height }} />;
  }

  if (!char || !resolved) {
    return <div className={className} style={{ height, width: height, display: 'grid', placeItems: 'center' }}>{fallback}</div>;
  }

  const scale = height / char.frameH;
  const url = `./pets/${species}/${rarity}/${resolved}.png`;
  const style: CSSProperties = {
    width: char.frameW * scale,
    height: char.frameH * scale,
    backgroundImage: `url(${url})`,
    backgroundSize: `${char.frameW * frames * scale}px ${char.frameH * scale}px`,
    backgroundPosition: `-${index * char.frameW * scale}px 0`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    transform: flip ? 'scaleX(-1)' : undefined,
  };

  return (
    <div className={className} style={style} role={title ? 'img' : 'presentation'} aria-label={title} />
  );
}

/** A standalone single-frame extra (crow's crumbs/food/fish) -- not an
 *  animation, just one recoloured frame. Same manifest/fallback shape,
 *  minus everything animation-specific. */
export function PetExtraSprite({
  species, rarity = 'common', extra, size = 16, className,
}: { species: string; rarity?: Rarity; extra: string; size?: number; className?: string }) {
  const manifest = useManifest();
  const char = manifest?.[species];
  if (!char) return null;
  const scale = size / char.frameH;
  return (
    <div
      className={className}
      style={{
        width: char.frameW * scale, height: char.frameH * scale,
        backgroundImage: `url(./pets/${species}/${rarity}/extra_${extra}.png)`,
        backgroundSize: 'contain', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
      }}
    />
  );
}
