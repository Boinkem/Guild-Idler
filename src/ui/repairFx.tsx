import { useEffect, useRef, useState } from 'react';
import type { GameEngine } from '../game/engine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { buyWithFx, flyIcon, fxMs, fxSpeed } from './purchaseFx';

/**
 * Patch 0425 -- the repair moment (Design canvas "Repairing gear", signed
 * off). The engine repairs instantly; this replays it on the cards you
 * can see:
 *
 *  - gold and Scrap fly into the button (buyWithFx);
 *  - a wrench hops from card to card, most-worn first, and each card's
 *    durability bar refills from where it was with a glint while the
 *    number counts up, with a small clank;
 *  - a piece that was broken gets its colour back with a RESTORED tag.
 *
 * Cards you can't see (another hero's gear) are simply repaired. With
 * motion off nothing replays. Auto-repair has its own lighter treatment
 * in EquipmentPanel (a glint on the card, the wrench spinning on the
 * Auto-repair row), since nothing was clicked.
 */
export interface RepairFxState {
  /** Durability currently shown per item uid while the replay runs. */
  shown: Record<string, number>;
  fill: string[];
  clank: string[];
  restored: string[];
}

const HOP = 330;
const STEPS = 8;

function durabilityOf(engine: GameEngine): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { item } of EquipmentManager.allItems(engine.state)) out[item.uid] = item.durability;
  return out;
}

export function useRepairFx(engine: GameEngine) {
  const [fx, setFx] = useState<RepairFxState | null>(null);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, fxMs(ms))); };
  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => clear, []);

  const run = (action: () => void, btn?: HTMLElement | null) => {
    const before = durabilityOf(engine);
    // Only cards actually on screen take part in the replay.
    const onScreen = new Set<string>();
    document.querySelectorAll<HTMLElement>('[data-dura-uid]').forEach((el) => { if (el.dataset.duraUid) onScreen.add(el.dataset.duraUid); });

    if (btn) buyWithFx(engine, btn, action); else action();

    const after = durabilityOf(engine);
    const fixed = Object.keys(after)
      .filter((uid) => onScreen.has(uid) && before[uid] !== undefined && after[uid] > before[uid])
      .sort((a, b) => {
        const item = (uid: string) => EquipmentManager.allItems(engine.state).find((e) => e.item.uid === uid)?.item;
        const ra = before[a] / Math.max(1, EquipmentManager.maxDurability(item(a)!));
        const rb = before[b] / Math.max(1, EquipmentManager.maxDurability(item(b)!));
        return ra - rb;
      });
    if (fixed.length === 0 || fxSpeed() <= 0) return;

    clear();
    const shown: Record<string, number> = {};
    for (const uid of fixed) shown[uid] = before[uid];
    setFx({ shown, fill: [], clank: [], restored: [] });

    let prev: Element | null = btn ?? null;
    const t0 = btn ? 420 : 0;
    fixed.forEach((uid, i) => {
      const at = t0 + i * HOP;
      const from = before[uid];
      const to = after[uid];
      later(at, () => {
        const card = document.querySelector(`[data-dura-uid="${uid}"]`);
        void flyIcon(prev, card, { glyph: '⚒' }, { size: 24, duration: 260 });
        prev = card;
      });
      later(at + 260, () => setFx((f) => f && ({ ...f, fill: [...f.fill, uid], clank: [...f.clank, uid] })));
      for (let s = 1; s <= STEPS; s++) {
        later(at + 260 + s * 60, () => setFx((f) => f && ({ ...f, shown: { ...f.shown, [uid]: Math.round(from + (to - from) * (s / STEPS)) } })));
      }
      later(at + 520, () => setFx((f) => f && ({
        ...f, clank: f.clank.filter((u) => u !== uid), restored: from === 0 ? [...f.restored, uid] : f.restored,
      })));
      later(at + 1000, () => setFx((f) => f && ({ ...f, fill: f.fill.filter((u) => u !== uid) })));
    });
    later(t0 + (fixed.length - 1) * HOP + 1800, () => setFx(null));
  };

  return { fx, run };
}
