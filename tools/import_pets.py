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
        self, species_id: str, frame_w: int, frame_h: int,
        recolor: List[str], keep: List[str],
        sheet_file: str | None = None,
        rows: Dict[str, Tuple[int, int, int]] | None = None,
        extras: Dict[str, Tuple[int, int]] | None = None,
        anim_files: Dict[str, str] | None = None,
    ):
        self.species_id = species_id
        self.frame_w = frame_w
        self.frame_h = frame_h
        # Two source shapes, no longer strictly mutually exclusive as of
        # Rooftail's idle fix below -- a spec can now mix both at once:
        #  - sheet_file + rows: animations sliced from one row-grid sheet
        #    (still every species' default shape).
        #  - anim_files: one or more animations that have since been
        #    REPLACED by an individually-supplied pre-cut strip file
        #    (frame_w-wide cells, one row), overriding whatever that same
        #    animation name would have sliced from sheet_file/rows. Started
        #    as an all-or-nothing shape (the Hound's whole pack came this
        #    way, then Ashwing's full replacement) -- Rooftail's idle-only
        #    fix is the first case needing a MIX: idle2/movement/sleep
        #    stay on the original sheet, only idle moves to its own fixed
        #    file (the original sheet's idle row baked in 2 fully blank
        #    trailing frames -- confirmed directly by inspecting the
        #    original file's pixel alpha channel, not assumed from the
        #    visual "blinks out" symptom alone -- so the fix is a
        #    corrected replacement file, not a code-side workaround).
        #    If the same animation name appears in both, anim_files wins.
        self.sheet_file = sheet_file
        self.rows = rows or {}
        self.anim_files = anim_files or {}
        self.recolor = [hex_to_rgb(c) for c in recolor]
        self.keep = [hex_to_rgb(c) for c in keep]
        # single-frame standalone sprites (e.g. crow's crumbs/fish), not
        # animations -- (row, col) into the sheet_file grid. Not supported
        # for the anim_files shape (no species has needed it there yet).
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
        # 'idle' removed from here -- the sheet's own idle row baked in 2
        # fully blank trailing frames (confirmed by inspecting the actual
        # alpha channel: frames 0-5 all had ~148 opaque pixels, frames 6-7
        # had zero), which read in-game as the animation "blinking out"
        # every loop before jumping back to frame 0. Overridden below via
        # anim_files with a corrected, already-trimmed 6-frame
        # replacement rather than patched in place, so the original sheet
        # file itself never needs re-touching.
        'idle2': (1, 0, 8),
        'movement': (2, 0, 8),
        'sleep': (6, 0, 8),
    },
    anim_files={
        'idle': 'Red-Panda-idle-fixed.png',
    },
    recolor=['#d67941', '#9d5021', '#694129', '#825235'],  # bright + dark fur tones
    keep=['#2f2f2e', '#ffffff', '#b8b8b8'],
)

CROW = PetSpec(
    species_id='ashwing',
    frame_w=48, frame_h=39,
    # Replaced entirely per direct request -- the old 6-animation row-grid
    # sheet (perched/sitting/laying/eating/walking/flying + 3 extras) is
    # gone, simplified down to the same idle+movement shape every other
    # pet already uses. Two new pre-cut strip files, confirmed by
    # direct inspection to already be trimmed to the full 39px content
    # height with no export padding (unlike the Hound/dog batch, which
    # needed 33-42px trimmed off) -- ground_trim_for below still runs
    # unconditionally same as always, it just correctly computes 0 here
    # rather than being skipped as a special case.
    #
    # The filenames are a red herring, not a mistake: 'perched.png' is
    # the file's own name from the source pack, but the pose inside it is
    # actually a walking/pecking stance -- confirmed directly by the
    # person supplying the art, who pointed out the CURRENT idle
    # (resolved from the old 'perched' animation) was already secretly a
    # walking pose, not a true stationary perch. Rather than fight that,
    # it's embraced as the new 'idle' outright. 'flying.png' becomes
    # 'movement' (this species' run) for the same reason the Crow's
    # locomotion was always more flight than walk -- see the old spec's
    # own row comments above this one's history.
    anim_files={
        'idle': 'perched.png',
        'movement': 'flying.png',
    },
    # The body is near-monochrome (mostly pure black), so the ONE colour
    # with any real hue (#222034, a dark navy-black) is what actually
    # carries the recolour -- true black stays pure outline. This produces
    # a subtle iridescent-sheen effect on higher rarities, which happens to
    # match how real corvid feathers actually catch colour in light.
    # Unchanged from the previous sheet-based spec -- same art style, same
    # palette, just fewer poses.
    recolor=['#222034'],
    keep=['#000000', '#696a6a'],
)

HOUND = PetSpec(
    species_id='hatchery_hound',
    frame_w=100, frame_h=100,
    # Already three separate pre-cut strip files, not a row-grid --
    # frame count comes from each file's own width / frame_w, not a hand
    # counted row. Only 3 of the usual 6 canonical animations (no idle2/
    # catch/damage) -- fine, PetSprite.resolveAnimation already falls back
    # to idle for anything a species doesn't have.
    anim_files={
        'idle': 'Saint-Bernard-Idle.png',
        'movement': 'Saint-Bernard-run.png',
        'sleep': 'Saint-Bernard-lying-down.png',
    },
    recolor=['#9f5434', '#7a3e25', '#906028', '#cd6a41', '#b6603c'],  # fur tones
    keep=['#cbc4c1', '#b9afab', '#9d9592', '#100804'],  # white/grey body + outline
)

# Five more breeds from the same licensed pack as the Hound above -- same
# pre-cut-strip shape (idle + run only this time, no lying-down file was
# provided for any of these five), same 100x100 padded frame canvas
# confirmed directly against the actual uploaded files (1000x100 for a
# 10-frame idle strip, 800x100 for an 8-frame run strip, exactly like the
# Hound's own convention). Every recolor/keep list below was picked by
# actually sampling the real PNGs' colour histograms and visually
# confirming each colour's role (fur vs. outline/eye) against an 8x
# nearest-neighbour crop -- not guessed from the sheet thumbnails alone.
GOLDENPAW = PetSpec(
    species_id='goldenpaw',
    frame_w=100, frame_h=100,
    anim_files={
        'idle': 'Golden-Retriever-idle.png',
        'movement': 'Golden-Retriever-run.png',
    },
    recolor=['#945d25', '#845321', '#704518', '#b27231', '#a46627'],  # graduated golden/brown fur tones
    keep=['#202020', '#353434'],  # near-black eye/nose + a dark outline shade
)

FARWATCH = PetSpec(
    species_id='farwatch',
    frame_w=100, frame_h=100,
    anim_files={
        'idle': 'Akita-Idle.png',
        'movement': 'Akita-run.png',
    },
    recolor=['#ce9254', '#986838', '#b0a88e', '#e6ddc3'],  # two-tone tan/brown fur + cream underbelly
    keep=['#180f06', '#bababa'],  # near-black eye/nose + a small light highlight
)

LONGSHADOW = PetSpec(
    species_id='longshadow',
    frame_w=100, frame_h=100,
    anim_files={
        'idle': 'Great-Dane-idle.png',
        'movement': 'Great-Dane-run.png',
    },
    # Harlequin/mantle coat -- silver-grey base AND brown patches both
    # shift together as one cohesive "fur" palette per rarity tier, same
    # as every other multi-tone coat here, so the patched pattern itself
    # survives the recolor rather than one tone shifting independently of
    # the other.
    recolor=['#a9adae', '#705009', '#494f4f', '#6b7476', '#553d08', '#b7bdc0', '#c8c8c8', '#626b6b', '#adadad'],
    keep=['#0d1115', '#1d2329'],  # two near-black shades, both outline/eye -- never touched
)

BRIARBEARD = PetSpec(
    species_id='briarbeard',
    frame_w=100, frame_h=100,
    anim_files={
        'idle': 'Schnauzer-Idle.png',
        'movement': 'Schnauzer-run.png',
    },
    recolor=['#7c8094', '#676a7c', '#53576a', '#a0a2a2', '#878c8c', '#515362', '#858179'],  # blue-grey coat tones
    keep=['#282424'],  # near-black eye/nose
)

FROSTRUNNER = PetSpec(
    species_id='frostrunner',
    frame_w=100, frame_h=100,
    anim_files={
        'idle': 'Siberian-Husky-Idle.png',
        'movement': 'Siberian-Husky-run.png',
    },
    recolor=['#2a2b2b', '#6d7474', '#191a1a', '#4a5454', '#b9c5c5'],  # black/grey/white coat
    # #069d9d is the husky's actual cyan eye colour, confirmed by sampling
    # the real sprite and visually inspecting an enlarged crop -- kept
    # fixed on purpose across every rarity tier rather than folded into
    # the recolor list, the same way every other species keeps its eye
    # colour constant while its coat shifts. A Legendary Frostrunner
    # keeps its blue eyes; only the coat tints.
    keep=['#069d9d', '#4a4b4b'],
)

PETS: List[PetSpec] = [FOX, RED_PANDA, CROW, HOUND, GOLDENPAW, FARWATCH, LONGSHADOW, BRIARBEARD, FROSTRUNNER]


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


def frame_bottom_padding(frame: Image.Image) -> int | None:
    """Rows of fully-transparent padding below the lowest opaque pixel in
    this one frame, or None if the frame has no opaque pixels at all.
    Pure PIL (no numpy) -- frame sizes here are small (<=100x100), so a
    plain per-row scan is fast enough and keeps Pillow the tool's only
    dependency."""
    w, h = frame.size
    px = frame.load()
    last_opaque_row = -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                last_opaque_row = y
                break
    return None if last_opaque_row < 0 else h - 1 - last_opaque_row


def ground_trim_for(strips: Dict[str, Image.Image], frame_w: int) -> int:
    """
    How many empty rows to crop off the BOTTOM of every frame so the
    lowest point any animation actually reaches becomes the frame's own
    floor -- the fix for a species whose source pack baked in a lot of
    empty canvas below the character (confirmed directly: the Hatchery
    Hound's pack had a uniform 35px of nothing under every single frame
    of every animation, at a 100px frame height, which read as visibly
    floating once displayed grounded the way fox/red panda already sit
    natively at zero padding).

    Takes the MINIMUM padding across every frame of every animation, not
    a fixed guess -- a flying bird's legs tuck up mid-flap, a pouncing fox
    dips lower than its idle stance, and both of those are real motion,
    not padding to trim away. Using the single lowest point any frame
    reaches as the species' own "floor" crops out only the part that's
    empty in literally every frame, so animation with genuine vertical
    travel keeps that travel intact -- confirmed against the actual
    measured per-frame values (fox: 0 across every animation, already
    correct, so this is a no-op; crow: 11-17px depending on the frame,
    real wing motion; hound: exactly 35px on every single frame with zero
    variance, the one actually-uniform case).
    """
    paddings: List[int] = []
    for strip in strips.values():
        count = strip.width // frame_w
        for i in range(count):
            frame = strip.crop((i * frame_w, 0, (i + 1) * frame_w, strip.height))
            pad = frame_bottom_padding(frame)
            if pad is not None:
                paddings.append(pad)
    return min(paddings) if paddings else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='folder holding the raw uploaded sheets')
    ap.add_argument('--out', required=True, help='output folder, e.g. public/pets')
    ap.add_argument('--only', nargs='*', help='limit to these species ids')
    args = ap.parse_args()

    targets = [p for p in PETS if not args.only or p.species_id in args.only]
    manifest: Dict[str, dict] = {}

    for spec in targets:
        counts: Dict[str, int] = {}
        raw_strips: Dict[str, Image.Image] = {}
        # Per-animation source label, purely for the per-anim print line
        # below (row-sliced vs. a specific replacement filename) -- kept
        # separate from raw_strips/counts so both source shapes can merge
        # into the exact same dicts below without losing that detail.
        source_label: Dict[str, str] = {}
        missing = False
        sheet: Image.Image | None = None

        if spec.sheet_file:
            src_path = os.path.join(args.src, spec.sheet_file)
            if not os.path.exists(src_path):
                print(f'  skip {spec.species_id}: {spec.sheet_file} not found in {args.src}')
                continue
            sheet = Image.open(src_path)

        # Sheet-sliced rows first, then anim_files -- anim_files wins on a
        # name collision (see PetSpec's own comment on why: a replacement
        # file is a deliberate override of that one animation, not an
        # accident). Rooftail's idle fix is the first spec to actually
        # rely on this ordering; every prior spec only ever populated one
        # side or the other, so this is a no-op change in behaviour for
        # all of them.
        if sheet is not None:
            for anim, (row, start_col, count) in spec.rows.items():
                counts[anim] = count
                raw_strips[anim] = slice_strip(sheet, spec, row, start_col, count)
                source_label[anim] = f'row {row}'

        for anim, filename in spec.anim_files.items():
            src_path = os.path.join(args.src, filename)
            if not os.path.exists(src_path):
                print(f'  skip {spec.species_id}: {filename} not found in {args.src}')
                missing = True
                break
            strip = Image.open(src_path)
            counts[anim] = strip.width // spec.frame_w
            raw_strips[anim] = strip
            source_label[anim] = filename
        if missing:
            continue

        if not raw_strips:
            print(f'  skip {spec.species_id}: no sheet_file or anim_files produced any frames')
            continue

        label = spec.sheet_file if (spec.sheet_file and not spec.anim_files) else \
            (f'{spec.sheet_file} + {len(spec.anim_files)} replacement file(s)' if spec.sheet_file else 'pre-cut strips')
        print(f'{spec.species_id} ({label}):')

        trim = ground_trim_for(raw_strips, spec.frame_w)
        frame_h = spec.frame_h - trim
        if trim > 0:
            print(f'    grounding: trimming {trim}px of empty canvas off every frame\'s bottom ({spec.frame_h} -> {frame_h}px)')

        for anim, strip in raw_strips.items():
            cropped = strip.crop((0, 0, strip.width, frame_h)) if trim > 0 else strip
            for tier in RARITY_LIVERY:
                mapping = build_map(spec, tier)
                recoloured = recolor_image(cropped, mapping)
                dest_dir = os.path.join(args.out, spec.species_id, tier)
                os.makedirs(dest_dir, exist_ok=True)
                recoloured.save(os.path.join(dest_dir, f'{anim}.png'), optimize=True)
            print(f'    {anim}: {source_label[anim]}, {counts[anim]} frames -> all 5 rarity tiers')

        if sheet is not None:
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

        manifest[spec.species_id] = {'frameW': spec.frame_w, 'frameH': frame_h, 'animations': counts}

    os.makedirs(args.out, exist_ok=True)
    manifest_path = os.path.join(args.out, 'manifest.json')
    # Merge onto whatever's already there rather than overwriting wholesale
    # -- --only lets a single species be regenerated (e.g. after getting
    # its art on a different day, in a different --src folder than the
    # others) without wiping every other species' entry in the process.
    # Confirmed necessary the hard way: an early --only run without this
    # clobbered three already-built species down to just the one just run.
    existing: Dict[str, dict] = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            existing = json.load(f)
    existing.update(manifest)
    with open(manifest_path, 'w') as f:
        json.dump(existing, f, indent=2)
    print(f'\nwrote {manifest_path}')
    print('done')


if __name__ == '__main__':
    main()
