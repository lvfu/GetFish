"""Step 13: 公主角色总览图（带名称），用于文档与验收。"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
OUT = os.path.join(BASE, "assets", "images", "princess")
QA = os.path.join(BASE, "delivery", "qa", "princess")


def font(sz):
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


cfg = json.load(open(os.path.join(OUT, "princess-config.json"), encoding="utf-8"))
keys = list(cfg.keys())

C = 260
COLS = 4
rows = (len(keys) + COLS - 1) // COLS
sheet = Image.new("RGB", (C * COLS, (C + 34) * rows), (247, 249, 252))
d = ImageDraw.Draw(sheet)
f = font(17)

for i, k in enumerate(keys):
    im = Image.open(os.path.join(OUT, k + ".png")).convert("RGBA")
    im = im.resize((int(C * 0.92), int(C * 0.92)), Image.LANCZOS)
    col, row = i % COLS, i // COLS
    x = col * C + (C - im.width) // 2
    y = row * (C + 34) + (C - im.height) // 2
    sheet.paste(im, (x, y), im)
    d.text((col * C + 10, row * (C + 34) + C + 6),
           f'{i + 1}. {cfg[k]["name"]}  {k}', fill=(40, 46, 60), font=f)
    d.rectangle([col * C, row * (C + 34), col * C + C - 1, row * (C + 34) + C - 1],
                outline=(220, 226, 235))

os.makedirs(QA, exist_ok=True)
sheet.save(os.path.join(QA, "princess-overview.png"))
print("saved", sheet.size)
