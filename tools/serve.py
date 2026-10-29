"""本地试玩服务。

用法：
    python tools/serve.py              # 仅本机，默认 8123
    python tools/serve.py --lan        # 局域网可访问（手机同 Wi-Fi 即可打开）
    python tools/serve.py --lan 9000   # 指定端口

注意：--lan 会把整个项目目录暴露给同一局域网内的设备，用完请关掉窗口。
"""
import functools
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lan_ip():
    """取本机对外网卡的地址（不会真的发包）"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        # 调试期频繁改文件，禁掉缓存，免得手机上看到的是旧版
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    args = [a for a in sys.argv[1:]]
    lan = "--lan" in args
    args = [a for a in args if not a.startswith("--")]
    port = int(args[0]) if args else 8123

    bind = "0.0.0.0" if lan else "127.0.0.1"
    handler = functools.partial(QuietHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.TCPServer((bind, port), handler)
    except OSError as e:
        print(f"端口 {port} 启动失败：{e}")
        print("可能已被占用。换一个端口：python tools/serve.py --lan 8124")
        return

    ip = lan_ip() if lan else "127.0.0.1"
    url = f"http://{ip}:{port}/web-preview/index.html"

    print("=" * 58)
    print("  黄金鱼钩 · 试玩服务")
    print("=" * 58)
    print(f"  本机打开：  http://127.0.0.1:{port}/web-preview/index.html")
    if lan:
        print(f"  手机打开：  {url}")
        print()
        print("  手机需要连同一个 Wi-Fi，横屏游玩。")
        print("  如果打不开，检查 Windows 防火墙是否放行了 Python。")
        print("  注意：局域网内其他设备也能访问本项目目录，用完请关闭本窗口。")
    print("=" * 58)

    if not lan:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
