"""Find every caption change in a creator's video and make labelled contact sheets so the exact text can be read.

Usage: python3 extract_captions.py VIDEO.mp4 OUTDIR [--crop W:H:X:Y] [--thresh 200]
  --crop  : region that contains the captions (default: bottom 30 % of the frame)
  --thresh: brightness that counts as caption text (white captions: 200 to 238)
Writes OUTDIR/segments.json ([start, end] per caption) and OUTDIR/sheet_N.png (16 captions per sheet).
Read every sheet by eye and type the captions out 1:1 (text, case, punctuation, line breaks). OCR is not
trusted for this. Watch for false segments caused by bright objects (shoes, white shirt text) and drop them.
Caption changes in both reference creators were hard cuts (no animation).
"""
import argparse, glob, json, os, subprocess, numpy as np
from PIL import Image, ImageDraw, ImageFont
p = argparse.ArgumentParser(); p.add_argument("video"); p.add_argument("outdir")
p.add_argument("--crop"); p.add_argument("--thresh", type=int, default=200)
a = p.parse_args(); os.makedirs(f"{a.outdir}/f", exist_ok=True)
w, h = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                                "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout.strip().split(","))
crop = a.crop or f"{w}:{int(h * 0.3)}:0:{int(h * 0.7)}"
subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", a.video, "-vf", f"fps=10,crop={crop},format=gray",
                f"{a.outdir}/f/f_%04d.png"], check=True)
fs = sorted(glob.glob(f"{a.outdir}/f/f_*.png")); M = [np.array(Image.open(f)) > a.thresh for f in fs]
same = lambda x, y: (x | y).sum() < 200 or (x & y).sum() / (x | y).sum() > 0.55
segs, start = [], 0
for i in range(1, len(M)):
    if not same(M[i], M[start]): segs.append((start, i - 1)); start = i
segs.append((start, len(M) - 1))
segs = [s for s in segs if M[(s[0] + s[1]) // 2].sum() > 300]
lab = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22); tiles = []
for s, e in segs:
    t = (s + e) / 2 / 10
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-i", a.video, "-frames:v", "1",
                    "-vf", f"crop={crop},scale=720:-2", f"{a.outdir}/t.png"], check=True)
    im = Image.open(f"{a.outdir}/t.png").convert("RGB"); tile = Image.new("RGB", (im.width + 130, im.height), (30, 30, 30))
    tile.paste(im, (130, 0)); ImageDraw.Draw(tile).text((5, im.height // 2 - 10), f"{s/10:.1f}-{(e+1)/10:.1f}", font=lab, fill=(255, 255, 0))
    tiles.append(tile)
for k in range(0, len(tiles), 16):
    g = tiles[k:k + 16]; sh = Image.new("RGB", (g[0].width, sum(t.height for t in g))); y = 0
    for t in g: sh.paste(t, (0, y)); y += t.height
    sh.save(f"{a.outdir}/sheet_{k // 16}.png")
json.dump([(s / 10, (e + 1) / 10) for s, e in segs], open(f"{a.outdir}/segments.json", "w"))
subprocess.run(["rm", "-rf", f"{a.outdir}/f", f"{a.outdir}/t.png"])
print(len(segs), "caption segments;", (len(tiles) + 15) // 16, "sheets in", a.outdir)
