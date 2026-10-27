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


def caption_timings(text, start, dur, alignment=None):
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
        for s, al in zip(self.scenes, alignments):
            text = s["spec"].get("caption", s["spec"].get("narration", ""))
            if text:
                self.captions += caption_timings(text, s["start"], s["dur"], al)

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
                self.ctx.set_source_rgba(col[0], col[1], col[2], col[3] * 0.8)
                self.ctx.fill_preserve()
                self.ctx.set_source_rgba(1, 1, 1, 0.7 * col[3])
            else:
                self.ctx.set_source_rgba(*col)
                self.ctx.fill_preserve()
                self.ctx.set_source_rgba(0.12, 0.1, 0.08, 0.55 * col[3])
            self.ctx.set_line_width(2.2)
            self.ctx.stroke()

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

    # -- マーカー
    def draw_markers(self, s, lt):
        ctx = self.ctx
        for i, m in enumerate(s["spec"].get("markers", [])):
            delay = m.get("delay", 0.4 + i * 0.25)
            k = ease_out_back((lt - delay) / 0.45)
            if lt < delay:
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
                self.text(m["label"], x + dx, y + dy, 46, alpha=min(1, k))

    # -- 文字
    def text(self, s, x, y, size, color=None, alpha=1.0, stroke=None, align="center"):
        ctx = self.ctx
        ctx.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
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
        ctx = self.ctx
        ctx.save()
        ctx.translate(W / 2, H * 0.17)
        ctx.scale(k, k)
        ctx.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        self.text(str(year), 0, 0, 130, color=STYLE["year"], stroke="#3b2f22")
        ctx.restore()

    def draw_caption(self, t, timeline):
        for text, t0, t1 in timeline.captions:
            if t0 <= t < t1:
                pop = ease_out_back((t - t0) / 0.18)
                ctx = self.ctx
                ctx.save()
                ctx.translate(W / 2, H * 0.72)
                ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop)
                lines = self._wrap(text, 70, W - 140)
                for j, ln in enumerate(lines):
                    self.text(ln, 0, (j - (len(lines) - 1) / 2) * 90, 70)
                ctx.restore()
                return

    def _wrap(self, text, size, maxw):
        ctx = self.ctx
        ctx.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
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
        self.draw_lines(s, lt)
        self.draw_markers(s, lt)
        self.draw_labels(s, lt)
        self.draw_year(s, lt)
        self.draw_caption(t, timeline)
        # シーン頭の軽いフラッシュで場面転換を強調
        if s["spec"].get("flash") and lt < 0.25:
            self.ctx.set_source_rgba(1, 1, 1, 0.5 * (1 - lt / 0.25))
            self.ctx.paint()
        self.surface.flush()
        return self.surface.get_data()
