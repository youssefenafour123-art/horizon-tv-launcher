"""Modern Hearth: a linear fireplace in a dark room, with simulated flames.
   The flames come from a small fluid simulation (heat carried by a swirling, rising flow, cooled by turbulence),
   coloured by flame temperature. The room is lit by the fire and reflected on a glossy floor. Rendered offline into a
   seamless loop: python tools/fire_sim.py OUT.mp4 [seconds] [--preview]"""
import subprocess, sys
import numpy as np
from scipy.ndimage import map_coordinates, gaussian_filter, zoom

W, H, FPS = 1920, 1080, 30
GX, GY = 520, 150                 # simulation grid (x across, y up)
BOX = (250, 470, 1670, 770)       # firebox opening: left, top, right, bottom
FLAME = (270, 455, 1650, 752)     # where the simulated flames are drawn (base at the bottom)
rng = np.random.default_rng(3)


# ---------------- the fluid ----------------
def advect(f, u, v):
    ys, xs = np.mgrid[0:GY, 0:GX].astype(np.float32)
    return map_coordinates(f, [ys - v, xs - u], order=1, mode='nearest').astype(np.float32)


def project(u, v, iters=40):
    # backward-difference divergence with forward-difference gradient: neighbouring cells stay coupled (no checkerboard bands)
    div = (u - np.roll(u, 1, 1)) + (v - np.roll(v, 1, 0))
    p = np.zeros_like(u)
    for _ in range(iters):
        p = (np.roll(p, 1, 0) + np.roll(p, -1, 0) + np.roll(p, 1, 1) + np.roll(p, -1, 1) - div) * .25
        p[0, :] = p[1, :]; p[-1, :] = 0
    u -= np.roll(p, -1, 1) - p
    v -= np.roll(p, -1, 0) - p
    return u, v


def vorticity(u, v, eps):
    w = (np.roll(v, -1, 1) - np.roll(v, 1, 1) - np.roll(u, -1, 0) + np.roll(u, 1, 0)) * .5
    aw = np.abs(w)
    gx = (np.roll(aw, -1, 1) - np.roll(aw, 1, 1)) * .5
    gy = (np.roll(aw, -1, 0) - np.roll(aw, 1, 0)) * .5
    n = np.sqrt(gx * gx + gy * gy) + 1e-5
    gx /= n; gy /= n
    return u + eps * gy * w, v - eps * gx * w


class Fire:
    def __init__(self):
        self.u = np.zeros((GY, GX), np.float32)
        self.v = np.zeros((GY, GX), np.float32)
        self.T = np.zeros((GY, GX), np.float32)
        # burner: many small jets along the bed, each flickering on its own
        self.jets = np.linspace(.035, .965, 70) * GX + rng.normal(0, 2.5, 70)
        self.phase = rng.uniform(0, 1e3, 70)
        self.rate = rng.uniform(.6, 1.6, 70)
        self.t = 0

    def step(self):
        self.t += 1
        t = self.t / FPS
        x = np.arange(GX, dtype=np.float32)
        src = np.zeros(GX, np.float32)
        for j, ph, r in zip(self.jets, self.phase, self.rate):
            flick = .55 + .45 * np.sin(t * 2.3 * r + ph) * np.sin(t * 3.7 * r + ph * .7) + .25 * np.sin(t * 9 * r + ph * 3)
            src += np.clip(flick, .25, 1.2) * np.exp(-((x - j) / 4.0) ** 2)
        edge = np.clip(np.minimum(x / (GX * .05), (GX - x) / (GX * .05)), 0, 1)   # the flames thin out at the ends
        src = np.minimum(src, 1.25) * edge
        self.T[1:4, :] = np.maximum(self.T[1:4, :], src[None, :] * rng.uniform(.85, 1.05, (3, GX)).astype(np.float32))
        self.v[1:6, :] = np.maximum(self.v[1:6, :], src[None, :] * 1.6)
        # buoyancy, a little sideways draught, swirl
        self.v += self.T * .22
        self.u += gaussian_filter(rng.normal(0, .5, (GY, GX)).astype(np.float32), 3) * .04 * (self.T > .02)
        self.u, self.v = vorticity(self.u, self.v, .16)
        self.u *= .9; self.v *= .985
        self.u = gaussian_filter(self.u, .6); self.v = gaussian_filter(self.v, .6)
        self.u, self.v = project(self.u, self.v)
        self.u, self.v = advect(self.u, self.u, self.v), advect(self.v, self.u, self.v)
        self.T = advect(self.T, self.u, self.v)
        # cooling, broken up by turbulence so tongues of flame tear off and vanish
        cool = gaussian_filter(rng.random((GY, GX)).astype(np.float32), 2.2)
        self.T -= (.006 + .045 * (cool - .47).clip(0)) * (1 + np.linspace(0, 1.4, GY)[:, None])
        self.T *= .985
        np.clip(self.T, 0, 1.3, out=self.T)
        self.T[-2:, :] = 0
        return self.T


# flame colours by temperature: deep red, orange, yellow, pale gold at the core
STOPS = np.array([[0, 0, 0, 0], [.18, 60, 6, 0], [.32, 170, 40, 4], [.5, 255, 110, 18], [.7, 255, 178, 60], [.9, 255, 222, 140], [1.2, 255, 245, 210]], np.float32)
LUT = np.stack([np.interp(np.linspace(0, 1.2, 1024), STOPS[:, 0], STOPS[:, c]) for c in (1, 2, 3)], -1).astype(np.float32) / 255


def flame_rgb(T):
    fw, fh = FLAME[2] - FLAME[0], FLAME[3] - FLAME[1]
    big = zoom(gaussian_filter(T[::-1], .7), (fh / GY, fw / GX), order=3).clip(0, 1.2)            # flip: row 0 is the bottom of the flame
    big = big + gaussian_filter(rng.normal(0, .015, big.shape).astype(np.float32), 1) * (big > .1)
    rgb = LUT[(big / 1.2 * 1023).clip(0, 1023).astype(np.int32)]
    return rgb


# ---------------- the room ----------------
def room():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    wall = np.array([.055, .047, .042])
    img[:] = wall
    tex = gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 1.5) * .006 + gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 30) * .05
    img += tex[..., None]
    floor_y = 880
    # glossy dark floor, a touch lighter towards the viewer
    img[floor_y:] = np.array([.03, .026, .024]) + (yy[floor_y:, :, None] - floor_y) / (H - floor_y) * .02
    img[floor_y - 2:floor_y + 1] = .015
    L, T, R, B = BOX
    # bronze surround and the firebox interior (a dark ceramic back with a soft bevel)
    img[T - 14:B + 14, L - 14:R + 14] = [.09, .065, .045]
    img[T - 14:T - 12, L - 14:R + 14] = [.22, .16, .1]
    img[T:B, L:R] = [.02, .016, .014]
    inner = np.clip((yy[T:B, L:R] - T) / (B - T), 0, 1)
    img[T:B, L:R] += (inner * .03)[..., None] * np.array([1, .6, .35])
    # the ember bed: rounded dark stones with glowing gaps
    bed = np.zeros((H, W), np.float32)
    for _ in range(1400):
        cx, cy = rng.uniform(L + 6, R - 6), rng.uniform(B - 30, B - 4)
        rx, ry = rng.uniform(5, 13), rng.uniform(3.5, 7)
        m = ((xx[B - 50:B, L:R] - cx) / rx) ** 2 + ((yy[B - 50:B, L:R] - cy) / ry) ** 2 < 1
        bed[B - 50:B, L:R][m] = np.maximum(bed[B - 50:B, L:R][m], rng.uniform(.4, 1))
    stones = gaussian_filter(bed, 1.2)
    glow_gaps = (gaussian_filter(bed, 4) - stones).clip(0) * 2.5
    shade = np.clip((yy[B - 50:B, L:R] - (B - 30)) / 30, 0, 1)        # coals at the back are in the flames' shadow
    img[B - 50:B, L:R] = img[B - 50:B, L:R] * (1 - stones[B - 50:B, L:R, None] * .8) + stones[B - 50:B, L:R, None] * (np.array([.07, .05, .04]) * (.6 + .4 * shade[..., None]))
    speck = gaussian_filter((rng.random((50, R - L)) > .93).astype(np.float32), .8) * 3
    embers = np.zeros((H, W, 3), np.float32)
    hot = (glow_gaps[B - 50:B, L:R] * .8 + speck * stones[B - 50:B, L:R] * .5) * (1.2 - shade * .5)
    embers[B - 50:B, L:R] = hot[..., None] * np.array([1, .3, .05])
    # light the fire throws on the wall, the surround and the floor (scaled each frame by how strongly it burns)
    cx, cy = (L + R) / 2, B - 60
    d = np.sqrt(((xx - cx) / 900) ** 2 + ((yy - cy) / 420) ** 2)
    light = (np.exp(-d * 2.2)[..., None] * np.array([1, .5, .2])).astype(np.float32)
    light[T:B, L:R] *= .3
    return img.astype(np.float32), embers, light, floor_y


def render(out, seconds=40, preview=False):
    base, embers, light, floor_y = room()
    fire = Fire()
    for _ in range(90): fire.step()                                      # let it catch before we start filming
    fade = 2
    total = (seconds + fade) * FPS
    frames = []
    proc = None
    if not preview:
        proc = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                 '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', out],
                                stdin=subprocess.PIPE)
    head = []
    L, T, R, B = BOX
    fl, ft, fr, fb = FLAME
    n = 3 if preview else total
    for i in range(n):
        Tf = fire.step()
        rgb = flame_rgb(Tf)
        strength = float(Tf[:40].mean()) * 6
        img = base + light * (.55 + .45 * min(1.4, strength)) * .36 + embers * (.75 + .25 * np.sin(i / 7.0))
        # the flames are light: add them, plus a soft glow around them
        region = img[ft:fb, fl:fr]
        glow = gaussian_filter(rgb, (14, 14, 0)) * .6
        img[ft:fb, fl:fr] = region + rgb * 1.05 + glow
        # back wall of the firebox catches the flame light
        back = gaussian_filter(rgb.mean(-1), 40)[..., None] * np.array([1, .55, .25]) * .35
        img[ft:fb, fl:fr] += back
        # reflection on the glossy floor: the firebox, flipped and softened, fading with distance
        refl = img[T - 14:B + 14, L - 14:R + 14][::-1]
        rh = min(H - floor_y, refl.shape[0])
        refl = gaussian_filter(refl[:rh], (3, 6, 0))
        fadek = np.linspace(.32, 0, rh)[:, None, None]
        img[floor_y:floor_y + rh, L - 14:R + 14] += refl * fadek
        frame = (np.clip(img, 0, 1) ** (1 / 1.05) * 255).astype(np.uint8)
        if preview:
            frames.append(frame); continue
        if i < fade * FPS: head.append(frame); continue
        k = i - fade * FPS
        if k >= seconds * FPS - fade * FPS:                                  # crossfade the end into the beginning
            j = k - (seconds * FPS - fade * FPS)
            a = (j + 1) / (fade * FPS + 1)
            frame = (frame * (1 - a) + head[j] * a).astype(np.uint8)
        proc.stdin.write(frame.tobytes())
        if k == seconds * FPS - 1: break
        if i % 150 == 0: print('frame', i, flush=True)
    if preview:
        from PIL import Image
        Image.fromarray(frames[-1]).save(out)
    else:
        proc.stdin.close(); proc.wait()


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    render(args[0], int(args[1]) if len(args) > 1 else 40, '--preview' in sys.argv)
