#!/usr/bin/env python3
"""
Some sprite packs ship one PNG per frame instead of horizontal strip sheets
(the Adventurer pack is like this: adventurer-idle-00.png, -01.png, ...).
tools/import_characters.py expects strip sheets, so this assembles loose
frames into them first.

Usage:
    python3 tools/assemble_strips.py --src <folder of loose frames> --out <folder>

Groups files by their name with the trailing frame number stripped (so
`adventurer-idle-00.png` and `adventurer-idle-01.png` become one `idle.png`
strip), sorts each group numerically, and concatenates horizontally.

To merge two animation variants into one longer loop (as done for the
Adventurer's idle + idle-2, giving an idle cycle with an occasional extra
gesture), pass --merge "idle,idle-2=idle" to combine both into a single
output named `idle`.
"""
import argparse
import os
import re
from collections import defaultdict

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Pillow is required:  pip install pillow')

FRAME_SUFFIX = re.compile(r'^(.*?)-(\d+)$')


def group_frames(src_dir):
    groups = defaultdict(list)
    for fn in sorted(os.listdir(src_dir)):
        if not fn.lower().endswith('.png'):
            continue
        stem = os.path.splitext(fn)[0]
        m = FRAME_SUFFIX.match(stem)
        if not m:
            continue
        name, num = m.group(1), int(m.group(2))
        groups[name].append((num, os.path.join(src_dir, fn)))
    for name in groups:
        groups[name].sort(key=lambda t: t[0])
    return groups


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--merge', action='append', default=[],
                     help='e.g. "idle,idle-2=idle" to concatenate two groups into one output')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    groups = group_frames(args.src)
    if not groups:
        raise SystemExit(f'No numbered frame files found in {args.src}')

    merges = {}
    consumed = set()
    for spec in args.merge:
        sources, target = spec.split('=')
        sources = [s.strip() for s in sources.split(',')]
        merges[target] = sources
        consumed.update(sources)

    written = {}
    for target, sources in merges.items():
        frames = []
        for s in sources:
            if s not in groups:
                raise SystemExit(f'--merge references unknown group "{s}"; found: {list(groups)}')
            frames += [p for _, p in groups[s]]
        written[target] = frames

    for name, frames in groups.items():
        if name in consumed:
            continue
        written[name] = [p for _, p in frames]

    for out_name, paths in written.items():
        imgs = [Image.open(p).convert('RGBA') for p in paths]
        w, h = imgs[0].size
        if any(im.size != (w, h) for im in imgs):
            raise SystemExit(f'"{out_name}": frames are not all the same size')
        sheet = Image.new('RGBA', (w * len(imgs), h))
        for i, im in enumerate(imgs):
            sheet.paste(im, (i * w, 0))
        out_path = os.path.join(args.out, f'{out_name}.png')
        sheet.save(out_path)
        print(f'{out_name}: {len(imgs)} frames -> {out_path} ({w * len(imgs)}x{h})')


if __name__ == '__main__':
    main()
