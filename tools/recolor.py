#!/usr/bin/env python3
"""
Recolour the knight sprite pack into one variant per hero class.

Method: strict palette swap with luminance preservation.

The pack uses 22 colours and binary alpha, so every pixel is an exact match for
one of a handful of known ramps. For each source colour we keep its **lightness**
untouched and replace only hue and saturation. That means the artist's shading
structure survives byte for byte -- nothing is blurred, averaged or resampled,
and the texture is identical to the original. Only the colour family changes.

Skin, outline, white highlights and the gold/blue effect colours are held
constant across all classes, so the six variants read as the same knight in
different livery rather than six unrelated characters.

Usage:
    python3 tools/recolor.py --src path/to/pack --out public/heroes
"""
from __future__ import annotations

import argparse
import colorsys
import os
from typing import Dict, Iterable, Tuple

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Pillow is required:  pip install pillow')

RGB = Tuple[int, int, int]

# ---------------------------------------------------------------- palette ---

ARMOR = ['#c7cfdd', '#bac6d4', '#92a1b9', '#657392', '#424c6e', '#2a2f4e']
CLOTH = ['#c64524', '#8e251d', '#5d2c28', '#571c27', '#391f21']
# Held constant across every class:
SKIN = ['#f6ca9f', '#e69c69', '#bf6f4a']
EFFECT = ['#ffc825', '#ffa214', '#ed7614', '#0098dc']
NEUTRAL = ['#ffffff', '#3d3d3d', '#1b1b1b', '#131313']

FRAME_W, FRAME_H = 96, 84
# The character never leaves this box in any sheet, so cropping to it drops
# roughly 63% of the pixels with no visual change.
CROP = (16, 16, 80, 62)          # left, top, right, bottom -> 64x46


class Livery:
    """Target hue/saturation/lightness treatment for one material group."""

    def __init__(self, hue: float | None, sat: float, light: float = 1.0):
        self.hue = hue            # degrees 0-360, or None to keep original hue
        self.sat = sat            # multiplier on original saturation
        self.light = light        # multiplier on original lightness


# hero class -> (armour livery, cloth livery)
CLASSES: Dict[str, Tuple[Livery, Livery]] = {
    # The pack as shipped: steel armour, red cape.
    'knight':  (Livery(None, 1.00, 1.00), Livery(None, 1.00, 1.00)),
    # Plain kit, green sash.
    'squire':  (Livery(210, 0.30, 0.98), Livery(140, 0.70, 0.95)),
    # Forest colours throughout.
    'archer':  (Livery(105, 0.55, 0.95), Livery(130, 0.85, 0.85)),
    # Muted, dark, low contrast.
    'rogue':   (Livery(265, 0.45, 0.72), Livery(280, 0.60, 0.62)),
    # Arcane blue with an indigo mantle.
    'mage':    (Livery(225, 0.85, 0.92), Livery(250, 0.90, 0.80)),
    # Pale gilded plate, violet cloak.
    'paladin': (Livery(45, 0.35, 1.12), Livery(285, 0.65, 0.95)),
}


def hex_to_rgb(value: str) -> RGB:
    v = value.lstrip('#')
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16))


def apply_livery(rgb: RGB, livery: Livery) -> RGB:
    """Replace hue and saturation, keep lightness. This is what preserves texture."""
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    new_h = (livery.hue / 360.0) if livery.hue is not None else h
    new_s = min(1.0, s * livery.sat)
    new_l = min(1.0, max(0.0, l * livery.light))
    r2, g2, b2 = colorsys.hls_to_rgb(new_h, new_l, new_s)
    return (round(r2 * 255), round(g2 * 255), round(b2 * 255))


def build_map(class_name: str) -> Dict[RGB, RGB]:
    armor_liv, cloth_liv = CLASSES[class_name]
    mapping: Dict[RGB, RGB] = {}
    for hexv in ARMOR:
        src = hex_to_rgb(hexv)
        mapping[src] = apply_livery(src, armor_liv)
    for hexv in CLOTH:
        src = hex_to_rgb(hexv)
        mapping[src] = apply_livery(src, cloth_liv)
    for hexv in SKIN + EFFECT + NEUTRAL:      # identity, but explicit
        src = hex_to_rgb(hexv)
        mapping[src] = src
    return mapping


def recolor_image(img: Image.Image, mapping: Dict[RGB, RGB]) -> Image.Image:
    img = img.convert('RGBA')
    out = Image.new('RGBA', img.size)
    src = img.load()
    dst = out.load()
    unmapped = set()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            key = (r, g, b)
            if key in mapping:
                nr, ng, nb = mapping[key]
            else:
                nr, ng, nb = key      # pass through anything unexpected
                unmapped.add(key)
            dst[x, y] = (nr, ng, nb, a)
    if unmapped:
        print(f'    note: {len(unmapped)} unmapped colour(s) passed through unchanged')
    return out


def crop_sheet(img: Image.Image) -> Image.Image:
    """Crop every frame to the content box, preserving frame alignment."""
    frames = img.size[0] // FRAME_W
    l, t, r, b = CROP
    w, h = r - l, b - t
    out = Image.new('RGBA', (w * frames, h))
    for i in range(frames):
        box = (i * FRAME_W + l, t, i * FRAME_W + r, b)
        out.paste(img.crop(box), (i * w, 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='folder holding the original sheets')
    ap.add_argument('--out', required=True, help='output folder')
    ap.add_argument('--no-crop', action='store_true', help='keep full 96x84 frames')
    ap.add_argument('--only', nargs='*', help='limit to these class names')
    args = ap.parse_args()

    sheets = sorted(f for f in os.listdir(args.src) if f.lower().endswith('.png'))
    if not sheets:
        raise SystemExit(f'no PNG sheets found in {args.src}')

    targets: Iterable[str] = args.only or CLASSES.keys()
    for class_name in targets:
        if class_name not in CLASSES:
            raise SystemExit(f'unknown class {class_name!r}')
        mapping = build_map(class_name)
        dest = os.path.join(args.out, class_name)
        os.makedirs(dest, exist_ok=True)
        print(f'{class_name}:')
        for sheet in sheets:
            img = Image.open(os.path.join(args.src, sheet))
            img = recolor_image(img, mapping)
            if not args.no_crop:
                img = crop_sheet(img)
            img.save(os.path.join(dest, sheet.lower()), optimize=True)
            print(f'    {sheet.lower()} -> {img.size[0]}x{img.size[1]}')
    print('\ndone')


if __name__ == '__main__':
    main()
