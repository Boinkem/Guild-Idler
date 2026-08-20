import { vendorRepLevel } from '../game/data/vendorRep';
import { Tuning } from '../game/data/tuning';

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
export function ReputationRing({ goldSpent, size = 26 }: { goldSpent: number; size?: number }) {
  const level = vendorRepLevel(goldSpent);
  const base = Tuning.get('vendorRep.goldPerLevelBase');
  // Same formula vendorRepLevel itself inverts (level = floor(sqrt(gold
  // / base))) -- goldForLevel(n) = base * n^2 is its exact inverse, used
  // here purely for the ring's own fill fraction, not the level number.
  const goldForLevel = (n: number) => base * n * n;
  const currentThreshold = goldForLevel(level);
  const nextThreshold = goldForLevel(level + 1);
  const progress = nextThreshold > currentThreshold
    ? Math.min(1, Math.max(0, (goldSpent - currentThreshold) / (nextThreshold - currentThreshold)))
    : 1;

  const stroke = Math.max(2, Math.round(size * 0.14));
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div
      className="gold-text"
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
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(9, Math.round(size * 0.44)), fontWeight: 700,
      }}
      >
        {level}
      </div>
    </div>
  );
}
