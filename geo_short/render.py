"""台本 JSON から地図アニメーションのフレームを描画する。"""
import math
import os
import re
import subprocess

import cairo
import numpy as np

from .geo import World, merc

W, H = 1080, 1920

STYLE = {
    "ocean": "#5b8790",
    "ocean_deep": "#3f6670",
    "land": "#d9c7a1",
    "border": "#9c8763",
    "text": "#ffffff",
    "text_stroke": "#1d1d1d",
    "year": "#f6efdc",
}

def _pick_font():
    """インストール済みの日本語フォントを選ぶ (GEO_FONT で上書き可)。"""
    cands = [os.environ.get("GEO_FONT"), "Noto Sans CJK JP", "Noto Sans JP", "IPAGothic"]
    for fam in filter(None, cands):
        try:
            got = subprocess.check_output(["fc-match", "-f", "%{family}", fam], text=True)
        except (OSError, subprocess.CalledProcessError):
            return fam
        if fam.lower() in got.lower():
            return fam
    return "sans-serif"


FONT = _pick_font()

FILL_FADE = 0.6       # 塗り替えにかける秒数
CAM_MOVE_MAX = 1.6    # カメラ移動にかける最大秒数
DRIFT = 0.05          # 静止中のゆっくりズーム率


def hex2rgba(h, alpha=1.0):
    h = h.lstrip("#")
    if len(h) == 8:
        alpha = int(h[6:8], 16) / 255
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, alpha)


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u) if u < 1 else 1.0


def ease_out_back(u):
    u = min(max(u, 0.0), 1.0)
    c = 1.70158
    return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2


def lerp(a, b, u):
    return tuple(x + (y - x) * u for x, y in zip(a, b))


R_EARTH = 6371.0


def geodesic_km(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(h))


def geodesic_dest(start, km, bearing_deg):
    lon1, lat1 = math.radians(start[0]), math.radians(start[1])
    d, b = km / R_EARTH, math.radians(bearing_deg)
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(b))
    lon2 = lon1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(lat1),
                             math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lon2), math.degrees(lat2)


# ---------------------------------------------------------------- 字幕の分割

def split_caption(text, max_chars=20):
    """ナレーションを短い字幕チャンクに分ける (句読点優先)。"""
    parts = [p for p in re.split(r"(?<=[。、！？!?」])", text) if p.strip()]
    chunks, cur = [], ""
    for p in parts:
        if cur and len(cur) + len(p) > max_chars:
            chunks.append(cur)
            cur = p
        else:
            cur += p
    if cur:
        chunks.append(cur)
    out = []
    for c in chunks:
        while len(c) > max_chars * 1.3:
            out.append(c[:max_chars])
            c = c[max_chars:]
        out.append(c)
    return [c.rstrip("。、") for c in out]


def split_caption_en(text, max_words=3, max_chars=18):
    """英語は 1〜3 語ずつ (TikTok 風)。(チャンク, 先頭の文字位置) のリストを返す。"""
    words = [(m.group(), m.start()) for m in re.finditer(r"\S+", text)]
    chunks, cur = [], []
    for w, pos in words:
        if cur and (len(cur) >= max_words or len(" ".join(x for x, _ in cur + [(w, 0)])) > max_chars):
            chunks.append(cur)
            cur = []
        cur.append((w, pos))
        if re.search(r"[.,!?;:—]$", w):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    out = []
    for c in chunks:
        t = " ".join(w for w, _ in c).strip("—").rstrip(".,;:").strip()
        out.append((t, c[0][1]))
    return out


def caption_timings(text, start, dur, alignment=None, lang="ja"):
    if lang == "en":
        pairs = split_caption_en(text)
        ok = alignment and "".join(alignment["characters"]) == text
        st = alignment["character_start_times_seconds"] if ok else None
        times = [start + (st[pos] if ok else dur * pos / max(len(text), 1)) for _, pos in pairs]
        times.append(start + dur)
        return [(pairs[i][0], times[i], times[i + 1]) for i in range(len(pairs))]
    chunks = split_caption(text)
    total = sum(len(c) for c in chunks) or 1
    times = []
    if alignment and "".join(alignment["characters"]) == text:
        st = alignment["character_start_times_seconds"]
        idx = 0
        for c in chunks:
            pos = text.find(c, idx)
            times.append(start + st[pos])
            idx = pos + len(c)
    else:
        acc = 0
        for c in chunks:
            times.append(start + dur * acc / total)
            acc += len(c)
    times.append(start + dur)
    return [(chunks[i], times[i], times[i + 1]) for i in range(len(chunks))]


# ---------------------------------------------------------------- タイムライン

class Timeline:
    def __init__(self, script, durations, alignments=None):
        self.script = script
        self.scenes = []
        t = 0.0
        alignments = alignments or [None] * len(durations)
        for sc, d, al in zip(script["scenes"], durations, alignments):
            self.scenes.append({"spec": sc, "start": t, "dur": d})
            t += d
        self.total = t
        self.captions = []
        lang = script.get("lang", "ja")
        for s, al in zip(self.scenes, alignments):
            text = s["spec"].get("caption", s["spec"].get("narration", ""))
            if text:
                self.captions += caption_timings(text, s["start"], s["dur"], al, lang)

        # 各シーン開始時点の塗り状態と終了時点のカメラを前計算
        fills = {}
        prev_cam = None
        for s in self.scenes:
            sp = s["spec"]
            s["fills_before"] = dict(fills)
            if sp.get("reset_fills"):
                fills = {}
            for k, v in sp.get("fill", {}).items():
                if v is None:
                    fills.pop(k, None)
                else:
                    fills[k] = v
            s["fills_after"] = dict(fills)
            cam = sp.get("camera")
            if cam:
                x, y = merc(*cam["center"])
                target = (x, y, math.log(cam["span"] / 360.0))
            else:
                target = prev_cam
            s["cam_from"] = prev_cam or target
            s["cam_to"] = target
            prev_cam = self._drifted(target, 1.0)

        self.sfx = self._sfx_events()

    def _sfx_events(self):
        ev = []
        for s in self.scenes:
            sp, t0 = s["spec"], s["start"]
            a, b = s["cam_from"], s["cam_to"]
            if a and b and (math.hypot(b[0] - a[0], b[1] - a[1]) > 0.02 * math.exp(b[2]) or abs(a[2] - b[2]) > 0.4):
                ev.append((max(0, t0 - 0.05), "whoosh", {"seed": len(ev)}))
            if sp.get("year"):
                ev.append((t0 + 0.05, "thud", {}))
            for i, m in enumerate(sp.get("markers", [])):
                ev.append((t0 + m.get("delay", 0.4 + i * 0.25), "pop", {"pitch": 1.0}))
            for i, ic in enumerate(sp.get("icons", [])):
                d = ic.get("delay", 0.4 + i * 0.3)
                for j in range(min(ic.get("count", 1), 6)):
                    ev.append((t0 + d + j * 0.08, "pop", {"pitch": 1.0 + 0.12 * (j % 4)}))
            for ln in sp.get("lines", []):
                if ln.get("label"):
                    ev.append((t0 + ln.get("delay", 0.3) + ln.get("draw_time", 1.2), "ding", {}))
            for c in sp.get("circles", []):
                ev.append((t0 + c.get("delay", 0.3), "whoosh", {"dur": 0.5, "seed": 99}))
            for i, tx in enumerate(sp.get("texts", [])):
                ev.append((t0 + tx.get("delay", 0.5 + i * 0.3), "pop", {"pitch": 0.8}))
            if sp.get("banner"):
                ev.append((t0 + sp["banner"].get("delay", 0.3), "thud", {}))
        return ev

    @staticmethod
    def _drifted(cam, u):
        return (cam[0], cam[1], cam[2] + math.log(1 - DRIFT * u))

    def scene_at(self, t):
        for i, s in enumerate(self.scenes):
            if t < s["start"] + s["dur"] or i == len(self.scenes) - 1:
                return i, s, t - s["start"]

    def camera(self, s, lt):
        a, b = s["cam_from"], s["cam_to"]
        move = min(CAM_MOVE_MAX, s["dur"] * 0.5)
        dist = math.hypot(b[0] - a[0], b[1] - a[1])
        if dist < 1e-9 and abs(a[2] - b[2]) < 1e-6:
            cam = b
        else:
            u = ease(lt / move)
            cam = lerp(a, b, u)
            # 遠くへ飛ぶときは途中で少し引く
            span = math.exp((a[2] + b[2]) / 2)
            bump = min(max(dist / span - 0.4, 0), 1.2)
            cam = (cam[0], cam[1], cam[2] + bump * math.sin(math.pi * u) * 0.6)
        drift_u = max(0.0, lt - move) / max(s["dur"] - move, 1e-6) if dist > 1e-9 else lt / s["dur"]
        return self._drifted(cam, min(drift_u, 1.0))


# ---------------------------------------------------------------- 描画

class Renderer:
    def __init__(self, script, scale=1.0):
        self.script = script
        self.scale = scale
        self.w, self.h = int(W * scale), int(H * scale)
        self.world = World()
        for name, coords in script.get("regions", {}).items():
            self.world.add_region(name, coords)
        self.surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, self.w, self.h)
        self.ctx = cairo.Context(self.surface)
        self.ctx.scale(scale, scale)
        # "satellite" (衛星写真) か "parchment" (古地図風のフラット)
        self.style = script.get("style", "satellite")
        self.sat = None
        if self.style == "satellite":
            from .satellite import SatelliteLayer
            self.sat = SatelliteLayer(self.w, self.h)
        self.overlay = self._make_overlay()
        self.t = 0.0
        from .assets import Flags, Icons, install_fonts
        install_fonts()
        self.lang = script.get("lang", "ja")
        self.font = FONT if self.lang == "ja" else os.environ.get("GEO_FONT_EN", "Poppins Black")
        self.icons = Icons()
        self.flags = Flags()

    # -- 座標変換
    def set_camera(self, cam):
        cx, cy, lspan = cam
        self.cx, self.cy = cx, cy
        self.ppu = W / math.exp(lspan)   # 正規化メルカトル 1 単位あたりのピクセル
        self.px_size = 1.0 / self.ppu / self.scale

    def to_px(self, lon, lat):
        x, y = merc(lon, lat)
        return (x - self.cx) * self.ppu + W / 2, (y - self.cy) * self.ppu + H / 2

    def visible(self, bbox):
        hw = W / 2 / self.ppu
        hh = H / 2 / self.ppu
        return not (bbox[2] < self.cx - hw or bbox[0] > self.cx + hw or
                    bbox[3] < self.cy - hh or bbox[1] > self.cy + hh)

    def path_shape(self, shape):
        ctx = self.ctx
        for poly in shape.polygons:
            if not self.visible(poly[0].bbox):
                continue
            for ring in poly:
                pts = ring.pick(self.px_size)
                sx = (pts[:, 0] - self.cx) * self.ppu + W / 2
                sy = (pts[:, 1] - self.cy) * self.ppu + H / 2
                ctx.move_to(sx[0], sy[0])
                for x, y in zip(sx[1:].tolist(), sy[1:].tolist()):
                    ctx.line_to(x, y)
                ctx.close_path()

    # -- 背景
    def _make_overlay(self):
        """周辺減光 + 紙の質感ノイズ。"""
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, self.w, self.h)
        c = cairo.Context(surf)
        c.scale(self.scale, self.scale)
        g = cairo.RadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75)
        g.add_color_stop_rgba(0, 0, 0, 0, 0)
        g.add_color_stop_rgba(1, 0, 0, 0, 0.45 if self.sat is None else 0.35)
        c.set_source(g)
        c.paint()
        if self.sat is not None:
            return surf
        rng = np.random.default_rng(7)
        n = (rng.random((self.h, self.w)) * 255).astype(np.uint8)
        a = np.full((self.h, self.w), 14, np.uint8)
        arr = np.dstack([n * a // 255, n * a // 255, n * a // 255, a]).astype(np.uint8)
        noise = cairo.ImageSurface.create_for_data(bytearray(arr.tobytes()), cairo.FORMAT_ARGB32,
                                                   self.w, self.h)
        c.identity_matrix()
        c.set_source_surface(noise)
        c.paint()
        return surf

    def _pixels(self):
        self.surface.flush()
        stride = self.surface.get_stride()
        return np.ndarray((self.h, stride // 4, 4), np.uint8, buffer=self.surface.get_data())[:, :self.w]

    def draw_satellite(self):
        px = self._pixels()
        px[..., :3] = self.sat.render(self.cx, self.cy, self.ppu * self.scale, self.t)
        px[..., 3] = 255
        self.surface.mark_dirty()
        # 国境線は細く白っぽく
        ctx = self.ctx
        ctx.new_path()
        for shp in self.world.shapes.values():
            if self.visible(shp.bbox):
                self.path_shape(shp)
        ctx.set_source_rgba(1, 1, 1, 0.38)
        ctx.set_line_width(max(1.2, min(2.2, self.ppu / 7000)))
        ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        ctx.stroke()

    def draw_clouds(self):
        a, strength = self.sat.cloud_alpha(self.ppu * self.scale, self.t, self.cx, self.cy)
        if a is None:
            return
        px = self._pixels()
        k = (a * strength)[..., None]
        rgb = px[..., :3].astype(np.float32)
        px[..., :3] = (rgb + (232.0 - rgb) * k).astype(np.uint8)
        self.surface.mark_dirty()

    def draw_base(self):
        if self.sat is not None:
            return self.draw_satellite()
        ctx = self.ctx
        g = cairo.LinearGradient(0, 0, 0, H)
        g.add_color_stop_rgba(0, *hex2rgba(STYLE["ocean"]))
        g.add_color_stop_rgba(1, *hex2rgba(STYLE["ocean_deep"]))
        ctx.set_source(g)
        ctx.paint()
        ctx.new_path()
        for shp in self.world.shapes.values():
            if self.visible(shp.bbox):
                self.path_shape(shp)
        ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
        # 海岸線のうっすらした影
        ctx.save()
        ctx.translate(0, 4)
        ctx.set_source_rgba(0, 0, 0, 0.18)
        ctx.fill_preserve()
        ctx.restore()
        ctx.set_source_rgba(*hex2rgba(STYLE["land"]))
        ctx.fill_preserve()
        ctx.set_source_rgba(*hex2rgba(STYLE["border"]))
        ctx.set_line_width(max(1.2, min(2.5, self.ppu / 6000)))
        ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        ctx.stroke()

    def draw_fills(self, s, lt):
        u = ease(lt / FILL_FADE)
        before, after = s["fills_before"], s["fills_after"]
        keys = list(dict.fromkeys(list(before) + list(after)))
        land = hex2rgba(STYLE["land"])
        for k in keys:
            shp = self.world.resolve(k)
            if not self.visible(shp.bbox):
                continue
            vb, va = before.get(k), after.get(k)
            if any(isinstance(v, str) and v.startswith("flag:") for v in (vb, va)):
                if vb and vb != va:
                    self._fill_layer(shp, vb, 1 - u)
                if va:
                    self._fill_layer(shp, va, u if vb != va else 1.0)
                continue
            if self.sat is not None or k in self.world.custom:
                c0 = hex2rgba(before[k]) if k in before else None
                c1 = hex2rgba(after[k]) if k in after else None
                # 無い側は「同じ色で透明」にしてフェードさせる
                c0 = c0 or c1[:3] + (0.0,)
                c1 = c1 or c0[:3] + (0.0,)
            else:
                c0 = hex2rgba(before[k]) if k in before else land
                c1 = hex2rgba(after[k]) if k in after else land
            col = lerp(c0, c1, u)
            if col[3] <= 0.001:
                continue
            self.ctx.new_path()
            self.path_shape(shp)
            if self.sat is not None:  # 地形が透けるように半透明で塗る
                self.ctx.set_source_rgba(col[0], col[1], col[2], col[3] * 0.9)
                self.ctx.fill_preserve()
                self.ctx.set_source_rgba(1, 1, 1, 0.7 * col[3])
            else:
                self.ctx.set_source_rgba(*col)
                self.ctx.fill_preserve()
                self.ctx.set_source_rgba(0.12, 0.1, 0.08, 0.55 * col[3])
            self.ctx.set_line_width(2.2)
            self.ctx.stroke()

    def _fill_layer(self, shp, value, alpha):
        if alpha <= 0.001:
            return
        ctx = self.ctx
        if not value.startswith("flag:"):
            c = hex2rgba(value)
            ctx.new_path()
            self.path_shape(shp)
            ctx.set_source_rgba(c[0], c[1], c[2], c[3] * alpha * (0.9 if self.sat else 1))
            ctx.fill()
            return
        flag = self.flags.get(value[5:])
        # 影 -> 国旗 (国の形で切り抜き) -> 白い縁
        ctx.save()
        ctx.translate(5, 9)
        ctx.new_path()
        self.path_shape(shp)
        ctx.set_source_rgba(0, 0, 0, 0.45 * alpha)
        ctx.fill()
        ctx.restore()
        b = shp.main_bbox
        x0, y0 = (b[0] - self.cx) * self.ppu + W / 2, (b[1] - self.cy) * self.ppu + H / 2
        x1, y1 = (b[2] - self.cx) * self.ppu + W / 2, (b[3] - self.cy) * self.ppu + H / 2
        bw, bh = max(x1 - x0, 1), max(y1 - y0, 1)
        k = max(bw / flag.get_width(), bh / flag.get_height())
        ctx.save()
        ctx.new_path()
        self.path_shape(shp)
        ctx.clip_preserve()
        ctx.translate((x0 + x1) / 2 - flag.get_width() * k / 2, (y0 + y1) / 2 - flag.get_height() * k / 2)
        ctx.scale(k, k)
        ctx.set_source_surface(flag)
        ctx.get_source().set_filter(cairo.FILTER_GOOD)
        ctx.paint_with_alpha(alpha)
        ctx.restore()
        ctx.new_path()
        self.path_shape(shp)
        ctx.set_source_rgba(1, 1, 1, 0.9 * alpha)
        ctx.set_line_width(3)
        ctx.stroke()

    def draw_outlines(self, s, lt):
        for k in s["spec"].get("outline", []):
            shp = self.world.resolve(k)
            a = ease(lt / 0.5) * (0.75 + 0.25 * math.sin(lt * 4))
            for width, alpha in ((22, 0.18), (12, 0.35), (5, 1.0)):
                self.ctx.new_path()
                self.path_shape(shp)
                self.ctx.set_source_rgba(1.0, 0.92, 0.2, alpha * a)
                self.ctx.set_line_width(width)
                self.ctx.stroke()

    # -- 線・矢印
    def _line_points(self, ln):
        pts = [self.to_px(*p) for p in ln["path"]]
        bend = ln.get("curve", 0)
        if bend and len(pts) == 2:
            (x0, y0), (x1, y1) = pts
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            dx, dy = x1 - x0, y1 - y0
            cx, cy = mx - dy * bend, my + dx * bend
            pts = []
            for i in range(41):
                u = i / 40
                pts.append(((1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x1,
                            (1 - u) ** 2 * y0 + 2 * (1 - u) * u * cy + u * u * y1))
        return pts

    def draw_lines(self, s, lt):
        ctx = self.ctx
        for ln in s["spec"].get("lines", []):
            pts = self._line_points(ln)
            delay = ln.get("delay", 0.3)
            prog = ease((lt - delay) / ln.get("draw_time", 1.2)) if ln.get("draw", True) else 1.0
            if prog <= 0:
                continue
            seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                   for i in range(len(pts) - 1)]
            target = sum(seg) * prog
            out, acc = [pts[0]], 0.0
            for i, L in enumerate(seg):
                if acc + L >= target:
                    u = (target - acc) / L if L else 0
                    out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u,
                                pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u))
                    break
                out.append(pts[i + 1])
                acc += L
            color = hex2rgba(ln.get("color", "#ffffff"))
            width = ln.get("width", 7)
            style = ln.get("style", "solid")
            ctx.new_path()
            ctx.move_to(*out[0])
            for p in out[1:]:
                ctx.line_to(*p)
            ctx.set_line_cap(cairo.LINE_CAP_ROUND)
            ctx.set_line_join(cairo.LINE_JOIN_ROUND)
            if style in ("dashed", "arrow_dashed"):
                ctx.set_dash([width * 2.4, width * 1.8], -lt * 40)
            ctx.set_source_rgba(0, 0, 0, 0.35)
            ctx.set_line_width(width + 4)
            ctx.stroke_preserve()
            ctx.set_source_rgba(*color)
            ctx.set_line_width(width)
            ctx.stroke()
            ctx.set_dash([])
            if ln.get("label") and prog > 0.05:
                self._line_label(ln, pts, prog)
            if style.startswith("arrow") and len(out) >= 2:
                (x0, y0), (x1, y1) = out[-2], out[-1]
                ang = math.atan2(y1 - y0, x1 - x0)
                hl = width * 4.5
                ctx.new_path()
                ctx.move_to(x1 + math.cos(ang) * hl * 0.4, y1 + math.sin(ang) * hl * 0.4)
                ctx.line_to(x1 + math.cos(ang + 2.5) * hl, y1 + math.sin(ang + 2.5) * hl)
                ctx.line_to(x1 + math.cos(ang - 2.5) * hl, y1 + math.sin(ang - 2.5) * hl)
                ctx.close_path()
                ctx.set_source_rgba(*color)
                ctx.fill()

    def _line_label(self, ln, pts, prog):
        label = ln["label"]
        if label == "auto":  # 経路の長さを測って 10km 単位で表示
            km = sum(geodesic_km(ln["path"][i], ln["path"][i + 1]) for i in range(len(ln["path"]) - 1))
            label, ln = "{n} KM", dict(ln, count=round(km, -1) if km > 100 else round(km))
        if "count" in ln:
            label = label.replace("{n}", f"{int(ln['count'] * prog):,}")
        (x0, y0), (x1, y1) = pts[0], pts[-1]
        mid = pts[len(pts) // 2] if len(pts) > 2 else ((x0 + x1) / 2, (y0 + y1) / 2)
        ang = math.atan2(y1 - y0, x1 - x0)
        if ang > math.pi / 2:
            ang -= math.pi
        if ang < -math.pi / 2:
            ang += math.pi
        ctx = self.ctx
        ctx.save()
        ctx.translate(*mid)
        ctx.rotate(ang)
        self.text(label, 0, -48, ln.get("label_size", 58), color=ln.get("label_color", "#ffe14d"),
                  alpha=min(1.0, prog * 3))
        ctx.restore()

    # -- 円 (半径◯km)
    def draw_circles(self, s, lt):
        ctx = self.ctx
        for c in s["spec"].get("circles", []):
            u = ease_out_back((lt - c.get("delay", 0.3)) / 0.7)
            if u <= 0:
                continue
            color = hex2rgba(c.get("color", "#e53935"))
            ring = [self.to_px(*geodesic_dest(c["at"], c["radius_km"] * u, b)) for b in range(0, 361, 4)]
            ctx.new_path()
            for p in ring:
                ctx.line_to(*p)
            ctx.close_path()
            ctx.set_source_rgba(color[0], color[1], color[2], 0.3)
            ctx.fill_preserve()
            for wdt, a in ((26, 0.12), (14, 0.25)):
                ctx.set_source_rgba(color[0], color[1], color[2], a)
                ctx.set_line_width(wdt)
                ctx.stroke_preserve()
            ctx.set_dash([0.1, 14], -lt * 30)
            ctx.set_line_cap(cairo.LINE_CAP_ROUND)
            ctx.set_source_rgba(1, 1, 1, 0.95)
            ctx.set_line_width(7)
            ctx.stroke()
            ctx.set_dash([])
            if c.get("label"):
                x, y = self.to_px(*geodesic_dest(c["at"], c["radius_km"], 180))
                self.text(c["label"], x, y + 45, 54, color="#ffffff", alpha=min(1, u))

    # -- 3D アイコン
    def draw_icons(self, s, lt):
        ctx = self.ctx
        for i, ic in enumerate(s["spec"].get("icons", [])):
            delay = ic.get("delay", 0.4 + i * 0.3)
            size = ic.get("size", 170)
            n = ic.get("count", 1)
            lon, lat = ic["at"] if "at" in ic else self.world.label_pos(ic["of"])
            bx, by = self.to_px(lon, lat)
            if "to" in ic:  # 移動 (人の流れ・船の航路など)
                tx, ty = self.to_px(*ic["to"])
                m = ease((lt - delay - 0.3) / ic.get("travel_time", 2.0))
                bx, by = bx + (tx - bx) * m, by + (ty - by) * m
            spread = ic.get("spread", size * 0.75)
            img = self.icons.get(ic["name"], size * self.scale * 1.15)
            for j in range(n):
                d = delay + j * 0.08
                k = ease_out_back((lt - d) / 0.45)
                if k < 0.02:  # 縮尺が 0 付近だと cairo の行列が特異になる
                    continue
                r = spread * math.sqrt(j) * 0.9
                th = j * 2.39996
                x, y = bx + r * math.cos(th), by + r * math.sin(th) * 0.8
                anim = ic.get("anim", "bob")
                if anim == "bob":
                    y += math.sin((lt + j * 0.7) * 3.2) * size * 0.04
                elif anim == "shake":
                    x += math.sin(lt * 40 + j) * size * 0.03
                rot = math.sin(lt * 25) * 0.08 if anim == "shake" else 0.0
                # 影
                ctx.save()
                ctx.translate(x, y + size * 0.47)
                ctx.scale(size * 0.36 * k, size * 0.08 * k)
                ctx.arc(0, 0, 1, 0, 2 * math.pi)
                ctx.set_source_rgba(0, 0, 0, 0.35)
                ctx.fill()
                ctx.restore()
                ctx.save()
                ctx.translate(x, y)
                ctx.rotate(rot)
                f = k * size / img.get_width()
                ctx.scale(f, f)
                if ic.get("flip"):
                    ctx.scale(-1, 1)
                ctx.translate(-img.get_width() / 2, -img.get_height() / 2)
                ctx.set_source_surface(img)
                ctx.paint()
                ctx.restore()
            if ic.get("label"):
                a = ease((lt - delay - 0.2) / 0.3)
                self.tag(ic["label"], bx, by - size * 0.62, alpha=a)

    # -- 大きい文字・タイトル帯
    def draw_texts(self, s, lt):
        for i, tx in enumerate(s["spec"].get("texts", [])):
            delay = tx.get("delay", 0.5 + i * 0.3)
            k = ease_out_back((lt - delay) / 0.4)
            if k < 0.02:
                continue
            text = tx["text"]
            if "count" in tx:
                n = tx["count"] * ease((lt - delay) / tx.get("count_time", 1.2))
                text = text.replace("{n}", f"{int(n):,}")
            if "at" in tx or "of" in tx:
                lon, lat = tx["at"] if "at" in tx else self.world.label_pos(tx["of"])
                x, y = self.to_px(lon, lat)
            else:
                x, y = W / 2, H * tx.get("y", 0.3)
            size = tx.get("size", 92)
            ctx = self.ctx
            ctx.save()
            ctx.translate(x, y)
            ctx.scale(k, k)
            self.rich_text(text, 0, 0, size, accent=tx.get("accent", []))
            ctx.restore()

    def rich_text(self, text, x, y, size, accent=()):
        """accent に含まれる語だけ黄色にして横に並べる。"""
        ctx = self.ctx
        ctx.select_font_face(self.font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(size)
        words = text.split(" ")
        space = ctx.text_extents(" ").x_advance
        widths = [ctx.text_extents(w).x_advance for w in words]
        cx = x - (sum(widths) + space * (len(words) - 1)) / 2
        for w, wd in zip(words, widths):
            col = "#ffe14d" if w.strip("?!.,") in accent else "#ffffff"
            self.text(w, cx + wd / 2, y, size, color=col)
            cx += wd + space

    def draw_banner(self, s, lt):
        bn = s["spec"].get("banner")
        if not bn:
            return
        ctx = self.ctx
        size = bn.get("size", 74)
        colors = bn.get("colors", ["#e53935", "#111111"])
        for j, line in enumerate(bn["lines"]):
            u = ease((lt - bn.get("delay", 0.3) - j * 0.15) / 0.35)
            if u <= 0:
                continue
            ctx.select_font_face(self.font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
            ctx.set_font_size(size)
            tw = ctx.text_extents(line).x_advance
            y = H * bn.get("y", 0.3) + j * size * 1.3
            off = (1 - u) * W * (1 if j % 2 else -1)
            x = W / 2 + off
            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(-0.03)
            ctx.rectangle(-tw / 2 - 28, -size * 0.68, tw + 56, size * 1.3)
            ctx.set_source_rgba(*hex2rgba(colors[j % len(colors)]))
            ctx.fill()
            ctx.move_to(-tw / 2, size * 0.36)
            ctx.text_path(line)
            ctx.set_source_rgba(1, 1, 1, 1)
            ctx.fill()
            ctx.restore()

    def tag(self, text, x, y, alpha=1.0, color="#e53935", size=34):
        """赤い角丸ボックスに白文字 (都市名などのタグ)。"""
        if alpha <= 0:
            return
        ctx = self.ctx
        ctx.select_font_face(self.font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(size)
        tw = ctx.text_extents(text).x_advance
        w, h, r = tw + 30, size * 1.45, 10
        x0, y0 = x - w / 2, y - h / 2
        ctx.new_path()
        ctx.arc(x0 + r, y0 + r, r, math.pi, 1.5 * math.pi)
        ctx.arc(x0 + w - r, y0 + r, r, 1.5 * math.pi, 2 * math.pi)
        ctx.arc(x0 + w - r, y0 + h - r, r, 0, 0.5 * math.pi)
        ctx.arc(x0 + r, y0 + h - r, r, 0.5 * math.pi, math.pi)
        ctx.close_path()
        c = hex2rgba(color)
        ctx.set_source_rgba(c[0], c[1], c[2], alpha)
        ctx.fill_preserve()
        ctx.set_source_rgba(1, 1, 1, alpha)
        ctx.set_line_width(3)
        ctx.stroke()
        ctx.move_to(x - tw / 2, y + size * 0.36)
        ctx.text_path(text)
        ctx.set_source_rgba(1, 1, 1, alpha)
        ctx.fill()

    # -- マーカー
    def draw_markers(self, s, lt):
        ctx = self.ctx
        for i, m in enumerate(s["spec"].get("markers", [])):
            delay = m.get("delay", 0.4 + i * 0.25)
            k = ease_out_back((lt - delay) / 0.45)
            if k < 0.02:
                continue
            x, y = self.to_px(*m["at"])
            color = hex2rgba(m.get("color", "#e53935"))
            kind = m.get("type", "pulse")
            ctx.save()
            ctx.translate(x, y)
            ctx.scale(k, k)
            if kind == "pulse":
                for ph in (0.0, 0.5):
                    u = ((lt - delay) * 0.8 + ph) % 1.0
                    ctx.new_path()
                    ctx.arc(0, 0, 18 + 70 * u, 0, 2 * math.pi)
                    ctx.set_source_rgba(color[0], color[1], color[2], 0.8 * (1 - u))
                    ctx.set_line_width(6)
                    ctx.stroke()
                ctx.arc(0, 0, 16, 0, 2 * math.pi)
                ctx.set_source_rgba(*color)
                ctx.fill_preserve()
                ctx.set_source_rgba(1, 1, 1, 1)
                ctx.set_line_width(5)
                ctx.stroke()
            elif kind == "pin":
                ctx.new_path()
                ctx.move_to(0, 0)
                ctx.curve_to(-14, -26, -30, -40, -30, -62)
                ctx.arc(0, -62, 30, math.pi, 2 * math.pi)
                ctx.curve_to(30, -40, 14, -26, 0, 0)
                ctx.close_path()
                ctx.set_source_rgba(*color)
                ctx.fill_preserve()
                ctx.set_source_rgba(1, 1, 1, 1)
                ctx.set_line_width(4)
                ctx.stroke()
                ctx.arc(0, -62, 11, 0, 2 * math.pi)
                ctx.fill()
            elif kind == "star":
                ctx.new_path()
                for j in range(10):
                    r = 34 if j % 2 == 0 else 14
                    a = -math.pi / 2 + j * math.pi / 5
                    ctx.line_to(r * math.cos(a), r * math.sin(a))
                ctx.close_path()
                ctx.set_source_rgba(*color)
                ctx.fill_preserve()
                ctx.set_source_rgba(0.1, 0.1, 0.1, 1)
                ctx.set_line_width(3)
                ctx.stroke()
            else:  # dot
                ctx.arc(0, 0, 13, 0, 2 * math.pi)
                ctx.set_source_rgba(*color)
                ctx.fill_preserve()
                ctx.set_source_rgba(1, 1, 1, 1)
                ctx.set_line_width(4)
                ctx.stroke()
            ctx.restore()
            if m.get("label"):
                dx, dy = m.get("label_offset", [0, -95 if kind == "pin" else -60])
                if m.get("tag", self.lang == "en"):
                    self.tag(m["label"].upper(), x + dx, y + dy - 10, alpha=min(1, k))
                else:
                    self.text(m["label"], x + dx, y + dy, 46, alpha=min(1, k))

    # -- 文字
    def text(self, s, x, y, size, color=None, alpha=1.0, stroke=None, align="center"):
        ctx = self.ctx
        ctx.select_font_face(self.font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(size)
        ext = ctx.text_extents(s)
        tx = x - ext.x_advance / 2 if align == "center" else x
        ty = y + size * 0.35
        ctx.new_path()
        ctx.move_to(tx, ty)
        ctx.text_path(s)
        ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        ctx.set_source_rgba(*hex2rgba(stroke or STYLE["text_stroke"])[:3], alpha)
        ctx.set_line_width(size * 0.2)
        ctx.stroke_preserve()
        ctx.set_source_rgba(*hex2rgba(color or STYLE["text"])[:3], alpha)
        ctx.fill()
        return ext.x_advance

    def draw_labels(self, s, lt):
        for i, lb in enumerate(s["spec"].get("labels", [])):
            delay = lb.get("delay", 0.5 + i * 0.2)
            a = ease((lt - delay) / 0.4)
            if a <= 0:
                continue
            lon, lat = lb["at"] if "at" in lb else self.world.label_pos(lb["of"])
            x, y = self.to_px(lon, lat)
            self.text(lb["text"], x, y, lb.get("size", 48), color=lb.get("color"), alpha=a)

    def draw_year(self, s, lt):
        year = s["spec"].get("year")
        if not year:
            return
        k = ease_out_back(lt / 0.5)
        if k < 0.02:
            return
        ctx = self.ctx
        ctx.save()
        ctx.translate(W / 2, H * 0.17)
        ctx.scale(k, k)
        ctx.select_font_face(self.font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        self.text(str(year), 0, 0, 130, color=STYLE["year"], stroke="#3b2f22")
        ctx.restore()

    def draw_caption(self, t, timeline):
        for text, t0, t1 in timeline.captions:
            if t0 <= t < t1:
                pop = ease_out_back((t - t0) / 0.18)
                ctx = self.ctx
                ctx.save()
                ctx.translate(W / 2, H * (0.72 if self.lang == "ja" else 0.68))
                ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop)
                size = 70 if self.lang == "ja" else 76
                lines = self._wrap(text, size, W - 140) if self.lang == "ja" else [text]
                for j, ln in enumerate(lines):
                    self.text(ln, 0, (j - (len(lines) - 1) / 2) * 90, size)
                ctx.restore()
                return

    def _wrap(self, text, size, maxw):
        ctx = self.ctx
        ctx.select_font_face(self.font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(size)
        if ctx.text_extents(text).x_advance <= maxw:
            return [text]
        # 中央に近い「助詞・読点の直後」で折り返し、語の途中で切らない
        mid = len(text) / 2
        cands = [i for i in range(2, len(text) - 1)
                 if text[i - 1] in "はがをにでとのもへや、」" and text[i] not in "ゃゅょっーァィゥェォッャュョ、。"]
        if not cands:  # 助詞が無ければ文字種 (ひらがな/カタカナ/漢字) の境目で
            kind = lambda ch: "h" if "ぁ" <= ch <= "ゖ" else "k" if "ァ" <= ch <= "ー" else "x"
            cands = [i for i in range(2, len(text) - 1) if kind(text[i - 1]) != kind(text[i])]
        cut = min(cands, key=lambda i: abs(i - mid)) if cands else len(text) // 2
        return [text[:cut], text[cut:]]

    # -- 1 フレーム
    def frame(self, t, timeline):
        i, s, lt = timeline.scene_at(t)
        self.t = t
        self.set_camera(timeline.camera(s, lt))
        self.ctx.set_dash([])
        self.draw_base()
        self.draw_fills(s, lt)
        self.draw_outlines(s, lt)
        if self.sat is not None:
            self.draw_clouds()
        self.ctx.save()
        self.ctx.identity_matrix()
        self.ctx.set_source_surface(self.overlay)
        self.ctx.paint()
        self.ctx.restore()
        self.draw_circles(s, lt)
        self.draw_lines(s, lt)
        self.draw_markers(s, lt)
        self.draw_icons(s, lt)
        self.draw_labels(s, lt)
        self.draw_texts(s, lt)
        self.draw_banner(s, lt)
        self.draw_year(s, lt)
        self.draw_caption(t, timeline)
        # シーン頭の軽いフラッシュで場面転換を強調
        if s["spec"].get("flash") and lt < 0.25:
            self.ctx.set_source_rgba(1, 1, 1, 0.5 * (1 - lt / 0.25))
            self.ctx.paint()
        self.surface.flush()
        return self.surface.get_data()
