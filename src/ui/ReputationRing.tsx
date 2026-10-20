import { useEffect, useRef, useState } from 'react';
import { vendorRepLevel } from '../game/data/vendorRep';
import { Tuning } from '../game/data/tuning';
import { flyTokens, fxMs, fxSpeed } from './purchaseFx';

/**
 * A small circular progress indicator for Vendor Rep -- the ring itself
 * fills toward the NEXT level (not a lifetime total, which would never
 * visibly move once rep is high), current level number centered inside.
 * Deliberately a standalone badge rather than wrapping a vendor's own
 * portrait art -- works identically next to a sub-tab's plain text
 * label (no art) and next to VendorSprite's real artwork (would
 * otherwise get covered by a centered number), same component either
 * place it's used.
 *
 * goldSpent is whichever lifetime counter applies -- GameState.
 * vendorGoldSpent[vendorId] for the three shop vendors, GameState.
 * stats.peddlerGoldSpent for Grimsby -- this component doesn't care
 * which, it just needs the raw number.
 */
export function ReputationRing({ goldSpent, size = 26, motes = false }: {
  goldSpent: number; size?: number;
  /** Patch 0425 -- fly a few gold motes from the header into this ring on
   *  each purchase (set on just one ring per page, so they don't double). */
  motes?: boolean;
}) {
  // Patch 0425 -- the ring shows `shown`, which trails the real total by
  // the mote flight so the arc fills (and the level ticks) as they land.
  const [shown, setShown] = useState(goldSpent);
  const level = vendorRepLevel(shown);
  const base = Tuning.get('vendorRep.goldPerLevelBase');
  // Same formula vendorRepLevel itself inverts (level = floor(sqrt(gold
  // / base))) -- goldForLevel(n) = base * n^2 is its exact inverse, used
  // here purely for the ring's own fill fraction, not the level number.
  const goldForLevel = (n: number) => base * n * n;
  const currentThreshold = goldForLevel(level);
  const nextThreshold = goldForLevel(level + 1);
  const progress = nextThreshold > currentThreshold
    ? Math.min(1, Math.max(0, (shown - currentThreshold) / (nextThreshold - currentThreshold)))
    : 1;

  // Patch 0425 -- a sip (the arc slides forward) on any spend, a burst
  // and a number roll when the level goes up. Never on mount.
  const ringRef = useRef<HTMLDivElement>(null);
  const prevSpent = useRef(goldSpent);
  const [fx, setFx] = useState<{ kind: 'sip' | 'level'; from: number; key: number } | null>(null);
  const fxTimer = useRef<number>();
  useEffect(() => {
    const before = prevSpent.current;
    prevSpent.current = goldSpent;
    window.clearTimeout(fxTimer.current);
    if (goldSpent <= before || fxSpeed() <= 0) { setShown(goldSpent); setFx(null); return; }
    const from = vendorRepLevel(before);
    const levelUp = vendorRepLevel(goldSpent) > from;
    if (motes && ringRef.current) flyTokens('gold', ringRef.current, 'coin', 3, fxMs(420));
    fxTimer.current = window.setTimeout(() => {
      setShown(goldSpent);
      setFx({ kind: levelUp ? 'level' : 'sip', from, key: Date.now() });
      fxTimer.current = window.setTimeout(() => setFx(null), fxMs(levelUp ? 900 : 350));
    }, fxMs(800));
  }, [goldSpent, motes]);
  useEffect(() => () => window.clearTimeout(fxTimer.current), []);

  const stroke = Math.max(2, Math.round(size * 0.14));
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div
      ref={ringRef}
      className={`gold-text repx-ring ${fx ? `repx-${fx.kind}` : ''}`}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      title={`Vendor Rep level ${level}`}
    >
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} opacity={0.25} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="repx-arc"
        />
      </svg>
      {fx?.kind === 'level' && <><span className="repx-shock" /><span className="repx-shock s2" /></>}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(9, Math.round(size * 0.44)), fontWeight: 700,
      }}
      >
        {fx?.kind === 'level'
          ? <span className="repx-num" key={fx.key}><span className="repx-num-old">{fx.from}</span><span className="repx-num-new">{level}</span></span>
          : level}
      </div>
    </div>
  );
}
