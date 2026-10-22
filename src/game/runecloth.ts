/**
 * Runecloth backdrops (patch 0440, direct request).
 *
 * The alternative to the painted per-tab scene art: a plain colour ground
 * with faint markings (runes, cross-hatch, an etched lattice, a starfield,
 * or scattered sigils) drawn over it. Picked during first-time setup
 * (GuildNamingModal's vibe step) and changeable anytime from Settings >
 * Backdrop.
 *
 * Deliberately built entirely in code -- CSS gradients plus one generated
 * SVG tile per colour/marking/strength -- rather than as image files:
 * nothing to commission, nothing to load, crisp at any window size, and
 * every colour x marking x strength combination exists for free.
 *
 * The runes and sigils are drawn as stroke PATHS, not font glyphs, on
 * purpose: an SVG used as a CSS background image can't load web fonts,
 * and the Runic Unicode block is missing from plenty of system fonts, so
 * text glyphs would silently render as empty boxes on some machines.
 *
 * Guild's Mood still applies: Bright shows the cloth exactly as picked,
 * Moody lays a night-blue veil over the whole thing (the top background
 * layer, see VEIL below) -- the same Moody/Bright/System setting and the
 * same quick-flip button in the menu bar that swap the painted art.
 *
 * Self-contained (imports nothing from settings.ts) so settings.ts can
 * import from here without a circular dependency.
 */

export type BackdropStyleId = 'painted' | 'runecloth';

export type RuneclothColourId =
  | 'blossom' | 'parchment' | 'frost' | 'bone'
  | 'moss' | 'tide' | 'moon' | 'amethyst'
  | 'dusk' | 'ember' | 'goldleaf' | 'slate';

export type RuneclothMotifId = 'runes' | 'hatch' | 'lattice' | 'stars' | 'sigils';
/** 'signature' = whichever motif that colour was designed around. */
export type RuneclothMarkingId = 'signature' | RuneclothMotifId;
export type RuneclothStrengthId = 'faint' | 'etched' | 'carved';

export interface RuneclothColour {
  id: RuneclothColourId;
  name: string;
  /** Centre of the ground's soft radial falloff. */
  base: string;
  /** Edge of the ground's radial falloff. */
  deep: string;
  /** Marking ink as an "r,g,b" triple, alpha applied separately. */
  ink: string;
  /** Base marking opacity before strength is applied -- tuned per colour
   *  so every marking reads as equally faint against its own ground. */
  alpha: number;
  signature: RuneclothMotifId;
}

export const RUNECLOTH_COLOURS: RuneclothColour[] = [
  { id: 'blossom', name: 'Blossom Shrine', base: '#e7a9bc', deep: '#cf8299', ink: '255,255,255', alpha: 0.55, signature: 'runes' },
  { id: 'parchment', name: 'Old Parchment', base: '#e8d9b6', deep: '#cbb485', ink: '110,78,40', alpha: 0.32, signature: 'lattice' },
  { id: 'frost', name: 'Frostmark', base: '#cfe2ea', deep: '#a3c0ce', ink: '255,255,255', alpha: 0.6, signature: 'sigils' },
  { id: 'bone', name: 'Bone & Ink', base: '#f0eadf', deep: '#d6ccba', ink: '40,32,26', alpha: 0.26, signature: 'hatch' },
  { id: 'moss', name: 'Mossbank', base: '#58734e', deep: '#3a5034', ink: '232,226,196', alpha: 0.22, signature: 'hatch' },
  { id: 'tide', name: 'Tidecall', base: '#2b6668', deep: '#184244', ink: '190,236,226', alpha: 0.26, signature: 'runes' },
  { id: 'moon', name: 'Moonwell', base: '#22304c', deep: '#111a2d', ink: '214,224,255', alpha: 0.32, signature: 'stars' },
  { id: 'amethyst', name: 'Amethyst Vault', base: '#4a3363', deep: '#2b1c3d', ink: '214,184,255', alpha: 0.28, signature: 'sigils' },
  { id: 'dusk', name: 'Duskrose', base: '#8f6073', deep: '#674052', ink: '255,214,226', alpha: 0.26, signature: 'lattice' },
  { id: 'ember', name: 'Ember Hearth', base: '#622622', deep: '#3a1412', ink: '230,170,90', alpha: 0.3, signature: 'runes' },
  { id: 'goldleaf', name: 'Goldleaf', base: '#312a1e', deep: '#1a160f', ink: '201,161,74', alpha: 0.32, signature: 'lattice' },
  { id: 'slate', name: 'Ashen Slate', base: '#3d4046', deep: '#24262a', ink: '236,236,236', alpha: 0.16, signature: 'hatch' },
];

export const RUNECLOTH_COLOUR_BY_ID: Record<RuneclothColourId, RuneclothColour> =
  Object.fromEntries(RUNECLOTH_COLOURS.map((c) => [c.id, c])) as Record<RuneclothColourId, RuneclothColour>;

export const RUNECLOTH_MARKINGS: { id: RuneclothMarkingId; name: string }[] = [
  { id: 'signature', name: 'Signature' },
  { id: 'runes', name: 'Runes' },
  { id: 'hatch', name: 'Cross-hatch' },
  { id: 'lattice', name: 'Lattice' },
  { id: 'stars', name: 'Starfield' },
  { id: 'sigils', name: 'Sigils' },
];

export const RUNECLOTH_STRENGTHS: { id: RuneclothStrengthId; name: string; k: number }[] = [
  { id: 'faint', name: 'Faint', k: 0.55 },
  { id: 'etched', name: 'Etched', k: 1 },
  { id: 'carved', name: 'Carved', k: 1.6 },
];

/** Moody's night veil -- dim 0.6, night-blue tint, the values picked from
 *  the design demo. Darker at the edges than the centre so it reads as
 *  lamplight fading out rather than a flat grey wash. */
const VEIL = 'radial-gradient(ellipse at 50% 40%, rgba(14,11,30,0.45), rgba(14,11,30,0.75))';

/* ------------------------------ glyph shapes ------------------------------ */

/** Elder Futhark runes as strokes in a 10x16 box. */
const RUNE_PATHS = [
  'M3 0V16M3 3L9 0M3 8L9 5',          // fehu
  'M2 16V0L8 5V16',                   // uruz
  'M3 0V16M3 4L8 8L3 12',             // thurisaz
  'M3 0V16M3 2L8 5M3 7L8 10',         // ansuz
  'M3 16V0L8 4L3 8L8 16',             // raido
  'M8 2L3 8L8 14',                    // kaunan
  'M2 2L8 14M8 2L2 14',               // gebo
  'M3 16V0L8 4L3 8',                  // wunjo
  'M2 0V16M8 0V16M2 6L8 10',          // hagalaz
  'M5 0V16M2 6L8 10',                 // naudiz
  'M4 2L1 6L4 10M6 6L9 10L6 14',      // jera
  'M5 0V16M5 0L8 3M5 16L2 13',        // eihwaz
  'M5 16V0M1 4L5 8L9 4',              // algiz
  'M7 1L3 6L7 10L3 15',               // sowilo
  'M5 16V0M1 4L5 0L9 4',              // tiwaz
  'M3 0V16M3 0L8 4L3 8L8 12L3 16',    // berkano
  'M2 16V0L5 4L8 0V16',               // ehwaz
  'M2 16V0L8 6M8 16V0L2 6',           // mannaz
  'M3 16V0L8 5',                      // laguz
  'M5 0L9 8L5 16L1 8Z',               // ingwaz
  'M1 0V16L9 0V16L1 0',               // dagaz
  'M1 16L8 6L5 1L2 6L9 16',           // othala
];
const RUNE_BOX = { w: 10, h: 16 };

/** Sigils and stars in a 16x16 box. */
const SIGIL_PATHS = [
  'M8 0L10 6L16 8L10 10L8 16L6 10L0 8L6 6Z',            // four-point star
  'M8 1L14 8L8 15L2 8ZM8 5L11 8L8 11L5 8Z',             // nested diamond
  'M11 2A7 7 0 1 0 11 14A5.5 5.5 0 1 1 11 2Z',          // crescent
  'M8 2A6 6 0 1 1 7.99 2ZM8 7A1 1 0 1 1 7.99 7Z',       // ringed dot
  'M8 1V15M1 8H15M3 3L13 13M13 3L3 13',                 // eight-ray
];
const STAR_PATHS = [
  'M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z',
  'M8 3V13M3 8H13',
];
const SIGIL_BOX = { w: 16, h: 16 };

interface GlyphSpec {
  paths: string[];
  box: { w: number; h: number };
  /** Chance each grid cell gets a glyph. */
  density: number;
  /** Rendered height range in px. */
  size: [number, number];
  /** Extra opacity multiplier on top of colour alpha x strength. */
  alphaMul: number;
}

const GLYPHS: Partial<Record<RuneclothMotifId, GlyphSpec>> = {
  runes: { paths: RUNE_PATHS, box: RUNE_BOX, density: 0.8, size: [18, 34], alphaMul: 1 },
  sigils: { paths: [...SIGIL_PATHS, RUNE_PATHS[21]], box: SIGIL_BOX, density: 0.55, size: [14, 26], alphaMul: 1 },
  stars: { paths: STAR_PATHS, box: SIGIL_BOX, density: 0.45, size: [8, 16], alphaMul: 1.3 },
  // Lattice gets a few large, very faint runes etched into the grid.
  lattice: { paths: [RUNE_PATHS[21], RUNE_PATHS[20], RUNE_PATHS[12], RUNE_PATHS[17]], box: RUNE_BOX, density: 0.2, size: [34, 52], alphaMul: 0.6 },
};

/** Glyph tile edge in px at scale 1 -- big enough that the repeat isn't
 *  obvious behind a full tab. */
const TILE = 320;
const GRID = 6;

/* ------------------------------- helpers -------------------------------- */

function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rgba(ink: string, a: number): string {
  return `rgba(${ink},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

const px = (n: number) => `${n.toFixed(1)}px`;

/** A scattered-glyph SVG tile as a CSS url(). Glyphs are kept inside a
 *  margin so none get clipped at the tile seam. */
function glyphTile(motif: RuneclothMotifId, c: RuneclothColour, k: number, scale: number): string | null {
  const spec = GLYPHS[motif];
  if (!spec) return null;
  const size = TILE * scale;
  const cell = size / GRID;
  const r = rng(hash(`${c.id}:${motif}`));
  const parts: string[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (r() > spec.density) continue;
      const h = (spec.size[0] + r() * (spec.size[1] - spec.size[0])) * scale;
      const s = h / spec.box.h;
      const x = (col + 0.2 + r() * 0.6) * cell;
      const y = (row + 0.2 + r() * 0.6) * cell;
      const rot = Math.round(r() * 50 - 25);
      const path = spec.paths[Math.floor(r() * spec.paths.length)];
      const op = Math.min(1, c.alpha * k * spec.alphaMul * 1.6 * (0.55 + r() * 0.45));
      parts.push(
        // vector-effect keeps every stroke ~1.6px however much its glyph
        // was scaled up, so big lattice runes stay as fine as small ones.
        `<path vector-effect='non-scaling-stroke' d='${path}' stroke-opacity='${op.toFixed(3)}' transform='translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(3)}) translate(${-spec.box.w / 2} ${-spec.box.h / 2})'/>`,
      );
    }
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size.toFixed(0)}' height='${size.toFixed(0)}'>` +
    `<g fill='none' stroke='rgb(${c.ink})' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>` +
    `${parts.join('')}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

interface Layer { image: string; size: string; position: string }

function textureLayers(motif: RuneclothMotifId, c: RuneclothColour, k: number, s: number): Layer[] {
  const a = c.alpha * k;
  switch (motif) {
    case 'hatch':
      return [
        { image: `repeating-linear-gradient(45deg, ${rgba(c.ink, a)} 0 1px, transparent 1px ${px(14 * s)})`, size: 'auto', position: '0 0' },
        { image: `repeating-linear-gradient(-45deg, ${rgba(c.ink, a * 0.7)} 0 1px, transparent 1px ${px(14 * s)})`, size: 'auto', position: '0 0' },
      ];
    case 'lattice':
      return [
        { image: `repeating-linear-gradient(60deg, ${rgba(c.ink, a * 0.9)} 0 1px, transparent 1px ${px(38 * s)})`, size: 'auto', position: '0 0' },
        { image: `repeating-linear-gradient(-60deg, ${rgba(c.ink, a * 0.9)} 0 1px, transparent 1px ${px(38 * s)})`, size: 'auto', position: '0 0' },
        { image: `repeating-linear-gradient(0deg, ${rgba(c.ink, a * 0.45)} 0 1px, transparent 1px ${px(38 * s)})`, size: 'auto', position: '0 0' },
      ];
    case 'stars':
      return [
        { image: `radial-gradient(circle, ${rgba(c.ink, a * 1.6)} 0 1px, transparent 1.7px)`, size: `${px(38 * s)} ${px(38 * s)}`, position: '0 0' },
        { image: `radial-gradient(circle, ${rgba(c.ink, a)} 0 0.7px, transparent 1.3px)`, size: `${px(38 * s)} ${px(38 * s)}`, position: `${px(19 * s)} ${px(25 * s)}` },
      ];
    case 'sigils':
      return [
        { image: `radial-gradient(circle, ${rgba(c.ink, a * 0.8)} 0 1px, transparent 1.6px)`, size: `${px(26 * s)} ${px(26 * s)}`, position: '0 0' },
      ];
    default:
      return [];
  }
}

export function resolveRuneclothMotif(colour: RuneclothColourId, marking: RuneclothMarkingId): RuneclothMotifId {
  return marking === 'signature' ? (RUNECLOTH_COLOUR_BY_ID[colour] ?? RUNECLOTH_COLOURS[0]).signature : marking;
}

export interface RuneclothBackground {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
  backgroundColor: string;
}

const cache = new Map<string, RuneclothBackground>();

/**
 * The full layered CSS background for a Runecloth choice. `dim` adds
 * Moody's veil on top; `scale` shrinks the marking spacing/size for small
 * previews (Settings swatches) so a thumbnail reads like a zoomed-out
 * view of the real thing rather than a few giant runes.
 */
export function runeclothBackground(
  colourId: RuneclothColourId,
  marking: RuneclothMarkingId,
  strength: RuneclothStrengthId,
  opts: { dim?: boolean; scale?: number } = {},
): RuneclothBackground {
  const dim = !!opts.dim;
  const scale = opts.scale ?? 1;
  const key = `${colourId}|${marking}|${strength}|${dim}|${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = RUNECLOTH_COLOUR_BY_ID[colourId] ?? RUNECLOTH_COLOURS[0];
  const motif = resolveRuneclothMotif(c.id, marking);
  const k = (RUNECLOTH_STRENGTHS.find((x) => x.id === strength) ?? RUNECLOTH_STRENGTHS[1]).k;

  const layers: Layer[] = [];
  if (dim) layers.push({ image: VEIL, size: 'auto', position: '0 0' });
  const tile = glyphTile(motif, c, k, scale);
  if (tile) layers.push({ image: tile, size: `${px(TILE * scale)} ${px(TILE * scale)}`, position: '0 0' });
  layers.push(...textureLayers(motif, c, k, scale));
  layers.push({ image: `radial-gradient(ellipse at 50% 35%, ${c.base} 0%, ${c.deep} 100%)`, size: 'auto', position: '0 0' });

  const out: RuneclothBackground = {
    backgroundImage: layers.map((l) => l.image).join(', '),
    backgroundSize: layers.map((l) => l.size).join(', '),
    backgroundPosition: layers.map((l) => l.position).join(', '),
    backgroundRepeat: 'repeat',
    backgroundColor: c.deep,
  };
  cache.set(key, out);
  return out;
}

export function isRuneclothColour(v: unknown): v is RuneclothColourId {
  return typeof v === 'string' && v in RUNECLOTH_COLOUR_BY_ID;
}
