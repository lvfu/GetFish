"""Step 2: 连通域分割 -> 8 条鱼的独立裁切（保留完整轮廓，排除标签栏）。"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = r"C:\Users\12599\.workbuddy-ai\clipboard-images\clipboard-2026-10-28T12-34-52-763Z-58d60c98.jpg"
BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
OUT = os.path.join(BASE, "delivery", "raw_crops")

ORDER = ["clownfish", "goldfish", "blue_tang", "pufferfish",
         "angelfish", "ray", "shark", "golden_koi"]

img = Image.open(SRC).convert("RGB")
W, H = img.size
a = np.asarray(img).astype(np.float32)

bg = np.array([255.0, 255.0, 255.0])
diff = np.abs(a - bg[None, None, :]).max(axis=2)

with open(os.path.join(BASE, "delivery", "qa", "analysis.json"), encoding="utf-8") as f:
    bars = json.load(f)["bars"]

# 前景候选
fg = diff > 20

# 剔除标签栏：与任一 label bar 有较大重叠的连通域
def in_bar(ys, xs):
    for b in bars:
        if xs.min() >= b["x0"] - 3 and xs.max() <= b["x1"] + 3 \
           and ys.min() >= b["y0"] - 3 and ys.max() <= b["y1"] + 3:
            return True
    return False

lab, n = ndimage.label(fg, structure=np.ones((3, 3)))
print("components:", n)

objs = ndimage.find_objects(lab)
keep = []
for i, sl in enumerate(objs, start=1):
    if sl is None:
        continue
    ys, xs = sl
    area = int((lab[sl] == i).sum())
    if area < 300:
        continue
    yy = np.array([ys.start, ys.stop - 1])
    xx = np.array([xs.start, xs.stop - 1])
    if in_bar(yy, xx):
        continue
    keep.append(dict(id=i, x0=int(xs.start), y0=int(ys.start),
                     x1=int(xs.stop - 1), y1=int(ys.stop - 1), area=area))

print("kept components:", len(keep))

# 按行聚类（y 中心），行内按 x 中心排序
row_mid = H * 0.5
rows = {0: [], 1: []}
for c in keep:
    cy = (c["y0"] + c["y1"]) / 2
    rows[0 if cy < row_mid else 1].append(c)

result = []
for r in (0, 1):
    items = sorted(rows[r], key=lambda c: (c["x0"] + c["x1"]) / 2)
    print(f"row{r}: {len(items)} components")
    for c in items:
        print("   ", c)
    # 每行应有 4 条鱼；若某条鱼被拆成多块，按 x 中心合并到最近槽位
    if len(items) == 4:
        groups = [[c] for c in items]
    else:
        # 用 4 等分槽位归并
        xs_all = [ (c["x0"]+c["x1"])/2 for c in items ]
        centers = [np.percentile(xs_all, p) for p in (12.5, 37.5, 62.5, 87.5)]
        groups = [[], [], [], []]
        for c, cx in zip(items, xs_all):
            k = int(np.argmin([abs(cx - cc) for cc in centers]))
            groups[k].append(c)
    for g in groups:
        x0 = min(c["x0"] for c in g); x1 = max(c["x1"] for c in g)
        y0 = min(c["y0"] for c in g); y1 = max(c["y1"] for c in g)
        result.append(dict(x0=x0, y0=y0, x1=x1, y1=y1,
                           area=sum(c["area"] for c in g), parts=len(g)))

print("groups:", len(result))
for i, r in enumerate(result):
    r["name"] = ORDER[i] if i < len(ORDER) else f"extra{i}"
    print(f'{r["name"]:12s} x[{r["x0"]:4d},{r["x1"]:4d}] y[{r["y0"]:4d},{r["y1"]:4d}] '
          f'w={r["x1"]-r["x0"]+1:4d} h={r["y1"]-r["y0"]+1:4d} parts={r["parts"]}')

os.makedirs(OUT, exist_ok=True)
PAD = 8
for r in result:
    if not r["name"] in ORDER:
        continue
    x0 = max(0, r["x0"] - PAD); y0 = max(0, r["y0"] - PAD)
    x1 = min(W, r["x1"] + PAD + 1); y1 = min(H, r["y1"] + PAD + 1)
    img.crop((x0, y0, x1, y1)).save(os.path.join(OUT, f'{r["name"]}_raw.png'))
    r["crop"] = [x0, y0, x1, y1]

with open(os.path.join(BASE, "delivery", "qa", "segments.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("saved raw crops ->", OUT)
