"""Step 5b: 4x 局部放大对比（原图 vs 处理结果），判断残留浅边性质。"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
SRC = r"C:\Users\12599\.workbuddy-ai\clipboard-images\clipboard-2026-10-28T12-34-52-763Z-58d60c98.jpg"
QA = os.path.join(BASE, "delivery", "qa")

ORDER = ["clownfish", "goldfish", "blue_tang", "pufferfish",
         "angelfish", "ray", "shark", "golden_koi"]

img = Image.open(SRC).convert("RGB")
arr = np.asarray(img).astype(np.float32)
H, W = arr.shape[:2]
diff = np.abs(arr - 255.0).max(axis=2)

with open(os.path.join(QA, "segments.json"), encoding="utf-8") as f:
    segs = {s["name"]: s for s in json.load(f) if s.get("name") in ORDER}
with open(os.path.join(QA, "analysis.json"), encoding="utf-8") as f:
    bars = json.load(f)["bars"]

barzone = np.zeros((H, W), bool)
for b in bars:
    m0 = 6
    barzone[max(0, b["y0"] - m0):b["y1"] + 1 + m0, max(0, b["x0"] - m0):b["x1"] + 1 + m0] = True

core = (diff > 60) & (~barzone)
lab, _ = ndimage.label(core, structure=np.ones((3, 3)))
seedlab = np.zeros((H, W), np.int32)
for i, n in enumerate(ORDER, start=1):
    s = segs[n]
    sub = lab[s["y0"]:s["y1"] + 1, s["x0"]:s["x1"] + 1]
    vals, cnts = np.unique(sub[sub > 0], return_counts=True)
    seedlab[lab == vals[np.argmax(cnts)]] = i

TH = 28


def flood(th):
    passable = diff <= th
    bg = np.zeros((H, W), bool)
    seed = np.zeros((H, W), bool)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    seed &= passable
    bg |= seed
    st = np.ones((3, 3), bool)
    while True:
        g = ndimage.binary_dilation(bg, st) & passable
        if g.sum() == bg.sum():
            break
        bg = g
    return bg


bg = flood(TH)
_, (iy, ix) = ndimage.distance_transform_edt(seedlab == 0, return_indices=True)
owner = seedlab[iy, ix]


def matte(name):
    i = ORDER.index(name) + 1
    m = (owner == i) & (~bg) & (~barzone)
    m = ndimage.binary_opening(m, np.ones((2, 2), bool)) | m
    d_in = ndimage.distance_transform_edt(m)
    d_out = ndimage.distance_transform_edt(~m)
    a = np.clip(0.5 + (d_in - d_out + 0.5), 0, 1)
    a = ndimage.gaussian_filter(a, 0.55)
    a[bg] = 0
    out = arr.copy()
    band = (a > 0.02) & (a < 0.94)
    av = a[band][:, None]
    out[band] = (out[band] - (1 - av) * 255.0) / np.maximum(av, 0.10)
    return np.clip(out, 0, 255), np.clip(a, 0, 1)


# 取局部区域放大：文件名, 中心 x, 中心 y, 半宽
ZOOMS = [("clownfish", 300, 330, 70), ("blue_tang", 960, 150, 70), ("pufferfish", 1200, 330, 70)]
S = 4
rows = []
for name, cx, cy, r in ZOOMS:
    rgb, al = matte(name)
    x0, y0 = max(0, cx - r), max(0, cy - r)
    x1, y1 = min(W, cx + r), min(H, cy + r)
    orig = img.crop((x0, y0, x1, y1)).resize(((x1 - x0) * S, (y1 - y0) * S), Image.NEAREST)
    tile = Image.new("RGB", ((x1 - x0) * S, (y1 - y0) * S), (24, 30, 44))
    piece = Image.fromarray(np.dstack([rgb[y0:y1, x0:x1].astype(np.uint8),
                                       (al[y0:y1, x0:x1] * 255).round().astype(np.uint8)]), "RGBA")
    piece = piece.resize(((x1 - x0) * S, (y1 - y0) * S), Image.NEAREST)
    tile.paste(piece, (0, 0), piece)
    rows.append((name, orig, tile))

tw = max(o.width for _, o, _ in rows)
sheet = Image.new("RGB", (tw * 2 + 30, sum(o.height for _, o, _ in rows) + 24 * len(rows)), (60, 60, 60))
d = ImageDraw.Draw(sheet)
y = 0
for name, o, t in rows:
    d.text((4, y + 4), f"{name} ORIGINAL", fill=(255, 255, 255))
    sheet.paste(o, (0, y + 18))
    d.text((tw + 34, y + 4), f"{name} MATTE(4x, th={TH})", fill=(255, 220, 0))
    sheet.paste(t, (tw + 30, y + 18))
    y += o.height + 24

sheet.save(os.path.join(QA, "qa_zoom4x.png"))
print("saved qa_zoom4x.png", sheet.size)
