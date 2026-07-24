import { useMemo } from 'react';

/**
 * Sprite art for Little Knight.
 *
 * Frames are character grids, 32x32, authored as flat material regions and then
 * given a directional shading ramp (light from the upper left). Every material
 * uses several tones rather than one flat fill, which is what keeps the figures
 * from reading as flat 16-bit era art.
 *
 * Legend
 *   .          transparent
 *   k          outline
 *   1 2 3 4    armour: deep shade, shade, base, highlight
 *   5 6 7      trim:   dark, base, light
 *   8 9 0      cloth:  dark, base, light
 *   d s S      skin:   shade, base, light
 *   l L        leather
 *   m M N      steel:  dark, base, highlight
 *   e          visor glow
 *
 * The armour, trim and cloth ramps are derived at runtime from a hero class's
 * three base colours, so one grid renders all six classes.
 */

export type Palette = Record<string, string | null>;

export interface ClassColors {
  armor: string;
  trim: string;
  cloth: string;
}

/* ----------------------------- colour maths ----------------------------- */

function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Blends toward black (amount < 0) or white (amount > 0). */
function shift(hex: string, amount: number): string {
  const [r, g, b] = toRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex([r + (target - r) * t, g + (target - g) * t, b + (target - b) * t]);
}

/** Fixed materials that never recolour per class. */
const FIXED: Palette = {
  '.': null,
  k: '#100c16',
  d: '#925c3a', s: '#ce9466', S: '#f0c296',
  l: '#342a1c', L: '#5e4832',
  m: '#464e5c', M: '#8e9aac', N: '#e4eefa',
  e: '#96e7ff',
};

export const DEFAULT_COLORS: ClassColors = {
  armor: '#a8b4ca',
  trim: '#be8e32',
  cloth: '#943036',
};

export function buildPalette(colors: ClassColors = DEFAULT_COLORS): Palette {
  return {
    ...FIXED,
    '1': shift(colors.armor, -0.55),
    '2': shift(colors.armor, -0.28),
    '3': colors.armor,
    '4': shift(colors.armor, 0.34),
    '5': shift(colors.trim, -0.38),
    '6': colors.trim,
    '7': shift(colors.trim, 0.4),
    '8': shift(colors.cloth, -0.4),
    '9': colors.cloth,
    '0': shift(colors.cloth, 0.32),
  };
}

/* -------------------------------- frames -------------------------------- */

export const KNIGHT_STAND: string[] = [
  '...............kk...............',
  '..............k09k..............',
  '.............k0999k.............',
  '............kk9888kk............',
  '...........k33333332k...........',
  '..........k6666666665k..........',
  '......kk..k4444444443k..........',
  '.....kNMk.k4322222232k..........',
  '.....kNmk.k42kekkek42k..........',
  '.....kNmk.k4344444432k..........',
  '.....kNmk.k3333333331k..........',
  '.....kNmk..k33333331k...........',
  '.....kNmk...k322221k............',
  '.....kNmkkkk66666665kkkk........',
  '.....kNm3444444444444442k.......',
  '.....kNm64333333333333263k......',
  '.....kNm43333332233333341k......',
  '.....kNm4333332094333332k.......',
  '.....kNm4332332084333332k.......',
  '.....kNm4319432084333332k.......',
  '....kkMm3198432084333332k.......',
  '...k66666659432084332221k.......',
  '....kksssd08432084329SSsk.......',
  '.....kLlk098321983218sddk.......',
  '....k666508LLLl65LLLl09k........',
  '.....kkk0999444444430999k.......',
  '.......k9888433223329888k.......',
  '........kkkk432kk432kkkk........',
  '...........k432kk432k...........',
  '...........k321kk321k...........',
  '..........kLLLLLLLLLLk..........',
  '..........kLlllllllllk..........',
];

export const KNIGHT_WALK_A: string[] = [
  '................................',
  '...............kk...............',
  '..............k09k..............',
  '.............k0999k.............',
  '............kk9888kk............',
  '...........k33333332k...........',
  '..........k6666666665k..........',
  '......kk..k4444444443k..........',
  '.....kNMk.k4322222232k..........',
  '.....kNmk.k42kekkek42k..........',
  '.....kNmk.k4344444432k..........',
  '.....kNmk.k3333333331k..........',
  '.....kNmk..k33333331k...........',
  '.....kNmk...k322221k............',
  '.....kNmkkkk66666665kkkk........',
  '.....kNm3444444444444442k.......',
  '.....kNm64333333333333263k......',
  '.....kNm43333332233333341k......',
  '.....kNm4333332094333332k.......',
  '.....kNm4332332084333332k.......',
  '.....kNm4319432084333332k.......',
  '....kkMm3198432084333332k.......',
  '...k66666659432084332221k.......',
  '....kksssd08432084329SSsk.......',
  '.....kLl9098321983218sddk.......',
  '....k666508LLLl65LLLl09k........',
  '.....kk9988844444443988k........',
  '.......kkkkk43222232kkk.........',
  '..........k432kkkk433k..........',
  '..........k432k..k321k..........',
  '..........k321k..kLLLLk.........',
  '.........kLLLLlk.kLlllk.........',
];

export const KNIGHT_WALK_B: string[] = [
  '................................',
  '...............kk...............',
  '..............k09k..............',
  '.............k0999k.............',
  '............kk9888kk............',
  '...........k33333332k...........',
  '..........k6666666665k..........',
  '......kk..k4444444443k..........',
  '.....kNMk.k4322222232k..........',
  '.....kNmk.k42kekkek42k..........',
  '.....kNmk.k4344444432k..........',
  '.....kNmk.k3333333331k..........',
  '.....kNmk..k33333331k...........',
  '.....kNmk...k322221k............',
  '.....kNmkkkk66666665kkkk........',
  '.....kNm3444444444444442k.......',
  '.....kNm64333333333333263k......',
  '.....kNm43333332233333341k......',
  '.....kNm4333332094333332k.......',
  '.....kNm4333332084333332k.......',
  '.....kNm4333332084333332k.......',
  '....kkMm3222332084333332k.......',
  '...k66666659432084332221k.......',
  '....kkksssd9432084329SSsk.......',
  '.....kLlkk08321983218sddk.......',
  '....k666508LLLl65LLLl0009k......',
  '.....kkkk9884444444398888k......',
  '.........kkk43222232kkkkk.......',
  '..........k432kkkk433k..........',
  '..........k321k..k432k..........',
  '..........kLLLLk.k321k..........',
  '..........kLlllkkLLLLlk.........',
];

/** Floating quest marker. Hand-coloured rather than ramped: it is a UI glyph. */
export const QUEST_MARK: string[] = [
  '....kkkk....',
  '...k7666k...',
  '...k7666k...',
  '...k7665k...',
  '...k7665k...',
  '....k665k...',
  '....k665k...',
  '.....kkk....',
  '............',
  '....kkkk....',
  '...k766k....',
  '...k665k....',
  '....kkk.....',
];

/** Frame order for the walking loop. */
export const WALK_CYCLE: string[][] = [KNIGHT_WALK_A, KNIGHT_STAND, KNIGHT_WALK_B, KNIGHT_STAND];

/* ------------------------------- component ------------------------------- */

export interface PixelSpriteProps {
  frame: string[];
  scale?: number;
  /** Hero class colours; omitted means the default knight palette. */
  colors?: ClassColors;
  /** Extra palette overrides, applied last. */
  palette?: Palette;
  className?: string;
  title?: string;
}

export function PixelSprite({ frame, scale = 4, colors, palette, className, title }: PixelSpriteProps) {
  const { rects, width, height } = useMemo(() => {
    const w = Math.max(...frame.map((row) => row.length));
    const map: Palette = { ...buildPalette(colors), ...palette };
    const out: { x: number; y: number; fill: string }[] = [];
    frame.forEach((row, y) => {
      const padded = row.padEnd(w, '.');
      for (let x = 0; x < w; x++) {
        const fill = map[padded[x]];
        if (fill) out.push({ x, y, fill });
      }
    });
    return { rects: out, width: w, height: frame.length };
  }, [frame, colors, palette]);

  return (
    <svg
      className={className}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
