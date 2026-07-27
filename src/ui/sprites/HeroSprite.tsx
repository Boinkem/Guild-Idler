import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { HeroClass, HeroSkin } from '../../game/types';

/**
 * Renders the character sprite packs. Each character has its own frame size and
 * animation set, described by public/heroes/manifest.json, which this component
 * loads once at startup. The art itself is gitignored (licensed, not
 * redistributable), so everything degrades gracefully when it is absent.
 *
 * Generate the art with:
 *   python3 tools/import_characters.py --src <packs> --knight-src <knight> --out public/heroes
 */

export type HeroAnimation =
  | 'idle' | 'walk' | 'run' | 'jump' | 'defend' | 'throw' | 'hurt' | 'death'
  | 'attack_1' | 'attack_2' | 'attack_3';

interface CharManifest {
  frameW: number;
  frameH: number;
  animations: Partial<Record<HeroAnimation, number>>;
  attacks: HeroAnimation[];
}

type Manifest = Partial<Record<HeroClass, CharManifest>>;

const DEFAULT_FPS: Partial<Record<HeroAnimation, number>> = {
  idle: 6, walk: 9, run: 12, hurt: 6, death: 8, defend: 8, jump: 10,
  attack_1: 11, attack_2: 11, attack_3: 11, throw: 11,
};

/**
 * Each character's frame is cropped tight to its own bounding box across
 * every animation it has, but source packs differ wildly in how much of that
 * box the character actually fills — measured directly (idle-frame opaque
 * pixel height / frame height): gladiator and adventurer fill ~97%, knight
 * ~80%, samurai only ~62%. Rendering every class at the same target `height`
 * therefore made some visibly bigger than others despite identical code.
 *
 * This corrects the oversized ones down to match knight (the longest-tuned
 * reference). Undersized classes are deliberately left at 1 rather than
 * scaled up — inflating them risks overflowing the tiny companion window,
 * especially stacked with the user's own sprite-size setting.
 */
const HERO_DISPLAY_SCALE: Partial<Record<HeroClass, number>> = {
  gladiator: 0.83,
  adventurer: 0.83,
  wizard: 0.86,
  dwarf: 0.92,
};

/**
 * The samurai pack crops its bounding box asymmetrically -- more empty
 * margin is left on the right and bottom than the left and top, so the
 * character itself sits visibly up and to the left of center once rendered
 * at a fixed frameW x frameH box. Nudges it back toward true center; values
 * are a percentage of the sprite's own rendered width/height (positive x
 * moves right, positive y moves down).
 */
const HERO_DISPLAY_OFFSET: Partial<Record<HeroClass, { x: number; y: number }>> = {
  samurai: { x: 7, y: 5 },
};

let manifestCache: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;

function loadManifest(): Promise<Manifest> {
  if (manifestCache) return Promise.resolve(manifestCache);
  if (!manifestPromise) {
    manifestPromise = fetch('./heroes/manifest.json')
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

export interface HeroSpriteProps {
  heroClass: HeroClass;
  skin?: HeroSkin;
  animation?: HeroAnimation;
  height?: number;
  fps?: number;
  once?: boolean;
  onComplete?: () => void;
  flip?: boolean;
  className?: string;
  title?: string;
}

export function HeroSprite({
  heroClass,
  skin = 'original',
  animation = 'idle',
  height = 96,
  fps,
  once = false,
  onComplete,
  flip = false,
  className,
  title,
}: HeroSpriteProps) {
  const manifest = useManifest();
  const char = manifest?.[heroClass];

  const resolved = useMemo<HeroAnimation>(() => {
    if (!char) return animation;
    if (char.animations[animation]) return animation;
    if (animation === 'run' && char.animations.walk) return 'walk';
    if (animation.startsWith('attack') && char.attacks[0]) return char.attacks[0];
    if (animation === 'defend' && char.animations.idle) return 'idle';
    return 'idle';
  }, [char, animation]);

  const frames = char?.animations[resolved] ?? 1;
  const rate = fps ?? DEFAULT_FPS[resolved] ?? 8;
  const [index, setIndex] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => { setIndex(0); doneRef.current = false; }, [resolved, heroClass, skin]);

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

  if (!char) {
    return (
      <div
        className={className}
        style={{
          height, width: height, display: 'grid', placeItems: 'center',
          border: '1px dashed var(--panel-3)', background: 'var(--panel)',
          fontSize: Math.max(9, height / 8), color: 'var(--muted)', textTransform: 'capitalize',
        }}
        title={title ?? heroClass}
      >
        {heroClass}
      </div>
    );
  }

  const scale = (height / char.frameH) * (HERO_DISPLAY_SCALE[heroClass] ?? 1);
  const url = `./heroes/${heroClass}/${skin}/${resolved}.png`;
  const offset = HERO_DISPLAY_OFFSET[heroClass];
  const transforms: string[] = [];
  if (flip) transforms.push('scaleX(-1)');
  if (offset) transforms.push(`translate(${flip ? -offset.x : offset.x}%, ${offset.y}%)`);
  const style: CSSProperties = {
    width: char.frameW * scale,
    height: char.frameH * scale,
    backgroundImage: `url(${url})`,
    backgroundSize: `${char.frameW * frames * scale}px ${char.frameH * scale}px`,
    backgroundPosition: `-${index * char.frameW * scale}px 0`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
  };

  return (
    <div className={className} style={style} role={title ? 'img' : 'presentation'} aria-label={title} />
  );
}
