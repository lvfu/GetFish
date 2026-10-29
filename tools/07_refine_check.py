"""Step 7: 边缘精修对比 —— 条件腐蚀 + 亮度归位，验证白边是否彻底消除。"""
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
TH = 28

img = Image.open(SRC).convert("RGB")
arr = np.asarray(img).astype(np.float32)
H, W = arr.shape[:2]
diff = np.abs(arr - 255.0).max(axis=2)

segs = {s["name"]: s for s in json.load(open(os.path.join(QA, "segments.json"), encoding="utf-8"))
        if s.get("name") in ORDER}
bars = json.load(open(os.path.join(QA, "analysis.json"), encoding="utf-8"))["bars"]
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

passable = diff <= TH
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

_, (iy, ix) = ndimage.distance_transform_edt(seedlab == 0, return_indices=True)
owner = seedlab[iy, ix]


def build(name, refine=True):
    i = ORDER.index(name) + 1
    m = (owner == i) & (~bg) & (~barzone)
    m = ndimage.binary_opening(m, np.ones((2, 2), bool)) | m

    if refine:
        # 1) 条件腐蚀：只削掉轮廓上「偏亮」的 1px 环，深色描边保留
        edge_ring = m & ~ndimage.binary_erosion(m, np.ones((3, 3), bool), border_value=0)
        minc = arr.min(axis=2)
        pale = minc > 205
        m = m & ~(edge_ring & pale)

    d_in = ndimage.distance_transform_edt(m)
    d_out = ndimage.distance_transform_edt(~m)
    a = np.clip(0.5 + (d_in - d_out + 0.5), 0, 1)
    a = ndimage.gaussian_filter(a, 0.5)
    a[bg] = 0
    a = np.clip(a, 0, 1)

    rgb = arr.copy()
    band = (a > 0.02) & (a < 0.94)
    av = a[band][:, None]
    rgb[band] = (rgb[band] - (1 - av) * 255.0) / np.maximum(av, 0.10)
    rgb = np.clip(rgb, 0, 255)

    if refine:
        # 2) 亮度归位：边缘像素若明显比内部亮，说明被白底冲淡，用最近的不透明像素颜色替换
        solid = a >= 0.97
        _, (sy, sx) = ndimage.distance_transform_edt(~solid, return_indices=True)
        ref = arr[sy, sx]
        lum_p = rgb.mean(axis=2)
        lum_r = ref.mean(axis=2)
        soft = (a > 0.05) & (a < 0.97)
        fix = soft & (lum_p > lum_r + 10)
        rgb[fix] = ref[fix]
    return rgb, a


ZOOMS = [("clownfish", 300, 330, 70), ("blue_tang", 960, 150, 70),
         ("pufferfish", 1200, 330, 70), ("ray", 480, 620, 70)]
S = 4
tiles = []
for name, cx, cy, r in ZOOMS:
    x0, y0 = max(0, cx - r), max(0, cy - r)
    x1, y1 = min(W, cx + r), min(H, cy + r)
    row = [img.crop((x0, y0, x1, y1))]
    for refine in (False, True):
        rgb, al = build(name, refine)
        p = Image.fromarray(np.dstack([rgb[y0:y1, x0:x1].astype(np.uint8),
                                       (al[y0:y1, x0:x1] * 255).round().astype(np.uint8)]), "RGBA")
        t = Image.new("RGB", (x1 - x0, y1 - y0), (24, 30, 44))
        t.paste(p, (0, 0), p)
        row.append(t)
    tiles.append((name, row))

tw, th_ = (ZOOMS[0][3] * 2) * S, (ZOOMS[0][3] * 2) * S
labels = ["ORIGINAL", "BEFORE(refine=off)", "AFTER(refine=on)"]
sheet = Image.new("RGB", (tw * 3 + 40, (th_ + 22) * len(tiles)), (70, 70, 70))
d = ImageDraw.Draw(sheet)
for ri, (name, row) in enumerate(tiles):
    for ci, im in enumerate(row):
        im2 = im.resize((im.width * S, im.height * S), Image.NEAREST)
        sheet.paste(im2, (ci * (tw + 20), ri * (th_ + 22) + 20))
        d.text((ci * (tw + 20) + 4, ri * (th_ + 22) + 6), f"{name} {labels[ci]}", fill=(255, 255, 0))

sheet.save(os.path.join(QA, "qa_refine_compare.png"))
print("saved qa_refine_compare.png", sheet.size)
