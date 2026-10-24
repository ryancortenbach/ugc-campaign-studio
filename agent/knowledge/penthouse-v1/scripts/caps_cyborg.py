"""CYBORG-tutorial caption style: heavy condensed serif, CRT scanlines, light-blue glow, one fixed baseline.

Usage:
  python3 caps_cyborg.py CHUNKS.json OUTDIR            # renders OUTDIR/cap_NN.png + caps.json + captions.srt
  python3 caps_cyborg.py --test OUTDIR "of my life"    # one test PNG (OUTDIR/test.png)

CHUNKS.json = [["You ever heard the", 0.14, 0.68], ...]  (text, first-word start s, last-word end s)
Each caption shows from its start until the next caption starts (if the gap is < 0.35 s), otherwise end + 0.15 s.
Frame is 720x1280 (9:16). Defaults below are the approved final look (2026-10-19, PS2 penthouse video v4);
every knob can be overridden with an environment variable of the same name.
"""
import json, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 720, 1280
E = lambda k, d: float(os.environ.get(k, d))
SIZE = int(E("SIZE", 80))                 # widest line "I focus on WHY they're" = 633 px of 720
TRACK = E("TRACK", -0.03) * SIZE          # tight letter spacing
CONDENSE = E("CONDENSE", 0.80)            # his letters are narrow: squeeze to 80 %
BASELINE = int(E("BASELINE", 935))        # ONE baseline for every caption (bottom third). Never centre per caption: it makes captions jump.
FONT_PATH = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
CORE_K, SCAN_D, SCAN_M = E("CORE_K", 1.3), E("SCAN_D", 0.72), E("SCAN_M", 0.95)      # letter brightness, scanline depth
BLOOM_R, BLOOM_K, HALO_K, GSCAN_D = E("BLOOM_R", 9), E("BLOOM_K", 0.70), E("HALO_K", 0.40), E("GSCAN_D", 0.50)
TINT = np.array([float(v) for v in os.environ.get("TINT", "90,150,255").split(",")], np.float32)  # light-blue halo (his halo lifts blue ~3x more than red)

def text_layer(t):
    # 2x supersample with a 1 px stroke (= half-pixel stroke at final size), condense, paste on the fixed baseline
    F2 = ImageFont.truetype(FONT_PATH, SIZE * 2)
    ascent2, descent2 = F2.getmetrics()
    widths = [F2.getlength(ch) for ch in t]
    tr2 = TRACK * 2
    total = sum(widths) + tr2 * (len(t) - 1)
    pad = 120; top2 = SIZE
    canvas = Image.new("L", (int(total) + 2 * pad, top2 + ascent2 + descent2 + SIZE), 0)
    d = ImageDraw.Draw(canvas); x = pad
    for ch, w in zip(t, widths):
        d.text((x, top2), ch, font=F2, fill=255, stroke_width=1, stroke_fill=255); x += w + tr2
    l, _, r, _ = canvas.getbbox()
    canvas = canvas.crop((l, 0, r, canvas.height))           # crop sideways only, keep the vertical position
    canvas = canvas.resize((max(1, int(canvas.width * CONDENSE / 2)), canvas.height // 2), Image.LANCZOS)
    base_in_canvas = (top2 + ascent2) // 2
    layer = Image.new("L", (W, H), 0)
    assert canvas.width < W - 30, f"caption too wide, split it: {t!r} ({canvas.width}px)"
    layer.paste(canvas, ((W - canvas.width) // 2, BASELINE - base_in_canvas))
    return layer

def render(t):
    L = text_layer(t)
    soft = L.resize((W // 2, H // 2), Image.BILINEAR).resize((W, H), Image.BILINEAR)   # low-res softness
    core = np.clip(np.array(soft, np.float32) / 255 * CORE_K, 0, 1)
    rows = np.arange(H)[:, None]
    scan = np.select([rows % 3 == 2, rows % 3 == 1], [SCAN_D, SCAN_M], 1.0)           # scanlines every 3 px
    text_a = np.clip(core * scan, 0, 1)
    bloom = np.array(L.filter(ImageFilter.GaussianBlur(BLOOM_R)), np.float32) / 255 * 2.2
    halo = np.array(L.filter(ImageFilter.GaussianBlur(4)), np.float32) / 255 * 1.35
    shadow = np.array(L.filter(ImageFilter.GaussianBlur(8)), np.float32) / 255 * 0.35
    glow_a = np.clip(np.maximum(bloom * BLOOM_K, halo * HALO_K), 0, 1)
    glow_a = glow_a * np.select([rows % 3 == 2, rows % 3 == 1], [GSCAN_D, 0.85], 1.0)  # scanlines in the glow too
    a_white = np.clip(np.maximum(text_a, glow_a), 0, 1)
    white = np.array([255, 255, 255], np.float32)
    mix = np.where(a_white[..., None] > 0, (text_a[..., None] * white + np.maximum(glow_a - text_a, 0)[..., None] * TINT) / np.maximum(a_white[..., None], 1e-6), 0)
    out_a = a_white + shadow * (1 - a_white)
    rgb = np.where(out_a[..., None] > 0, mix * (a_white / np.maximum(out_a, 1e-6))[..., None], 0)
    return Image.fromarray(np.dstack([rgb, out_a * 255]).clip(0, 255).astype(np.uint8), "RGBA")

def build(chunks, outdir):
    os.makedirs(outdir, exist_ok=True); out = []
    for i, (t, s, e) in enumerate(chunks):
        nxt = chunks[i + 1][1] if i + 1 < len(chunks) else None
        end = nxt if (nxt is not None and nxt - e < 0.35) else e + 0.15
        if nxt is not None: end = min(end, nxt)
        out.append((t, s, round(end, 3))); render(t).save(f"{outdir}/cap_{i:02d}.png")
    json.dump(out, open(f"{outdir}/caps.json", "w"))
    ts = lambda v: f"{int(v//3600):02d}:{int(v%3600//60):02d}:{int(v%60):02d},{int(round((v-int(v))*1000)):03d}"
    with open(f"{outdir}/captions.srt", "w") as f:
        for i, (t, s, e) in enumerate(out, 1): f.write(f"{i}\n{ts(s)} --> {ts(e)}\n{t}\n\n")
    print(len(out), "captions ->", outdir)

if __name__ == "__main__":
    if sys.argv[1] == "--test":
        os.makedirs(sys.argv[2], exist_ok=True); render(sys.argv[3]).save(f"{sys.argv[2]}/test.png"); print("test.png")
    else:
        build(json.load(open(sys.argv[1])), sys.argv[2])
