"""把 ImageGen 出的「棋盘格假透明」贴图抠成真 alpha，并标准化成和现有鱼一致的 512x512。

问题：ImageGen 返回的是 RGB，请求的透明背景被渲染成 #fff / #e6e6e6 交替的棋盘格，
直接当贴图用会带着格子。所以必须自己抠。

策略（沿用 03_matte_standardize.py 的思路，但背景判定改掉）：
1. 棋盘格是**中性浅色**（r≈g≈b 且亮），鱼体有饱和度、有暗部 —— 用这个当判据，
   比「接近纯白」更稳：剑鱼腹部的浅灰带蓝，不会被误伤。
2. 只有**与四边连通**的中性浅色区域才算背景，鱼身内部的浅色斑块（章鱼吸盘、剑鱼高光）
   不与边框连通，会被保留。
3. 用距离场生成软 alpha，边缘像素做反预乘去白边。
4. 裁到内容 bbox，等比缩进 512 画布并居中，留白比例对齐现有鱼（452/512）。

用法：
    python tools/26_matte_props.py <输入.png> <输出名> [--crop x0,y0,x1,y1]
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# 输出画布与留白：和 pufferfish.png 一致（trim 后 452×397，居中）
CANVAS = 512
CONTENT_W = 452
CONTENT_H = 397

FISH_DIRS = [
    "assets/images/fish",
    "game/assets/resources/images/fish",
]


def build_background_mask(rgb: np.ndarray) -> np.ndarray:
    """中性浅色 + 与四边连通 → 背景。"""
    a = rgb.astype(np.int16)
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    # 棋盘格两色都接近中性灰白；留 14 的容差吃掉 JPG 压缩噪声
    neutral_light = (mx - mn <= 14) & (mn >= 205)

    # 8 连通标记，把「与边框接触的浅色块」整体判为背景
    lab, n = ndimage.label(neutral_light, structure=np.ones((3, 3), np.int16))
    if n == 0:
        return np.zeros_like(neutral_light)

    edge_labels = set()
    for row in (0, -1):
        edge_labels.update(np.unique(lab[row, :]))
    for col in (0, -1):
        edge_labels.update(np.unique(lab[:, col]))
    edge_labels.discard(0)

    keep = np.isin(lab, list(edge_labels))
    return keep


def matte(path: str) -> Image.Image:
    src = Image.open(path).convert("RGB")
    rgb = np.asarray(src)
    bg = build_background_mask(rgb)

    fg = ~bg
    # 去掉零星的小岛（水印残留、生成噪点）。阈值放小，章鱼那一缕墨迹有几千像素，不会被误删
    lab, n = ndimage.label(fg, structure=np.ones((3, 3), np.int16))
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        # 最大的一块是主体，其余小于它 0.5% 的算噪点
        biggest = sizes.max()
        drop = [i + 1 for i, s in enumerate(sizes) if s < biggest * 0.005]
        if drop:
            fg = fg & ~np.isin(lab, drop)

    # 软 alpha：到背景的距离，前 1.2px 渐变出抗锯齿边
    dist = ndimage.distance_transform_edt(fg)
    alpha = np.clip(dist / 1.2, 0.0, 1.0)

    # 反预乘去白边：边缘像素原本和白底混合过，直接透明化会留一圈白晕
    out = rgb.astype(np.float32)
    a3 = alpha[..., None]
    safe = np.where(a3 > 0.02, a3, 1.0)
    unpremul = np.clip((out - (1.0 - a3) * 255.0) / safe, 0, 255)
    out = np.where(a3 > 0.02, unpremul, out)

    rgba = np.dstack([out, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def normalize(img: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """裁到内容、等比缩进留白框、居中贴到 512 画布。"""
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("抠完是空图，检查背景判据")
    content = img.crop(bbox)

    k = min(CONTENT_W / content.width, CONTENT_H / content.height)
    w = max(1, round(content.width * k))
    h = max(1, round(content.height * k))
    content = content.resize((w, h), Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - w) // 2
    y = (CANVAS - h) // 2
    canvas.paste(content, (x, y), content)
    return canvas, (x, y, w, h)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("name", help="输出名，不含 .png")
    args = ap.parse_args()

    img = matte(args.src)
    canvas, (x, y, w, h) = normalize(img)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for d in FISH_DIRS:
        p = os.path.join(root, d, args.name + ".png")
        canvas.save(p)
        print("wrote", os.path.relpath(p, root), canvas.size, "content", (w, h), "at", (x, y))


if __name__ == "__main__":
    main()
