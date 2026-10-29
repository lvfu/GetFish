"""Step 12: 公主角色质检图 —— 白/深/棋盘三背景 + 竿尖标记。"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
OUT = os.path.join(BASE, "assets", "images", "princess")
QA = os.path.join(BASE, "delivery", "qa", "princess")


def checker(w, h, s=16):
    im = Image.new("RGB", (w, h), (200, 200, 200))
    d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if ((x // s) + (y // s)) % 2 == 0:
                d.rectangle([x, y, x + s - 1, y + s - 1], fill=(255, 255, 255))
    return im


def font(sz=16):
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def main():
    names = sys.argv[1:] or [os.path.splitext(f)[0] for f in sorted(os.listdir(OUT))
                             if f.endswith(".png") and f != "princess-config.json"]
    cfg = json.load(open(os.path.join(OUT, "princess-config.json"), encoding="utf-8"))
    os.makedirs(QA, exist_ok=True)

    C = 320
    sheet = Image.new("RGB", (C * 3, C * len(names)), (120, 120, 120))
    d = ImageDraw.Draw(sheet)
    f = font(15)

    for i, n in enumerate(names):
        im = Image.open(os.path.join(OUT, n + ".png")).convert("RGBA")
        small = im.resize((C - 20, C - 20), Image.LANCZOS)
        bgs = [Image.new("RGB", (C, C), (255, 255, 255)),
               Image.new("RGB", (C, C), (24, 30, 44)),
               checker(C, C)]
        for j, bg in enumerate(bgs):
            bg.paste(small, (10, 10), small)
            dd = ImageDraw.Draw(bg)
            tip = cfg.get(n, {}).get("rodTip")
            if tip:
                tx = 10 + tip[0] * (C - 20)
                ty = 10 + tip[1] * (C - 20)
                dd.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], outline=(255, 0, 128), width=2)
                dd.line([tx - 12, ty, tx + 12, ty], fill=(255, 0, 128))
                dd.line([tx, ty - 12, tx, ty + 12], fill=(255, 0, 128))
            sheet.paste(bg, (j * C, i * C))
            dd2 = ImageDraw.Draw(sheet)
            dd2.text((j * C + 8, i * C + C - 20), f"{n}  {'白/深/棋盘'[j*2:j*2+1]}", fill=(255, 255, 0), font=f)

    sheet.save(os.path.join(QA, "princess_qa.png"))
    print("saved", os.path.join(QA, "princess_qa.png"), sheet.size)


if __name__ == "__main__":
    main()
