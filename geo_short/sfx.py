"""効果音をその場で合成する (素材ライセンス不要)。"""
import wave

import numpy as np

SR = 44100


def _env(n, attack, release):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(attack, 1e-4))
    return e * np.exp(-np.maximum(0, t - attack) / release)


def _lowpass(x, cutoff):
    """cutoff (Hz, 配列可) の 1 次ローパス。"""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def whoosh(dur=0.7, seed=0):
    n = int(dur * SR)
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n)
    u = np.linspace(0, 1, n)
    shape = np.sin(np.pi * u) ** 2
    cutoff = 300 + 2600 * np.sin(np.pi * u)
    x = _lowpass(noise, cutoff) - _lowpass(noise, cutoff * 0.25)
    return x / (np.abs(x).max() + 1e-9) * shape * 0.5


def pop(pitch=1.0):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = (900 * pitch) * np.exp(-t * 28) + 180 * pitch
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.002, 0.03)
    return x * 0.55


def thud():
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 110 * np.exp(-t * 4) + 45
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.003, 0.18)
    click = np.random.default_rng(1).standard_normal(n) * _env(n, 0.001, 0.01) * 0.3
    return (body + click) * 0.8


def tick():
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 2400 * t) * _env(n, 0.0005, 0.006) * 0.25


def ding():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t) * a for f, a in ((1320, 1), (2640, 0.3), (3960, 0.12)))
    return x * _env(n, 0.002, 0.25) * 0.35


def riser(dur=1.2):
    """盛り上げ: 高くなっていくノイズ + 上昇音。最後に向かって大きくなる。"""
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    noise = np.random.default_rng(5).standard_normal(n)
    x = _lowpass(noise, 300 + 6000 * u ** 2) * 0.6
    f = 200 + 900 * u ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    x = (x / (np.abs(x).max() + 1e-9) + tone) * u ** 2
    return x * 0.55


def siren(dur=3.0):
    """警報: 上下するサイレン (だんだん大きく)。"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 700 + 350 * np.sin(2 * np.pi * 0.9 * t)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25 + np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4
    x = _lowpass(x, 3000)
    u = np.linspace(0, 1, n)
    return x * np.minimum(1, u * 3) * np.minimum(1, (1 - u) * 8) * 0.5


def heartbeat(dur=4.0, bpm=80, bpm2=None):
    """心音 (ドッ・クン)。bpm2 があると、だんだん速くなる。"""
    n = int(dur * SR)
    out = np.zeros(n)
    tt = 0.0
    while tt < dur:
        u = tt / dur
        b = bpm + ((bpm2 or bpm) - bpm) * u
        for off, amp in ((0.0, 1.0), (0.22, 0.7)):
            i = int((tt + off) * SR)
            m = int(0.16 * SR)
            if i + m >= n:
                continue
            k = np.arange(m) / SR
            out[i:i + m] += np.sin(2 * np.pi * (55 + 30 * np.exp(-k * 30)) * k) * np.exp(-k * 28) * amp
        tt += 60 / b
    return out * 0.9


def glitch(dur=0.6, seed=3):
    """デジタルのノイズ (ブツッ・ジジッ)。"""
    n = int(dur * SR)
    rng = np.random.default_rng(seed)
    x = np.zeros(n)
    i = 0
    while i < n:
        L = int(rng.uniform(0.01, 0.06) * SR)
        kind = rng.integers(3)
        k = np.arange(min(L, n - i)) / SR
        if kind == 0:
            seg = rng.standard_normal(len(k)) * 0.5
        elif kind == 1:
            seg = np.sign(np.sin(2 * np.pi * rng.uniform(200, 2000) * k)) * 0.35
        else:
            seg = np.zeros(len(k))
        x[i:i + len(k)] = seg
        i += L
    return x * 0.6


def lock():
    """重いロック音 (ガシャン)。"""
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    clank = sum(np.sin(2 * np.pi * f * t) * a for f, a in ((420, 1), (1130, 0.6), (2350, 0.3))) * _env(n, 0.001, 0.06)
    body = np.sin(2 * np.pi * (90 * np.exp(-t * 6) + 40) * t) * _env(n, 0.002, 0.12)
    return (clank * 0.4 + body * 0.8) * 0.8


def scratch():
    """レコードのスクラッチ (キュキュッ)。"""
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    rate = 1 + 0.9 * np.sin(2 * np.pi * 4.5 * t)
    noise = np.random.default_rng(9).standard_normal(n)
    x = _lowpass(noise, 600 + 2500 * rate) - _lowpass(noise, 300 * rate)
    tone = np.sin(2 * np.pi * np.cumsum(300 + 500 * rate) / SR) * 0.3
    return (x / (np.abs(x).max() + 1e-9) * 0.6 + tone) * _env(n, 0.005, 0.25) * 0.7


def powerdown(dur=1.4):
    """電源が落ちる音 (ヒューン↓)。"""
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    f = 900 * (1 - u) ** 2 + 40
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5 + np.sign(np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR)) * 0.12
    return x * (1 - u) * 0.6


def slide():
    """コミカルなスライド音 (ヒュイッ↑)。"""
    n = int(0.35 * SR)
    u = np.linspace(0, 1, n)
    f = 400 + 1400 * u ** 1.5
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.01, 0.2) * 0.4


def hum(dur=3.0):
    """機械の駆動音 (ウィーン)。"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = np.linspace(0, 1, n)
    f = 120 + 60 * u
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR)
    return x * np.minimum(1, u * 4) * np.minimum(1, (1 - u) * 4) * 0.35


def birds(dur=3.0):
    """朝の小鳥 (チュンチュン)。"""
    n = int(dur * SR)
    out = np.zeros(n)
    rng = np.random.default_rng(4)
    for _ in range(int(dur * 3)):
        i = int(rng.uniform(0, dur - 0.2) * SR)
        m = int(0.08 * SR)
        k = np.arange(m) / SR
        f = rng.uniform(3000, 4500) + 1500 * np.sin(2 * np.pi * 25 * k)
        out[i:i + m] += np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(m, 0.005, 0.03) * 0.3
    return out


SOUNDS = {"riser": riser, "whoosh": whoosh, "pop": pop, "thud": thud, "tick": tick, "ding": ding,
          "siren": siren, "heartbeat": heartbeat, "glitch": glitch, "lock": lock, "scratch": scratch,
          "powerdown": powerdown, "slide": slide, "hum": hum, "birds": birds}


def render_track(events, total, path, gain=0.35):
    """events: [(秒, 種類, {引数})] を 1 本のモノラル WAV にする。"""
    out = np.zeros(int((total + 1) * SR))
    cache = {}
    for t, kind, kw in events:
        key = (kind, tuple(sorted(kw.items())))
        if key not in cache:
            cache[key] = SOUNDS[kind](**kw)
        s = cache[key]
        i = int(t * SR)
        if i >= len(out):
            continue
        seg = s[: len(out) - i]
        out[i:i + len(seg)] += seg
    out = out[: int(total * SR)] * gain
    out = np.clip(out, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())
