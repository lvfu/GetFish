"""Step 3b: 参数扫描 —— 对比不同白底阈值下的边缘质量，选出最优参数。"""
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

with open(os.path.join(BASE, "delivery", "qa", "segments.json"), encoding="utf-8") as f:
    segs = [s for s in json.load(f) if s.get("name") in ORDER]
with open(os.path.join(BASE, "delivery", "qa", "analysis.json"), encoding="utf-8") as f:
    bars = json.load(f)["bars"]

barzone = np.zeros((H, W), bool)
for b in bars:
    m0 = 6
    barzone[max(0, b["y0"] - m0):b["y1"] + 1 + m0, max(0, b["x0"] - m0):b["x1"] + 1 + m0] = True

core = (diff > 60) & (~barzone)
lab, _ = ndimage.label(core, structure=np.ones((3, 3)))
seedlab = np.zeros((H, W), np.int32)
for i, s in enumerate(segs, start=1):
    sub = lab[s["y0"]:s["y1"] + 1, s["x0"]:s["x1"] + 1]
    vals, cnts = np.unique(sub[sub > 0], return_counts=True)
    seedlab[lab == vals[np.argmax(cnts)]] = i


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


def alpha_from(mask, blur):
    d_in = ndimage.distance_transform_edt(mask)
    d_out = ndimage.distance_transform_edt(~mask)
    sdf = d_in - d_out + 0.5
    a = np.clip(0.5 + sdf, 0.0, 1.0)
    if blur > 0:
        a = ndimage.gaussian_filter(a, blur)
    return np.clip(a, 0, 1)


def decon(rgb, alpha, lo=0.02, hi=0.94):
    out = rgb.astype(np.float32).copy()
    band = (alpha > lo) & (alpha < hi)
    a = alpha[band][:, None]
    out[band] = (out[band] - (1.0 - a) * 255.0) / np.maximum(a, 0.10)
    return np.clip(out, 0, 255)


def build(th, blur, name):
    bg = flood(th)
    owner = seedlab
    _, (iy, ix) = ndimage.distance_transform_edt(seedlab == 0, return_indices=True)
    owner = seedlab[iy, ix]
    m = (owner == name_idx[name]) & (~bg) & (~barzone)
    m = ndimage.binary_opening(m, np.ones((2, 2), bool)) | m
    a = alpha_from(m, blur)
    a[bg] = 0
    rgb = decon(arr, a)
    ys, xs = np.where(a > 0.5)
    y0, y1, x0, x1 = ys.min() - 2, ys.max() + 2, xs.min() - 2, xs.max() + 2
    y0, x0 = max(0, y0), max(0, x0)
    y1, x1 = min(H - 1, y1), min(W - 1, x1)
    return rgb[y0:y1 + 1, x0:x1 + 1], (a[y0:y1 + 1, x0:x1 + 1] * 255).round().astype(np.uint8)


name_idx = {n: i for i, n in enumerate(ORDER, start=1)}

PARAMS = [(12, 0.55), (20, 0.55), (26, 0.55), (32, 0.6)]
CHECK = ["clownfish", "blue_tang", "pufferfish", "goldfish"]
CELL = 300
sheet = Image.new("RGB", (CELL * len(PARAMS), CELL * len(CHECK)), (24, 30, 44))
d = ImageDraw.Draw(sheet)

for ci, name in enumerate(CHECK):
    for pi, (th, bl) in enumerate(PARAMS):
        rgb, al = build(th, bl, name)
        rgba = np.dstack([rgb.astype(np.uint8), al])
        im = Image.fromarray(rgba, "RGBA")
        ar = im.width / im.height
        w2 = int(CELL * 0.92)
        h2 = int(w2 / ar)
        if h2 > CELL * 0.92:
            h2 = int(CELL * 0.92)
            w2 = int(h2 * ar)
        im = im.resize((w2, h2), Image.LANCZOS)
        tile = Image.new("RGB", (CELL, CELL), (24, 30, 44))
        tile.paste(im, ((CELL - w2) // 2, (CELL - h2) // 2), im)
        sheet.paste(tile, (pi * CELL, ci * CELL))
        d.text((pi * CELL + 6, ci * CELL + 6), f"{name} th={th}", fill=(255, 80, 160))

sheet.save(os.path.join(QA, "param_sweep.png"))
print("saved param_sweep.png")
