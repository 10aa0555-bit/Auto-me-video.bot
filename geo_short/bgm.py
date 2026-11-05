"""ドキュメンタリー風 BGM をその場で合成する (著作権フリー)。

マイナー調のコード進行 + パッド + アルペジオ + ベース + 軽いビート。
"""
import wave

import numpy as np

SR = 44100
A4 = 440.0

# A マイナー: Am - F - C - G (各 1 小節)。数字は A4 からの半音
PROGRESSION = [
    [-12, -9, -5, 0],    # Am
    [-16, -12, -9, -4],  # F
    [-21, -17, -14, -9], # C (低め)
    [-14, -10, -7, -2],  # G
]


def _hz(semi):
    return A4 * 2 ** (semi / 12)


def _adsr(n, a, d, s, r):
    e = np.full(n, s, dtype=np.float64)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na, nd = min(na, n), min(nd, max(n - na, 0))
    e[:na] = np.linspace(0, 1, na, endpoint=False)
    e[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def _lowpass(x, cutoff):
    """FFT で滑らかなローパス (ブロック単位なので高速)。"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def _saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 9):  # 帯域制限したノコギリ波
        out += np.sin(2 * np.pi * freq * (1 + detune) * k * t) / k
    return out


def render(total, path, bpm=98, seed=0):
    rng = np.random.default_rng(seed)
    n_total = int((total + 0.5) * SR)
    beat = 60 / bpm
    bar = beat * 4
    out = np.zeros(n_total)

    def add(sig, start):
        i = int(start * SR)
        if i >= n_total:
            return
        sig = sig[: n_total - i]
        out[i:i + len(sig)] += sig

    n_bars = int(np.ceil(total / bar)) + 1
    for b in range(n_bars):
        t0 = b * bar
        chord = PROGRESSION[b % 4]
        nb = int(bar * SR)
        # パッド
        pad = sum(_saw(_hz(s), nb, d) for s in chord for d in (-0.004, 0.004))
        pad = _lowpass(pad, 900) * _adsr(nb, 0.4, 0.3, 0.8, 0.4) * 0.035
        add(pad, t0)
        # ベース (1, 3 拍目)
        for k in (0, 2):
            nn = int(beat * 1.8 * SR)
            tt = np.arange(nn) / SR
            f = _hz(chord[0] - 12)
            bass = np.tanh(2.2 * np.sin(2 * np.pi * f * tt)) * _adsr(nn, 0.01, 0.25, 0.5, 0.2) * 0.16
            add(bass, t0 + k * beat)
        # アルペジオ (8 分音符)
        for k in range(8):
            nn = int(beat * 0.9 * SR)
            tt = np.arange(nn) / SR
            semi = chord[[1, 2, 3, 2, 1, 3, 2, 3][k]] + 12
            f = _hz(semi)
            pl = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 7)
            add(pl * (0.05 if k % 2 == 0 else 0.035), t0 + k * beat / 2)
        if b == 0:
            continue  # 最初の 1 小節はビート無しで入る
        # キック (4 つ打ち) とハイハット (裏拍)
        for k in range(4):
            nn = int(0.35 * SR)
            tt = np.arange(nn) / SR
            f = 50 + 90 * np.exp(-tt * 30)
            kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9) * 0.32
            add(kick, t0 + k * beat)
            nh = int(0.06 * SR)
            hat = rng.standard_normal(nh)
            hat = np.diff(np.concatenate([[0], hat])) * np.exp(-np.arange(nh) / SR * 70) * 0.05
            add(hat, t0 + k * beat + beat / 2)
        # 4 小節ごとにスネア風のアクセント
        if b % 4 == 3:
            nn = int(0.25 * SR)
            sn = rng.standard_normal(nn) * np.exp(-np.arange(nn) / SR * 18) * 0.12
            add(_lowpass(sn, 5000), t0 + 3 * beat)

    out = out[: int(total * SR)]
    fade = int(min(2.0, total / 4) * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    out /= np.abs(out).max() + 1e-9
    out *= 0.8
    stereo = np.stack([out, out], axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype(np.int16).tobytes())
