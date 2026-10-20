import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '../game/engine';
import { EquipSlot, EquipmentItem, Stats } from '../game/types';
import { EQUIPMENT_BY_ID, EQUIP_SLOTS, gearScoreForInstance } from '../game/data/equipment';
import { HeroManager } from '../game/managers/HeroManager';
import { flyIcon, fxMs, fxSpeed } from './purchaseFx';

/**
 * Patch 0425 -- the equip moment (mocked up on the Design canvas as
 * "Equipping gear & Equip best", signed off). The engine swaps gear
 * instantly; this replays the swap for the eye:
 *
 *  - each new piece arcs out of its stash card into its slot (the slot
 *    keeps its icon hidden until it lands), and the piece it replaced
 *    tumbles back down into its own, freshly shown, stash card;
 *  - the slot shines on landing, and for a single equip the stat changes
 *    float up green/red over it;
 *  - the Gear Score badge counts up one landing at a time (so its own
 *    tier-up flash fires on the landing that crosses the line);
 *  - "Equip best" runs every upgrade one after another, then shows a
 *    summary pill; when there's nothing better the button shakes (the
 *    engine's own toast already says why).
 *
 * Snapshot-before / diff-after, so it works for any action that changes
 * the hero's equipment. Nothing runs with motion off.
 */
export interface EquipFxState {
  key: number;
  wait: EquipSlot[];
  land: EquipSlot[];
  back: string[];
  /** Swapped-out pieces whose stash card stays hidden until they land. */
  hold: string[];
  gsShown: number;
  tick: boolean;
  deltas: Partial<Record<EquipSlot, string[]>>;
  summary: string | null;
}

const STAT_SHORT: Record<keyof Stats, string> = { strength: 'STR', endurance: 'END', luck: 'LCK', wisdom: 'WIS' };
const GAP = 300;
const FLIGHT = 460;

function centerOf(el: Element | null): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function itemScore(item: EquipmentItem | undefined): number {
  const def = item ? EQUIPMENT_BY_ID[item.defId] : undefined;
  return item && def ? gearScoreForInstance(item, def) : 0;
}

export function useEquipFx(engine: GameEngine, heroId: string) {
  const [fx, setFx] = useState<EquipFxState | null>(null);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, fxMs(ms))); };
  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => clear, []);
  // Switching hero tabs mid-run just drops the replay.
  useEffect(() => { clear(); setFx(null); }, [heroId]);

  const shake = (btn: HTMLElement | null | undefined) => {
    if (!btn || fxSpeed() <= 0 || typeof btn.animate !== 'function') return;
    btn.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-4px)', offset: 0.2 }, { transform: 'translateX(4px)', offset: 0.4 },
      { transform: 'translateX(-3px)', offset: 0.6 }, { transform: 'translateX(2px)', offset: 0.8 }, { transform: 'translateX(0)' },
    ], { duration: fxMs(360), easing: 'linear' });
  };

  const run = (action: () => unknown, kind: 'one' | 'best', btn?: HTMLElement | null) => {
    const hero0 = engine.state.heroes.find((h) => h.id === heroId);
    if (!hero0) { action(); return; }
    const before: Partial<Record<EquipSlot, EquipmentItem>> = { ...hero0.equipment };
    const stats0 = { ...HeroManager.equipmentStats(hero0) };
    const gs0 = HeroManager.gearScore(hero0);
    const from: Record<string, { x: number; y: number }> = {};
    document.querySelectorAll<HTMLElement>('[data-eq-uid]').forEach((el) => {
      const c = centerOf(el.querySelector('.item-icon') ?? el);
      if (c && el.dataset.eqUid) from[el.dataset.eqUid] = c;
    });

    action();

    const hero1 = engine.state.heroes.find((h) => h.id === heroId);
    if (!hero1) return;
    const changed = EQUIP_SLOTS.filter((s) => hero1.equipment[s] && before[s]?.uid !== hero1.equipment[s]?.uid);
    if (changed.length === 0) { if (kind === 'best') shake(btn); return; }
    if (fxSpeed() <= 0) return;

    clear();
    const stats1 = HeroManager.equipmentStats(hero1);
    const gs1 = HeroManager.gearScore(hero1);
    const lines = (Object.keys(STAT_SHORT) as (keyof Stats)[])
      .map((k) => ({ k, d: Math.round((stats1[k] ?? 0) - (stats0[k] ?? 0)) }))
      .filter((x) => x.d !== 0)
      .map((x) => `${x.d > 0 ? '+' : ''}${x.d} ${STAT_SHORT[x.k]}`);
    setFx({ key: Date.now(), wait: [...changed], land: [], back: [], hold: changed.map((s) => before[s]?.uid).filter((u): u is string => !!u), gsShown: gs0, tick: false, deltas: {}, summary: null });

    // Next frame: the DOM now shows the new loadout (icons held hidden).
    window.requestAnimationFrame(() => {
      changed.forEach((slot, i) => {
        const item = hero1.equipment[slot]!;
        const def = EQUIPMENT_BY_ID[item.defId];
        const old = before[slot];
        const oldDef = old ? EQUIPMENT_BY_ID[old.defId] : undefined;
        const slotIcon = document.querySelector(`[data-eq-slot="${slot}"] .item-icon`);
        const t0 = i * GAP;
        void flyIcon(from[item.uid] ?? null, slotIcon, { icon: def?.icon, glyph: '⚔' }, { size: 40, delay: t0 });
        const gain = itemScore(item) - itemScore(old);
        later(t0 + FLIGHT, () => {
          setFx((f) => f && ({
            ...f,
            wait: f.wait.filter((s) => s !== slot),
            land: [...f.land, slot],
            gsShown: f.gsShown + gain,
            tick: true,
            deltas: kind === 'one' ? { ...f.deltas, [slot]: lines } : f.deltas,
          }));
          if (old && oldDef) {
            const home = document.querySelector(`[data-eq-uid="${old.uid}"] .item-icon`);
            void flyIcon(slotIcon, home, { icon: oldDef.icon, glyph: '⚔' }, { size: 34, duration: 420 });
          }
        });
        if (old) {
          later(t0 + FLIGHT + 380, () => setFx((f) => f && ({
            ...f, back: [...f.back, old.uid], hold: f.hold.filter((u) => u !== old.uid),
          })));
        }
        later(t0 + FLIGHT + 320, () => setFx((f) => f && ({ ...f, tick: false })));
        later(t0 + FLIGHT + 700, () => setFx((f) => f && ({ ...f, land: f.land.filter((s) => s !== slot) })));
      });
      const end = (changed.length - 1) * GAP + FLIGHT;
      if (kind === 'best') {
        later(end + 120, () => setFx((f) => f && ({
          ...f,
          summary: `${changed.length} upgrade${changed.length === 1 ? '' : 's'} · ⛨ ${Math.round(gs0)} → ${Math.round(gs1)}`,
        })));
      }
      later(end + (kind === 'best' ? 2600 : 1600), () => setFx(null));
    });
  };

  return { fx, run };
}
