import { useEffect, useState } from 'react';
import { ElementType, GemTier } from '../game/types';
import { ELEMENT_GLYPH } from '../game/data/elements';
import { RARITY_ORDER } from '../game/util';
import type { Rect } from './CraftingStation';
import { at } from './resultFx';
import { fxMs, fxSpeed } from './purchaseFx';

/** Patch 0424 -- one colour per element for the infuse moment's motes,
 *  rune circle and lingering glow. */
export const ELEMENT_FX_COLOR: Record<ElementType, string> = {
  fire: '#e8743a', frost: '#7cc8e8', lightning: '#e8d25a', poison: '#79c35a',
};

export interface InfuseBeat { key: number; element: ElementType; tier: GemTier; text: string }

/** Holds the current infuse beat for ~2.6s (1x), then clears it. Never
 *  starts one with motion off -- the result already shows on the item. */
export function useInfuseBeat(): [InfuseBeat | null, (b: Omit<InfuseBeat, 'key'>) => void] {
  const [beat, setBeat] = useState<InfuseBeat | null>(null);
  useEffect(() => {
    if (!beat) return undefined;
    const id = window.setTimeout(() => setBeat(null), fxMs(2600));
    return () => window.clearTimeout(id);
  }, [beat]);
  const play = (b: Omit<InfuseBeat, 'key'>) => {
    if (fxSpeed() <= 0) return;
    setBeat({ ...b, key: Date.now() });
  };
  return [beat, play];
}

const center = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * Patch 0424 -- the Weapon Enchanting / Armour Infusion moment, drawn over
 * the shared infuse scene in the same % space as its slots: the gem
 * charges as a ring closes in, a stream of element-coloured motes climbs
 * into the item while a rune circle turns around it, then the item flares
 * and the result line pops above it. Higher gem tiers send more motes and
 * a bigger flare.
 */
export function InfuseFx({ beat, item, gem }: { beat: InfuseBeat | null; item: Rect; gem: Rect }) {
  if (!beat) return null;
  const color = ELEMENT_FX_COLOR[beat.element];
  const tierIx = Math.max(0, RARITY_ORDER.indexOf(beat.tier));
  const ic = center(item);
  const gc = center(gem);
  const motes = 8 + tierIx * 4;
  const flares = 3 + tierIx;
  return (
    <div key={beat.key} className="ifx-layer" style={{ color }} aria-hidden="true">
      <span className="ifx-runes" style={at(500, { left: `${ic.x}%`, top: `${ic.y}%` })}>
        <svg viewBox="0 0 170 170">
          <circle cx="85" cy="85" r="78" strokeWidth="1.5" strokeDasharray="4 7" />
          <circle cx="85" cy="85" r="64" strokeWidth="1" strokeDasharray="18 6 2 6" />
          <circle cx="85" cy="85" r="54" strokeWidth="1.5" strokeDasharray="1 9" />
        </svg>
      </span>
      <span className="ifx-glow" style={at(1400, { left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, height: `${item.height}%` })} />
      <span className="ifx-orb" style={at(0, { left: `${gc.x}%`, top: `${gc.y}%` })}>{ELEMENT_GLYPH[beat.element]}</span>
      <span className="ifx-cring" style={at(0, { left: `${gc.x}%`, top: `${gc.y}%` })} />
      <span className="ifx-stream" style={{ left: `${ic.x}%`, top: `${ic.y}%`, height: `${gc.y - ic.y}%` }}>
        {Array.from({ length: motes }, (_, i) => (
          <i key={i} style={at(700 + i * (650 / motes), { marginLeft: ((i * 13) % 21) - 10 })} />
        ))}
      </span>
      {Array.from({ length: flares }, (_, i) => (
        <span key={i} className={`ifx-flare f${i % 7}`} style={at(1450, { left: `${ic.x}%`, top: `${ic.y}%` })} />
      ))}
      <span className="ifx-result" style={at(1650, { left: `${ic.x}%`, top: `${Math.max(2, item.top - 8)}%` })}>{beat.text}</span>
    </div>
  );
}
