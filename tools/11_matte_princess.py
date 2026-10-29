"""Step 11: 公主角色抠图与标准化。

输入：raw/<name>.png（白底、含鱼竿的全身角色）
输出：<name>.png 512x512 RGBA，并自动检测鱼竿尖位置写入配置。

与鱼类素材共用同一套抠图策略：白底泛洪 + 条件腐蚀 + 距离场软 Alpha + 反预乘。
角色有白色裙摆/毛边，因此腐蚀阈值单独放宽。
"""
import glob
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
RAW = os.path.join(BASE, "assets", "images", "princess", "raw")
OUT = os.path.join(BASE, "assets", "images", "princess")
QA = os.path.join(BASE, "delivery", "qa", "princess")

CANVAS = 512
CONTENT_H = 470      # 角色高度占画布比例 ~92%，顶部留出鱼竿尖空间


def flood_background(diff, th):
    h, w = diff.shape
    passable = diff <= th
    bg = np.zeros((h, w), bool)
    seed = np.zeros((h, w), bool)
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


def matte(path, th=28, pale=205):
    img = Image.open(path).convert("RGB")
    arr = np.asarray(img).astype(np.float32)
    H, W = arr.shape[:2]
    diff = np.abs(arr - 255.0).max(axis=2)

    bg = flood_background(diff, th)
    m = ~bg
    # 去掉零星噪点
    lab, k = ndimage.label(m, structure=np.ones((3, 3)))
    if k > 1:
        sizes = ndimage.sum(m, lab, range(1, k + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s > 200]
        m = np.isin(lab, keep)

    # 条件腐蚀：只削掉轮廓上偏亮的 1px 环
    ring = m & ~ndimage.binary_erosion(m, np.ones((3, 3), bool), border_value=0)
    m = m & ~(ring & (arr.min(axis=2) > pale))

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

    solid = a >= 0.97
    _, (sy, sx) = ndimage.distance_transform_edt(~solid, return_indices=True)
    ref = arr[sy, sx]
    soft = (a > 0.05) & (a < 0.97)
    fix = soft & (rgb.mean(axis=2) > ref.mean(axis=2) + 10)
    rgb[fix] = ref[fix]
    return rgb, a


def resize_premult(rgba, size):
    f = rgba.astype(np.float32)
    al = f[:, :, 3:4] / 255.0
    pre = np.concatenate([f[:, :, :3] * al, f[:, :, 3:4]], axis=2)
    im = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize(size, Image.LANCZOS)
    o = np.asarray(im).astype(np.float32)
    a2 = o[:, :, 3:4] / 255.0
    rgb = np.where(a2 > 1e-4, o[:, :, :3] / np.maximum(a2, 1e-4), 0)
    return np.concatenate([np.clip(rgb, 0, 255), o[:, :, 3:4]], axis=2).astype(np.uint8)


def find_rod_tip(a):
    """定位鱼竿尖。

    头冠、发髻经常比竿尖更高，靠「最上方像素」必然出错；
    形态学分离也会被头发干扰。这里改用直线检测：
      1) 在角色掩码上做 Canny + HoughLinesP，找长直线段；
      2) 只保留斜率在 25°~72°、方向朝右上的段（鱼竿的朝向）；
      3) 取最长的一段，从它的上端点沿竿方向外推，直到离开掩码 —— 即竿尖。
    """
    solid = a > 128
    H, W = solid.shape
    mask = (solid * 255).astype(np.uint8)

    edges = cv2.Canny(mask, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=28,
                            minLineLength=80, maxLineGap=10)

    best = None
    if lines is not None:
        for ln in lines:
            v = np.asarray(ln).reshape(-1)
            if v.size < 4:
                continue
            x1, y1, x2, y2 = (int(v[0]), int(v[1]), int(v[2]), int(v[3]))
            dx, dy = x2 - x1, y2 - y1
            length = float(np.hypot(dx, dy))
            if length < 80:
                continue
            ang = abs(np.degrees(np.arctan2(dy, dx)))
            ang = min(ang, 180 - ang)          # 归一到 0~90
            if ang < 22 or ang > 74:
                continue
            # 上端点
            top = (x1, y1) if y1 <= y2 else (x2, y2)
            bot = (x2, y2) if y1 <= y2 else (x1, y1)
            if best is None or length > best[0]:
                best = (length, top, bot)

    if best is None:
        ys, xs = np.where(solid)
        t = ys.min()
        return float(xs[ys <= t + 2].mean()), float(t)

    _, top, bot = best
    dx = top[0] - bot[0]
    dy = top[1] - bot[1]
    n = np.hypot(dx, dy)
    if n < 1e-6:
        return float(top[0]), float(top[1])
    ux, uy = dx / n, dy / n

    # 沿竿方向外推，找到真正端点
    tip = (float(top[0]), float(top[1]))
    miss = 0
    for k in range(1, 90):
        px_ = int(round(top[0] + ux * k))
        py_ = int(round(top[1] + uy * k))
        if not (0 <= px_ < W and 0 <= py_ < H):
            break
        # 允许 2px 容差，避免细竿中断
        hit = solid[max(0, py_ - 1):py_ + 2, max(0, px_ - 1):px_ + 2].any()
        if hit:
            tip = (float(px_), float(py_))
            miss = 0
        else:
            miss += 1
            if miss >= 4:
                break
    return tip


def process(name, th=28, pale=205):
    src = os.path.join(RAW, name + ".png")
    rgb, a = matte(src, th=th, pale=pale)
    rgba = np.concatenate([rgb, (a * 255).round()[:, :, None]], axis=2).astype(np.uint8)

    ys, xs = np.where(a > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    sub = rgba[y0:y1 + 1, x0:x1 + 1]
    h, w = sub.shape[:2]

    scale = CONTENT_H / h
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    ch = resize_premult(sub, (nw, nh))

    canvas = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    ox = (CANVAS - nw) // 2
    oy = (CANVAS - nh) // 2
    canvas[oy:oy + nh, ox:ox + nw] = ch

    # 竿尖坐标（在 512 画布内）
    ta = canvas[:, :, 3].astype(np.int16)
    tipx, tipy = find_rod_tip(ta)

    Image.fromarray(canvas, "RGBA").save(os.path.join(OUT, name + ".png"), optimize=True)
    return dict(name=name, size=[CANVAS, CANVAS], content_wh=[int(nw), int(nh)],
                src_wh=[int(w), int(h)],
                rodTip=[round(tipx / CANVAS, 4), round(tipy / CANVAS, 4)],
                rodTipPx=[round(tipx, 1), round(tipy, 1)])


def main():
    names = sys.argv[1:]
    if not names:
        names = [os.path.splitext(os.path.basename(p))[0]
                 for p in sorted(glob.glob(os.path.join(RAW, "*.png")))]
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(QA, exist_ok=True)
    out = []
    for n in names:
        if not os.path.exists(os.path.join(RAW, n + ".png")):
            print("skip", n)
            continue
        r = process(n)
        out.append(r)
        print(f'{n:18s} src {r["src_wh"][0]}x{r["src_wh"][1]} -> {r["content_wh"][0]}x{r["content_wh"][1]} '
              f'竿尖 {r["rodTipPx"]} 归一化 {r["rodTip"]}')

    cfg_path = os.path.join(OUT, "princess-config.json")
    old = {}
    if os.path.exists(cfg_path):
        old = json.load(open(cfg_path, encoding="utf-8"))
    for r in out:
        old.setdefault(r["name"], {})
        old[r["name"]].update({"rodTip": r["rodTip"]})
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(old, f, ensure_ascii=False, indent=2)
    print("wrote", cfg_path)


if __name__ == "__main__":
    main()
