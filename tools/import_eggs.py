#!/usr/bin/env python3
"""
Crops the 5 rarity-tier static egg icons out of the source Eggs_32x32.png
sheet -- a 10-column x 16-row grid of egg DESIGNS x COLORS, not an
animation strip (confirmed by inspection: each row is one solid egg colour
rendered in 10 different surface-pattern variants, plus a "cracking open"
pose in the last column; rows 10-15 are a separate, more ornate jewelled
set, unused by this script).

Row -> rarity and column -> design were both picked by matching, not
guessed: row colours were averaged and compared against the game's own
RARITY_COLOR hex values (src/game/util.ts) to find the closest fit for
each tier; column 7 (a smooth single-tone gradient egg, no speckle/spot/
stripe pattern) was picked as the one design that stays readable at small
icon sizes across every row, and column 9 (the only genuinely different
silhouette -- shell visibly cracked open) was deliberately excluded since
these are meant to depict a WHOLE, unhatched egg sitting in storage.

Only crops -- no recolouring needed, unlike tools/import_pets.py's pet
species, since this sheet already ships each rarity as a genuinely
different colour rather than one design needing a palette swap.

Usage:
    python3 tools/import_eggs.py --src <folder with Eggs_32x32.png> --out public/pets/egg
"""
from __future__ import annotations

import argparse
import os

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Pillow is required:  pip install pillow')

FRAME = 32
DESIGN_COL = 7  # smooth solid-gradient egg -- reads cleanly at icon size, every row

# rarity -> source row, picked by nearest-match against RARITY_COLOR (see module docstring)
RARITY_ROW = {
    'common': 0,
    'uncommon': 4,
    'rare': 5,
    'epic': 9,
    'legendary': 6,
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='folder holding Eggs_32x32.png')
    ap.add_argument('--out', required=True, help='output folder, e.g. public/pets/egg')
    ap.add_argument('--sheet', default='Eggs_32x32.png')
    args = ap.parse_args()

    src_path = os.path.join(args.src, args.sheet)
    if not os.path.exists(src_path):
        raise SystemExit(f'{args.sheet} not found in {args.src}')

    sheet = Image.open(src_path).convert('RGBA')
    for rarity, row in RARITY_ROW.items():
        box = (DESIGN_COL * FRAME, row * FRAME, (DESIGN_COL + 1) * FRAME, (row + 1) * FRAME)
        icon = sheet.crop(box)
        dest_dir = os.path.join(args.out, rarity)
        os.makedirs(dest_dir, exist_ok=True)
        icon.save(os.path.join(dest_dir, 'icon.png'), optimize=True)
        print(f'{rarity}: row {row}, col {DESIGN_COL} -> {dest_dir}/icon.png')

    print('done')


if __name__ == '__main__':
    main()
