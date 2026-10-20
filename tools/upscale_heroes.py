#!/usr/bin/env python3
"""
Double the pixel resolution of whole hero classes (patch 0435).

Why: every class is drawn at the same on-screen height, so classes whose source
frames are small get chunky pixels -- the adventurer (30px tall) showed ~2.7
screen px per sprite px, the gladiator ~2.5, the knight ~2.1, against ~1.1-1.6
for most of the roster. Doubling those three lands them at ~1.3 / ~1.3 / ~1.05.

What it does, per class, for EVERY skin folder (original, tints, per-class sets):
  1. Scale2x (EPX) each frame -- pixel-art-aware 2x: crisp, rounds off stair-steps,
     never blurs or invents colours.
  2. Outline fix:
       - classes that already have a dark outline (knight, gladiator): Scale2x turns
         a 1px outline into 2px; the outer layer is peeled back so it's 1px again
         (that half-pixel outline is most of the "finer" look).
       - classes without one (adventurer): add a 1px dark outline around the body,
         using the original skin's silhouette so effects drawn around the hero
         (halos, sparkles, tendrils) don't get outlined.
  3. manifest.json: frameW/frameH doubled and "artScale": 2 recorded, which also
     stops the script from doubling a class twice.

HeroSprite (and the DevTool sprite lab) size everything from the manifest, so no
code change is needed -- the doubled art draws at exactly the same size.

Usage (from the repo root):
  python tools/upscale_heroes.py adventurer knight gladiator
  python tools/upscale_heroes.py --heroes public/heroes --backup backups/heroes-1x adventurer
Needs: pip install pillow numpy

Re-running tools/import_characters.py regenerates these classes at 1x and resets
the manifest -- run this script again afterwards.
"""
import argparse, json, os, shutil
import numpy as np
from PIL import Image

ANIMS = {'idle', 'walk', 'run', 'defend', 'hurt', 'death', 'jump', 'throw',
         'attack_1', 'attack_2', 'attack_3'}
SKIP_SKINS = {'champion'}          # parked set, regenerated later at the new size
NEEDS_OUTLINE = {'adventurer'}     # source pack has no dark outline
OUTLINE = (27, 27, 27, 255)


def _key(f):
    f = f.astype(np.uint32)
    k = (f[..., 0] << 24) | (f[..., 1] << 16) | (f[..., 2] << 8) | f[..., 3]
    k[f[..., 3] == 0] = 0
    return k


def scale2x(f):
    """EPX / Scale2x on one RGBA frame."""
    H, W = f.shape[:2]
    k = _key(f)
    p = np.pad(k, 1, mode='edge')
    fp = np.pad(f, ((1, 1), (1, 1), (0, 0)), mode='edge')
    A, B, C, D = p[:-2, 1:-1], p[1:-1, 2:], p[1:-1, :-2], p[2:, 1:-1]
    fA, fB, fC, fD = fp[:-2, 1:-1], fp[1:-1, 2:], fp[1:-1, :-2], fp[2:, 1:-1]
    o = np.zeros((H * 2, W * 2, 4), f.dtype)
    sel = lambda cond, src: np.where(cond[..., None], src, f)
    o[0::2, 0::2] = sel((C == A) & (C != D) & (A != B), fA)
    o[0::2, 1::2] = sel((A == B) & (A != C) & (B != D), fB)
    o[1::2, 0::2] = sel((D == C) & (D != B) & (C != A), fC)
    o[1::2, 1::2] = sel((B == D) & (B != A) & (D != C), fD)
    return o


def _n4(m):
    """pixels with at least one 4-neighbour set in m"""
    o = np.zeros_like(m)
    o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    return o


def thin_outline(o):
    """peel the outer layer of a doubled dark outline back to 1px"""
    a = o[..., 3]
    dark = (a == 255) & (o[..., :3].max(-1) < 40)
    air = a < 200                                   # transparent or a soft glow
    outer = dark & _n4(air)
    inner = dark & ~outer
    peel = outer & _n4(inner)
    if not peel.any():
        return o
    # replace each peeled pixel with whatever is beside it on the air side
    out = o.copy()
    H, W = a.shape
    ys, xs = np.where(peel)
    for y, x in zip(ys, xs):
        out[y, x] = (0, 0, 0, 0)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            Y, X = y + dy, x + dx
            if 0 <= Y < H and 0 <= X < W and air[Y, X] and not peel[Y, X]:
                out[y, x] = o[Y, X]
                break
    return out


def add_outline(o, body):
    """1px dark outline around `body` (bool mask), only over non-solid pixels"""
    ring = _n4(body) & ~body & (o[..., 3] < 255)
    out = o.copy()
    out[ring] = OUTLINE
    return out


def frames(path, fw):
    im = np.array(Image.open(path).convert('RGBA'))
    return [im[:, i * fw:(i + 1) * fw] for i in range(im.shape[1] // fw)]


def process_class(root, cls, entry, backup):
    fw, fh = entry['frameW'], entry['frameH']
    cdir = os.path.join(root, cls)
    skins = sorted(d for d in os.listdir(cdir)
                   if os.path.isdir(os.path.join(cdir, d)) and d not in SKIP_SKINS)
    # body silhouettes from the original skin, for classes that get a new outline
    bodies = {}
    if cls in NEEDS_OUTLINE:
        for a in ANIMS:
            p = os.path.join(cdir, 'original', a + '.png')
            if os.path.exists(p):
                bodies[a] = [scale2x(f)[..., 3] == 255 for f in frames(p, fw)]
    n = 0
    for s in skins:
        for fn in sorted(os.listdir(os.path.join(cdir, s))):
            a, ext = os.path.splitext(fn)
            if ext != '.png' or a not in ANIMS:
                continue
            src = os.path.join(cdir, s, fn)
            if backup:
                dst = os.path.join(backup, cls, s, fn)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
            out = []
            for i, f in enumerate(frames(src, fw)):
                g = scale2x(f)
                if cls in NEEDS_OUTLINE:
                    b = bodies.get(a)
                    g = add_outline(g, b[i] if b and i < len(b) else g[..., 3] == 255)
                else:
                    g = thin_outline(g)
                out.append(g)
            Image.fromarray(np.concatenate(out, 1), 'RGBA').save(src)
            n += 1
    entry['frameW'], entry['frameH'], entry['artScale'] = fw * 2, fh * 2, 2
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('classes', nargs='+')
    ap.add_argument('--heroes', default=os.path.join(os.path.dirname(__file__), '..', 'public', 'heroes'))
    ap.add_argument('--backup', default=None, help='copy each 1x sheet here before overwriting')
    args = ap.parse_args()
    mpath = os.path.join(args.heroes, 'manifest.json')
    manifest = json.load(open(mpath))
    if args.backup:
        os.makedirs(args.backup, exist_ok=True)
        shutil.copy2(mpath, os.path.join(args.backup, 'manifest.json'))
    for cls in args.classes:
        entry = manifest[cls]
        if entry.get('artScale', 1) >= 2:
            print(f'{cls}: already doubled, skipped')
            continue
        n = process_class(args.heroes, cls, entry, args.backup)
        print(f'{cls}: {n} sheets doubled -> {entry["frameW"]}x{entry["frameH"]}')
    json.dump(manifest, open(mpath, 'w'), indent=2)


if __name__ == '__main__':
    main()
