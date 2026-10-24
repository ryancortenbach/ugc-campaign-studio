import sys
from pathlib import Path
from PIL import Image, ImageDraw

# 1024px macOS app icon: the artwork in desktop/icon.png on Apple's 824px rounded tile with transparent margins.
size, tile, radius = 1024, 824, 185
art = Image.open(Path(__file__).with_name('icon.png')).convert('RGBA').resize((tile, tile), Image.LANCZOS)
mask = Image.new('L', (tile, tile), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, tile - 1, tile - 1], radius=radius, fill=255)
canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
offset = (size - tile) // 2
canvas.paste(art, (offset, offset), mask)
canvas.save(sys.argv[1])
