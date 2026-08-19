import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { DiceFace } from '../../game/types';

/**
 * Grimsby's dice sprite sheet -- a single 96x240 image, 16x16px cells,
 * 6 columns x 15 rows (public/peddler/dice/dice-sheet.png, committed to
 * the repo same as every other peddler/ art asset, not gitignored). Rows
 * 0-11 are the same six pip faces (1-6, left to right) recolored twelve
 * times over; rows 12-13 are a blank color-swatch legend (unused here);
 * row 14 is a 6-frame tumble/roll animation, one shared color, meant to
 * play on a loop while the die is "in the air" before landing on a real
 * face.
 *
 * Deliberately its own small component rather than reusing GrimsbySprite/
 * HeroSprite's manifest-driven pattern -- this sheet's geometry is fixed
 * and fully known (it's a single small asset authored for exactly this
 * minigame, not a swappable licensed pack with per-character variance),
 * so a fetched manifest.json would be pure overhead here.
 */

const CELL = 16;
const COLS = 6;
const ROLL_ROW = 14;
/** White -- row 0. Grimsby's cart already leans purple/brass (see
 *  .peddler-card/.high-roller-badge in app.css); a plain white die reads
 *  clearly against both his table backdrop and the tumble animation's own
 *  neutral tone, without competing with either. */
const FACE_ROW = 0;
const SHEET_ROWS = 15;

export interface DiceSpriteProps {
  /** Plays the row-14 tumble loop instead of showing a resolved face. */
  rolling: boolean;
  /** Which face to show once NOT rolling -- the chosen number as a
   *  preview before the first roll, or the actual landed face once a
   *  result exists. Falls back to a blank/neutral look if unset. */
  face: DiceFace | null;
  height?: number;
  /** Frames per second for the tumble loop -- fast enough to read as a
   *  genuine roll rather than a slow flip. */
  rollFps?: number;
  className?: string;
  title?: string;
}

export function DiceSprite({
  rolling, face, height = 96, rollFps = 12, className, title,
}: DiceSpriteProps) {
  const [rollFrame, setRollFrame] = useState(0);

  useEffect(() => {
    if (!rolling) { setRollFrame(0); return undefined; }
    const id = window.setInterval(() => {
      setRollFrame((f) => (f + 1) % COLS);
    }, 1000 / rollFps);
    return () => window.clearInterval(id);
  }, [rolling, rollFps]);

  const row = rolling ? ROLL_ROW : FACE_ROW;
  const col = rolling ? rollFrame : (face ? face - 1 : 0);
  const scale = height / CELL;

  const style: CSSProperties = {
    width: CELL * scale,
    height: CELL * scale,
    backgroundImage: 'url(./peddler/dice/dice-sheet.png)',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${col * CELL * scale}px -${row * CELL * scale}px`,
    backgroundSize: `${CELL * COLS * scale}px ${CELL * SHEET_ROWS * scale}px`,
    imageRendering: 'pixelated',
  };

  return <div className={className} style={style} role={title ? 'img' : 'presentation'} aria-label={title} />;
}
