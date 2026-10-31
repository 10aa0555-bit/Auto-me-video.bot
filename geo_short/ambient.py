"""What if シリーズの環境音 (波・風・街のざわめき・ヘリ) をその場で合成する (素材ライセンス不要)。

ノイズの周波数をフーリエ変換で整えるので、長い音でも速い。
"""
import numpy as np

SR = 44100


def _shaped_noise(n, lo, hi, seed):
    """lo〜hi Hz を中心にしたなめらかなノイズ (-1..1 くらい)。"""
    rng = np.random.default_rng(seed)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    band = 1 / (1 + (f / hi) ** 4) * (1 - 1 / (1 + (f / max(lo, 1)) ** 2))
    x = np.fft.irfft(spec * band, n)
    return x / (np.abs(x).max() + 1e-9)


def _ease(u):
    u = np.clip(u, 0, 1)
    return u * u * (3 - 2 * u)


def track(scenes, key, init, total, move=1.6):
    """WhatIf.tsx の track と同じく、シーンの頭で前の値からなめらかに変わる値を 1 秒 SR 個で返す。"""
    t = np.arange(int(total * SR)) / SR
    out = np.full_like(t, init, dtype=np.float64)
    prev = init
    for s in scenes:
        v = s["spec"].get(key, prev)
        m = (t >= s["start"]) & (t < s["start"] + s["dur"])
        out[m] = prev + (v - prev) * _ease((t[m] - s["start"]) / min(move, s["dur"] * 0.8))
        prev = v
    out[t >= scenes[-1]["start"] + scenes[-1]["dur"]] = prev
    return out


def render(scenes, total, rewind=0.0):
    """海面・車の数・時刻から環境音 (モノラル, -1..1) を作る。rewind 秒前から最初の状態に戻す。"""
    n = int(total * SR)
    t = np.arange(n) / SR
    sea = track(scenes, "sea", -1.6, total, 2.4)
    cars = track(scenes, "cars", 1.0, total)
    if rewind:
        k = _ease((t - (total - rewind)) / rewind)
        sea = sea * (1 - k) - 1.6 * k
        cars = cars * (1 - k) + k
    # 波: 寄せては返すうねり。水位が上がるほど大きく荒く
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * 0.11 * t + 1.3) ** 2
    waves = _shaped_noise(n, 80, 900, 1) * swell * (0.35 + 0.65 * np.clip((sea + 1.6) / 12, 0, 1))
    # 風: 高い所から見下ろす後半ほど強く
    wind = _shaped_noise(n, 150, 700, 2) * (0.25 + 0.5 * np.clip(sea / 60, 0, 1)) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * t))
    # 街のざわめき (低い走行音) は車が走っている間だけ
    city = _shaped_noise(n, 40, 220, 3) * 0.6 * np.clip(cars, 0, 1) * np.clip(1 - (sea + 0.2) / 1.5, 0, 1)
    # ヘリ: 低いバタバタ (約 9 回 / 秒)。水があふれてから 45 単位まで、近づいたり離れたり
    blade = np.clip(np.sin(2 * np.pi * 9.2 * t), 0, 1) ** 6
    heli = _shaped_noise(n, 60, 300, 4) * blade * 1.6
    heli *= ((sea > 0.3) & (sea < 45)) * (0.35 + 0.65 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.056 * t)))
    mix = 0.22 * waves + 0.12 * wind + 0.12 * city + 0.10 * heli
    fade = np.minimum(1, t / 0.8) * np.minimum(1, (total - t) / 0.4)
    return np.clip(mix * fade, -1, 1)
