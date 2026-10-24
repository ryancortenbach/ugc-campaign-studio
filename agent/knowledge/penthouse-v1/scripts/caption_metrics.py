import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
def metrics(path, label):
    g=np.array(Image.open(path).convert("L")).astype(np.float32)
    core=g>200
    core=ndimage.binary_opening(core, iterations=1)
    rows=np.where(core.sum(1)>3)[0]
    h=rows.max()-rows.min()
    # scanline depth: within letter interiors, row-to-row brightness alternation
    inner=ndimage.binary_erosion(g>150, iterations=1)
    prof=np.array([g[r][inner[r]].mean() if inner[r].sum()>8 else np.nan for r in range(g.shape[0])])
    p=prof[~np.isnan(prof)]; d=np.abs(np.diff(p))
    scan=np.median(d)
    # glow: brightness in a 2-8px ring outside the letters minus background 20-30px out
    dil2=ndimage.binary_dilation(core, iterations=2); dil8=ndimage.binary_dilation(core, iterations=8)
    dil20=ndimage.binary_dilation(core, iterations=20); dil30=ndimage.binary_dilation(core, iterations=30)
    ring=dil8&~dil2; bg=dil30&~dil20
    glow=g[ring].mean()-g[bg].mean()
    print(f"{label:28s} text_h={h:3d}px  scanline_step={scan:5.1f}  glow_lift={glow:5.1f}  core_brightness={g[core].mean():5.1f}")
for a in sys.argv[1:]:
    p,l=a.split("::"); metrics(p,l)
