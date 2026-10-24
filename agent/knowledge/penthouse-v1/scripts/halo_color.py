import sys, numpy as np
from PIL import Image
from scipy import ndimage
for a in sys.argv[1:]:
    p,l=a.split("::")
    im=np.array(Image.open(p).convert("RGB")).astype(np.float32); g=im.mean(2)
    core=ndimage.binary_opening(g>200, iterations=1)
    d1=ndimage.binary_dilation(core,iterations=1); d4=ndimage.binary_dilation(core,iterations=4); d9=ndimage.binary_dilation(core,iterations=9)
    d20=ndimage.binary_dilation(core,iterations=20); d30=ndimage.binary_dilation(core,iterations=30)
    near=d4&~d1; far=d9&~d4; bg=d30&~d20
    f=lambda m: im[m].mean(0)
    n,fa,b=f(near),f(far),f(bg)
    print(f"{l:22s} near-ring RGB {n.round(0)}  mid-ring RGB {fa.round(0)}  background RGB {b.round(0)}  | near lift {(n-b).round(0)}  blue-minus-red near {n[2]-n[0]:.0f} (bg {b[2]-b[0]:.0f})")
