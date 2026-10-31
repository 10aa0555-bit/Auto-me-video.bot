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


def render_story(scenes, total):
    """物語 (海の上) の環境音: 波 (spec.waves の大きさ)、嵐の雨と風、雷 (lightning の場面)。"""
    n = int(total * SR)
    t = np.arange(n) / SR
    amp = track(scenes, "waves", 0.3, total, 1.2)
    storm = np.zeros(n)
    for s in scenes:
        if s["spec"].get("sky") == "storm":
            m = (t >= s["start"]) & (t < s["start"] + s["dur"])
            storm[m] = 1
    storm = np.convolve(storm, np.ones(SR) / SR, mode="same")  # 1 秒かけて出入り
    ocean = any(s["spec"].get("set", "ocean") == "ocean" for s in scenes)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * 0.13 * t + 0.7) ** 2
    waves = _shaped_noise(n, 70, 900, 11) * swell * np.clip(0.3 + amp / 2.5, 0, 1.2) * (1 if ocean else 0.3)
    rain = _shaped_noise(n, 1500, 7000, 12) * storm * 0.6
    wind = _shaped_noise(n, 120, 600, 13) * (0.2 + 0.8 * storm)
    thunder = np.zeros(n)
    for s in scenes:
        if s["spec"].get("lightning"):
            for dt in (0.55, 2.75):
                i = int((s["start"] + dt) * SR)
                L = min(int(2.2 * SR), n - i)
                if L > 0:
                    env = np.exp(-np.arange(L) / (0.6 * SR))
                    thunder[i:i + L] += _shaped_noise(L, 20, 160, i % 97) * env * 1.4
    out = 0.24 * waves + 0.14 * rain + 0.1 * wind + 0.35 * thunder
    fade = np.minimum(1, t / 0.6) * np.minimum(1, (total - t) / 0.4)
    return np.clip(out * fade, -1, 1)


def render_space(scenes, total):
    """宇宙アニメの環境音: 低くうなるパッド + きらきらしたノイズ (曲ではなく空気感だけ)。"""
    n = int(total * SR)
    t = np.arange(n) / SR
    pad = sum(np.sin(2 * np.pi * f * t + p) * a for f, p, a in ((55, 0, 1.0), (55.4, 1.3, 0.8), (82.5, 0.4, 0.45), (110.2, 2.1, 0.25)))
    pad *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.05 * t) ** 2
    air = _shaped_noise(n, 3000, 9000, 41) * (0.4 + 0.6 * np.sin(2 * np.pi * 0.11 * t + 1) ** 2)
    out = 0.2 * pad / 2.5 + 0.05 * air
    fade = np.minimum(1, t / 1.5) * np.minimum(1, (total - t) / 1.0)
    return np.clip(out * fade, -1, 1)


def render_noir(scenes, total):
    """ダークなモチベーション動画の環境音: 静かな雨 + 低いうなり + たまの遠雷。"""
    n = int(total * SR)
    t = np.arange(n) / SR
    rain = _shaped_noise(n, 1200, 8000, 51) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * t))
    drone = sum(np.sin(2 * np.pi * f * t + p) * a for f, p, a in ((41.2, 0, 1.0), (61.7, 0.8, 0.5), (82.4, 1.9, 0.25)))
    drone *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.04 * t) ** 2
    thunder = np.zeros(n)
    for k, at in enumerate((total * 0.33, total * 0.71)):
        i = int(at * SR)
        L = min(int(3.0 * SR), n - i)
        if L > 0:
            thunder[i:i + L] += _shaped_noise(L, 20, 140, 60 + k) * np.exp(-np.arange(L) / (0.9 * SR))
    out = 0.09 * rain + 0.07 * drone / 1.75 + 0.25 * thunder
    fade = np.minimum(1, t / 1.5) * np.minimum(1, (total - t) / 1.0)
    return np.clip(out * fade, -1, 1)
