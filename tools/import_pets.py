#!/usr/bin/env python3
"""
Slice pet sprite sheets into per-animation strips, recolour a copy per
rarity tier, and write public/pets/manifest.json -- same shape and
conventions as tools/import_characters.py (per-character manifest, sliced
animation strips) and tools/recolor.py (lightness-preserving HLS palette
swap, so shading survives byte-for-byte and only hue/saturation move).

Each source sheet is a row-grid (confirmed by hand against the actual art,
see the ROW comments below -- there's no metadata for these packs the way
the Red Panda's aseprite JSON has one, so these mappings are this script's
one real source of truth). ROWS maps animation name -> (row, startCol,
frameCount) in that species' own frameW x frameH grid.

Usage:
    python3 tools/import_pets.py --src <folder with the raw sheets> --out public/pets
"""
from __future__ import annotations

import argparse
import colorsys
import json
import os
from typing import Dict, List, Tuple

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Pillow is required:  pip install pillow')

RGB = Tuple[int, int, int]


class Livery:
    def __init__(self, hue_shift: float, sat: float, light: float = 1.0):
        self.hue_shift = hue_shift  # degrees ADDED to the source hue, not an absolute target
        self.sat = sat
        self.light = light


# Common is the pack's own original colouring -- identity, not a hue of 0.
# Each tier after that shifts further around the wheel and saturates a
# little harder, ending on Legendary's warm/bright "shine". Shared across
# every species so a rarity always reads the same way regardless of which
# pet it landed on.
RARITY_LIVERY: Dict[str, Livery] = {
    'common': Livery(0, 1.00, 1.00),
    'uncommon': Livery(40, 1.05, 1.00),
    'rare': Livery(130, 1.15, 1.00),
    'epic': Livery(210, 1.25, 1.02),
    'legendary': Livery(300, 1.35, 1.08),
}


def hex_to_rgb(value: str) -> RGB:
    v = value.lstrip('#')
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16))


def apply_livery(rgb: RGB, livery: Livery) -> RGB:
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    new_h = (h + livery.hue_shift / 360.0) % 1.0
    new_s = min(1.0, s * livery.sat)
    new_l = min(1.0, max(0.0, l * livery.light))
    r2, g2, b2 = colorsys.hls_to_rgb(new_h, new_l, new_s)
    return (round(r2 * 255), round(g2 * 255), round(b2 * 255))


class PetSpec:
    def __init__(
        self, species_id: str, sheet_file: str, frame_w: int, frame_h: int,
        rows: Dict[str, Tuple[int, int, int]],
        recolor: List[str], keep: List[str],
        extras: Dict[str, Tuple[int, int]] | None = None,
    ):
        self.species_id = species_id
        self.sheet_file = sheet_file
        self.frame_w = frame_w
        self.frame_h = frame_h
        # animation -> (row, startCol, frameCount)
        self.rows = rows
        self.recolor = [hex_to_rgb(c) for c in recolor]
        self.keep = [hex_to_rgb(c) for c in keep]
        # single-frame standalone sprites (e.g. crow's crumbs/fish), not
        # animations -- (row, col) into the same grid.
        self.extras = extras or {}


# ------------------------------------------------------------------ specs ---
# Row mappings confirmed by hand against the uploaded sheets (see the
# conversation this shipped in -- fox's Catch row and crow's Sitting/Laying
# rows were the two genuinely ambiguous calls, both confirmed directly
# rather than guessed silently).

FOX = PetSpec(
    species_id='ember_kit',
    sheet_file='Fox_Sprite_Sheet.png',
    frame_w=32, frame_h=32,
    rows={
        'idle': (0, 0, 5),
        'movement': (1, 0, 14),
        # row 2 (8f, a shorter pounce) is spare/unused -- row 3 is the
        # fuller pounce-and-bite sequence, confirmed as the real Catch.
        'catch': (3, 0, 11),
        'damage': (4, 0, 5),
        'sleep': (5, 0, 6),
        'idle2': (6, 0, 7),
    },
    recolor=['#9d5021', '#d67941'],  # fur (two tones)
    keep=['#2f2f2e', '#ffffff', '#b8b8b8', '#4f4f4e', '#3b3b39'],  # outline family + white + tail-tip grey
)

RED_PANDA = PetSpec(
    species_id='rooftail',
    sheet_file='Red_Panda_Sprite_Sheet.png',
    frame_w=32, frame_h=32,
    rows={
        'idle': (0, 0, 8),
        'idle2': (1, 0, 8),
        'movement': (2, 0, 8),
        'sleep': (6, 0, 8),
    },
    recolor=['#d67941', '#9d5021', '#694129', '#825235'],  # bright + dark fur tones
    keep=['#2f2f2e', '#ffffff', '#b8b8b8'],
)

CROW = PetSpec(
    species_id='ashwing',
    sheet_file='Crow.png',
    frame_w=48, frame_h=48,
    rows={
        'perched': (0, 0, 7),
        # Confirmed: row1 settles into a seated pose (Sitting), row2 flattens
        # into a fluffed breathing ball (Laying) -- the two were genuinely
        # ambiguous without this confirmation.
        'sitting': (1, 0, 7),
        'laying': (2, 0, 4),  # frames 4-6 of this row are a spare stand-up transition, unused
        'eating': (3, 0, 7),
        'walking': (4, 4, 3),
        # Row 5's col 5 is the baked-in "CAW" text graphic, not a real
        # frame -- deliberately excluded, not a bug.
        'flying': (5, 0, 5),
    },
    extras={'crumbs': (4, 1), 'food': (4, 2), 'fish': (4, 3)},
    # The body is near-monochrome (mostly pure black), so the ONE colour
    # with any real hue (#222034, a dark navy-black) is what actually
    # carries the recolour -- true black stays pure outline. This produces
    # a subtle iridescent-sheen effect on higher rarities, which happens to
    # match how real corvid feathers actually catch colour in light.
    recolor=['#222034'],
    keep=['#000000', '#696a6a'],
)

PETS: List[PetSpec] = [FOX, RED_PANDA, CROW]


# -------------------------------------------------------------- recolour ---

def build_map(spec: PetSpec, tier: str) -> Dict[RGB, RGB]:
    livery = RARITY_LIVERY[tier]
    mapping: Dict[RGB, RGB] = {}
    for src in spec.recolor:
        mapping[src] = apply_livery(src, livery)
    for src in spec.keep:
        mapping[src] = src  # identity, but explicit -- never touched by any tier
    return mapping


def recolor_image(img: Image.Image, mapping: Dict[RGB, RGB]) -> Image.Image:
    img = img.convert('RGBA')
    out = Image.new('RGBA', img.size)
    src = img.load()
    dst = out.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            key = (r, g, b)
            nr, ng, nb = mapping.get(key, key)  # unrecognised colours pass through unchanged
            dst[x, y] = (nr, ng, nb, a)
    return out


def slice_strip(img: Image.Image, spec: PetSpec, row: int, start_col: int, count: int) -> Image.Image:
    out = Image.new('RGBA', (spec.frame_w * count, spec.frame_h))
    for i in range(count):
        box = (
            (start_col + i) * spec.frame_w, row * spec.frame_h,
            (start_col + i + 1) * spec.frame_w, (row + 1) * spec.frame_h,
        )
        out.paste(img.crop(box), (i * spec.frame_w, 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='folder holding the raw uploaded sheets')
    ap.add_argument('--out', required=True, help='output folder, e.g. public/pets')
    ap.add_argument('--only', nargs='*', help='limit to these species ids')
    args = ap.parse_args()

    targets = [p for p in PETS if not args.only or p.species_id in args.only]
    manifest: Dict[str, dict] = {}

    for spec in targets:
        src_path = os.path.join(args.src, spec.sheet_file)
        if not os.path.exists(src_path):
            print(f'  skip {spec.species_id}: {spec.sheet_file} not found in {args.src}')
            continue
        sheet = Image.open(src_path)
        print(f'{spec.species_id} ({spec.sheet_file}):')

        counts: Dict[str, int] = {}
        for anim, (row, start_col, count) in spec.rows.items():
            counts[anim] = count
            strip = slice_strip(sheet, spec, row, start_col, count)
            for tier in RARITY_LIVERY:
                mapping = build_map(spec, tier)
                recoloured = recolor_image(strip, mapping)
                dest_dir = os.path.join(args.out, spec.species_id, tier)
                os.makedirs(dest_dir, exist_ok=True)
                recoloured.save(os.path.join(dest_dir, f'{anim}.png'), optimize=True)
            print(f'    {anim}: row {row}, {count} frames -> all 5 rarity tiers')

        for name, (row, col) in spec.extras.items():
            box = (col * spec.frame_w, row * spec.frame_h, (col + 1) * spec.frame_w, (row + 1) * spec.frame_h)
            frame = sheet.crop(box)
            for tier in RARITY_LIVERY:
                mapping = build_map(spec, tier)
                recoloured = recolor_image(frame, mapping)
                dest_dir = os.path.join(args.out, spec.species_id, tier)
                os.makedirs(dest_dir, exist_ok=True)
                recoloured.save(os.path.join(dest_dir, f'extra_{name}.png'), optimize=True)
            print(f'    extra "{name}": row {row} col {col} -> all 5 rarity tiers')

        manifest[spec.species_id] = {'frameW': spec.frame_w, 'frameH': spec.frame_h, 'animations': counts}

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'\nwrote {os.path.join(args.out, "manifest.json")}')
    print('done')


if __name__ == '__main__':
    main()
