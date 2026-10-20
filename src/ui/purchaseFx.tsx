import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameEngine } from '../game/engine';
import { formatGold } from '../game/util';
import { getFlyTargetCenter } from './flyTarget';
import waxSealComplete from '../assets/wax-seal-complete.png';

/**
 * Patch 0420 -- shared purchase feedback for the Guild Hall rows, the
 * vendor level-up and recruiting (mocked up and signed off on the Design
 * canvas first). Three pieces, all opt-in per call site:
 *
 *  1. `buyWithFx` -- wraps an engine purchase, diffs gold/scrap before and
 *     after, and only if something was actually spent flies coins (and
 *     silver Scrap shards) from the header's 'gold'/'scrap' fly targets
 *     into the button that was clicked, with a red "-cost" drifting off
 *     the counter. Imperative, on a body-level fixed layer, so it survives
 *     the button unmounting (a modal closing on purchase) and never
 *     touches React state.
 *  2. `usePurchaseBeats` -- the per-row timeline. The engine applies a
 *     purchase instantly; this holds the *displayed* value at the old
 *     level for the coin flight (`press`), then plays the level-up
 *     (`levelup`), and on a final level the wax-seal stamp (`stamp`) and
 *     optionally the file-away (`file`). Same "not on mount, only on a
 *     real change" rule usePulsesOnChange already follows, so a tab switch
 *     never replays anything.
 *  3. Small render helpers (`LevelRoll`, `SealStamp`) so each surface
 *     shares the exact same markup the CSS (.fx-* in app.css) expects.
 *
 * Timing follows Settings > Animation speed through `fxMs`, the JS twin
 * of the `--fx-t` CSS unit. With Reduce motion on (speed 0) nothing here
 * runs at all: no particles, and beats are skipped, so rows simply show
 * their new state exactly as they did before this patch.
 */

/** Current Settings > Animation speed (0 when Reduce motion is on), read
 *  from the same --anim-speed custom property Settings.apply writes. */
export function fxSpeed(): number {
  if (typeof document === 'undefined') return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--anim-speed').trim();
  const n = Number(raw);
  return raw === '' || !Number.isFinite(n) ? 1 : n;
}

/** A 1x-speed duration scaled by the current animation speed; 0 when motion is off. */
export function fxMs(ms: number): number {
  const s = fxSpeed();
  return s <= 0 ? 0 : ms / s;
}

let layer: HTMLDivElement | null = null;
function fxLayer(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export type FlyKind = 'coin' | 'shard' | 'gem' | 'spark';
const FLY_CLASS: Record<FlyKind, string> = { coin: 'fx-coin', shard: 'fx-shard', gem: 'fx-gem', spark: 'fx-spark' };

type FlyPoint = Element | string | { x: number; y: number };
function pointOf(target: FlyPoint): { x: number; y: number } | null {
  if (typeof target === 'string') return getFlyTargetCenter(target);
  if (target instanceof Element) return centerOf(target);
  return target;
}

/**
 * Patch 0424 -- tokens arcing between any two points: an element, or a
 * flyTarget.ts key ('gold', 'scrap', 'renown', 'inventory'...). Coins for
 * gold, shards for scrap, violet gems for renown, blue sparks for Guild
 * Power. Generalised from 0420's counter-to-button flight so rewards can
 * fly the other way (a mailbox letter to its counter).
 */
export function flyTokens(from: FlyPoint, to: FlyPoint, kind: FlyKind, count: number, startDelay = 0) {
  const dur = fxMs(420);
  const host = fxLayer();
  const a = pointOf(from);
  const b = pointOf(to);
  if (!dur || !host || !a || !b || typeof Element.prototype.animate !== 'function') return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = FLY_CLASS[kind];
    const sx = a.x + ((i % 3) - 1) * 7;
    const sy = a.y + (i % 2 ? 4 : -3);
    const dx = b.x + ((i % 3) - 1) * 7 - sx;
    const dy = b.y + ((i * 7) % 5) - 2 - sy;
    p.style.left = `${sx}px`;
    p.style.top = `${sy}px`;
    host.appendChild(p);
    const lift = Math.min(60, 24 + Math.abs(dy) * 0.2);
    const anim = p.animate([
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.2 },
      { transform: `translate(calc(-50% + ${dx * 0.3}px), calc(-50% + ${dy * 0.2 - lift}px)) scale(1)`, opacity: 1, offset: 0.4 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.85)`, opacity: 1 },
    ], { duration: dur, delay: startDelay + fxMs(i * 45), easing: 'cubic-bezier(.3,0,.7,1)', fill: 'backwards' });
    anim.onfinish = () => p.remove();
    anim.oncancel = () => p.remove();
  }
}

/** Coins (or Scrap shards) arcing from a registered fly target into `toEl`. */
function flyParticles(fromKey: string, toEl: Element, kind: FlyKind, count: number, startDelay: number) {
  flyTokens(fromKey, toEl, kind, count, startDelay);
}

/** A red "-amount" drifting down off a header counter. */
function floatOff(fromKey: string, text: string) {
  const dur = fxMs(900);
  const host = fxLayer();
  const from = getFlyTargetCenter(fromKey);
  if (!dur || !host || !from || typeof Element.prototype.animate !== 'function') return;
  const f = document.createElement('span');
  f.className = 'fx-floater';
  f.textContent = text;
  f.style.left = `${from.x}px`;
  f.style.top = `${from.y + 8}px`;
  host.appendChild(f);
  const anim = f.animate([
    { transform: 'translate(-50%, -4px)', opacity: 0 },
    { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.15 },
    { transform: 'translate(-50%, 16px)', opacity: 0 },
  ], { duration: dur, easing: 'ease-out' });
  anim.onfinish = () => f.remove();
  anim.oncancel = () => f.remove();
}

/**
 * Runs `action` (an engine purchase) and, only if it actually spent gold
 * and/or scrap, plays the spend: coins/shards into `btn`, a floater off
 * each header counter, and a squash on the button itself. A purchase the
 * engine refused (not enough gold, already maxed) spends nothing, so
 * nothing plays.
 */
export function buyWithFx(engine: GameEngine, btn: HTMLElement | null | undefined, action: () => void) {
  const gold0 = engine.state.gold;
  const scrap0 = engine.state.scrap;
  const renown0 = engine.state.renown;
  action();
  const goldSpent = gold0 - engine.state.gold;
  const scrapSpent = scrap0 - engine.state.scrap;
  const renownSpent = renown0 - engine.state.renown;
  if (!btn || (goldSpent <= 0 && scrapSpent <= 0 && renownSpent <= 0) || fxSpeed() <= 0) return;
  // Patch 0424 -- Renown perks pay in renown: violet gems instead of coins.
  if (renownSpent > 0) {
    flyParticles('renown', btn, 'gem', 4, 0);
    floatOff('renown', `−${formatGold(renownSpent)}`);
  }
  if (goldSpent > 0) {
    flyParticles('gold', btn, 'coin', 6, 0);
    floatOff('gold', `−${formatGold(goldSpent)}`);
  }
  if (scrapSpent > 0) {
    flyParticles('scrap', btn, 'shard', 4, fxMs(90));
    floatOff('scrap', `−${formatGold(scrapSpent)}`);
  }
  if (typeof btn.animate === 'function') {
    btn.animate([
      { transform: 'scale(1)' }, { transform: 'scale(0.88)', offset: 0.35 }, { transform: 'scale(1)' },
    ], { duration: fxMs(260), easing: 'ease-out' });
  }
}

/** Crest SVG shared by the recruit card's face-down back. */
const CREST_SVG =
  '<svg width="34" height="40" viewBox="0 0 44 50" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">'
  + '<path d="M22 3l17 6v14c0 12-8 20-17 24C13 43 5 35 5 23V9z"/><path d="M14 16l16 16M30 16L14 32"/></svg>';

/**
 * A face-down guild card lifting off `from` (a rect captured before the
 * source unmounted) and growing into `toEl`'s box. Resolves when it lands
 * (immediately if motion is off or there's nothing to fly between).
 */
export function flyCard(from: DOMRect | null, toEl: HTMLElement | null): Promise<void> {
  const dur = fxMs(560);
  const host = fxLayer();
  if (!dur || !host || !from || !toEl || typeof Element.prototype.animate !== 'function') return Promise.resolve();
  const to = toEl.getBoundingClientRect();
  const card = document.createElement('div');
  card.className = 'fx-card-back';
  card.innerHTML = CREST_SVG;
  host.appendChild(card);
  const startW = 64, startH = 86;
  const sx = from.left + from.width / 2 - startW / 2;
  const sy = from.top - startH / 2;
  const anim = card.animate([
    { left: `${sx}px`, top: `${sy}px`, width: `${startW}px`, height: `${startH}px`, transform: 'rotate(-6deg) scale(0.8)', opacity: 0.6 },
    { left: `${(sx + to.left) / 2}px`, top: `${Math.min(sy, to.top) - 40}px`, width: `${(startW + to.width) / 2}px`, height: `${(startH + to.height) / 2}px`, transform: 'rotate(-2deg) scale(1)', opacity: 1, offset: 0.5 },
    { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, transform: 'rotate(0) scale(1)', opacity: 1 },
  ], { duration: dur, easing: 'cubic-bezier(.35,0,.25,1)', fill: 'forwards' });
  return new Promise((resolve) => {
    const done = () => { card.remove(); resolve(); };
    anim.onfinish = done;
    anim.oncancel = done;
  });
}

export type BeatPhase = 'press' | 'levelup' | 'stamp' | 'file';
export interface Beat { phase: BeatPhase; prev: number }

/** Phase lengths at 1x speed, in ms. `file: 0` ends the beat after the
 *  stamp instead of filing the row away (the vendor card stays put). */
export interface BeatTiming { press: number; levelup: number; maxLevelup: number; stamp: number; file: number }
export const ROW_BEATS: BeatTiming = { press: 450, levelup: 950, maxLevelup: 520, stamp: 1400, file: 580 };

/**
 * Per-id purchase timeline -- see this file's header. `max` is the cap a
 * value can reach (Infinity for counters with no stamp, like the roster
 * count). Only increases start a beat; a decrease (hard reset) just
 * clears any beat in flight.
 */
export function usePurchaseBeats(
  items: { id: string; value: number; max: number }[],
  timing: BeatTiming = ROW_BEATS,
): Record<string, Beat> {
  const prevRef = useRef<Record<string, number> | null>(null);
  const timersRef = useRef<Record<string, number[]>>({});
  const [beats, setBeats] = useState<Record<string, Beat>>({});

  const set = (id: string, beat: Beat | null) => setBeats((cur) => {
    const next = { ...cur };
    if (beat) next[id] = beat; else delete next[id];
    return next;
  });
  const clearTimers = (id: string) => {
    for (const t of timersRef.current[id] ?? []) window.clearTimeout(t);
    timersRef.current[id] = [];
  };

  const signature = items.map((i) => `${i.id}:${i.value}`).join('|');
  // Layout effect, not a plain effect: the engine has already applied the
  // purchase by this render, so the old level has to be put back on screen
  // before the browser paints, or the new number flashes for a frame.
  useLayoutEffect(() => {
    const prev = prevRef.current;
    const next: Record<string, number> = {};
    for (const item of items) {
      next[item.id] = item.value;
      const before = prev?.[item.id];
      if (!prev || before === undefined || before === item.value) continue;
      clearTimers(item.id);
      if (item.value < before || fxSpeed() <= 0) { set(item.id, null); continue; }
      const id = item.id;
      const toMax = item.value >= item.max;
      const at: number[] = [];
      const later = (ms: number, fn: () => void) => at.push(window.setTimeout(fn, fxMs(ms)));
      set(id, { phase: 'press', prev: before });
      let t = timing.press;
      later(t, () => set(id, { phase: 'levelup', prev: before }));
      if (toMax) {
        t += timing.maxLevelup;
        later(t, () => set(id, { phase: 'stamp', prev: before }));
        t += timing.stamp;
        if (timing.file > 0) {
          later(t, () => set(id, { phase: 'file', prev: before }));
          t += timing.file;
        }
      } else {
        t += timing.levelup;
      }
      later(t, () => set(id, null));
      timersRef.current[id] = at;
    }
    prevRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => () => {
    for (const id of Object.keys(timersRef.current)) clearTimers(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return beats;
}

/** The value a beat-aware display should show right now -- the old one
 *  while the coins are still in the air. */
export function shownValue(beat: Beat | undefined, value: number): number {
  return beat?.phase === 'press' ? beat.prev : value;
}

/** Odometer roll from the old value to the new one, with a "+N" ember. */
export function LevelRoll({ beat, value, render }: { beat?: Beat; value: number; render: (v: number) => ReactNode }) {
  const rolling = beat?.phase === 'levelup';
  const shown = shownValue(beat, value);
  return (
    <span className={`fx-roll-wrap ${rolling ? 'rolling' : ''}`}>
      <span className="fx-roll">
        <span className="fx-roll-old" aria-hidden="true">{render(beat?.prev ?? value)}</span>
        <span className="fx-roll-new">{render(shown)}</span>
      </span>
      {rolling && beat && <span className="fx-ember" aria-hidden="true">+{value - beat.prev}</span>}
    </span>
  );
}

/** The wax seal slamming down, with its ring, wax specks and ink label.
 *  Positioned by the caller through `className` (an anchor point; the
 *  pieces are centred on it). */
export function SealStamp({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`fx-seal-anchor ${className ?? ''}`} aria-hidden="true">
      <span className="fx-seal-ring" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <span key={i} className="fx-speck" style={{ transform: `rotate(${-80 + i * 46}deg)` }}><i /></span>
      ))}
      <span className="fx-seal-ink">{label}</span>
      <img className="fx-seal-img" src={waxSealComplete} alt="" />
    </span>
  );
}

/**
 * Patch 0421 -- the ids whose tracked value just went UP (an item became
 * owned, a level rose, happiness was topped up), each held for `ms` (1x,
 * scaled by animation speed) so a one-off CSS moment can play on it. Same
 * "never on mount, only a real change you watched happen" rule as
 * usePurchaseBeats. Returns a fresh key per change so a repeat purchase
 * inside the window can remount the effect. Empty when motion is off.
 */
export function useRecentIncrease(items: { id: string; value: number }[], ms: number): Record<string, number> {
  const prevRef = useRef<Record<string, number> | null>(null);
  const timers = useRef<Record<string, number>>({});
  const [active, setActive] = useState<Record<string, number>>({});
  const signature = items.map((i) => `${i.id}:${i.value}`).join('|');
  useLayoutEffect(() => {
    const prev = prevRef.current;
    const next: Record<string, number> = {};
    for (const item of items) {
      next[item.id] = item.value;
      const before = prev?.[item.id];
      if (!prev || before === undefined || item.value <= before || fxSpeed() <= 0) continue;
      const id = item.id;
      window.clearTimeout(timers.current[id]);
      setActive((cur) => ({ ...cur, [id]: Date.now() + Math.random() }));
      timers.current[id] = window.setTimeout(() => setActive((cur) => {
        const rest = { ...cur };
        delete rest[id];
        return rest;
      }), fxMs(ms));
    }
    prevRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => () => { for (const t of Object.values(timers.current)) window.clearTimeout(t); }, []);
  return active;
}

/**
 * Patch 0421 -- a single item icon (an `./item-icons/` path, or a glyph
 * when there's no art yet) arcing from one element to another (or to a
 * registered fly-target key): food into a pet, a freshly forged item off
 * to the Inventory tab. Resolves on landing;
 * resolves immediately when motion is off or either end is missing.
 */
export function flyIcon(
  from: Element | { x: number; y: number } | null, to: Element | string | null,
  art: { icon?: string; glyph?: string }, opts: { duration?: number; size?: number; delay?: number } = {},
): Promise<void> {
  const dur = fxMs(opts.duration ?? 460);
  const host = fxLayer();
  if (!dur || !host || !from || !to || typeof Element.prototype.animate !== 'function') return Promise.resolve();
  // Patch 0425 -- a captured point works too (the source card may have
  // unmounted by the time the flight starts, e.g. an item just equipped).
  const a = from instanceof Element ? centerOf(from) : from;
  // A string is a flyTarget.ts key (the header gold, the Inventory tab).
  const b = typeof to === 'string' ? getFlyTargetCenter(to) : centerOf(to);
  if (!b) return Promise.resolve();
  const size = opts.size ?? 26;
  const el = document.createElement(art.icon ? 'img' : 'span');
  el.className = 'fx-icon-fly';
  if (art.icon) (el as HTMLImageElement).src = `./item-icons/${art.icon}`;
  else el.textContent = art.glyph ?? '✦';
  el.style.left = `${a.x}px`;
  el.style.top = `${a.y}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.fontSize = `${Math.round(size * 0.8)}px`;
  host.appendChild(el);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lift = Math.min(70, 30 + Math.abs(dx) * 0.15);
  const anim = el.animate([
    { transform: 'translate(-50%, -50%) scale(.6) rotate(0deg)', opacity: 0.4 },
    { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - lift}px)) scale(1.1) rotate(160deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55) rotate(320deg)`, opacity: 1 },
  ], { duration: dur, delay: fxMs(opts.delay ?? 0), easing: 'cubic-bezier(.3,0,.7,1)', fill: 'backwards' });
  return new Promise((resolve) => {
    const done = () => { el.remove(); resolve(); };
    anim.onfinish = done;
    anim.oncancel = done;
  });
}

/**
 * Patch 0424 -- lets an element that's about to unmount (a claimed
 * mailbox letter) leave on screen: a static copy is laid over it in the
 * fx layer and slides out while fading, and its wax seal (any
 * `.mfx-seal` inside) pops off. Call it before the state change that
 * removes the real element; no-op with motion off.
 */
export function ghostOut(el: HTMLElement | null, delay = 0) {
  const dur = fxMs(420);
  const host = fxLayer();
  if (!dur || !host || !el || typeof Element.prototype.animate !== 'function') return;
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add('fx-ghost');
  ghost.style.position = 'fixed';
  ghost.style.left = `${r.left}px`;
  ghost.style.top = `${r.top}px`;
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;
  ghost.style.margin = '0';
  host.appendChild(ghost);
  const seal = ghost.querySelector<HTMLElement>('.mfx-seal');
  seal?.animate([
    { transform: 'none', opacity: 1 },
    { transform: 'translate(18px, -30px) rotate(140deg)', opacity: 0 },
  ], { duration: fxMs(320), delay: fxMs(delay), easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both' });
  const anim = ghost.animate([
    { transform: 'none', opacity: 1 },
    { transform: 'scale(1.03)', opacity: 1, offset: 0.35 },
    { transform: 'translateX(48px) scale(.96)', opacity: 0 },
  ], { duration: dur, delay: fxMs(delay + 180), easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'both' });
  anim.onfinish = () => ghost.remove();
  anim.oncancel = () => ghost.remove();
}

/** Patch 0424 -- the row class for a purchase beat, shared by every
 *  `.upgrade-row` that adopted the 0420 beats (Harvest tools, Overseer,
 *  Renown perks...): glow + shine on the level-up, shake on the stamp. */
export function rowBeatClass(beat: Beat | undefined): string {
  if (!beat) return '';
  if (beat.phase === 'levelup') return 'fx-levelup';
  if (beat.phase === 'stamp' || beat.phase === 'file') return 'fx-stamped';
  return '';
}

/** Same row beats with no file-away: these rows stay where they are once maxed. */
export const STAY_BEATS: BeatTiming = { ...ROW_BEATS, file: 0 };
