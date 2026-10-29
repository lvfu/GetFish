"""Step 8: 正式产出 —— 8 张 512x512 透明 PNG、预览图、配置文件、机器校验结果。"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
SRC = r"C:\Users\12599\.workbuddy-ai\clipboard-images\clipboard-2026-10-28T12-34-52-763Z-58d60c98.jpg"
QA = os.path.join(BASE, "delivery", "qa")
RAW = os.path.join(BASE, "delivery", "raw_crops")
OUTDIR = os.path.join(BASE, "assets", "images", "fish")

CANVAS = 512
CONTENT = 452          # 88.3% of canvas
TH = 28                # 白底泛洪阈值（经参数扫描确定）
PALE = 205             # 边缘浅色环判定阈值

ORDER = ["clownfish", "goldfish", "blue_tang", "pufferfish",
         "angelfish", "ray", "shark", "golden_koi"]

CN = {"clownfish": "小丑鱼", "goldfish": "金鱼", "blue_tang": "蓝色热带鱼",
      "pufferfish": "河豚", "angelfish": "神仙鱼", "ray": "鳐鱼",
      "shark": "鲨鱼", "golden_koi": "黄金锦鲤"}

# pattern / wave / reel 是玩法性格，不是美术参数：
#   pattern  游法（cruise 匀速 / dart 走走停停 / sweep 优雅上下巡游 /
#                 glide 贴底滑翔 / burst 间歇突进）
#   wave     纵向摆动幅度 px
#   reel     收线速度 px/s，越小越「沉」（小鱼一拽就上来，鲨鱼要拉三秒）
CONFIG = {
    "clownfish": {"name": "小丑鱼", "image": "clownfish", "baseSize": 60, "baseSpeed": 110,
                  "baseValue": 20, "pattern": "dart", "wave": 6, "reel": 117},
    "goldfish": {"name": "金鱼", "image": "goldfish", "baseSize": 70, "baseSpeed": 52,
                 "baseValue": 30, "pattern": "cruise", "wave": 11, "reel": 107},
    "blue_tang": {"name": "蓝色热带鱼", "image": "blue_tang", "baseSize": 65, "baseSpeed": 155,
                  "baseValue": 25, "pattern": "dart", "wave": 5, "reel": 126},
    "pufferfish": {"name": "河豚", "image": "pufferfish", "baseSize": 65, "baseSpeed": 42,
                   "baseValue": 50, "pattern": "glide", "wave": 4, "reel": 50},
    "angelfish": {"name": "神仙鱼", "image": "angelfish", "baseSize": 75, "baseSpeed": 78,
                  "baseValue": 40, "pattern": "sweep", "wave": 16, "reel": 86},
    "ray": {"name": "鳐鱼", "image": "ray", "baseSize": 100, "baseSpeed": 40,
            "baseValue": 100, "pattern": "glide", "wave": 9, "reel": 71},
    "shark": {"name": "鲨鱼", "image": "shark", "baseSize": 120, "baseSpeed": 62,
              "baseValue": 200, "pattern": "burst", "wave": 3, "reel": 71},
    "golden_koi": {"name": "黄金锦鲤", "image": "golden_koi", "baseSize": 85, "baseSpeed": 96,
                   "baseValue": 150, "pattern": "burst", "wave": 8, "reel": 83},
}


def load_ctx():
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
    return img, arr, H, W, bg, owner, barzone


def build_matte(arr, bg, owner, barzone, name):
    i = ORDER.index(name) + 1
    m = (owner == i) & (~bg) & (~barzone)
    m = ndimage.binary_opening(m, np.ones((2, 2), bool)) | m
    # 只保留主要连通块，去掉零星噪点
    l2, k = ndimage.label(m, structure=np.ones((3, 3)))
    if k > 1:
        sizes = ndimage.sum(m, l2, range(1, k + 1))
        m = np.isin(l2, [j + 1 for j, s in enumerate(sizes) if s > 40])

    # 条件腐蚀：削掉轮廓上偏亮的 1px 环
    edge_ring = m & ~ndimage.binary_erosion(m, np.ones((3, 3), bool), border_value=0)
    pale = arr.min(axis=2) > PALE
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

    # 亮度归位
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


def cjk_font(size=16):
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhbd.ttc",
              r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\simsun.ttc"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def main():
    img, arr, H, W, bg, owner, barzone = load_ctx()
    os.makedirs(OUTDIR, exist_ok=True)
    log = {}

    for name in ORDER:
        rgb, a = build_matte(arr, bg, owner, barzone, name)
        rgba = np.concatenate([rgb, (a * 255).round()[:, :, None]], axis=2).astype(np.uint8)

        ys, xs = np.where(a > 0.5)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        pad = 2
        y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
        y1, x1 = min(H - 1, y1 + pad), min(W - 1, x1 + pad)
        sub = rgba[y0:y1 + 1, x0:x1 + 1]
        Image.fromarray(sub, "RGBA").save(os.path.join(RAW, f"{name}_matte.png"))

        h, w = sub.shape[:2]
        scale = CONTENT / max(w, h)
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        fish = resize_premult(sub, (nw, nh))

        canvas = np.zeros((CANVAS, CANVAS, 4), np.uint8)
        ox, oy = (CANVAS - nw) // 2, (CANVAS - nh) // 2
        canvas[oy:oy + nh, ox:ox + nw] = fish
        Image.fromarray(canvas, "RGBA").save(os.path.join(OUTDIR, f"{name}.png"), optimize=True)

        log[name] = dict(src_wh=[int(w), int(h)], scale=round(float(scale), 4),
                         out_wh=[int(nw), int(nh)], canvas=[CANVAS, CANVAS],
                         content_pct=round(max(nw, nh) / CANVAS * 100, 1))

    # ---------- 预览图（透明背景 1024x1024，2 行 4 列） ----------
    CELL = 256
    prev = Image.new("RGBA", (CELL * 4, CELL * 2), (0, 0, 0, 0))
    for i, name in enumerate(ORDER):
        f = Image.open(os.path.join(OUTDIR, f"{name}.png")).convert("RGBA")
        f = f.resize((int(CELL * 0.86), int(CELL * 0.86)), Image.LANCZOS)
        cx, cy = (i % 4) * CELL + CELL // 2, (i // 4) * CELL + CELL // 2
        prev.alpha_composite(f, (cx - f.width // 2, cy - f.height // 2))
    prev.save(os.path.join(OUTDIR, "fish-preview.png"), optimize=True)

    # 带标签总览（文档用，不参与游戏）
    labeled = Image.new("RGB", (CELL * 4, (CELL + 34) * 2), (247, 249, 252))
    d = ImageDraw.Draw(labeled)
    fnt = cjk_font(17)
    for i, name in enumerate(ORDER):
        f = Image.open(os.path.join(OUTDIR, f"{name}.png")).convert("RGBA")
        f = f.resize((int(CELL * 0.86), int(CELL * 0.86)), Image.LANCZOS)
        col, row = i % 4, i // 4
        x = col * CELL + (CELL - f.width) // 2
        y = row * (CELL + 34) + (CELL - f.height) // 2
        labeled.paste(f, (x, y), f)
        d.text((col * CELL + 10, row * (CELL + 34) + CELL + 6),
               f"{CN[name]}  {name}.png", fill=(40, 46, 60), font=fnt)
        d.rectangle([col * CELL, row * (CELL + 34), col * CELL + CELL - 1,
                     row * (CELL + 34) + CELL - 1], outline=(220, 226, 235))
    labeled.save(os.path.join(QA, "fish-overview-labeled.png"))

    # ---------- 配置文件 ----------
    with open(os.path.join(OUTDIR, "fish-config.json"), "w", encoding="utf-8") as f:
        json.dump(CONFIG, f, ensure_ascii=False, indent=2)

    with open(os.path.join(QA, "process_log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)

    for n in ORDER:
        print(f'{n:12s} {log[n]["src_wh"][0]}x{log[n]["src_wh"][1]} -> '
              f'{log[n]["out_wh"][0]}x{log[n]["out_wh"][1]}  占画布 {log[n]["content_pct"]}%')
    print("done")


if __name__ == "__main__":
    main()
