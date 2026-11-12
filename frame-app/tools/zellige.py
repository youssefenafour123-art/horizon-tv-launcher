"""Procedural zellige: the eight-pointed star and cross tessellation, with hand-glazed tile variation.
   render(name, path) writes a 1920x1200 PNG."""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

PALETTES = {
    # grout, star A, star B, cross, inner star
    'zellige-fez': dict(grout=(226, 218, 200), a=(28, 66, 128), b=(240, 232, 214), cross=(24, 98, 76), inner=(206, 150, 58)),
    'zellige-marrakech': dict(grout=(236, 226, 206), a=(176, 84, 56), b=(28, 30, 32), cross=(30, 104, 80), inner=(222, 196, 140)),
}


def star(cx, cy, R, rot=0.0):
    r = R * math.cos(math.pi / 4) / math.cos(math.pi / 8)
    pts = []
    for k in range(16):
        ang = rot + k * math.pi / 8
        rad = R if k % 2 == 0 else r
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return pts


def cross(cx, cy, s):
    """the cross left between the four stars around a cell centre: each star gives the edge facing the centre"""
    R = s / 2
    r = R * math.cos(math.pi / 4) / math.cos(math.pi / 8)
    pts = []
    for qx, qy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        sx, sy = cx + qx * s / 2, cy + qy * s / 2
        base = math.atan2(cy - sy, cx - sx)
        for k, rad in ((-2, R), (-1, r), (0, R), (1, r)):
            ang = base + k * math.pi / 8
            pts.append((sx + rad * math.cos(ang), sy + rad * math.sin(ang)))
    pts.sort(key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    return pts


def shade(col, k):
    return tuple(max(0, min(255, int(c * k))) for c in col)


def smooth_noise(w, h, cell, rnd):
    small = Image.effect_noise((max(2, w // cell), max(2, h // cell)), 60)
    return small.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(cell * .6))


def render(name, path, W=1920, H=1200, seed=7, vignette=True, spacing=236):
    pal = PALETTES[name]
    rnd = random.Random(seed)
    SS = 2
    w, h = W * SS, H * SS
    s = spacing * SS                   # star spacing
    grout = 6 * SS
    img = Image.new('RGB', (w, h), pal['grout'])
    mask = Image.new('L', (w, h), 0)    # where the tiles are (for the bevel)
    d, dm = ImageDraw.Draw(img), ImageDraw.Draw(mask)
    gloss = Image.new('L', (w, h), 0)   # per-tile glaze highlight
    dg = ImageDraw.Draw(gloss)
    nx, ny = w // s + 2, h // s + 2
    ox, oy = (w - (nx - 1) * s) / 2, (h - (ny - 1) * s) / 2

    def tile(poly, col, size):
        k = rnd.uniform(.88, 1.08)                      # every tile glazed a little differently
        d.polygon(poly, fill=shade(col, k))
        dm.polygon(poly, fill=255)
        dm.line(poly + [poly[0]], fill=0, width=grout, joint='curve')
        d.line(poly + [poly[0]], fill=pal['grout'], width=grout, joint='curve')
        cx = sum(p[0] for p in poly) / len(poly); cy = sum(p[1] for p in poly) / len(poly)
        hx, hy = cx - size * .25, cy - size * .3
        dg.ellipse((hx - size * .3, hy - size * .16, hx + size * .3, hy + size * .16), fill=int(rnd.uniform(70, 120)))

    for j in range(-1, ny):
        for i in range(-1, nx):
            cx, cy = ox + i * s, oy + j * s
            tile(star(cx, cy, s / 2), pal['a'] if (i + j) % 2 == 0 else pal['b'], s * .5)
            tile(star(cx, cy, s * .2, math.pi / 8), pal['inner'], s * .2)
            tile(cross(cx + s / 2, cy + s / 2, s), pal['cross'], s * .4)

    # mottled glaze inside each tile
    mott = smooth_noise(w, h, 22 * SS, rnd).point(lambda v: 128 + (v - 128) * .2)
    img = ImageChops.add(img, Image.merge("RGB", (mott,) * 3), 1, -128)
    # bevel: tiles catch light on their upper-left edges and fall into shadow towards the grout on the lower right
    hgt = mask.filter(ImageFilter.GaussianBlur(3 * SS))
    o = 2 * SS
    hi = ImageChops.subtract(ImageChops.offset(hgt, o, o), hgt)          # light side
    lo = ImageChops.subtract(ImageChops.offset(hgt, -o, -o), hgt)        # shadow side
    img = Image.composite(Image.new('RGB', (w, h), (255, 250, 236)), img, hi.point(lambda v: min(255, v * 2)))
    img = Image.composite(Image.new('RGB', (w, h), (20, 16, 10)), img, lo.point(lambda v: min(200, v * 2)))
    # recessed grout: a little darker where it meets the tiles
    groutshade = ImageChops.invert(mask).filter(ImageFilter.GaussianBlur(2 * SS))
    img = ImageChops.multiply(img, Image.merge('RGB', (ImageChops.invert(ImageChops.multiply(groutshade, mask)).point(lambda v: 200 + v * 55 // 255),) * 3))
    # glossy highlights, softened, only on the tiles
    gloss = ImageChops.multiply(gloss.filter(ImageFilter.GaussianBlur(14 * SS)), mask)
    img = Image.composite(Image.new('RGB', (w, h), (255, 253, 245)), img, gloss.point(lambda v: v * .5))
    # gentle light falloff across the wall, like daylight in a courtyard
    if vignette:
        vign = Image.radial_gradient('L').resize((w, h)).point(lambda v: 255 - int(v * .3))
        img = ImageChops.multiply(img, Image.merge('RGB', (vign,) * 3))
    img.resize((W, H), Image.LANCZOS).save(path)


def border_tile(path):
    """one seamless period of the Fez pattern, for the zellige frame (the pattern repeats every two stars)"""
    render('zellige-fez', path + '.png', W=472, H=472, vignette=False)
    Image.open(path + '.png').convert('RGB').save(path, 'JPEG', quality=88)
    import os; os.remove(path + '.png')


if __name__ == '__main__':
    import sys, os
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    for n in PALETTES:
        render(n, os.path.join(out, n + '.png'))
