"""Step 10: 由 JSON 配置生成 web-preview 侧的 JS 镜像（单一数据源，避免两处维护）。"""
import json
import os

BASE = r"C:\Users\12599\Desktop\vibe\zhuayu"

JOBS = [
    ("assets/images/fish/fish-config.json", "web-preview/fish-config.js", "window.FISH_CONFIG"),
    ("assets/images/princess/princess-config.json", "web-preview/princess-config.js", "window.PRINCESS_CONFIG"),
]

for src, dst, var in JOBS:
    sp = os.path.join(BASE, src)
    dp = os.path.join(BASE, dst)
    cfg = json.load(open(sp, encoding="utf-8"))
    with open(dp, "w", encoding="utf-8") as f:
        f.write(f"// 由 tools/10_build_web_config.py 从 {src} 生成，勿手改\n")
        f.write(var + " = " + json.dumps(cfg, ensure_ascii=False, indent=2) + ";\n")
    print("wrote", dst, len(cfg), "items")
