"""Step 5: 边缘细节放大复核（2x），分别合成到白底与深底，暴露白边/黑边。"""
import os

import numpy as np
from PIL import Image, ImageDraw

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
FISH = os.path.join(BASE, "assets", "images", "fish")
QA = os.path.join(BASE, "delivery", "qa")

ORDER = ["clownfish", "goldfish", "blue_tang", "pufferfish",
         "angelfish", "ray", "shark", "golden_koi"]

SC = 2
CW, CH = 512 * SC, 512 * SC


def flat(size, color):
    return Image.new("RGB", size, color)


def main():
    for tag, bgcol in (("dark", (24, 30, 44)), ("white", (255, 255, 255))):
        sheet = Image.new("RGB", (CW * 2, CH * 2), (128, 128, 128))
        d = ImageDraw.Draw(sheet)
        for i, name in enumerate(ORDER):
            f = Image.open(os.path.join(FISH, f"{name}.png")).convert("RGBA")
            f = f.resize((CW, CH), Image.NEAREST)
            tile = flat((CW, CH), bgcol)
            tile.paste(f, (0, 0), f)
            x, y = (i % 2) * CW, (i // 2) * CH
            sheet.paste(tile, (x, y))
            d.rectangle([x, y, x + CW - 1, y + CH - 1], outline=(90, 90, 90))
            d.text((x + 10, y + 8), f"{name}  [bg={tag} 2x]", fill=(255, 0, 128))
        sheet.save(os.path.join(QA, f"qa_zoom_{tag}.png"))
        print("saved", f"qa_zoom_{tag}.png")


if __name__ == "__main__":
    main()
