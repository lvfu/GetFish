"""把网页原型里那段 WebAudio 合成音乐，离线渲染成 mp3，给 Cocos 用。

旋律与 web-preview/game.js 的 MUSIC 完全一致（C 大调 8 小节，88 BPM），
这样两边听感是同一首曲子。

用法：
    python tools/20_render_audio.py

输出：
    game/assets/resources/audio/bgm.mp3    背景音乐（无缝循环）
    game/assets/resources/audio/sfx_*.mp3  音效
"""
import os

import numpy as np
import lameenc
from scipy.signal import lfilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "game", "assets", "resources", "audio")

SR = 32000

# ---------- 与 game.js 一致的乐谱 ----------
BPM = 88
STEP = 60 / BPM / 2          # 八分音符时长

CHORDS = [
    [48, 55, 64],   # C
    [43, 50, 59],   # G
    [45, 52, 60],   # Am
    [41, 48, 57],   # F
    [48, 55, 64],   # C
    [41, 48, 57],   # F
    [43, 50, 59],   # G
    [48, 55, 64],   # C
]

MELODY = [
    (0, 72, 2), (2, 76, 2), (4, 79, 3), (7, 76, 1),
    (8, 74, 2), (10, 71, 2), (12, 67, 4),
    (16, 69, 2), (18, 72, 2), (20, 76, 3), (23, 72, 1),
    (24, 77, 2), (26, 72, 2), (28, 69, 4),
    (32, 67, 2), (34, 72, 2), (36, 76, 3), (39, 74, 1),
    (40, 72, 2), (42, 69, 2), (44, 65, 4),
    (48, 67, 2), (50, 71, 2), (52, 74, 3), (55, 71, 1),
    (56, 72, 6), (62, 76, 2),
]

TOTAL_STEPS = 64
LOOP_SEC = TOTAL_STEPS * STEP      # 8 小节
TAIL_SEC = 4.0                     # 额外渲染的混响尾巴，最后折回开头，保证无缝


def mtof(m):
    return 440.0 * (2 ** ((m - 69) / 12))


def add(buf, start, sig):
    """把 sig 叠加到 buf 的 start 采样处，超出部分丢弃（尾巴另处理）"""
    i = int(start * SR)
    if i >= len(buf):
        return
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n]


def env_exp(n, attack, dur, peak):
    """快起慢落包络"""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-np.clip(t - attack, 0, None) / (dur / 4.5))
    return a * d * peak


def bell(freq, dur, vol):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.12 * np.sin(2 * np.pi * freq * 2 * t)
    return sig * env_exp(n, 0.012, dur, vol)


def pad(freq, dur, vol):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # 4 个谐波叠成柔和的类锯齿，再过一阶低通
    sig = np.zeros(n)
    for k in range(1, 5):
        sig += np.sin(2 * np.pi * freq * k * t) / k
    sig /= 2.0
    a = np.exp(-2 * np.pi * 760 / SR)
    out = lfilter([1 - a], [1, -a], sig)
    # 慢起慢落
    atk = np.clip(t / 0.7, 0, 1)
    rel = np.clip((dur - t) / 0.8, 0, 1)
    return out * atk * rel * vol


def bass(freq, dur, vol):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * env_exp(n, 0.06, dur, vol)


def reverb(x, combs=((0.34, 0.20), (0.23, 0.14)), damp=2600):
    """两个反馈梳状延时 + 一阶低通，够用的简易混响"""
    y = np.copy(x)
    a = np.exp(-2 * np.pi * damp / SR)
    for delay_s, fb in combs:
        d = int(delay_s * SR)
        out = np.copy(y)
        dline = np.zeros(d)
        idx = 0
        for i in range(len(y)):
            delayed = dline[idx]
            out[i] = y[i] + delayed * fb
            dline[idx] = (1 - a) * out[i] + a * delayed
            idx = (idx + 1) % d
        y = out
    return y


def render_bgm():
    total = LOOP_SEC + TAIL_SEC
    buf = np.zeros(int(total * SR))

    for step in range(TOTAL_STEPS + int(TAIL_SEC / STEP)):
        t = step * STEP
        if t >= total:
            break
        s = step % TOTAL_STEPS
        bar = s // 8
        pos = s % 8
        ch = CHORDS[bar]

        # 旋律
        for (st, midi, dur) in MELODY:
            if st == s:
                add(buf, t, bell(mtof(midi), dur * STEP * 1.2 + 0.3, 0.085))
                break

        # 每小节低音 + 铺底
        if pos == 0:
            add(buf, t, bass(mtof(ch[0]), 1.5, 0.13))
            add(buf, t, pad(mtof(ch[1]), 2.7, 0.026))
            add(buf, t, pad(mtof(ch[2]), 2.7, 0.019))
            add(buf, t, pad(mtof(ch[2] + 12), 2.7, 0.011))
        if pos == 4:
            add(buf, t, bass(mtof(ch[0]), 1.1, 0.08))
        # 轻拨
        if pos == 3 or pos == 6:
            add(buf, t, bell(mtof(ch[1 if pos == 3 else 2]), 0.75, 0.032))

    buf = reverb(buf)

    # 把尾巴折回开头 → 无缝循环
    n = int(LOOP_SEC * SR)
    tail = buf[n:]
    out = buf[:n].copy()
    m = min(len(tail), n)
    out[:m] += tail[:m]

    # 归一化
    peak = np.max(np.abs(out)) or 1.0
    out = out / peak * 0.72
    return out


def render_cast():
    """出钩：下滑的短促风声"""
    dur = 0.22
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 9) + 240
    phase = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(phase) * 0.5
    noise = np.random.RandomState(7).randn(n) * 0.18 * np.exp(-t * 26)
    return (sig + noise) * env_exp(n, 0.005, dur, 0.55)


def render_catch():
    """捕获：两声清脆铃音"""
    dur = 0.5
    buf = np.zeros(int(dur * SR))
    add(buf, 0.0, bell(mtof(84), 0.45, 0.5))
    add(buf, 0.07, bell(mtof(88), 0.4, 0.38))
    return buf


def render_click():
    dur = 0.09
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 660 * t) * env_exp(n, 0.004, dur, 0.32)


def render_win():
    """过关：C-E-G 上行"""
    dur = 0.9
    buf = np.zeros(int(dur * SR))
    for i, midi in enumerate((72, 76, 79, 84)):
        add(buf, i * 0.11, bell(mtof(midi), 0.7, 0.4))
    return buf


def write_mp3(path, data, kbps=64):
    peak = np.max(np.abs(data)) or 1.0
    x = np.clip(data / peak * 0.9, -1, 1)
    pcm = (x * 32767).astype(np.int16)

    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    mp3 = enc.encode(pcm.tobytes())
    mp3 += enc.flush()
    with open(path, "wb") as f:
        f.write(bytes(mp3))
    return len(mp3)


def main():
    os.makedirs(OUT, exist_ok=True)

    bgm = render_bgm()
    size = write_mp3(os.path.join(OUT, "bgm.mp3"), bgm, kbps=64)
    print(f"bgm.mp3        {len(bgm)/SR:5.1f}s  {size/1024:6.1f} KB")

    for name, fn in (("sfx_cast", render_cast), ("sfx_catch", render_catch),
                     ("sfx_click", render_click), ("sfx_win", render_win)):
        data = fn()
        size = write_mp3(os.path.join(OUT, name + ".mp3"), data, kbps=96)
        print(f"{name+'.mp3':14s} {len(data)/SR:5.2f}s  {size/1024:6.1f} KB")


if __name__ == "__main__":
    main()
