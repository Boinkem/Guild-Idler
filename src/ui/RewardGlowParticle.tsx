import type { CSSProperties } from 'react';

/**
 * One flying reward particle -- a colored circular glow (always
 * present) with an optional icon centered inside it. Extracted out of
 * PeddlerCardModal.tsx (patch 0230) so PeddlerTabModal's own Settle
 * flourish could reuse it -- a second copy of this exact shape is
 * exactly the kind of drift risk this project already avoids elsewhere
 * (see e.g. the sim reusing balance.ts's real formulas instead of
 * re-deriving them). No behavior change from the original -- same
 * "glow-only when no icon set" fallback, same CSS custom properties
 * (`--fly-dx`/`--fly-dy`/`--glow-color`) the shared `.reward-glow-
 * particle` CSS class already reads.
 */
export function RewardGlowParticle({
  color, icon, x, y, dx, dy, delay, durationMs,
}: {
  color: string; icon?: string; x: number; y: number; dx: number; dy: number; delay: number; durationMs: number;
}) {
  return (
    <span
      className="fly-particle reward-glow-particle"
      aria-hidden="true"
      style={{
        position: 'fixed', left: x, top: y,
        '--fly-dx': `${dx}px`, '--fly-dy': `${dy}px`, '--glow-color': color,
        animationDuration: `${durationMs}ms`, animationDelay: `${delay}ms`,
      } as CSSProperties}
    >
      {icon && <img src={`./item-icons/${icon}`} alt="" />}
    </span>
  );
}
