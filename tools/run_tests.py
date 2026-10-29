"""一键跑完全部自动化测试。

自己起一个临时静态服务（随机端口），依次执行 node 测试脚本，最后汇总结果。
用法：
    python tools/run_tests.py
    python tools/run_tests.py --keep-open   # 跑完保留服务，方便手动看
"""
import functools
import http.server
import os
import socket
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE_CANDIDATES = [
    os.environ.get("NODE_EXE"),
    r"C:\Users\12599\.workbuddy-ai\binaries\node\versions\22.22.2-6\node.exe",
    "node",
]
NODE_PATH_CANDIDATES = [
    os.environ.get("NODE_PATH"),
    r"C:\Users\12599\.workbuddy-ai\binaries\node\workspace\node_modules",
]

TESTS = [
    ("基础可玩性", "tools/test_web.js"),
    ("关卡流程", "tools/test_flow.js"),
    ("角色换装", "tools/test_princess.js"),
    ("横竖屏适配", "tools/test_orientation.js"),
    ("背景音乐", "tools/test_audio.js"),
    ("60 秒平衡", "tools/test_balance.js"),
]


def find_node():
    for c in NODE_CANDIDATES:
        if not c:
            continue
        if os.path.sep in c:
            if os.path.exists(c):
                return c
        else:
            try:
                subprocess.run([c, "-v"], capture_output=True, check=True)
                return c
            except Exception:
                continue
    return None


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


def main():
    node = find_node()
    if not node:
        print("找不到 node，无法运行测试。请先安装 Node.js 18+")
        return 1

    node_path = ""
    for c in NODE_PATH_CANDIDATES:
        if c and os.path.isdir(c):
            node_path = c
            break

    port = free_port()
    handler = functools.partial(Quiet, directory=ROOT)
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    print(f"本地服务 {base}\n")

    env = dict(os.environ)
    if node_path:
        env["NODE_PATH"] = node_path
    env["TEST_BASE"] = base

    only = sys.argv[1:]
    results = []
    for name, script in TESTS:
        if only and not any(o in script for o in only):
            continue
        path = os.path.join(ROOT, script)
        print("-" * 56)
        print(f"▶ {name}  ({script})")
        print("-" * 56)
        t0 = time.time()
        try:
            r = subprocess.run([node, path], cwd=ROOT, env=env,
                               capture_output=True, text=True, encoding="utf-8", errors="replace",
                               timeout=300)
            out = (r.stdout or "").strip()
            err = (r.stderr or "").strip()
            if out:
                print(out)
            if err:
                print("[stderr]", err)
            results.append((name, r.returncode == 0, round(time.time() - t0, 1)))
        except subprocess.TimeoutExpired:
            print("超时")
            results.append((name, False, 300))
        print()

    print("=" * 56)
    print("汇总")
    print("=" * 56)
    all_ok = True
    for name, ok, sec in results:
        print(f'  {"PASS" if ok else "FAIL"}  {name:12s} {sec:>6.1f}s')
        all_ok = all_ok and ok

    if "--keep-open" in sys.argv:
        print(f"\n服务保留在 {base} ，Ctrl+C 结束")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    else:
        httpd.shutdown()

    print("\n全部通过" if all_ok else "\n存在失败项")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
