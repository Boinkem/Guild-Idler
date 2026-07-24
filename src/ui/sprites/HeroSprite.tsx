import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { HeroClass } from '../../game/types';
import { KNIGHT_STAND, PixelSprite, WALK_CYCLE } from './PixelSprite';
import { HERO_CLASSES } from '../../game/data/progression';

/**
 * Renders the licensed knight sprite pack.
 *
 * The art is not committed to the repository, so this component degrades to the
 * built-in generated sprites when the sheets are missing. A fresh clone still
 * runs; installing the pack simply upgrades the visuals.
 *
 * Install with:
 *   python3 tools/recolor.py --src <pack folder> --out public/heroes
 */

export type HeroAnimation =
  | 'idle' | 'walk' | 'run' | 'jump' | 'defend' | 'hurt' | 'death'
  | 'attack_1' | 'attack_2' | 'attack_3';

/** Frame counts, from the sheets as shipped. */
export const ANIMATION_FRAMES: Record<HeroAnimation, number> = {
  idle: 7, walk: 8, run: 8, jump: 5, defend: 6, hurt: 4, death: 12,
  attack_1: 6, attack_2: 5, attack_3: 6,
};

/** Frame size after tools/recolor.py crops away the empty margins. */
export const FRAME_W = 64;
export const FRAME_H = 46;

const DEFAULT_FPS: Partial<Record<HeroAnimation, number>> = {
  idle: 7, walk: 10, run: 14, hurt: 6, death: 8, defend: 8,
  attack_1: 12, attack_2: 12, attack_3: 12,
};

function sheetUrl(heroClass: HeroClass, animation: HeroAnimation): string {
  return `./heroes/${heroClass}/${animation}.png`;
}

/** Module-level cache so each sheet is probed once per session. */
const probeCache = new Map<string, boolean>();

function useSheet(url: string): 'loading' | 'ready' | 'missing' {
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(
    () => (probeCache.has(url) ? (probeCache.get(url) ? 'ready' : 'missing') : 'loading'),
  );

  useEffect(() => {
    if (probeCache.has(url)) {
      setState(probeCache.get(url) ? 'ready' : 'missing');
      return;
    }
    let live = true;
    const img = new Image();
    img.onload = () => {
      probeCache.set(url, true);
      if (live) setState('ready');
    };
    img.onerror = () => {
      probeCache.set(url, false);
      if (live) setState('missing');
    };
    img.src = url;
    return () => { live = false; };
  }, [url]);

  return state;
}

export interface HeroSpriteProps {
  heroClass: HeroClass;
  animation?: HeroAnimation;
  scale?: number;
  fps?: number;
  /** Play once and stop on the last frame instead of looping. */
  once?: boolean;
  onComplete?: () => void;
  flip?: boolean;
  className?: string;
  title?: string;
}

export function HeroSprite({
  heroClass,
  animation = 'idle',
  scale = 3,
  fps,
  once = false,
  onComplete,
  flip = false,
  className,
  title,
}: HeroSpriteProps) {
  const url = sheetUrl(heroClass, animation);
  const status = useSheet(url);
  const frames = ANIMATION_FRAMES[animation];
  const rate = fps ?? DEFAULT_FPS[animation] ?? 10;
  const [index, setIndex] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    setIndex(0);
    doneRef.current = false;
  }, [animation, heroClass]);

  useEffect(() => {
    if (status !== 'ready') return;
    const id = window.setInterval(() => {
      setIndex((current) => {
        const next = current + 1;
        if (next >= frames) {
          if (once) {
            if (!doneRef.current) {
              doneRef.current = true;
              onComplete?.();
            }
            return frames - 1;
          }
          return 0;
        }
        return next;
      });
    }, 1000 / rate);
    return () => window.clearInterval(id);
  }, [status, frames, rate, once, onComplete]);

  const style = useMemo<CSSProperties>(() => ({
    width: FRAME_W * scale,
    height: FRAME_H * scale,
    backgroundImage: `url(${url})`,
    backgroundSize: `${FRAME_W * frames * scale}px ${FRAME_H * scale}px`,
    backgroundPosition: `-${index * FRAME_W * scale}px 0`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    transform: flip ? 'scaleX(-1)' : undefined,
  }), [url, frames, index, scale, flip]);

  if (status === 'missing') {
    // Generated fallback art, so the game is never blank.
    const palette = HERO_CLASSES[heroClass].palette;
    const frame = animation === 'walk' || animation === 'run'
      ? WALK_CYCLE[index % WALK_CYCLE.length]
      : KNIGHT_STAND;
    return <PixelSprite frame={frame} scale={Math.max(1, Math.round(scale * 1.4))} colors={palette} title={title} />;
  }

  if (status === 'loading') {
    return <div className={className} style={{ width: FRAME_W * scale, height: FRAME_H * scale }} />;
  }

  return (
    <div
      className={className}
      style={style}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    />
  );
}
