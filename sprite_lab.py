"""
Little Knight sprite authoring.

Pipeline:
  1. Draw a flat silhouette in *materials* (armour, trim, cloth, skin, leather,
     steel) using spans, so the figure is centred by construction.
  2. Lighting pass: each pixel's tone comes from its material's 4-tone ramp,
     chosen by which edges of its region it sits on, light from the upper left.
  3. Outline pass, then dump the char grid for the TSX file.
"""
from PIL import Image

W = H = 32

# material -> 4-tone ramp: deep, shade, base, light
MATERIALS = {
    'a': ('1', '2', '3', '4'),   # armour
    't': ('5', '5', '6', '7'),   # trim / gold
    'c': ('8', '8', '9', '0'),   # cloth
    's': ('d', 'd', 's', 'S'),   # skin
    'l': ('l', 'l', 'L', 'L'),   # leather
    'm': ('m', 'm', 'M', 'N'),   # steel
}

PAL = {
    '.': None,
    'k': (16, 12, 22),
    '1': (74, 84, 106), '2': (116, 128, 154), '3': (168, 180, 202), '4': (226, 234, 246),
    '5': (118, 80, 26), '6': (190, 142, 50), '7': (243, 208, 124),
    '8': (86, 26, 32), '9': (148, 48, 54), '0': (198, 86, 82),
    'd': (146, 92, 58), 's': (206, 148, 102), 'S': (240, 194, 150),
    'l': (52, 38, 28), 'L': (94, 72, 50),
    'm': (70, 78, 92), 'M': (142, 154, 172), 'N': (228, 238, 250),
    'e': (150, 231, 255),
}


class Canvas:
    def __init__(self):
        self.g = [['.'] * W for _ in range(H)]

    def span(self, y, x0, x1, ch):
        if 0 <= y < H:
            for x in range(max(0, x0), min(W - 1, x1) + 1):
                self.g[y][x] = ch

    def rect(self, y0, y1, x0, x1, ch):
        for y in range(y0, y1 + 1):
            self.span(y, x0, x1, ch)

    def px(self, y, x, ch):
        if 0 <= y < H and 0 <= x < W:
            self.g[y][x] = ch

    def trapezoid(self, y0, y1, tx0, tx1, bx0, bx1, ch):
        steps = max(1, y1 - y0)
        for i, y in enumerate(range(y0, y1 + 1)):
            f = i / steps
            self.span(y, round(tx0 + (bx0 - tx0) * f), round(tx1 + (bx1 - tx1) * f), ch)


def build_stand():
    c = Canvas()
    # Cape ends above the knee so it never reads as a skirt.
    c.trapezoid(14, 26, 11, 20, 8, 23, 'c')

    c.span(1, 15, 16, 'c')                            # plume
    c.span(2, 14, 17, 'c')
    c.span(3, 14, 17, 'c')

    c.span(4, 12, 19, 'a')                            # helm
    c.rect(5, 10, 11, 20, 'a')
    c.span(11, 12, 19, 'a')
    c.span(12, 13, 18, 'a')
    c.span(5, 11, 20, 't')
    c.span(8, 13, 18, 'k')                            # visor slit
    c.px(8, 14, 'e'); c.px(8, 17, 'e')

    c.span(13, 12, 19, 't')                           # gorget
    c.span(14, 8, 23, 'a')                            # pauldrons
    c.rect(15, 16, 7, 24, 'a')
    c.span(17, 8, 23, 'a')
    c.px(15, 8, 't'); c.px(15, 23, 't')

    c.rect(14, 23, 12, 19, 'a')                       # torso
    c.rect(17, 23, 15, 16, 'c')                       # tabard

    c.span(18, 8, 11, 'a'); c.span(19, 7, 10, 'a')    # arms
    c.rect(20, 21, 6, 9, 'a')
    c.rect(18, 21, 20, 23, 'a')

    c.span(22, 6, 9, 's')                             # hands
    c.rect(22, 23, 21, 23, 's')

    c.span(24, 11, 20, 'l')                           # belt
    c.px(24, 15, 't'); c.px(24, 16, 't')              # buckle
    c.rect(25, 26, 12, 19, 'a')                       # tassets

    c.rect(27, 29, 12, 14, 'a')                       # legs
    c.rect(27, 29, 17, 19, 'a')

    c.rect(30, 31, 11, 15, 'l')                       # boots
    c.rect(30, 31, 16, 20, 'l')

    # Sword: guard sits directly on the hand so the grip reads as held.
    c.rect(8, 20, 6, 7, 'm')
    c.px(7, 6, 'm'); c.px(7, 7, 'm')
    c.span(21, 4, 10, 't')                            # crossguard at hand height
    c.span(23, 6, 7, 'l')                             # grip below the fist
    c.span(24, 5, 8, 't')                             # pommel
    return c.g


def shade(grid):
    out = [['.'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            m = grid[y][x]
            if m == '.':
                continue
            if m not in MATERIALS:
                out[y][x] = m
                continue
            deep, dark, base, light = MATERIALS[m]

            def diff(dy, dx):
                ny, nx = y + dy, x + dx
                if not (0 <= ny < H and 0 <= nx < W):
                    return True
                return grid[ny][nx] != m

            score = (diff(-1, 0) + diff(0, -1)) - (diff(1, 0) + diff(0, 1))
            if score >= 2:
                out[y][x] = light
            elif score == 1:
                out[y][x] = base if (diff(1, 0) or diff(0, 1)) else light
            elif score == 0:
                out[y][x] = base
            elif score == -1:
                out[y][x] = dark
            else:
                out[y][x] = deep
    return out


def outline(grid):
    out = [row[:] for row in grid]
    for y in range(H):
        for x in range(W):
            if grid[y][x] != '.':
                continue
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and grid[ny][nx] != '.':
                    out[y][x] = 'k'
                    break
    return out


def render(grid, path, scale=10, bg=(30, 25, 40)):
    img = Image.new('RGB', (W, H), bg)
    px = img.load()
    for y in range(H):
        for x in range(W):
            col = PAL.get(grid[y][x])
            if col:
                px[x, y] = col
    img.resize((W * scale, H * scale), Image.NEAREST).save(path)


def emit(grid, name):
    lines = [f'export const {name} = [']
    for row in grid:
        lines.append(f"  '{''.join(row)}',")
    lines.append('];')
    return '\n'.join(lines)


if __name__ == '__main__':
    render(outline(shade(build_stand())), '/tmp/stand2.png')
    print('ok')


def build_walk(phase):
    """Two-frame walk cycle. phase 0 = left leg forward, 1 = right leg forward."""
    c = Canvas()
    lead, trail = (11, 18) if phase == 0 else (18, 11)
    sway = -1 if phase == 0 else 1

    c.trapezoid(15, 26, 11 + sway, 20 + sway, 8 + sway, 23 + sway, 'c')

    c.span(2, 15, 16, 'c')                            # plume trails the bob
    c.span(3, 14, 17, 'c')
    c.span(4, 14, 17, 'c')

    c.span(5, 12, 19, 'a')                            # helm, one pixel lower
    c.rect(6, 11, 11, 20, 'a')
    c.span(12, 12, 19, 'a')
    c.span(13, 13, 18, 'a')
    c.span(6, 11, 20, 't')
    c.span(9, 13, 18, 'k')
    c.px(9, 14, 'e'); c.px(9, 17, 'e')

    c.span(14, 12, 19, 't')
    c.span(15, 8, 23, 'a')
    c.rect(16, 17, 7, 24, 'a')
    c.span(18, 8, 23, 'a')
    c.px(16, 8, 't'); c.px(16, 23, 't')

    c.rect(15, 24, 12, 19, 'a')
    c.rect(18, 24, 15, 16, 'c')

    # Arms swing opposite to the legs.
    if phase == 0:
        c.span(19, 8, 11, 'a'); c.span(20, 7, 10, 'a')
        c.rect(21, 22, 6, 9, 'a')
        c.rect(19, 22, 20, 23, 'a')
        c.span(23, 6, 9, 's'); c.rect(23, 24, 21, 23, 's')
    else:
        c.rect(19, 21, 8, 11, 'a')
        c.span(22, 7, 10, 'a')
        c.rect(19, 22, 20, 23, 'a')
        c.span(23, 7, 10, 's'); c.rect(23, 24, 21, 23, 's')

    c.span(25, 11, 20, 'l')
    c.px(25, 15, 't'); c.px(25, 16, 't')
    c.rect(26, 27, 12, 19, 'a')

    # Legs stride: lead leg forward and straighter, trail leg bent back.
    c.rect(28, 30, lead, lead + 2, 'a')
    c.rect(28, 29, trail, trail + 2, 'a')
    c.rect(31, 31, lead - 1, lead + 3, 'l')
    c.rect(30, 31, trail, trail + 3, 'l')

    c.rect(9, 21, 6, 7, 'm')                          # sword shouldered
    c.px(8, 6, 'm'); c.px(8, 7, 'm')
    c.span(22, 4, 10, 't')
    c.span(24, 6, 7, 'l')
    c.span(25, 5, 8, 't')
    return c.g


QUEST_MARK_SRC = [
    '....tttt....',
    '...tttttt...',
    '..tttttttt..',
    '..tttkktt...',
    '..tttkktt...',
    '...ttkktt...',
    '....tkkt....',
    '....tkkt....',
    '....tttt....',
    '............',
    '....tttt....',
    '...tttttt...',
    '....tttt....',
]
