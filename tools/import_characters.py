#!/usr/bin/env python3
"""
Import the character sprite packs and generate every class x skin variant.

For each of the eight classes this:
  1. picks the canonical sheet set from the (differently-nested) source packs,
  2. normalises animation names to the game's vocabulary (idle/walk/attack/...),
  3. crops each frame to a shared content box,
  4. writes the original colours plus four themed recolours.

Recolouring is the same lightness-preserving palette swap used for the knight:
binary alpha and low colour counts mean texture survives exactly. Themes remap
saturated "identity" pixels toward a primary/secondary hue pair while leaving
neutrals (outlines, steel, bone, eyes) untouched, so a two-tone character stays
two-tone in its new livery.

Usage:
    python3 tools/import_characters.py --src <extracted pack root> --out public/heroes
"""
from __future__ import annotations

import argparse
import colorsys
import json
import os
from typing import Dict, List, Optional, Tuple

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Pillow is required:  pip install pillow')

RGB = Tuple[int, int, int]

# ------------------------------------------------------------------ manifest --
# frame_w/h and the animation frame counts were measured from the packs.
# `base` is the sub-path inside each pack that holds the sheets; `map` renames
# the artist's files to the game's animation keys. `attack` lists every attack
# sheet so the game can pick one at random for variety.

CHARACTERS: Dict[str, dict] = {
    'adventurer': {
        'frame_w': 50, 'frame_h': 37,
        'base': 'Adventurer',
        # idle.png and walk.png are pre-assembled strips (tools/assemble_strips.py
        # concatenates the individually-shipped frame files this pack uses, since it
        # has no sheet files at all — one PNG per frame instead).
        'map': {'idle': 'idle', 'walk': 'walk'},
    },
    'knight': {
        'frame_w': 96, 'frame_h': 84,
        'base': 'Knight',
        'map': {'IDLE': 'idle', 'WALK': 'walk', 'RUN': 'run', 'DEFEND': 'defend',
                'HURT': 'hurt', 'DEATH': 'death', 'JUMP': 'jump',
                'ATTACK_1': 'attack_1', 'ATTACK_2': 'attack_2', 'ATTACK_3': 'attack_3'},
    },
    'gladiator': {
        'frame_w': 96, 'frame_h': 96,
        'base': 'Gladiator #3 2D Pixel Art/Gladiator #3 2D Pixel Art/Sprites',
        'map': {'IDLE': 'idle', 'WALK': 'walk', 'ATTACK': 'attack_1', 'HURT': 'hurt', 'DEATH': 'death'},
    },
    'samurai': {
        'frame_w': 96, 'frame_h': 96,
        'base': 'Samurai #4 2D Pixel Art v1.1/Samurai #4 2D Pixel Art v1.1/Samurai #4 2D Pixel Art v1.1/Sprites',
        'map': {'IDLE': 'idle', 'RUN': 'walk', 'JUMP': 'jump', 'DEFEND': 'defend', 'THROW': 'throw',
                'ATTACK 1': 'attack_1', 'ATTACK 2': 'attack_2', 'ATTACK 3': 'attack_3',
                'HURT': 'hurt', 'DEATH': 'death'},
    },
    'witch': {
        'frame_w': 125, 'frame_h': 125,
        'base': 'Witch/Witch/Sprite',
        'map': {'IDLE': 'idle', 'MOVE': 'walk', 'ATTACK': 'attack_1', 'HURT': 'hurt', 'DEATH': 'death'},
    },
    'pyromancer': {
        'frame_w': 100, 'frame_h': 100,
        'base': 'Pyromancer 2D Pixel Art/Pyromancer 2D Pixel Art/Sprites',
        'map': {'IDLE': 'idle', 'WALK': 'walk', 'ATTACK': 'attack_1', 'HURT': 'hurt', 'DEATH': 'death'},
    },
    'lizardman': {
        'frame_w': 144, 'frame_h': 96,
        'base': 'Lizardman 2D Pixel Art v1.2/Lizardman 2D Pixel Art v1.2/New Version/Sprites/outline',
        'map': {'IDLE': 'idle', 'WALK': 'walk', 'ATTACK 1': 'attack_1', 'ATTACK 2': 'attack_2',
                'HURT': 'hurt', 'DEATH': 'death'},
    },
    'wizard': {
        'frame_w': 128, 'frame_h': 78,
        'base': 'Wizard 2D Pixel Art v2.0/Wizard 2D Pixel Art v2.0/Sprites/with_outline',
        'map': {'IDLE': 'idle', 'WALK': 'walk', 'MELEE ATTACK': 'attack_1', 'RANGED ATTACK': 'attack_2',
                'HURT': 'hurt', 'DEATH': 'death'},
    },
    'dwarf': {
        'frame_w': 128, 'frame_h': 96,
        'base': 'Dwarf Warrior 2D Pixel Art v1.2/Dwarf Warrior 2D Pixel Art v1.2/New Version/Sprites/outline',
        'map': {'IDLE': 'idle', 'RUN': 'walk', 'ATTACK': 'attack_1', 'HURT': 'hurt', 'DEATH': 'death'},
    },
}

# ------------------------------------------------------------------- skins ----

SKINS: Dict[str, Optional[dict]] = {
    'original': None,  # ship the artist's colours untouched
    'necrotic': dict(primary=0.34, secondary=0.75, sat=0.85, light=0.95),
    # Was desaturating everything to ~45% (the reported "washed out" look) and
    # routing half the identity pixels to a cool blue secondary hue, which
    # fights the "bleached white and gilded" description outright. Both hues
    # now sit in the same warm gold/ivory family -- primary for the richer
    # gilded trim, secondary a touch paler for the bleached-white base -- with
    # saturation and lightness both pushed up so the recolor actually reads
    # as bright gold rather than pale tan.
    'holy':     dict(primary=0.13, secondary=0.11, sat=0.88, light=1.2),
    'infernal': dict(primary=0.02, secondary=0.09, sat=1.05, light=0.92),
    'frost':    dict(primary=0.55, secondary=0.47, sat=0.80, light=1.08),
}

SAT_THRESHOLD = 0.22  # below this a pixel is treated as neutral and left alone


def theme_pixel(rgb: RGB, theme: dict) -> RGB:
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < SAT_THRESHOLD:
        return rgb
    target = theme['primary'] if h < 0.5 else theme['secondary']
    nl = min(1.0, max(0.0, l * theme['light']))
    ns = min(1.0, s * theme['sat'])
    r2, g2, b2 = colorsys.hls_to_rgb(target % 1.0, nl, ns)
    return (round(r2 * 255), round(g2 * 255), round(b2 * 255))


def recolor(img: Image.Image, theme: Optional[dict]) -> Image.Image:
    img = img.convert('RGBA')
    if theme is None:
        return img
    out = Image.new('RGBA', img.size)
    src, dst = img.load(), out.load()
    cache: Dict[RGB, RGB] = {}
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            key = (r, g, b)
            mapped = cache.get(key)
            if mapped is None:
                mapped = theme_pixel(key, theme)
                cache[key] = mapped
            dst[x, y] = (*mapped, a)
    return out


def content_box(frames: List[Image.Image]) -> Tuple[int, int, int, int]:
    """Tight box that contains every frame's opaque pixels."""
    import numpy as np
    x0 = y0 = 1 << 30
    x1 = y1 = 0
    for f in frames:
        a = np.array(f)
        ys, xs = np.nonzero(a[:, :, 3])
        if len(xs) == 0:
            continue
        x0, x1 = min(x0, xs.min()), max(x1, xs.max())
        y0, y1 = min(y0, ys.min()), max(y1, ys.max())
    if x1 < x0:
        return (0, 0, frames[0].width, frames[0].height)
    return (int(x0), int(y0), int(x1) + 1, int(y1) + 1)


def slice_frames(sheet: Image.Image, frame_w: int) -> List[Image.Image]:
    n = sheet.width // frame_w
    return [sheet.crop((i * frame_w, 0, (i + 1) * frame_w, sheet.height)) for i in range(n)]


def find_sheet(base: str, artist_name: str) -> Optional[str]:
    for ext in ('.png', '.PNG'):
        p = os.path.join(base, artist_name + ext)
        if os.path.exists(p):
            return p
    return None


def process_character(name: str, src_root: str, out_root: str, runtime_manifest: dict) -> None:
    spec = CHARACTERS[name]
    base = os.path.join(src_root, spec['base'])
    if not os.path.isdir(base):
        print(f'  ! {name}: source folder not found, skipping ({spec["base"]})')
        return

    frame_w = spec['frame_w']

    # Load and slice every mapped animation once, in original colours.
    original: Dict[str, List[Image.Image]] = {}
    for artist_name, anim_key in spec['map'].items():
        path = find_sheet(base, artist_name)
        if not path:
            continue
        frames = slice_frames(Image.open(path).convert('RGBA'), frame_w)
        original[anim_key] = frames

    if 'idle' not in original:
        print(f'  ! {name}: no idle animation found, skipping')
        return

    # One shared crop box across all animations keeps frames aligned.
    all_frames = [f for frames in original.values() for f in frames]
    box = content_box(all_frames)
    cw, ch = box[2] - box[0], box[3] - box[1]

    counts = {k: len(v) for k, v in original.items()}
    attacks = sorted(k for k in counts if k.startswith('attack'))
    runtime_manifest[name] = {'frameW': cw, 'frameH': ch, 'animations': counts, 'attacks': attacks}

    for skin_name, theme in SKINS.items():
        dest = os.path.join(out_root, name, skin_name)
        os.makedirs(dest, exist_ok=True)
        for anim_key, frames in original.items():
            strip = Image.new('RGBA', (cw * len(frames), ch))
            for i, f in enumerate(frames):
                strip.paste(f.crop(box), (i * cw, 0))
            strip = recolor(strip, theme)
            strip.save(os.path.join(dest, f'{anim_key}.png'), optimize=True)
    print(f'  {name}: {len(original)} animations, frame {cw}x{ch}, skins {", ".join(SKINS)}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='root folder holding the extracted character packs')
    ap.add_argument('--out', required=True, help='output folder, e.g. public/heroes')
    ap.add_argument('--only', nargs='*', help='limit to these character names')
    args = ap.parse_args()

    runtime_manifest: Dict[str, dict] = {}
    names = args.only or list(CHARACTERS)

    for name in names:
        process_character(name, args.src, args.out, runtime_manifest)

    # Emit a runtime manifest the game reads to size each character correctly.
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'manifest.json'), 'w') as f:
        json.dump(runtime_manifest, f, indent=2)
    print(f'\nwrote {os.path.join(args.out, "manifest.json")} for {len(runtime_manifest)} characters')


if __name__ == '__main__':
    main()
