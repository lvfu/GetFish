"""生成手机测试用的二维码图片。

用法：
    python tools/make_qr.py                 # 自动探测局域网地址 + 8123 端口
    python tools/make_qr.py 9000            # 指定端口
"""
import os
import socket
import sys

import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "delivery", "qa", "phone-test-qr.png")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def font(sz):
    for p in (r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else "8123"
    ip = lan_ip()
    url = f"http://{ip}:{port}/web-preview/index.html"

    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=12, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(image_factory=StyledPilImage,
                        module_drawer=RoundedModuleDrawer()).convert("RGB")

    title = "手机扫码试玩 · 黄金鱼钩"
    lines = [url, "手机与电脑需连同一 Wi-Fi · 横屏游玩"]
    f1 = font(30)
    f2 = font(20)

    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    tw = probe.textbbox((0, 0), title, font=f1)[2]
    text_w = max(probe.textbbox((0, 0), t, font=f2)[2] for t in lines)

    W = max(img.width, tw + 40, text_w + 40)
    pad_top, pad_bottom = 74, 96
    canvas = Image.new("RGB", (W, img.height + pad_top + pad_bottom), (255, 255, 255))
    canvas.paste(img, ((W - img.width) // 2, pad_top))

    d = ImageDraw.Draw(canvas)
    d.text(((W - tw) / 2, 22), title, fill=(20, 26, 36), font=f1)

    y = pad_top + img.height + 20
    for i, t in enumerate(lines):
        bb = d.textbbox((0, 0), t, font=f2)
        d.text(((W - bb[2]) / 2, y + i * 30), t,
               fill=(30, 90, 160) if i == 0 else (70, 78, 92), font=f2)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.save(OUT)
    print("saved", OUT)
    print("url  ", url)


if __name__ == "__main__":
    main()
