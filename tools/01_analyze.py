"""Step 1: 分析参考图，定位 8 条鱼与标签栏的精确范围。只做只读分析，不产出素材。"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = r"C:\Users\12599\.workbuddy-ai\clipboard-images\clipboard-2026-10-28T12-34-52-763Z-58d60c98.jpg"
OUT = r"C:\Users\12599\Desktop\vibe\zhuayu\delivery\qa"

img = Image.open(SRC).convert("RGB")
W, H = img.size
a = np.asarray(img).astype(np.int16)
print(f"size={W}x{H}")

# 背景色估计：取四角 8x8 均值
corners = [a[:8, :8], a[:8, -8:], a[-8:, :8], a[-8:, -8:]]
bg = np.concatenate([c.reshape(-1, 3) for c in corners]).mean(axis=0)
print("bg corner mean:", bg.round(2))
print("corner std:", np.concatenate([c.reshape(-1, 3) for c in corners]).std(axis=0).round(2))

# 前景 = 与背景差异大的像素
diff = np.abs(a - bg[None, None, :]).max(axis=2)
fg = diff > 18
print("fg ratio:", round(fg.mean(), 4))

# 标签栏是深色（近黑）圆角矩形：亮度低且饱和度低
lum = a.mean(axis=2)
sat = a.max(axis=2) - a.min(axis=2)
label = (lum < 110) & (sat < 45)
lbl, n = ndimage.label(label)
print("dark blobs:", n)
bars = []
for i in range(1, n + 1):
    ys, xs = np.where(lbl == i)
    if len(ys) < 900:
        continue
    w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    if w > 90 and 20 < h < 70 and w / h > 2.0:
        bars.append(dict(x0=int(xs.min()), y0=int(ys.min()), x1=int(xs.max()), y1=int(ys.max()),
                         w=int(w), h=int(h), area=int(len(ys))))
bars.sort(key=lambda d: (d["y0"] // 100, d["x0"]))
print("label bars:", len(bars))
for b in bars:
    print("  ", b)

# 行分割：按前景像素的横向投影找空白带
rowsum = fg.sum(axis=1)
empty_rows = rowsum < 3
# 找连续空白段
gaps = []
s = None
for y in range(H):
    if empty_rows[y]:
        if s is None:
            s = y
    else:
        if s is not None:
            gaps.append((s, y - 1))
            s = None
if s is not None:
    gaps.append((s, H - 1))
print("row gaps:", [g for g in gaps if g[1] - g[0] > 8])

colsum = fg.sum(axis=0)
empty_cols = colsum < 3
gaps = []
s = None
for x in range(W):
    if empty_cols[x]:
        if s is None:
            s = x
    else:
        if s is not None:
            gaps.append((s, x - 1))
            s = None
if s is not None:
    gaps.append((s, W - 1))
print("col gaps:", [g for g in gaps if g[1] - g[0] > 8])

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "analysis.json"), "w", encoding="utf-8") as f:
    json.dump(dict(size=[W, H], bg=[float(v) for v in bg], bars=bars), f, ensure_ascii=False, indent=2)
print("saved analysis.json")
