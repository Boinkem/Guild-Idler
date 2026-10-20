import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { vendorRepLevel } from '../game/data/vendorRep';
import { formatGold } from '../game/util';
import { fxMs, fxSpeed } from './purchaseFx';

/**
 * Patch 0425 -- vendor reputation moments (Design canvas "Vendor
 * reputation level", signed off). Every purchase tops the rep ring up a
 * little (ReputationRing animates that itself); crossing a level makes
 * the ring burst and roll its number, the vendor hops with a line, the
 * "% off" badge pops and every price on the page that actually dropped
 * ticks down. Past the discount cap the level keeps climbing as pure
 * fame: the burst still plays, but no price moves, so nothing ticks.
 */

/** A fresh key while a rep level-up is playing (only on a real increase
 *  watched on screen, never on mount), else null. */
export function useRepLevelUp(goldSpent: number, ms = 2400): number | null {
  const level = vendorRepLevel(goldSpent);
  const prev = useRef(level);
  const [active, setActive] = useState<number | null>(null);
  const timer = useRef<number>();
  useEffect(() => {
    if (level > prev.current && fxSpeed() > 0) {
      // Lands with the ring's own burst (it waits for the gold motes).
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setActive(Date.now());
        timer.current = window.setTimeout(() => setActive(null), fxMs(ms));
      }, fxMs(800));
    }
    prev.current = level;
  }, [level, ms]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return active;
}

/** What the vendor says when your reputation with them goes up. */
export const REP_LINES = [
  "You're a regular now.",
  'Back again? Good.',
  "I'll knock a bit off for you.",
  'Best customer this month.',
  'Word gets around. Good word.',
];

/**
 * A price that, when it drops while on screen, shows the old figure struck
 * through rolling away and the new one rolling in, with a small green
 * "-N%" chip. Rises and first renders just show the number.
 */
export function PriceTag({ value }: { value: number }) {
  const prev = useRef(value);
  const [drop, setDrop] = useState<{ was: number; pct: number; key: number; rolling: boolean } | null>(null);
  const timer = useRef<number>();
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (!(value < before && before > 0 && fxSpeed() > 0)) return;
    // Hold the old price until the rep ring bursts, then roll it down.
    setDrop({ was: before, pct: Math.max(1, Math.round((1 - value / before) * 100)), key: Date.now(), rolling: false });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setDrop((d) => d && { ...d, rolling: true });
      timer.current = window.setTimeout(() => setDrop(null), fxMs(1500));
    }, fxMs(1050));
  }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!drop) return <span className="repx-price">{formatGold(value)}</span>;
  if (!drop.rolling) return <span className="repx-price">{formatGold(drop.was)}</span>;
  return (
    <span className="repx-price repx-drop fx-price" key={drop.key}>
      <span className="repx-was">{formatGold(drop.was)}</span>
      <span className="repx-now">{formatGold(value)}</span>
      <span className="repx-off">−{drop.pct}%</span>
    </span>
  );
}
