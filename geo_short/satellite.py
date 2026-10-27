"""NASA Blue Marble (パブリックドメイン) の衛星画像を地図の下地として描く。"""
import math
import os
import urllib.request

import cv2
import numpy as np

CACHE = os.path.expanduser("~/.cache/geo_short")
# 2004 年 12 月の地形 + 海底地形入り Blue Marble (21600x10800, 約 1.9km/px)
NASA_URL = ("https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/"
            "world.topo.bathy.200412.3x21600x10800.jpg")


def find_texture():
    """使える中で一番高解像度の衛星画像のパスを返す。"""
    env = os.environ.get("GEO_SAT_TEXTURE")
    if env:
        return env
    hi = os.path.join(CACHE, "bluemarble_21600.jpg")
    if os.path.exists(hi):
        return hi
    try:
        os.makedirs(CACHE, exist_ok=True)
        print("衛星画像 (NASA Blue Marble 21600px) をダウンロード中…")
        urllib.request.urlretrieve(NASA_URL, hi + ".part")
        os.replace(hi + ".part", hi)
        return hi
    except OSError as e:
        print(f"  高解像度版を取得できませんでした ({e})。低解像度版を使います")
    lo = os.path.join(CACHE, "bmng_5400.jpg")
    if os.path.exists(lo):
        return lo
    try:  # pip install basemap-data に同梱の Blue Marble (5400px)
        from mpl_toolkits import basemap_data
        return os.path.join(os.path.dirname(basemap_data.__file__), "bmng.jpg")
    except ImportError:
        raise RuntimeError("衛星画像が見つかりません。GEO_SAT_TEXTURE で画像を指定するか "
                           "`pip install basemap-data` してください")


def _grade(img):
    """Blue Marble は少し眠いので、コントラストと彩度を上げて海を深く見せる。"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.2, 0, 255)
    v = hsv[..., 2] / 255.0
    hsv[..., 2] = np.clip((v - 0.5) * 1.15 + 0.52, 0, 1) ** 0.95 * 255
    # 海 (青) は彩度を落として少し緑寄り・暗めに
    sea = ((hsv[..., 0] > 95) & (hsv[..., 0] < 130)).astype(np.float32)
    sea = cv2.GaussianBlur(sea, (0, 0), 2)
    hsv[..., 0] -= sea * 8
    hsv[..., 1] *= 1 - sea * 0.35
    hsv[..., 2] *= 1 - sea * 0.2
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


class SatelliteLayer:
    def __init__(self, w, h):
        self.w, self.h = w, h
        path = find_texture()
        img = cv2.imread(path, cv2.IMREAD_COLOR)
        if img is None:
            raise RuntimeError(f"衛星画像を読めません: {path}")
        img = _grade(img)
        # 縮小表示時のちらつき防止にミップマップを作る
        self.levels = [img]
        while self.levels[-1].shape[1] > 2048:
            self.levels.append(cv2.pyrDown(self.levels[-1]))
        self.clouds = self._make_clouds()
        print(f"衛星画像: {os.path.basename(path)} {img.shape[1]}x{img.shape[0]}")

    @staticmethod
    def _make_clouds(size=1024, seed=3):
        """フラクタルノイズで雲のテクスチャを作る (0..1)。"""
        rng = np.random.default_rng(seed)
        acc = np.zeros((size, size), np.float32)
        amp, total = 1.0, 0.0
        for cells in (4, 8, 16, 32, 64, 128):
            # 周期的に並べてから拡大し中央を切り出す -> 継ぎ目の出ないタイル
            g = np.tile(rng.random((cells, cells)).astype(np.float32), (3, 3))
            big = cv2.resize(g, (size * 3, size * 3), interpolation=cv2.INTER_CUBIC)
            acc += big[size:2 * size, size:2 * size] * amp
            total += amp
            amp *= 0.55
        acc /= total
        return np.clip((acc - 0.48) * 3.2, 0, 1)

    def render(self, cx, cy, ppu, t):
        """カメラ (正規化メルカトル中心 cx, cy / 1 単位あたりの px) で BGRA 画像を返す。"""
        w, h = self.w, self.h
        mx = cx + (np.arange(w, dtype=np.float64) + 0.5 - w / 2) / ppu
        my = cy + (np.arange(h, dtype=np.float64) + 0.5 - h / 2) / ppu
        lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * np.clip(my, 0.0, 1.0)))))
        base_w = self.levels[0].shape[1]
        src_per_px = base_w / ppu
        lv = min(max(int(math.floor(math.log2(max(src_per_px, 1.0)))), 0), len(self.levels) - 1)
        tex = self.levels[lv]
        th, tw = tex.shape[:2]
        col = (mx % 1.0) * tw - 0.5
        row = (90.0 - lat) / 180.0 * th - 0.5
        map_x = np.broadcast_to(col.astype(np.float32)[None, :], (h, w))
        map_y = np.broadcast_to(row.astype(np.float32)[:, None], (h, w))
        out = cv2.remap(tex, np.ascontiguousarray(map_x), np.ascontiguousarray(map_y),
                        cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        return out

    def cloud_alpha(self, ppu, t, cx, cy):
        """画面空間の雲 (引きの画ほど濃く)。0..1 の float 配列を返す。"""
        span_deg = self.w / ppu * 360
        strength = float(np.clip((span_deg - 8) / 60, 0.0, 1.0)) * 0.55
        if strength <= 0.01:
            return None, 0.0
        w, h = self.w, self.h
        size = self.clouds.shape[0]
        k = size / (w * 1.1)
        # カメラ移動と少しずれて動く (視差) + ゆっくり流れる
        ox = cx * ppu * 0.25 * k + t * 6
        oy = cy * ppu * 0.25 * k + t * 2
        xs = (np.arange(w, dtype=np.float32) * k + ox) % size
        ys = (np.arange(h, dtype=np.float32) * k + oy) % size
        mx = np.ascontiguousarray(np.broadcast_to(xs[None, :], (h, w)))
        my = np.ascontiguousarray(np.broadcast_to(ys[:, None], (h, w)))
        a = cv2.remap(self.clouds, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        return a, strength
