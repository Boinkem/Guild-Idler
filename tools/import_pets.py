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
        frame_boxes: Dict[str, List[Tuple[int, int, int, int]]] | None = None,
        frame_files: Dict[str, List[str]] | None = None,
        base_recolor: Dict[str, str] | None = None,
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
        # Fourth source shape, added for Bandit (raccoon): per-animation
        # EXPLICIT (x, y, w, h) crop boxes into sheet_file, for packs that
        # aren't a real uniform grid -- Bandit's own sheet has each row on
        # a consistent 24px vertical pitch but a DIFFERENT horizontal pitch
        # per row (16px for the front/back rows, ~21px for the side-profile
        # walk row), which the single frame_w/frame_h-per-sheet model above
        # can't express. Boxes below were read off the actual sheet via a
        # connected-component scan (every opaque blob's tight bounding box),
        # not eyeballed -- see the conversation this shipped in. Each cropped
        # frame is pasted into this spec's own frame_w x frame_h canvas,
        # horizontally centred and bottom-aligned (paws stay grounded even
        # though the raw crops vary a few px in both dimensions frame to
        # frame) -- see build_strip_from_boxes.
        self.frame_boxes = frame_boxes or {}
        # Fifth source shape, added for Tidewhelp (otter): some packs ship
        # one file PER FRAME rather than a sheet or a pre-cut strip (e.g.
        # otter_idle_1.png .. otter_idle_4.png). Each animation here is an
        # ordered list of filenames, concatenated left-to-right into a strip
        # at import time -- see stitch_frame_files. Every listed file is
        # assumed to already BE frame_w x frame_h (confirmed true for
        # Otter's own pack: every loose frame is a uniform 200x200 canvas),
        # so no cropping/padding happens here the way frame_boxes needs.
        self.frame_files = frame_files or {}
        # Sixth addition, added for Dragonling: a one-time FIXED colour
        # remap applied before the normal per-tier hue-shift livery, for a
        # species whose only supplied art is the wrong base colour for its
        # own name (Dragonling's pack is green; the black colourway was
        # never supplied -- see the conversation this shipped in). Keyed by
        # the same original source hex the sheet actually uses; build_map
        # below substitutes this target colour in for that source BEFORE
        # handing it to apply_livery, so the "common" tier (0deg hue shift)
        # renders as this fixed target colour exactly, and every other tier
        # hue-shifts onward FROM that colour rather than from the original
        # green. Every recolor entry not listed here just passes through as
        # its own original colour, same as always -- this is additive, not
        # a replacement for the recolor/keep split.
        self.base_recolor = {hex_to_rgb(k): hex_to_rgb(v) for k, v in (base_recolor or {}).items()}


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

# ---------------------------------------------------------- batch: patch 0250 ---
# Eleven species in one go -- five general-pool placeholders that already had
# a `PetDef` waiting on art (mossback/tidewhelp/wisplet, plus two new-species
# additions bandit/squirrel), and six dedicated-reward species tied to a
# specific raid encounter or quest chain (see pets.json/raid-encounters.json/
# quest-chains.json in this same patch). Colours below were picked the same
# way every prior batch was: sampling the real PNGs' histograms and
# confirming each colour's role against an enlarged crop, not guessed from
# the sheet thumbnail alone.

MOSSBACK = PetSpec(
    species_id='mossback',
    frame_w=48, frame_h=48,
    # GreenBrown is the one canonical colourway picked from the pack's six
    # (BlueBlue/BlueBrown/GreenBlue/GreenBrown/PurpleBlue/PurpleWhite) --
    # direct request was "use 1, then recolour", so the other five are
    # simply unused; the usual 5-tier auto-tint below covers the rest.
    # 'Explosion' (9 frames, a toxic special-attack burst) has no matching
    # PetAnimation slot yet -- skipped, not lost; the source file stays in
    # the pack if that vocabulary ever grows.
    anim_files={
        'idle': 'Frog/GreenBrown/ToxicFrogGreenBrown_Idle.png',
        'movement': 'Frog/GreenBrown/ToxicFrogGreenBrown_Hop.png',
        'catch': 'Frog/GreenBrown/ToxicFrogGreenBrown_Attack.png',
        'damage': 'Frog/GreenBrown/ToxicFrogGreenBrown_Hurt.png',
    },
    recolor=['#63c74d', '#3e8948', '#265c42', '#e4a672', '#ead4aa', '#b86f50', '#733e39'],  # skin greens + belly/spot tans
    keep=['#181425'],  # outline
)

TIDEWHELP = PetSpec(
    species_id='tidewhelp',
    frame_w=200, frame_h=200,
    # Loose numbered frames, not a sheet -- see frame_files above. Only the
    # idle/run frames were asked for; idle_alt/jump/land/sleep/spin are
    # in the pack but deliberately unused this patch.
    frame_files={
        'idle': ['Otter/otter_idle_1.png', 'Otter/otter_idle_2.png', 'Otter/otter_idle_3.png', 'Otter/otter_idle_4.png'],
        'movement': ['Otter/otter_run_1.png', 'Otter/otter_run_2.png', 'Otter/otter_run_3.png'],
    },
    recolor=['#8f563b', '#78432b', '#c4986e', '#eec39a'],  # fur + belly tones
    keep=['#000000', '#45283c'],  # outline + eye/nose
)

# Bandit's own sheet ships two colourways (Brown/Grey) that are the exact
# same shapes with a different palette baked in -- confirmed by identical
# per-colour pixel counts between the two files. Brown picked as canonical,
# same "pick one, auto-tint covers the rest" treatment as Mossback above.
# Box coordinates are the real connected-component scan of
# RaccoonRun SpriteSheets/BrownRaccoons.png (see PetSpec.frame_boxes) --
# row 1 (front-facing idle bob) and row 4 (side-profile walk) specifically,
# the two rows that map onto this game's idle/movement vocabulary. Rows 2
# (3/4-angle idle, both directions) and 3 (back-facing idle) are real frames
# in the source pack but have no slot to go in yet.
BANDIT = PetSpec(
    species_id='bandit',
    frame_w=20, frame_h=22,
    sheet_file='Raccoon/RaccoonRun SpriteSheets/BrownRaccoons.png',
    frame_boxes={
        'idle': [(1, 1, 16, 22), (17, 1, 16, 22), (33, 1, 16, 22)],
        'movement': [(0, 73, 17, 22), (22, 73, 17, 22), (43, 73, 20, 22), (64, 73, 17, 22)],
    },
    recolor=['#5e4a40', '#bba69a', '#33241d', '#55433a', '#3b291f', '#4d372b'],  # fur tones
    keep=['#000000', '#ffffff'],  # outline + tiny highlight
)

WISPLET = PetSpec(
    species_id='wisplet',
    frame_w=288, frame_h=288,
    # Single 10-frame idle-flicker strip, no other animation supplied --
    # PetSprite already falls back to idle for movement/etc, same as every
    # other species missing a row. NOTE: this pack is a warm fire-coloured
    # wisp (orange/red/cream), not the pale cool light Wisplet's own flavour
    # text originally described -- flavour text updated in this same patch
    # (pets.json) to match the actual art instead of the other way around.
    anim_files={'idle': "Whisp/NoobGodoter'sSpritesheet.png"},
    recolor=['#e02807', '#fa6f19', '#f5e98b'],  # flame body + pale core
    keep=['#3d0202'],  # outline
)

SQUIRREL = PetSpec(
    species_id='squirrel',
    frame_w=32, frame_h=32,
    sheet_file='Squirrel/Squirrel Sprite Sheet.png',
    # Confirmed directly: this sheet IS a uniform 32x32, 8-col grid despite
    # not every row being fully populated (row 0 has 6 frames of 8 possible
    # columns, row 3 has 4) -- row/col placement read off a connected-
    # component scan, not assumed from a filled-grid guess. Row 0 (idle) and
    # row 3 (run) per direct instruction; rows 1/2/4/5/6 (a near-duplicate
    # idle variant, a longer leap cycle, a two-frame "found something" pose,
    # and a pounce) are real content but unused this patch.
    rows={
        'idle': (0, 0, 6),
        'movement': (3, 0, 4),
    },
    recolor=['#825235', '#694129', '#a67354'],  # fur tones (same bright/dark-tone family fox/red panda already use)
    keep=['#2f2f2e', '#e4e4e4'],  # outline + small highlight
)

# The next six species (Skelly, Imp, Dragonling, Mimic, Skeleton Warrior,
# Flying Eye) are all from the same "2D Pixel Art" template pack family --
# confirmed by their near-identical palette (c42430/891e2b/571c27 reds,
# 657392/c7cfdd blue-greys turn up in almost every one of them) and, more
# importantly, by every one of them shipping animation files under the
# EXACT SAME generic names (IDLE.png/WALK.png/ATTACK.png/HURT.png/
# MOVE.png/DEATH.png, under Sprites/<with|without>_outline or
# Sprites/<no|>_outline depending on the pack). Every anim_files path below
# is deliberately the FULL path from --src, one species subfolder deep,
# rather than the bare filename every earlier species in this file uses --
# six same-named IDLE.png files WOULD silently overwrite each other if
# --src were ever a single flat folder holding all of them side by side.
# This assumes --src is the folder each pack's own zip extracted INTO
# (i.e. each pack's own top-level folder -- "Skeleton Mage 2D Pixel Art/",
# "Imp 2D Pixel Art v1.2/", etc -- sits directly under --src, unrenamed),
# which is what a normal unzip already produces with zero manual renaming.

SKELLY = PetSpec(
    species_id='skelly',
    frame_w=128, frame_h=128,
    anim_files={
        'idle': 'Skeleton Mage 2D Pixel Art/Sprites/without_outline/IDLE.png',
        'movement': 'Skeleton Mage 2D Pixel Art/Sprites/without_outline/WALK.png',
        'catch': 'Skeleton Mage 2D Pixel Art/Sprites/without_outline/ATTACK.png',
        'damage': 'Skeleton Mage 2D Pixel Art/Sprites/without_outline/HURT.png',
    },
    # Robe/hood purples + the dark blue-black base recolour; bone/skin tones
    # shift too (a Legendary Skelly reads as a different creature, same as
    # every fur-based species). The staff orb's glow (edab50/ed7614/ffc825)
    # is kept fixed across every tier on purpose -- same "constant magic
    # glow" treatment Frostrunner's eyes already established.
    recolor=['#03193f', '#622461', '#3b1443', '#93388f', '#ca52c9', '#f6ca9f', '#e69c69', '#f9e6cf', '#5d2c28', '#391f21'],
    keep=['#131313', '#edab50', '#ed7614', '#ffc825'],
)

IMP = PetSpec(
    species_id='imp',
    frame_w=128, frame_h=48,
    anim_files={
        'idle': 'Imp 2D Pixel Art v1.2/Sprites/no_outline/IDLE.png',
        'movement': 'Imp 2D Pixel Art v1.2/Sprites/no_outline/MOVE.png',
        'catch': 'Imp 2D Pixel Art v1.2/Sprites/no_outline/ATTACK.png',
        'damage': 'Imp 2D Pixel Art v1.2/Sprites/no_outline/HURT.png',
    },
    recolor=['#c42430', '#891e2b', '#571c27', '#424c6e', '#657392', '#2a2f4e', '#c7cfdd'],  # skin reds + horn/wing blues
    keep=['#3d3d3d', '#272727', '#5d5d5d', '#080808', '#000000', '#ffffff'],  # outline/shadow family + highlight
)

# Only the green colourway was supplied (see base_recolor below) -- the
# actual name/id was shortened from black_dragonling to just "dragonling"
# in this same patch, since the black art doesn't exist yet and the old id
# read as a promise the sprite couldn't keep.
DRAGONLING = PetSpec(
    species_id='dragonling',
    frame_w=158, frame_h=125,  # confirmed against IDLE.png (632x125, visually 4 frames) and every other file dividing cleanly at 158
    anim_files={
        'idle': 'Baby Dragon 2D Pixel Art/Sprites/without_outline/IDLE.png',
        'movement': 'Baby Dragon 2D Pixel Art/Sprites/without_outline/MOVE.png',
        'catch': 'Baby Dragon 2D Pixel Art/Sprites/without_outline/ATTACK.png',
        'damage': 'Baby Dragon 2D Pixel Art/Sprites/without_outline/HURT.png',
    },
    # Every scale/wing/horn tone remapped to a black/charcoal/deep-maroon
    # palette -- a hand-authored "black dragon" livery, not a hue-shift of
    # the source green (see PetSpec.base_recolor for why hue-shift alone
    # can't get there). The small red accent (c42430) and white glint
    # (ffffff) are deliberately left in `keep` rather than remapped, for a
    # glowing-eyes-in-the-dark read rather than a flat black silhouette.
    recolor=['#1e6f50', '#33984b', '#5ac54f', '#e69c69', '#f6ca9f', '#bf6f4a', '#92a1b9', '#c7cfdd', '#657392', '#0c2e44', '#134c4c'],
    keep=['#c42430', '#ffffff'],
    base_recolor={
        '#1e6f50': '#16181c', '#33984b': '#2b2e33', '#5ac54f': '#3d4046',
        '#e69c69': '#4a1414', '#f6ca9f': '#6b1f1f', '#bf6f4a': '#591818',
        '#92a1b9': '#14161c', '#c7cfdd': '#262b33', '#657392': '#1b1f28',
        '#0c2e44': '#0a0a10', '#134c4c': '#0d1616',
    },
)

MIMIC = PetSpec(
    species_id='mimic',
    frame_w=96, frame_h=96,  # confirmed visually against IDLE.png (768x96, 8 frames) -- the raw GCD across every file lands on 192, exactly double the real grid, since nothing forces it lower
    anim_files={
        'idle': 'Mimic 2D Pixel Art v1.2/New Version/Sprites/no_outline/IDLE.png',
        'movement': 'Mimic 2D Pixel Art v1.2/New Version/Sprites/no_outline/WALK.png',
        'catch': 'Mimic 2D Pixel Art v1.2/New Version/Sprites/no_outline/ATTACK.png',
        'damage': 'Mimic 2D Pixel Art v1.2/New Version/Sprites/no_outline/HURT.png',
    },
    # 'APPEAR' (8 frames -- the chest "waking up" and standing on its own
    # legs) has no matching PetAnimation slot yet, same gap as Mossback's
    # Explosion -- unused this patch, not lost. 'New Version' picked over
    # 'Old Version' -- newer art, same pack.
    recolor=['#5d2c28', '#bf6f4a', '#8a4836', '#391f21', '#c7cfdd', '#657392', '#92a1b9'],  # wood tones + metal bands
    keep=['#c42430', '#571c27', '#891e2b', '#1c121c', '#ffffff', '#b4b4b4'],  # red maw stays red + outline/teeth
)

# Facing bug reported alongside the art itself -- see PET_REVERSED_FACING
# in src/ui/sprites/PetSprite.tsx, same fix shape as HeroSprite's
# HERO_REVERSED_FACING. Only ATTACK 1 of the pack's two attack variants is
# wired to 'catch'; ATTACK 2 is unused this patch, same as every other
# pack's extra/unmapped animation this batch. Note the pack's own folder
# name has a double space ("Warrior  2D") -- kept exactly as extracted
# rather than "corrected", since that's what --src will actually contain.
SKELETON_WARRIOR = PetSpec(
    species_id='skeleton_warrior',
    frame_w=89, frame_h=78,
    anim_files={
        'idle': 'Skeleton Warrior  2D Pixel Art v1.1/Sprites/without_outline/IDLE.png',
        'movement': 'Skeleton Warrior  2D Pixel Art v1.1/Sprites/without_outline/WALK.png',
        'catch': 'Skeleton Warrior  2D Pixel Art v1.1/Sprites/without_outline/ATTACK 1.png',
        'damage': 'Skeleton Warrior  2D Pixel Art v1.1/Sprites/without_outline/HURT.png',
    },
    recolor=['#858585', '#b4b4b4', '#5d5d5d', '#3d3d3d', '#657392', '#1a1932', '#2a2f4e', '#c7cfdd', '#92a1b9'],  # bone tones + armour blues
    keep=['#272727', '#131313', '#0e071b'],  # outline family
)

# No dedicated idle file in this pack -- MOVE (the floating hover loop) is
# wired to BOTH idle and movement, same "one animation, two vocabulary
# slots" shape a stationary-but-always-animated creature needs.
FLYING_EYE = PetSpec(
    species_id='flying_eye',
    frame_w=150, frame_h=150,
    anim_files={
        'idle': 'Flying Eye 2D Pixel Art/Sprites/without_outline/MOVE.png',
        'movement': 'Flying Eye 2D Pixel Art/Sprites/without_outline/MOVE.png',
        'catch': 'Flying Eye 2D Pixel Art/Sprites/without_outline/ATTACK.png',
        'damage': 'Flying Eye 2D Pixel Art/Sprites/without_outline/HURT.png',
    },
    recolor=['#0c2e44', '#134c4c', '#1e6f50', '#33984b', '#c42430', '#891e2b', '#571c27', '#f5555d', '#f68187'],  # wing/tentacle body greens + iris/tentacle-underside reds
    keep=['#ffffff', '#b4b4b4', '#858585', '#161c39', '#22284a'],  # sclera + outline family
)

PETS: List[PetSpec] = [
    FOX, RED_PANDA, CROW, HOUND, GOLDENPAW, FARWATCH, LONGSHADOW, BRIARBEARD, FROSTRUNNER,
    MOSSBACK, TIDEWHELP, BANDIT, WISPLET, SQUIRREL, SKELLY, IMP, DRAGONLING, MIMIC, SKELETON_WARRIOR, FLYING_EYE,
]


# -------------------------------------------------------------- recolour ---

def build_map(spec: PetSpec, tier: str) -> Dict[RGB, RGB]:
    livery = RARITY_LIVERY[tier]
    mapping: Dict[RGB, RGB] = {}
    for src in spec.recolor:
        # base_recolor substitutes a fixed target colour in for src BEFORE
        # the livery shift, so "common" (0deg shift) renders as that exact
        # target colour and every other tier hue-shifts onward from there
        # instead of from the source art's own original colour. No-op for
        # every species without a base_recolor entry for this src (the
        # overwhelming majority) -- falls through to the original
        # hue-shift-from-source behaviour exactly as before.
        base = spec.base_recolor.get(src, src)
        mapping[src] = apply_livery(base, livery)
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


def build_strip_from_boxes(img: Image.Image, boxes: List[Tuple[int, int, int, int]], frame_w: int, frame_h: int) -> Image.Image:
    """PetSpec.frame_boxes support -- crops each explicit (x, y, w, h) box
    out of img and pastes it into a uniform frame_w x frame_h canvas,
    horizontally centred and bottom-aligned. Centring/bottom-align (rather
    than pasting at (0, 0) the way slice_strip does for a real grid) matters
    here specifically because the boxes themselves vary a few px in both
    dimensions frame to frame -- Bandit's own idle boxes are 16px wide,
    its walk boxes 17-20px -- so a naive top-left paste would make the
    animation visibly hop side to side and float up/down as it played."""
    out = Image.new('RGBA', (frame_w * len(boxes), frame_h))
    for i, (x, y, w, h) in enumerate(boxes):
        frame = img.crop((x, y, x + w, y + h))
        ox = (frame_w - w) // 2
        oy = frame_h - h
        out.paste(frame, (i * frame_w + ox, oy), frame)
    return out


def stitch_frame_files(paths: List[str], frame_w: int, frame_h: int) -> Image.Image:
    """PetSpec.frame_files support -- concatenates a list of individual
    per-frame files (each assumed to already be frame_w x frame_h, unlike
    frame_boxes' crops) left to right into one strip, same output shape
    slice_strip/build_strip_from_boxes both already produce."""
    out = Image.new('RGBA', (frame_w * len(paths), frame_h))
    for i, path in enumerate(paths):
        frame = Image.open(path).convert('RGBA')
        out.paste(frame, (i * frame_w, 0), frame)
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

            # frame_boxes shares sheet_file with the rows above (Bandit uses
            # both: none currently, but nothing stops a future spec mixing
            # them the same way rows+anim_files already do for Rooftail).
            for anim, boxes in spec.frame_boxes.items():
                counts[anim] = len(boxes)
                raw_strips[anim] = build_strip_from_boxes(sheet, boxes, spec.frame_w, spec.frame_h)
                source_label[anim] = f'{len(boxes)} explicit boxes'

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

        for anim, filenames in spec.frame_files.items():
            paths = [os.path.join(args.src, f) for f in filenames]
            not_found = [f for f, p in zip(filenames, paths) if not os.path.exists(p)]
            if not_found:
                print(f'  skip {spec.species_id}: {", ".join(not_found)} not found in {args.src}')
                missing = True
                break
            counts[anim] = len(paths)
            raw_strips[anim] = stitch_frame_files(paths, spec.frame_w, spec.frame_h)
            source_label[anim] = f'{len(paths)} stitched loose frames'
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
