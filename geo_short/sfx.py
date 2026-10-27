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


SOUNDS = {"riser": riser, "whoosh": whoosh, "pop": pop, "thud": thud, "tick": tick, "ding": ding}


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
