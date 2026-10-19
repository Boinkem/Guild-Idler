"""Cut the egg icons the game uses out of the licensed egg sheet.

Patch 0424. EggIcon (src/ui/EggIcon.tsx) loads public/pets/egg/<rarity>/icon.png
and falls back to an emoji when it's missing; the hatch animation also uses
open.png (the cracked-shell frame). public/pets is gitignored (licensed art),
so this script regenerates the files locally from the sheet that ships in the
same pack:

    python3 tools/import_eggs.py            # reads public/pets/Eggs/Eggs_48x48.png

Row/column choices match the Claude Design hatch mock-up: one colour per
rarity, column 2 (swirl pattern) for the whole egg, column 9 for the cracked one.
"""
import os
import sys

from PIL import Image

SHEET = sys.argv[1] if len(sys.argv) > 1 else os.path.join('public', 'pets', 'Eggs', 'Eggs_48x48.png')
OUT = os.path.join('public', 'pets', 'egg')
CELL = 48
ROWS = {'common': 3, 'uncommon': 4, 'rare': 5, 'epic': 9, 'legendary': 6}
WHOLE_COL, OPEN_COL = 2, 9

sheet = Image.open(SHEET).convert('RGBA')
for rarity, row in ROWS.items():
    folder = os.path.join(OUT, rarity)
    os.makedirs(folder, exist_ok=True)
    for name, col in (('icon.png', WHOLE_COL), ('open.png', OPEN_COL)):
        box = (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)
        sheet.crop(box).save(os.path.join(folder, name))
    print('wrote', folder)
