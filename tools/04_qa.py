"""Step 4: 生成质检图 —— 多背景合成、缩小可辨识度、边缘白边检测。"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
FISH = os.path.join(BASE, "assets", "images", "fish")
QA = os.path.join(BASE, "delivery", "qa")

ORDER = ["clownfish", "goldfish", "blue_tang", "pufferfish",
         "angelfish", "ray", "shark", "golden_koi"]


def checker(w, h, s=16, c1=(200, 200, 200), c2=(255, 255, 255)):
    im = Image.new("RGB", (w, h), c1)
    d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if ((x // s) + (y // s)) % 2 == 0:
                d.rectangle([x, y, x + s - 1, y + s - 1], fill=c2)
    return im


def compose(bg, fish, size, pos):
    im = bg.copy()
    f = fish.resize(size, Image.LANCZOS)
    im.paste(f, pos, f)
    return im


def main():
    tiles = 4
    cell = 300
    sheet = Image.new("RGB", (cell * tiles, cell * 2 * 2), (255, 255, 255))

    stats = []
    for i, name in enumerate(ORDER):
        f = Image.open(os.path.join(FISH, f"{name}.png")).convert("RGBA")
        a = np.asarray(f)[:, :, 3]

        # --- 数值质检 ---
        opaque = a == 255
        trans = a == 0
        semi = (a > 0) & (a < 255)
        # 四角与四条边是否透明
        border = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
        # 不透明区域的紧致包围盒
        ys, xs = np.where(opaque)
        bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        # 白边检测：alpha>200 的像素里，接近纯白且饱和度极低的占比
        rgb = np.asarray(f)[:, :, :3].astype(np.int16)
        near_white = (rgb.min(axis=2) > 235) & (rgb.max(axis=2) - rgb.min(axis=2) < 12)
        halo = (near_white & (a > 180)).sum()
        edge = ((a > 40) & (a < 215)).sum()
        # 边缘半透明像素中「亮且无彩」的比例（白边风险指标）
        e_band = (a > 40) & (a < 215)
        if e_band.sum() > 0:
            e_white = (near_white & e_band).sum() / e_band.sum()
        else:
            e_white = 0.0

        stats.append(dict(name=name, size=f.size, alpha_min=int(a.min()), alpha_max=int(a.max()),
                          transparent_ratio=round(float(trans.mean()), 4),
                          semi_ratio=round(float(semi.mean()), 4),
                          border_max_alpha=int(border.max()), bbox=bbox,
                          edge_band_px=int(edge), edge_white_ratio=round(float(e_white), 4),
                          white_halo_px=int(halo)))

        # --- 视觉质检：白底 / 深底 / 棋盘 / 缩小 ---
        row, col = divmod(i, tiles)
        base = Image.new("RGB", (cell, cell), (255, 255, 255))
        b2 = Image.new("RGB", (cell, cell), (32, 40, 56))
        b3 = checker(cell, cell)
        for bg, off in ((base, 0),):
            pass
        # 横向三拼放进一格：左白右深
        half = Image.new("RGB", (cell, cell), (255, 255, 255))
        d = ImageDraw.Draw(half)
        d.rectangle([cell // 2, 0, cell, cell], fill=(30, 38, 54))
        sz = (int(cell * 0.5 * 0.92), int(cell * 0.5 * 0.92))
        ar = f.width / f.height
        w2 = sz[0]; h2 = int(w2 / ar)
        if h2 > sz[1]:
            h2 = sz[1]; w2 = int(h2 * ar)
        half = compose(half, f, (w2, h2), (cell // 4 - w2 // 2, cell // 2 - h2 // 2))
        half = compose(half, f, (w2, h2), (cell // 2 + cell // 4 - w2 // 2, cell // 2 - h2 // 2))
        sheet.paste(half, (col * cell, row * cell * 2))

        # 第二行：棋盘格 + 小尺寸可辨识度（64px）
        chk = checker(cell, cell)
        chk = compose(chk, f, (int(cell * 0.62), int(cell * 0.62 / ar)), (cell // 8, cell // 8))
        small = f.resize((72, int(72 / ar)), Image.LANCZOS)
        chk.paste(small, (cell - 96, cell - 96), small)
        chk.paste(small.resize((40, int(40 / ar)), Image.LANCZOS), (cell - 60, 20), None)
        sheet.paste(chk, (col * cell, row * cell * 2 + cell))

        dd = ImageDraw.Draw(sheet)
        dd.text((col * cell + 8, row * cell * 2 + cell - 18), name, fill=(0, 0, 0))

    sheet.save(os.path.join(QA, "qa_multibg.png"))
    with open(os.path.join(QA, "alpha_stats.json"), "w", encoding="utf-8") as fp:
        json.dump(stats, fp, ensure_ascii=False, indent=2)

    print(f'{"name":12s} {"size":10s} {"trans%":>7s} {"semi%":>7s} {"borderA":>7s} {"edgeWhite":>9s} {"bbox":>22s}')
    for s in stats:
        print(f'{s["name"]:12s} {str(s["size"]):10s} {s["transparent_ratio"]*100:7.2f} '
              f'{s["semi_ratio"]*100:7.2f} {s["border_max_alpha"]:7d} '
              f'{s["edge_white_ratio"]*100:8.2f}% {str(s["bbox"]):>22s}')


if __name__ == "__main__":
    main()
