import sys
from PIL import Image, ImageDraw, ImageFont

# 1024px app icon in the app's palette: navy tile, mint frame, mint M.
size = 1024
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
pad = 100
d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=185, fill=(13, 16, 24, 255))
inset = pad + 150
d.rounded_rectangle([inset, inset, size - inset, size - inset], radius=90, outline=(55, 222, 143, 255), width=34)
font = None
for path in ['/System/Library/Fonts/SFNS.ttf', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial Bold.ttf']:
    try:
        font = ImageFont.truetype(path, 330)
        try:
            font.set_variation_by_name('Bold')
        except Exception:
            pass
        break
    except Exception:
        continue
box = d.textbbox((0, 0), 'M', font=font)
w, h = box[2] - box[0], box[3] - box[1]
d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), 'M', font=font, fill=(55, 222, 143, 255))
img.save(sys.argv[1])
