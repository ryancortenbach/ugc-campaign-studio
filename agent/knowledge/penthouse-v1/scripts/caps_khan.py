"""Children of Khan caption style: white Arial Bold, thin light-grey rim, soft dark shadow, ONE line per caption.

Usage:
  python3 caps_khan.py CHUNKS.json OUTDIR      # renders OUTDIR/cap_NN.png + caps.json + captions.srt

CHUNKS.json = [["you ever heard the saying", 0.14, 1.04], ...]  (text, first-word start s, last-word end s)
Ryan's rule (2026-10-19): one line only, never wrap. If a phrase is too wide, split it into two timed captions.
His text style: lowercase start except names and "I", no sentence-final punctuation, phrase-sized chunks.
Measured from his reel DdAx0P6gfSc: Arial Bold, "my friend spent 3 years" = 78 % of frame width, captions cut in
on one frame (no animation), widest line about 80 %. He sits his block at 87 % of height; Ryan wants the bottom
third, so the baseline is pinned at y 905 of 1280.
"""
import json, os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 720, 1280
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SIZE = min(range(30, 90), key=lambda s: abs(ImageFont.truetype(FONT_PATH, s).getlength("my friend spent 3 years") - 0.78 * W))  # = 50
BASELINE = int(os.environ.get("BASELINE", 905))
MAXW = 0.90 * W

def render(t, S=2):
    F = ImageFont.truetype(FONT_PATH, SIZE * S); asc, _ = F.getmetrics()
    assert F.getlength(t) / S <= MAXW, f"too wide for one line, split it: {t!r}"
    fill = Image.new("L", (W * S, H * S), 0); edge = Image.new("L", (W * S, H * S), 0)
    x = (W * S - F.getlength(t)) / 2; y = BASELINE * S - asc
    ImageDraw.Draw(edge).text((x, y), t, font=F, fill=255, stroke_width=3, stroke_fill=255)   # 1.5 px rim at final size
    ImageDraw.Draw(fill).text((x, y), t, font=F, fill=255)
    fill = fill.resize((W, H), Image.LANCZOS); edge = edge.resize((W, H), Image.LANCZOS)
    f = np.array(fill, np.float32) / 255; e = np.array(edge, np.float32) / 255
    sh = np.roll(np.array(edge.filter(ImageFilter.GaussianBlur(4)), np.float32) / 255, 2, axis=0) * 0.6   # soft shadow, 2 px down
    rim = np.clip(e - f, 0, 1)                                                                            # light-grey outline (185)
    a = np.clip(f + rim, 0, 1)
    grey = np.where(a > 0, (f * 255 + rim * 185) / np.maximum(a, 1e-6), 0)
    out_a = a + sh * (1 - a)
    v = np.where(out_a > 0, grey * (a / np.maximum(out_a, 1e-6)), 0)
    return Image.fromarray(np.dstack([v, v, v, out_a * 255]).clip(0, 255).astype(np.uint8), "RGBA")

def build(chunks, outdir):
    os.makedirs(outdir, exist_ok=True); out = []
    for i, (t, s, e) in enumerate(chunks):
        nxt = chunks[i + 1][1] if i + 1 < len(chunks) else None
        end = nxt if (nxt is not None and nxt - e < 0.35) else e + 0.15
        if nxt is not None: end = min(end, nxt)
        out.append((t, s, round(end, 3))); render(t).save(f"{outdir}/cap_{i:02d}.png")
    json.dump(out, open(f"{outdir}/caps.json", "w"))
    ts = lambda v: f"{int(v//3600):02d}:{int(v%3600//60):02d}:{int(v%60):02d},{int(round((v-int(v))*1000)):03d}"
    with open(f"{outdir}/captions.srt", "w") as fh:
        for i, (t, s, e) in enumerate(out, 1): fh.write(f"{i}\n{ts(s)} --> {ts(e)}\n{t}\n\n")
    print(f"font size {SIZE}, {len(out)} captions -> {outdir}")

if __name__ == "__main__":
    build(json.load(open(sys.argv[1])), sys.argv[2])
