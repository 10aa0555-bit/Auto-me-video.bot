"""国境データの読み込みと Web メルカトル投影。"""
import json
import math
import os

import numpy as np

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "countries.geojson")


def merc(lon, lat):
    """経緯度 -> 0..1 の正規化メルカトル座標 (x: 東向き, y: 南向き)。"""
    lat = max(min(lat, 85.0), -85.0)
    x = (lon + 180.0) / 360.0
    y = 0.5 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / (2 * math.pi)
    return x, y


def merc_arr(coords):
    a = np.asarray(coords, dtype=np.float64)
    lat = np.clip(a[:, 1], -85.0, 85.0)
    x = (a[:, 0] + 180.0) / 360.0
    y = 0.5 - np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) / (2 * np.pi)
    return np.stack([x, y], axis=1)


class Ring:
    """1 本の閉じた輪郭線。ズームに応じて間引いた版 (LOD) を持つ。"""

    LOD_TOLS = [0.0, 2e-5, 8e-5, 3e-4, 1e-3]

    def __init__(self, pts):
        self.lods = [pts]
        for tol in self.LOD_TOLS[1:]:
            q = np.round(pts / tol)
            keep = np.ones(len(q), dtype=bool)
            keep[1:] = np.any(q[1:] != q[:-1], axis=1)
            p = pts[keep]
            if len(p) < 4:
                p = self.lods[-1]
            self.lods.append(p)
        self.bbox = (pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max())

    def pick(self, px_size):
        """1px あたりの正規化距離 px_size に合う LOD を返す。"""
        best = self.lods[0]
        for tol, p in zip(self.LOD_TOLS, self.lods):
            if tol <= px_size * 0.6:
                best = p
        return best


class Shape:
    """複数ポリゴン (外周 + 穴) の集合。"""

    def __init__(self, polygons):
        # polygons: [[ring_pts, hole_pts, ...], ...] (各要素はメルカトル座標の ndarray)
        self.polygons = [[Ring(r) for r in poly] for poly in polygons]
        xs = [p[0].bbox for p in self.polygons]
        self.bbox = (min(b[0] for b in xs), min(b[1] for b in xs),
                     max(b[2] for b in xs), max(b[3] for b in xs))
        # 国旗を貼るときの基準 (本土 = 一番大きいポリゴン)
        self.main_bbox = max(xs, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))


def _point_in_ring(lon, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


class World:
    def __init__(self, path=DATA_PATH):
        with open(path, encoding="utf-8") as f:
            fc = json.load(f)
        self.raw = {}      # code -> 経緯度ポリゴンのリスト
        self.props = {}
        self.shapes = {}
        for feat in fc["features"]:
            code = feat["properties"]["code"]
            g = feat["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            self.raw.setdefault(code, []).extend(polys)
            self.props[code] = feat["properties"]
        for code, polys in self.raw.items():
            self.shapes[code] = Shape([[merc_arr(r) for r in poly] for poly in polys])
        self.custom = {}

    def add_region(self, name, coords):
        self.custom[name] = Shape([[merc_arr(coords)]])

    def resolve(self, key):
        """国コード 'POL'、国の一部 'RUS@20.5,54.7'、またはカスタム地域名から Shape を得る。"""
        if key in self.custom:
            return self.custom[key]
        if "@" in key:
            code, at = key.split("@")
            lon, lat = (float(v) for v in at.split(","))
            for poly in self.raw[code]:
                if _point_in_ring(lon, lat, poly[0]):
                    shp = Shape([[merc_arr(r) for r in poly]])
                    self.custom[key] = shp
                    return shp
            raise ValueError(f"{key}: 指定した地点を含むポリゴンがありません")
        if key not in self.shapes:
            raise KeyError(f"不明な国コード: {key}")
        return self.shapes[key]

    def label_pos(self, key):
        if key in self.props:
            return tuple(self.props[key]["label"])
        if "@" in key:
            return tuple(float(v) for v in key.split("@")[1].split(","))
        shp = self.resolve(key)
        b = shp.bbox
        x, y = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        lon = x * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y))))
        return lon, lat

    def raw_polygons(self, key):
        """国 (または "CODE@lon,lat" の一部) の経緯度ポリゴン [[ring, hole, ...], ...]。"""
        if "@" in key:
            code, at = key.split("@")
            lon, lat = (float(v) for v in at.split(","))
            return [poly for poly in self.raw[code] if _point_in_ring(lon, lat, poly[0])]
        return self.raw[key]


class Ghost:
    """国の形を、面積を保ったまま別の緯度経度へ移す (メルカトル図法の歪みを見せる用)。

    各点を中心からの km オフセットに直しておき、移動先でその km を経緯度に戻す。
    高緯度から赤道へ動かすと、地図上では縮んで見える (= 本当の大きさ)。
    """

    def __init__(self, polygons):
        main = max(polygons, key=lambda p: len(p[0]))
        lon0 = float(np.mean(np.asarray(main[0])[:, 0]))
        rings = []
        for poly in polygons:
            for r in poly:
                a = np.asarray(r, dtype=np.float64)
                a[:, 0] = (a[:, 0] - lon0 + 180) % 360 - 180 + lon0  # 日付変更線をまたぐ国 (ロシア) 対策
                rings.append(a)
        allp = np.concatenate(rings)
        self.center = ((allp[:, 0].min() + allp[:, 0].max()) / 2, (allp[:, 1].min() + allp[:, 1].max()) / 2)
        lonc, latc = self.center
        self.offsets = []  # 各リングを (東西 km, 南北 km) で持つ
        for a in rings:
            dx = (a[:, 0] - lonc) * 111.32 * np.cos(np.radians(a[:, 1]))
            dy = (a[:, 1] - latc) * 110.57
            self.offsets.append(np.stack([dx, dy], axis=1))
        self.n_rings = [len(p) for p in polygons]

    def shape_at(self, lon, lat):
        """中心を (lon, lat) に置いたときの Shape。"""
        rings = []
        for o in self.offsets:
            la = np.clip(lat + o[:, 1] / 110.57, -84, 84)
            lo = lon + o[:, 0] / (111.32 * np.cos(np.radians(la)))
            rings.append(merc_arr(np.stack([lo, la], axis=1)))
        polys, i = [], 0
        for n in self.n_rings:
            polys.append(rings[i:i + n])
            i += n
        return Shape(polys)

