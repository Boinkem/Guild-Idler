import { useEffect, useRef, useState } from 'react';

/**
 * Sprites for the Raid Quartermaster's Den -- unlike VendorSprite (an
 * animated frame-strip), these are individual pre-rendered static images
 * per level, swapped directly rather than animated. Each of skull/rack/
 * shelf has exactly 3 states (0-2), pre-cropped from the source sheets
 * into public/raid-room/<kind>-<level>.png.
 *
 * The torch is the one exception: it's a binary unlock indicator (has the
 * Raid Charter been bought), not a leveled upgrade, and cycles through 3
 * lit frames for an idle flicker once lit rather than staying static.
 */
export function RaidRoomSprite({
  kind, level, height, title,
}: {
  kind: 'skull' | 'rack' | 'shelf';
  level: number;
  height: number;
  title?: string;
}) {
  const clamped = Math.max(0, Math.min(2, level));
  return (
    <img
      src={`./raid-room/${kind}-${clamped}.png`}
      alt=""
      title={title}
      style={{ height, imageRendering: 'pixelated' }}
      // Art missing/not yet placed -- fail quietly rather than show a
      // broken-image icon, same convention as every other art asset that
      // rolls out gradually in this project.
      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
    />
  );
}

const TORCH_LIT_FRAME_COUNT = 3;
/** Slow, ember-like flicker rather than a fast animation -- this is ambient
 *  scenery, not something meant to draw the eye. */
const TORCH_FPS = 2.5;

export function RaidTorchSprite({ lit, height, title }: { lit: boolean; height: number; title?: string }) {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!lit) return undefined;
    const id = window.setInterval(() => {
      frameRef.current = (frameRef.current + 1) % TORCH_LIT_FRAME_COUNT;
      setFrame(frameRef.current);
    }, 1000 / TORCH_FPS);
    return () => window.clearInterval(id);
  }, [lit]);

  const src = lit ? `./raid-room/torch-lit-${frame + 1}.png` : './raid-room/torch-off.png';
  return (
    <img
      src={src}
      alt=""
      title={title}
      style={{ height, imageRendering: 'pixelated' }}
      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
    />
  );
}
