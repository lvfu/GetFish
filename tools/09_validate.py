"""Step 9: 自动化验收 —— 逐项检查尺寸/格式/Alpha/命名/配置引用，并统计边缘质量。"""
import json
import os

import numpy as np
from PIL import Image

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"
FISH = os.path.join(BASE, "assets", "images", "fish")
QA = os.path.join(BASE, "delivery", "qa")

ORDER = ["clownfish", "goldfish", "blue_tang", "pufferfish",
         "angelfish", "ray", "shark", "golden_koi"]


def main():
    res = []
    cfg_path = os.path.join(FISH, "fish-config.json")
    cfg = json.load(open(cfg_path, encoding="utf-8")) if os.path.exists(cfg_path) else {}

    for name in ORDER:
        p = os.path.join(FISH, f"{name}.png")
        item = {"name": name, "file": f"{name}.png", "exists": os.path.exists(p)}
        if not item["exists"]:
            item["pass"] = False
            res.append(item)
            continue
        im = Image.open(p)
        item["format"] = im.format
        item["mode"] = im.mode
        item["size"] = list(im.size)
        rgba = im.convert("RGBA")
        a = np.asarray(rgba)[:, :, 3]
        rgb = np.asarray(rgba)[:, :, :3].astype(np.int16)

        # 透明度结构
        item["alpha_min"] = int(a.min())
        item["alpha_max"] = int(a.max())
        item["transparent_pct"] = round(float((a == 0).mean()) * 100, 2)
        item["opaque_pct"] = round(float((a == 255).mean()) * 100, 2)
        item["semi_pct"] = round(float(((a > 0) & (a < 255)).mean()) * 100, 2)

        # 四边必须完全透明（不得被裁切）
        border = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
        item["border_max_alpha"] = int(border.max())
        item["edge_margin_ok"] = bool(border.max() == 0)

        # 主体包围盒与占比
        ys, xs = np.where(a > 8)
        bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
        item["content_bbox"] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        item["content_pct"] = round(max(bw, bh) / 512 * 100, 1)

        # 白边指标：半透明带内「近白且无彩」像素占比（越低越好）
        band = (a > 30) & (a < 220)
        near_white = (rgb.min(axis=2) > 238) & (rgb.max(axis=2) - rgb.min(axis=2) < 10)
        item["edge_px"] = int(band.sum())
        item["edge_white_pct"] = round(float((band & near_white).sum() / max(1, band.sum())) * 100, 2)

        # 朝向：重心应在包围盒中线附近，鱼头(眼睛)偏右 -> 用右半部分高亮/暗部复杂度粗略判断
        # 更可靠：眼睛是深色小圆，检测深色像素簇的水平重心
        dark = (a > 200) & (rgb.mean(axis=2) < 70)
        if dark.sum() > 50:
            dys, dxs = np.where(dark)
            item["dark_centroid_x_ratio"] = round(float(dxs.mean() / 512), 3)
        item["eye_hint_right"] = bool(item.get("dark_centroid_x_ratio", 0.5) > 0.5)

        item["config_ref"] = cfg.get(name, {}).get("image")
        item["config_ok"] = item["config_ref"] == name
        item["size_ok"] = item["size"] == [512, 512]
        item["alpha_ok"] = item["alpha_min"] == 0 and item["alpha_max"] == 255 and item["transparent_pct"] > 20
        item["pass"] = all([item["format"] == "PNG", item["size_ok"], item["alpha_ok"],
                            item["edge_margin_ok"], item["config_ok"]])
        res.append(item)

    # 配置引用的图片是否都存在
    missing = [k for k, v in cfg.items() if not os.path.exists(os.path.join(FISH, f'{v["image"]}.png'))]
    preview_ok = os.path.exists(os.path.join(FISH, "fish-preview.png"))

    summary = {
        "total": len(ORDER),
        "passed": sum(1 for r in res if r.get("pass")),
        "config_missing_images": missing,
        "preview_exists": preview_ok,
        "all_pass": all(r.get("pass") for r in res) and not missing and preview_ok,
    }

    out = {"summary": summary, "items": res}
    with open(os.path.join(QA, "validation.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f'{"file":18s} {"fmt":4s} {"mode":5s} {"size":9s} {"trans%":>7s} {"semi%":>6s} '
          f'{"bordA":>5s} {"内容%":>6s} {"白边%":>6s} {"深色重心":>8s} {"PASS":>5s}')
    for r in res:
        print(f'{r["file"]:18s} {r.get("format","-"):4s} {r.get("mode","-"):5s} '
              f'{str(r.get("size","-")):9s} {r.get("transparent_pct",0):7.2f} {r.get("semi_pct",0):6.2f} '
              f'{r.get("border_max_alpha",-1):5d} {r.get("content_pct",0):6.1f} '
              f'{r.get("edge_white_pct",0):6.2f} {r.get("dark_centroid_x_ratio",0):8.3f} '
              f'{"OK" if r.get("pass") else "FAIL":>5s}')
    print()
    print("summary:", json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
