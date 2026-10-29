"""测量真实边缘像素剖面，定位白晕的宽度与亮度。"""
import numpy as np
from PIL import Image

SRC = r"C:\Users\12599\.workbuddy-ai\clipboard-images\clipboard-2026-10-28T12-34-52-763Z-58d60c98.jpg"
a = np.asarray(Image.open(SRC).convert("RGB")).astype(np.int16)

def profile(name, y, x0, x1):
    print(f"\n--- {name}  y={y}  x={x0}..{x1} ---")
    print(f'{"x":>5} {"R":>4} {"G":>4} {"B":>4} {"diff":>5}')
    for x in range(x0, x1):
        p = a[y, x]
        print(f"{x:5d} {p[0]:4d} {p[1]:4d} {p[2]:4d} {int(np.abs(p-255).max()):5d}")

# 小丑鱼底部边缘（鱼身下缘约 y=379）
profile("clownfish bottom", 372, 60, 100)
# 蓝吊左侧尾部边缘（x=793 附近）
print()
def vprofile(name, x, y0, y1):
    print(f"\n--- {name}  x={x}  y={y0}..{y1} ---")
    for y in range(y0, y1):
        p = a[y, x]
        print(f"{y:5d} {p[0]:4d} {p[1]:4d} {p[2]:4d} {int(np.abs(p-255).max()):5d}")

vprofile("blue_tang top", 960, 136, 152)
