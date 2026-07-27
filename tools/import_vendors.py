#!/usr/bin/env python3
"""
Imports the three guild vendor sprites (Blacksmith, Alchemist, Enchanter).

Unlike tools/import_characters.py, vendors are NPCs, not player-customized
heroes: no skins, no multi-animation rig (idle/walk/attack/etc) -- each is a
single working-animation strip. This is a deliberately lighter, separate
pipeline rather than forcing vendors through the hero manifest system built
for a much more complex case.

Usage:
    python3 tools/import_vendors.py --src <folder with BLACKSMITH.png etc> --out public/vendors
"""
import argparse
import json
import os
from typing import List, Tuple

from PIL import Image

RGBA = Tuple[int, int, int, int]

VENDORS = {
    'blacksmith': {'file': 'BLACKSMITH.png', 'frames': 7, 'name': 'Blacksmith'},
    'alchemist': {'file': 'ALCHEMIST.png', 'frames': 8, 'name': 'Alchemist'},
    'enchanter': {'file': 'ENCHANTER.png', 'frames': 8, 'name': 'Enchanter'},
}


def content_box(frames: List[Image.Image]) -> Tuple[int, int, int, int]:
    """Tight bounding box of opaque pixels across every frame, so they share
    one crop and stay aligned frame-to-frame (same technique as the hero
    import pipeline)."""
    min_x, min_y = None, None
    max_x, max_y = None, None
    for f in frames:
        bbox = f.getbbox()
        if bbox is None:
            continue
        x0, y0, x1, y1 = bbox
        min_x = x0 if min_x is None else min(min_x, x0)
        min_y = y0 if min_y is None else min(min_y, y0)
        max_x = x1 if max_x is None else max(max_x, x1)
        max_y = y1 if max_y is None else max(max_y, y1)
    if min_x is None:
        return (0, 0, frames[0].width, frames[0].height)
    return (min_x, min_y, max_x, max_y)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    manifest = {}

    for vendor_id, cfg in VENDORS.items():
        src_path = os.path.join(args.src, cfg['file'])
        sheet = Image.open(src_path).convert('RGBA')
        total_w, total_h = sheet.size
        frame_count = cfg['frames']
        raw_frame_w = total_w // frame_count
        if total_w % frame_count != 0:
            raise SystemExit(
                f"{cfg['file']}: width {total_w} does not divide evenly into "
                f"{frame_count} frames (got {total_w / frame_count})"
            )

        raw_frames = [
            sheet.crop((i * raw_frame_w, 0, (i + 1) * raw_frame_w, total_h))
            for i in range(frame_count)
        ]

        x0, y0, x1, y1 = content_box(raw_frames)
        crop_w, crop_h = x1 - x0, y1 - y0
        cropped = [f.crop((x0, y0, x1, y1)) for f in raw_frames]

        strip = Image.new('RGBA', (crop_w * frame_count, crop_h), (0, 0, 0, 0))
        for i, frame in enumerate(cropped):
            strip.paste(frame, (i * crop_w, 0))

        out_path = os.path.join(args.out, f'{vendor_id}.png')
        strip.save(out_path)

        manifest[vendor_id] = {
            'name': cfg['name'],
            'frameW': crop_w,
            'frameH': crop_h,
            'frames': frame_count,
        }
        print(f'{vendor_id}: {frame_count} frames, {crop_w}x{crop_h} each (from {raw_frame_w}x{total_h} raw)')

    with open(os.path.join(args.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'\nwrote {args.out}/manifest.json for {len(manifest)} vendors')


if __name__ == '__main__':
    main()
