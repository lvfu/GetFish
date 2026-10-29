"""Step 3: 背景去除 + Alpha 生成 + 512x512 标准化。

核心策略：
1) 从图像四边做泛洪，只有「与边框连通且接近纯白」的区域判为背景。
   鱼体内部的白色（鲨鱼腹部、神仙鱼白底、小丑鱼白条）不与边框连通，因此被保留。
2) 每个前景像素用距离变换归属到最近的鱼，避免矩形裁切带进邻鱼像素。
3) 用有符号距离场生成亚像素级软 Alpha（真抗锯齿），而不是简单二值化。
4) 对边缘像素做「去白边」反预乘，消除 JPG 白底混色造成的白晕。
5) 预乘 Alpha 后缩放，避免缩放产生新的边缘污染。
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
SRC = r"C:\Users\12599\.workbuddy-ai\clipboard-images\clipboard-2026-10-28T12-34-52-763Z-58d60c98.jpg"
RAW = os.path.join(BASE, "delivery", "raw_crops")
OUTDIR = os.path.join(BASE, "assets", "images", "fish")

CANVAS = 512
CONTENT = 452          # 452/512 = 88.3%，落在 75%~90% 区间
FG_TH = 12             # 前景判定阈值
FLOOD_TH = 12          # 泛洪可穿越阈值（接近纯白）

ORDER = ["clownfish", "goldfish", "blue_tang", "pufferfish",
         "angelfish", "ray", "shark", "golden_koi"]


def flood_background(diff, th):
    """从四边泛洪，返回背景掩码（True=背景）。"""
    h, w = diff.shape
    passable = diff <= th
    bg = np.zeros((h, w), bool)
    seed = np.zeros((h, w), bool)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    seed &= passable
    bg |= seed
    # 迭代膨胀（限制在 passable 内），直到稳定
    st = np.ones((3, 3), bool)
    while True:
        grown = ndimage.binary_dilation(bg, st) & passable
        if grown.sum() == bg.sum():
            break
        bg = grown
    return bg


def signed_alpha(mask, blur=0.55):
    """由二值掩码生成亚像素软 Alpha。"""
    inside = ndimage.distance_transform_edt(mask)
    outside = ndimage.distance_transform_edt(~mask)
    sdf = inside - outside + 0.5          # 边界处约等于 0
    a = np.clip(0.5 + sdf, 0.0, 1.0)
    if blur > 0:
        a = ndimage.gaussian_filter(a, blur)
    return a


def decontaminate(rgb, alpha, bgcol=255.0, lo=0.03, hi=0.92):
    """反预乘：把边缘像素中被白底冲淡的颜色还原。"""
    out = rgb.astype(np.float32).copy()
    band = (alpha > lo) & (alpha < hi)
    if band.any():
        a = alpha[band][:, None]
        out[band] = (out[band] - (1.0 - a) * bgcol) / np.maximum(a, 0.08)
    return np.clip(out, 0, 255)


def resize_premult(rgba, size):
    """预乘后缩放，避免透明边缘被底色污染。"""
    arr = rgba.astype(np.float32)
    a = arr[:, :, 3:4] / 255.0
    pre = np.concatenate([arr[:, :, :3] * a, arr[:, :, 3:4]], axis=2)
    im = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA")
    im = im.resize(size, Image.LANCZOS)
    out = np.asarray(im).astype(np.float32)
    a2 = out[:, :, 3:4] / 255.0
    rgb = np.where(a2 > 1e-4, out[:, :, :3] / np.maximum(a2, 1e-4), 0)
    res = np.concatenate([np.clip(rgb, 0, 255), out[:, :, 3:4]], axis=2)
    return res.astype(np.uint8)


def main():
    img = Image.open(SRC).convert("RGB")
    arr = np.asarray(img).astype(np.float32)
    H, W = arr.shape[:2]

    diff = np.abs(arr - 255.0).max(axis=2)
    bg = flood_background(diff, FLOOD_TH)
    fg = (~bg) & (diff > FG_TH)
    print(f"background ratio={bg.mean():.4f}  fg ratio={fg.mean():.4f}")

    # 每像素归属到最近的「鱼体核心」，排除标签栏
    with open(os.path.join(BASE, "delivery", "qa", "segments.json"), encoding="utf-8") as f:
        segs = [s for s in json.load(f) if s.get("name") in ORDER]

    # 标签栏禁入区（含外扩，确保圆角与阴影不残留）
    with open(os.path.join(BASE, "delivery", "qa", "analysis.json"), encoding="utf-8") as f:
        bars = json.load(f)["bars"]
    barzone = np.zeros((H, W), bool)
    for b in bars:
        m0 = 6
        barzone[max(0, b["y0"] - m0):b["y1"] + 1 + m0,
                max(0, b["x0"] - m0):b["x1"] + 1 + m0] = True

    # 核心种子：强前景，去掉标签栏区域
    core = (diff > 60) & (~barzone)

    # 用 8 个连通域做种子标记
    lab, n = ndimage.label(core, structure=np.ones((3, 3)))
    seedlab = np.zeros((H, W), np.int32)
    ids = []
    for s in segs:
        x0, y0, x1, y1 = s["x0"], s["y0"], s["x1"], s["y1"]
        sub = lab[y0:y1 + 1, x0:x1 + 1]
        vals, cnts = np.unique(sub[sub > 0], return_counts=True)
        if len(vals) == 0:
            raise RuntimeError(f'no seed for {s["name"]}')
        best = vals[np.argmax(cnts)]
        ids.append(int(best))
        seedlab[lab == best] = len(ids)

    # 最近种子归属（把抗锯齿边缘像素分给正确的鱼）
    _, (iy, ix) = ndimage.distance_transform_edt(seedlab == 0, return_indices=True)
    owner = seedlab[iy, ix]
    owner[bg] = 0
    owner[barzone] = 0

    os.makedirs(OUTDIR, exist_ok=True)
    report = []

    for idx, name in enumerate(ORDER, start=1):
        m = (owner == idx) & (~bg)
        # 去掉零星噪点
        m = ndimage.binary_opening(m, np.ones((2, 2), bool)) | m
        lab2, k = ndimage.label(m, structure=np.ones((3, 3)))
        if k > 1:
            sizes = ndimage.sum(m, lab2, range(1, k + 1))
            m = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > 40])

        alpha = signed_alpha(m, blur=0.55)
        # 背景区强制 0，避免泛洪区残留
        alpha[bg] = 0.0
        alpha = np.clip(alpha, 0, 1)

        rgb = decontaminate(arr, alpha)
        rgba = np.concatenate([rgb, (alpha * 255).round()[:, :, None]], axis=2).astype(np.uint8)

        ys, xs = np.where(alpha > 0.5)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        pad = 2
        y0 = max(0, y0 - pad); x0 = max(0, x0 - pad)
        y1 = min(H - 1, y1 + pad); x1 = min(W - 1, x1 + pad)
        sub = rgba[y0:y1 + 1, x0:x1 + 1]
        h, w = sub.shape[:2]

        # 等比例缩放到 CONTENT 内
        scale = CONTENT / max(w, h)
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        fish = resize_premult(sub, (nw, nh))

        canvas = np.zeros((CANVAS, CANVAS, 4), np.uint8)
        ox = (CANVAS - nw) // 2
        oy = (CANVAS - nh) // 2
        canvas[oy:oy + nh, ox:ox + nw] = fish

        Image.fromarray(canvas, "RGBA").save(os.path.join(OUTDIR, f"{name}.png"), optimize=True)

        # 记录原始裁切（供核对）
        Image.fromarray(sub, "RGBA").save(os.path.join(RAW, f"{name}_matte.png"))

        report.append(dict(name=name, src_box=[int(x0), int(y0), int(x1), int(y1)],
                           src_wh=[int(w), int(h)], scale=round(float(scale), 4),
                           out_wh=[nw, nh], content_ratio=round(max(nw, nh) / CANVAS, 4)))

    with open(os.path.join(BASE, "delivery", "qa", "process_log.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    for r in report:
        print(f'{r["name"]:12s} src {r["src_wh"][0]}x{r["src_wh"][1]} -> {r["out_wh"][0]}x{r["out_wh"][1]} '
              f'占画布 {r["content_ratio"]*100:.1f}%')


if __name__ == "__main__":
    main()
