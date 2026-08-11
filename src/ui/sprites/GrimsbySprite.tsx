import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Renders Grimsby's own sprite pack -- same manifest-driven, per-
 * animation-strip approach as VendorSprite/PetSprite, just for a single
 * character with no species/rarity axis (there's only one Grimsby). Art
 * lives at public/peddler/<animation>.png, gitignored/licensed same as
 * every other sprite pack in this game -- degrades to nothing rather
 * than a broken image if absent.
 */

export type GrimsbyAnimation = 'idle' | 'idle2' | 'wave' | 'approval' | 'dialogue';

interface GrimsbyManifest {
  frameW: number;
  frameH: number;
  animations: Partial<Record<GrimsbyAnimation, number>>;
}

const DEFAULT_FPS: Record<GrimsbyAnimation, number> = {
  idle: 6, idle2: 5, wave: 10, approval: 8, dialogue: 8,
};

let manifestCache: GrimsbyManifest | null = null;
let manifestPromise: Promise<GrimsbyManifest | null> | null = null;

function loadManifest(): Promise<GrimsbyManifest | null> {
  if (manifestCache) return Promise.resolve(manifestCache);
  if (!manifestPromise) {
    manifestPromise = fetch('./peddler/manifest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: GrimsbyManifest | null) => {
        if (m) manifestCache = m;
        manifestPromise = null;
        return m;
      })
      .catch(() => null);
  }
  return manifestPromise;
}

export interface GrimsbySpriteProps {
  animation?: GrimsbyAnimation;
  height?: number;
  fps?: number;
  /** Plays the animation once and calls onComplete instead of looping --
   *  for the arrival wave / card-spawn gesture, which shouldn't repeat
   *  indefinitely the way the idle loops do. */
  once?: boolean;
  onComplete?: () => void;
  flip?: boolean;
  className?: string;
  title?: string;
}

export function GrimsbySprite({
  animation = 'idle', height = 96, fps, once = false, onComplete, flip = false, className, title,
}: GrimsbySpriteProps) {
  const [manifest, setManifest] = useState<GrimsbyManifest | null>(manifestCache);

  useEffect(() => {
    if (manifest) return;
    let live = true;
    void loadManifest().then((m) => { if (live) setManifest(m); });
    return () => { live = false; };
  }, [manifest]);

  // Falls back to 'idle' if the requested animation isn't in the
  // manifest (e.g. art for a newer animation hasn't landed yet) --
  // same "nearest available" resolution PetSprite/HeroSprite already do.
  const resolved: GrimsbyAnimation | null = manifest
    ? (manifest.animations[animation] ? animation : (manifest.animations.idle ? 'idle' : null))
    : null;
  const frames = (resolved && manifest?.animations[resolved]) ?? 1;
  const rate = fps ?? (resolved ? DEFAULT_FPS[resolved] : 8);

  const [index, setIndex] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => { setIndex(0); doneRef.current = false; }, [resolved]);

  useEffect(() => {
    if (!manifest || !resolved || frames <= 1) return undefined;
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
  }, [manifest, resolved, frames, rate, once, onComplete]);

  if (!manifest || !resolved) {
    // Art absent (gitignored, licensed) or not loaded yet -- render
    // nothing rather than a broken image, same convention as every
    // other sprite in this game.
    return <div className={className} style={{ height, width: height }} title={title} />;
  }

  const scale = height / manifest.frameH;
  const style: CSSProperties = {
    width: manifest.frameW * scale,
    height: manifest.frameH * scale,
    backgroundImage: `url(./peddler/${resolved}.png)`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${index * manifest.frameW * scale}px 0`,
    backgroundSize: `${manifest.frameW * frames * scale}px ${manifest.frameH * scale}px`,
    imageRendering: 'pixelated',
    transform: flip ? 'scaleX(-1)' : undefined,
  };

  return <div className={className} style={style} role={title ? 'img' : 'presentation'} aria-label={title} />;
}
