import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { HeroClass, HeroSkin } from '../../game/types';
import { DlcManager } from '../../game/managers/DlcManager';

/**
 * Renders the character sprite packs. Each character has its own frame size and
 * animation set, described by public/heroes/manifest.json, which this component
 * loads once at startup. The art itself is gitignored (licensed, not
 * redistributable), so everything degrades gracefully when it is absent.
 *
 * Generate the art with:
 *   python3 tools/import_characters.py --src <packs> --knight-src <knight> --out public/heroes
 *
 * A DLC pack can add its own hero classes the same way it adds skins/pets
 * (see DlcManager) -- its own `heroes-manifest.json`, same shape as the
 * base game's, discovered at `./dlc/<packId>/heroes-manifest.json` once
 * that pack is installed. Its sprite files live under
 * `./dlc/<packId>/heroes/<class>/<skin>/<anim>.png` -- a separate folder
 * per pack rather than merged into `./heroes/`, so two different DLC
 * packs (or a pack and the base game) can never collide on a shared
 * path. `CharManifest.basePath` below records which root a given class's
 * frames actually live under; unset means the base game's own
 * `./heroes/`, exactly as before this existed.
 */

export type HeroAnimation =
  | 'idle' | 'walk' | 'run' | 'jump' | 'defend' | 'throw' | 'hurt' | 'death'
  | 'attack_1' | 'attack_2' | 'attack_3';

interface CharManifest {
  frameW: number;
  frameH: number;
  animations: Partial<Record<HeroAnimation, number>>;
  attacks: HeroAnimation[];
  /** Root folder this class's sprite files live under -- './heroes' (the
   *  base game's own art) when unset, or './dlc/<packId>/heroes' for a
   *  class a DLC pack added. Stamped automatically when a pack's own
   *  manifest is merged in (see loadManifest below); never present in
   *  the base game's own manifest.json on disk. */
  basePath?: string;
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
 * `content_box` in tools/import_characters.py fits one shared crop box
 * across ALL of a character's animations, on purpose, so switching between
 * idle/walk/attack doesn't resize or re-anchor the sprite mid-transition.
 * The samurai has ten animations including wide attack/jump/throw poses
 * that reach further right and down than a resting stance does, so that
 * shared box is sized for the widest pose -- and idle, the calm one shown
 * on the desktop 90%+ of the time, ends up sitting in the upper-left
 * portion of a box built for a much bigger swing. A first pass at this
 * (7%, 5%) was too small to actually read as centered; this is a bigger,
 * eyeballed correction from the reported screenshot. Gated to the idle
 * pose specifically below, since action animations already fill the box
 * they defined and don't need the same push.
 */
const HERO_DISPLAY_OFFSET: Partial<Record<HeroClass, { x: number; y: number }>> = {
  samurai: { x: 16, y: 13 },
};

/**
 * Every class's `flip` prop assumes the same default facing direction in
 * its own source sheet -- unflipped plays facing away (departing/walking
 * out), flipped plays facing the viewer (returning home), matching
 * whichever way the equipped pet's own run animation faces beside it. The
 * Dwarf's source pack (and, per the same report, the Wizard's) was
 * authored facing the opposite default direction from every other class,
 * so applying the same flip logic left them facing backward relative to
 * both the other classes and the pet running next to them. Rather than
 * push this per-class quirk onto every caller of `flip` (IdleView.tsx and
 * anywhere else that ever renders a HeroSprite), it's inverted once here,
 * internally, the same "corrected in one place" shape
 * HERO_DISPLAY_SCALE/HERO_DISPLAY_OFFSET above already use for their own
 * per-class art quirks.
 *
 * Witch reported with the exact same symptom (running backward relative
 * to the pet beside her) -- same root cause, her source pack was authored
 * facing the same opposite default as Dwarf/Wizard's, so she's corrected
 * here the same way rather than needing a different fix.
 */
const HERO_REVERSED_FACING: Partial<Record<HeroClass, true>> = {
  dwarf: true,
  wizard: true,
  witch: true,
};

let manifestCache: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;

/**
 * Loads the base game's own manifest, then checks every known DLC pack
 * (see DlcManager.knownPackIds) for its own `heroes-manifest.json` in
 * parallel -- packs the player doesn't own simply won't have that file,
 * so `fetchPackAsset` resolves to null for them and they contribute
 * nothing, same as today. Any class a pack DOES provide gets its
 * `basePath` stamped to that pack's own art folder before merging, so
 * later frame-URL construction knows to look under
 * `./dlc/<packId>/heroes/...` instead of the base game's `./heroes/`.
 * A DLC class with the same id as a base class (shouldn't happen, but
 * not enforced anywhere yet) would lose to the base entry here --
 * merged with the DLC packs spread first, base game's own manifest
 * spread last and therefore taking priority, on the principle that a
 * pack should never be able to silently override base-game art.
 */
function loadManifest(): Promise<Manifest> {
  if (manifestCache) return Promise.resolve(manifestCache);
  if (!manifestPromise) {
    manifestPromise = Promise.all([
      fetch('./heroes/manifest.json').then((r) => (r.ok ? r.json() as Promise<Manifest> : {})).catch(() => ({})),
      ...DlcManager.knownPackIds().map((packId) => DlcManager.fetchPackAsset<Manifest>(packId, 'heroes-manifest.json')
        .then((packManifest) => {
          if (!packManifest) return {};
          const stamped: Manifest = {};
          for (const [classId, char] of Object.entries(packManifest)) {
            if (char) stamped[classId] = { ...char, basePath: `./dlc/${packId}/heroes` };
          }
          return stamped;
        })),
    ]).then(([base, ...packs]) => {
      const merged: Manifest = Object.assign({}, ...packs, base);
      manifestCache = merged;
      return merged;
    }).catch(() => { manifestCache = {}; return {}; });
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
  /**
   * Starting point in the animation loop, as a 0-1 fraction of the total
   * frame count -- lets several simultaneous instances of the same
   * animation (RaidPartySprites' running party row) desync from each
   * other instead of stepping through identical frames in lockstep. Every
   * instance in a row mounts in the same React commit and shares the same
   * per-animation DEFAULT_FPS, so without this they'd march in perfect
   * unison -- a party that's supposed to read as several individuals
   * running together instead reads as one sprite copy-pasted several
   * times. Ignored (always starts at frame 0) for a `once` playback -- a
   * one-shot animation (an attack flash) has a specific first frame that
   * matters, unlike a seamless loop where any starting point looks the
   * same to a viewer who wasn't watching it start.
   */
  framePhase?: number;
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
  framePhase,
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

  useEffect(() => {
    const startIndex = !once && framePhase !== undefined && frames > 1
      ? Math.floor((((framePhase % 1) + 1) % 1) * frames)
      : 0;
    setIndex(startIndex);
    doneRef.current = false;
  }, [resolved, heroClass, skin, frames, once, framePhase]);

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
  const url = `${char.basePath ?? './heroes'}/${heroClass}/${skin}/${resolved}.png`;
  const offset = resolved === 'idle' ? HERO_DISPLAY_OFFSET[heroClass] : undefined;
  // XOR, not OR/AND -- a reversed-facing class should flip exactly when a
  // normal class WOULDN'T, and vice versa, not simply flip more often.
  const effectiveFlip = HERO_REVERSED_FACING[heroClass] ? !flip : flip;
  const transforms: string[] = [];
  if (effectiveFlip) transforms.push('scaleX(-1)');
  if (offset) transforms.push(`translate(${effectiveFlip ? -offset.x : offset.x}%, ${offset.y}%)`);
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
