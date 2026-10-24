"""Renders agent/public/malachite.jpg, the banded green stone texture behind the app's malachite theme.

Malachite grows in concentric bands around a few nuclei, so the texture warps the distance to three nuclei with
layered sine noise and maps it through the stripe palette sampled from desktop/icon.png. Pillow only, no numpy.
Usage: python3 scripts/make-malachite-texture.py
"""
import math
from pathlib import Path
from PIL import Image, ImageFilter

W, H, SCALE = 960, 600, 2  # rendered at 960x600, then upscaled for smooth bands
# One growth cycle of stripes sampled from the logo: wide mid greens, a thin pale band and a thin near-black streak.
STOPS = [(0.00, (2, 22, 13)), (0.10, (5, 50, 29)), (0.22, (11, 98, 55)), (0.30, (24, 158, 86)), (0.34, (92, 214, 150)),
         (0.37, (28, 168, 92)), (0.48, (12, 102, 57)), (0.56, (4, 42, 24)), (0.60, (1, 12, 7)), (0.64, (6, 56, 32)),
         (0.76, (14, 118, 65)), (0.84, (30, 175, 96)), (0.88, (13, 104, 58)), (1.00, (2, 22, 13))]
NUCLEI = [(0.18, 0.95, 1.0), (0.78, 0.10, 0.85), (1.05, 0.85, 0.7)]


def palette(t):
    t %= 1.0
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            k = k * k * (3 - 2 * k)
            return tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return STOPS[-1][1]


def field(u, v):
    # Domain warp: two octaves of crossed sines bend the bands into the wavy malachite flow.
    wu = u + 0.045 * math.sin(7.1 * v + 1.3) + 0.022 * math.sin(17.0 * (u + v) + 0.4) + 0.008 * math.sin(41.0 * v - 2.1)
    wv = v + 0.040 * math.sin(6.3 * u + 0.7) + 0.020 * math.sin(15.0 * (u - v) + 2.2) + 0.007 * math.sin(37.0 * u + 1.1)
    # Smooth minimum of the weighted distances keeps the bands continuous where two nuclei meet.
    acc = 0.0
    for cx, cy, w in NUCLEI:
        d = math.hypot(wu - cx, (wv - cy) * 1.25) / w
        acc += math.exp(-d * 6.0)
    d = -math.log(acc + 1e-9) / 6.0
    # Uneven band spacing plus fine growth lines inside each band.
    return d * 7.0 + 0.22 * math.sin(d * 23.0 + 1.7) + 0.05 * math.sin(90.0 * d + 3.0 * wu)


img = Image.new('RGB', (W, H))
px = img.load()
for y in range(H):
    v = y / H
    for x in range(W):
        u = x / W * (W / H) * 0.62
        r, g, b = palette(field(u, v))
        # A soft diagonal light, like the polish on the stones in the store banner.
        lift = 0.78 + 0.26 * max(0.0, 1.0 - math.hypot(x / W - 0.3, y / H - 0.2) * 1.4)
        px[x, y] = (min(255, round(r * lift)), min(255, round(g * lift)), min(255, round(b * lift)))

out = Path(__file__).resolve().parents[1] / 'agent' / 'public' / 'malachite.jpg'
img.resize((W * SCALE // 2 * 2, H * SCALE // 2 * 2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5)).save(out, quality=84, optimize=True, progressive=True)
print(out, out.stat().st_size, 'bytes')
