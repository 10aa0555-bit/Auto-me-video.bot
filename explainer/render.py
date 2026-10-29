"""フラットなベクター風イラストで見せる科学解説ショートの描画 (1080x1920)。

画面の構成 (スマホの UI に隠れない範囲に収める):
- 上: その動画の問いを書いたタイトルの帯 (pill)
- 中: シーンごとの AI イラストの窓。ゆっくり寄りながら動き、シーンが変わると横から入れ替わる
- 窓の上: 要点のチップ (points)、出典 (cite)
- 窓の下: 大きな数字や言葉 (stat)、単語ハイライトの字幕
"""
import math
import os

import cairo
import numpy as np

from geo_short.assets import AIArt, Icons, install_fonts
from geo_short.render import caption_timings

W, H = 1080, 1920
FONT = os.environ.get("GEO_FONT_EN", "Poppins Black")

# 窓の位置 (正方形の AI イラストをそのまま見せる)
WIN = (80, 300, 920, 920)       # x, y, w, h
STAT_Y = 1325
CAPTION_Y = 1470
TRANS = 0.38                    # シーン切り替えの長さ (秒)

PALETTES = {
    "night": {"bg": ["#140b2e", "#24124f", "#0f2a4a"], "accent": "#ffb02e", "accent2": "#2ee6c5",
              "pill": "#1d0f42", "text": "#ffffff", "hl": "#ffd23f", "blob": ["#3a1d8a", "#0f5e78", "#7a2a8c"]},
    "dawn": {"bg": ["#2a0f3d", "#5b1e5e", "#c2425a"], "accent": "#ffd23f", "accent2": "#5ee7ff",
             "pill": "#2a0f3d", "text": "#ffffff", "hl": "#ffe66d", "blob": ["#7d2a74", "#c2425a", "#3a1d8a"]},
    "ocean": {"bg": ["#061a33", "#0b3a5c", "#0f5e78"], "accent": "#ff8a3d", "accent2": "#7cf29c",
              "pill": "#061a33", "text": "#ffffff", "hl": "#ffd23f", "blob": ["#0f5e78", "#1d7f8c", "#2a3f8f"]},
}

ART_STYLE = ("minimalist flat vector illustration, simple geometric shapes, limited color palette of deep "
             "purple, teal and warm orange, flat solid colors, no gradients, no texture, clean bold shapes, "
             "simple stylized characters without detailed faces, educational animation style, "
             "no text, no letters, no watermark")
# 2026-10-29 までの絵柄。この絵柄で描いた絵を使い回す台本は "art_style": "v1" と書く
ART_STYLE_V1 = ("flat vector illustration, bold saturated colors, deep purple and teal background with warm "
                "orange accents, soft gradients, subtle grain texture, clean rounded geometric shapes, "
                "simple characters with big round eyes, educational science animation style, "
                "no text, no letters, no watermark")


def hexrgb(h, a=1.0):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (a,)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(u):
    u = clamp(u)
    return u * u * (3 - 2 * u)


def ease_out_back(u, s=1.7):
    u = clamp(u) - 1
    return 1 + u * u * ((s + 1) * u + s)


def ease_out(u):
    u = clamp(u)
    return 1 - (1 - u) ** 3


def rounded(ctx, x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    ctx.close_path()


# ---------------------------------------------------------------- イラスト

class Art:
    """台本の "art" (英語の説明) から正方形のイラストを描いて保存する。"""

    def __init__(self, style=None):
        self.ai = AIArt(ART_STYLE_V1 if style == "v1" else style or ART_STYLE)
        self.mem = {}

    def path(self, prompt):
        return self.ai._path(prompt, "square")

    def prepare(self, prompt):
        p = self.path(prompt)
        if os.path.exists(p):
            return p
        if not self.ai.provider:
            return None
        data = self.ai._generate(f"{prompt}. {self.ai.style}", "1:1")
        with open(p, "wb") as f:
            f.write(_to_png(data))
        print(f"  イラスト生成 ({self.ai.provider}): {prompt[:60]}")
        return p

    def full(self, prompt, w, h):
        key = ("full", prompt, w, h)
        if key not in self.mem:
            p = self.path(prompt)
            if os.path.exists(p):
                self.mem[key] = _fullscreen(p, w, h)
            else:
                sq = _placeholder(prompt, h)
                surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
                c = cairo.Context(surf)
                c.set_source_surface(sq, -(h - w) / 2, 0)
                c.paint()
                self.mem[key] = surf
        return self.mem[key]

    def surface(self, prompt, size):
        key = (prompt, size)
        if key not in self.mem:
            p = self.path(prompt)
            self.mem[key] = _load_square(p, size) if os.path.exists(p) else _placeholder(prompt, size)
        return self.mem[key]


def _to_png(data):
    import cv2
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    ok, buf = cv2.imencode(".png", img)
    return buf.tobytes()


def _load_square(path, size):
    """画像を size px 角に (中央で切り抜いて) 読み込む。少し大きめに持って寄りに使う。"""
    import cv2
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    s = min(h, w)
    img = img[(h - s) // 2:(h - s) // 2 + s, (w - s) // 2:(w - s) // 2 + s]
    img = cv2.resize(img, (size, size), interpolation=cv2.INTER_LANCZOS4 if size > s else cv2.INTER_AREA)
    bgra = np.dstack([img, np.full((size, size), 255, np.uint8)])
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    np.ndarray((size, size, 4), np.uint8, surf.get_data(), strides=(surf.get_stride(), 4, 1))[:] = bgra
    surf.mark_dirty()
    return surf


def _clean(img):
    """AI の絵の細かいノイズだけを、輪郭を残したまま軽くならす (色数は減らさない)。"""
    import cv2
    return cv2.bilateralFilter(img, 7, 30, 7)


def _fullscreen(path, w, h, clean=True):
    """正方形の絵を縦長の画面いっぱいに置く。上下は絵の端の色のなめらかなグラデーションに溶け込ませる (枠なし)。"""
    import cv2
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if clean:
        img = _clean(img)
    fw = int(w * 1.18)
    fg = cv2.resize(img, (fw, fw), interpolation=cv2.INTER_LANCZOS4)
    fg = fg[:, (fw - w) // 2:(fw - w) // 2 + w].astype(np.float32)
    y0 = int(h * 0.47 - fw / 2)
    # 背景: 絵の上端・下端の平均色から作る縦のグラデーション (ぼかした絵は使わない)
    band = max(4, fw // 40)
    top = fg[:band].mean(axis=(0, 1))
    bot = fg[-band:].mean(axis=(0, 1))
    t = np.clip((np.arange(h, dtype=np.float32) - y0) / fw, 0, 1)[:, None]
    bg = (top[None] * (1 - t) + bot[None] * t)[:, None, :].repeat(w, axis=1) * 0.85
    fade = int(fw * 0.14)
    alpha = np.ones((fw, 1), np.float32)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    ramp = ramp * ramp * (3 - 2 * ramp)
    alpha[:fade, 0] = ramp
    alpha[-fade:, 0] = ramp[::-1]
    out = bg
    ys, ye = max(0, y0), min(h, y0 + fw)
    seg = slice(ys - y0, ye - y0)
    out[ys:ye] = out[ys:ye] * (1 - alpha[seg, :, None]) + fg[seg] * alpha[seg, :, None]
    out = np.clip(out, 0, 255).astype(np.uint8)
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    np.ndarray((h, w, 4), np.uint8, surf.get_data(), strides=(surf.get_stride(), 4, 1))[:] = \
        np.dstack([out, np.full((h, w), 255, np.uint8)])
    surf.mark_dirty()
    return surf


def _placeholder(prompt, size):
    """AI が使えない時の仮の絵 (説明文の要約を描いた抽象パターン)。"""
    import hashlib
    rng = np.random.default_rng(int(hashlib.md5(prompt.encode()).hexdigest()[:8], 16))
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    c = cairo.Context(surf)
    pal = list(PALETTES["night"]["blob"]) + ["#ffb02e", "#2ee6c5"]
    g = cairo.LinearGradient(0, 0, size, size)
    g.add_color_stop_rgb(0, *hexrgb("#2b1665")[:3])
    g.add_color_stop_rgb(1, *hexrgb("#0f3d5c")[:3])
    c.set_source(g)
    c.paint()
    for _ in range(9):
        c.set_source_rgba(*hexrgb(pal[rng.integers(len(pal))], 0.55))
        c.arc(rng.uniform(0, size), rng.uniform(0, size), rng.uniform(size * 0.08, size * 0.3), 0, 2 * math.pi)
        c.fill()
    return surf


# ---------------------------------------------------------------- タイムライン

class Timeline:
    def __init__(self, script, durations, alignments=None, icon_mode=False):
        self.script = script
        self.scenes = []
        t = 0.0
        alignments = alignments or [None] * len(durations)
        for sc, d in zip(script["scenes"], durations):
            self.scenes.append({"spec": sc, "start": t, "dur": d})
            t += d
        self.total = t
        self.captions = []
        for s, al in zip(self.scenes, alignments):
            text = s["spec"].get("caption", s["spec"].get("narration", ""))
            if text:
                self.captions += caption_timings(text, s["start"], s["dur"], al, "en")
        # 同じ絵が続くシーンは窓を入れ替えない
        prev = None
        for s in self.scenes:
            icons = s["spec"].get("icons")
            key = ("icons:" + "|".join(icons)) if icon_mode and icons else s["spec"].get("art")
            s["art"] = key or prev
            s["new_art"] = s["art"] != prev
            prev = s["art"]
        self.sfx = self._sfx_events()

    def _sfx_events(self):
        ev = []
        for i, s in enumerate(self.scenes):
            sp, t0 = s["spec"], s["start"]
            if i > 0 and s["new_art"]:
                ev.append((max(0, t0 - 0.12), "whoosh", {"dur": 0.5, "seed": i}))
            for j, p in enumerate(sp.get("points", [])):
                ev.append((t0 + p.get("delay", 0.5 + j * 0.5), "pop", {"pitch": 1.0 + 0.1 * j}))
            if sp.get("stat"):
                ev.append((t0 + sp["stat"].get("delay", 0.35), "pop", {"pitch": 0.8}))
                if sp["stat"].get("count") is not None:
                    ev.append((t0 + sp["stat"].get("delay", 0.35) + 1.0, "ding", {}))
            if sp.get("cite"):
                ev.append((t0 + 0.6, "tick", {}))
        return ev

    def scene_at(self, t):
        for i, s in enumerate(self.scenes):
            if t < s["start"] + s["dur"] or i == len(self.scenes) - 1:
                return i, s, t - s["start"]


# ---------------------------------------------------------------- 描画

class Renderer:
    def __init__(self, script, scale=1.0, icon_mode=False):
        install_fonts()
        self.script = script
        self.scale = scale
        self.w, self.h = int(W * scale), int(H * scale)
        self.surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, self.w, self.h)
        self.ctx = cairo.Context(self.surface)
        self.ctx.scale(scale, scale)
        self.pal = PALETTES[script.get("palette", "night")]
        self.art = Art(script.get("art_style"))
        self.icons = Icons()
        self.layout = script.get("layout", "full")  # "full" (枠なし全画面) / "window" (枠付き)
        self.art_px = int(WIN[2] * 1.12 * scale)  # 寄りの分だけ大きめに持つ
        rng = np.random.default_rng(3)
        # 背景にゆっくり漂う光の玉と星
        self.blobs = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(260, 520), rng.uniform(0, 6.28),
                       self.pal["blob"][k % len(self.pal["blob"])]) for k in range(6)]
        self.stars = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(1.2, 3.2), rng.uniform(0, 6.28))
                      for _ in range(70)]
        self.grain = self._make_grain()

    def _make_grain(self):
        n = 256
        rng = np.random.default_rng(5)
        v = rng.integers(0, 255, (n, n), dtype=np.uint8)
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, n, n)
        a = np.ndarray((n, n, 4), np.uint8, surf.get_data(), strides=(surf.get_stride(), 4, 1))
        alpha = 10
        g = (v.astype(np.uint16) * alpha // 255).astype(np.uint8)
        a[..., 0] = a[..., 1] = a[..., 2] = g
        a[..., 3] = alpha
        surf.mark_dirty()
        return surf

    # -- 文字
    def text(self, s, x, y, size, color="#ffffff", alpha=1.0, stroke=None, stroke_w=None, align="center"):
        """縁取り付きの文字。縁取りで単語の間が詰まって見えないよう、単語ごとに間を空けて描く。"""
        if stroke and " " in s.strip():
            words = s.split()
            gap = size * 0.3 + (stroke_w or size * 0.16) * 0.7
            widths = [self.text_width(w, size) for w in words]
            total = sum(widths) + gap * (len(words) - 1)
            cx = x - total / 2 if align == "center" else x
            for w, wd in zip(words, widths):
                self.text(w, cx, y, size, color, alpha, stroke, stroke_w, align="left")
                cx += wd + gap
            return total
        ctx = self.ctx
        ctx.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        ctx.set_font_size(size)
        ext = ctx.text_extents(s)
        tx = x - ext.x_advance / 2 if align == "center" else x
        ty = y + size * 0.36
        ctx.move_to(tx, ty)
        ctx.text_path(s)
        if stroke:
            ctx.set_source_rgba(*hexrgb(stroke, alpha))
            ctx.set_line_width(stroke_w or size * 0.16)
            ctx.set_line_join(cairo.LINE_JOIN_ROUND)
            ctx.stroke_preserve()
        ctx.set_source_rgba(*hexrgb(color, alpha))
        ctx.fill()
        return ext.x_advance

    def text_width(self, s, size):
        self.ctx.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        self.ctx.set_font_size(size)
        return self.ctx.text_extents(s).x_advance

    # -- 背景
    def draw_background(self, t):
        ctx = self.ctx
        bg = self.pal["bg"]
        g = cairo.LinearGradient(0, 0, W * 0.3, H)
        for k, c in enumerate(bg):
            g.add_color_stop_rgb(k / (len(bg) - 1), *hexrgb(c)[:3])
        ctx.set_source(g)
        ctx.paint()
        for x, y, r, ph, col in self.blobs:
            bx = x + 60 * math.sin(t * 0.21 + ph)
            by = y + 80 * math.cos(t * 0.17 + ph)
            rg = cairo.RadialGradient(bx, by, 0, bx, by, r)
            rg.add_color_stop_rgba(0, *hexrgb(col, 0.55))
            rg.add_color_stop_rgba(1, *hexrgb(col, 0.0))
            ctx.set_source(rg)
            ctx.paint()
        for x, y, r, ph in self.stars:
            a = 0.25 + 0.35 * (0.5 + 0.5 * math.sin(t * 1.3 + ph * 3))
            ctx.set_source_rgba(1, 1, 1, a)
            ctx.arc(x, (y - t * 6) % H, r, 0, 2 * math.pi)
            ctx.fill()

    # -- イラストの窓
    def _window(self, prompt, lt, dur, dx=0.0, alpha=1.0, tilt=0.0):
        ctx = self.ctx
        x, y, w, h = WIN
        x += dx
        cx, cy = x + w / 2, y + h / 2
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(tilt)
        ctx.translate(-cx, -cy)
        # 影
        ctx.set_source_rgba(0, 0, 0, 0.35 * alpha)
        rounded(ctx, x + 10, y + 22, w, h, 46)
        ctx.fill()
        # 縁取り
        ctx.set_source_rgba(*hexrgb(self.pal["accent"], alpha))
        rounded(ctx, x - 10, y - 10, w + 20, h + 20, 54)
        ctx.fill()
        ctx.set_source_rgba(*hexrgb(self.pal["pill"], alpha))
        rounded(ctx, x - 3, y - 3, w + 6, h + 6, 48)
        ctx.fill()
        # 中身: ゆっくり寄りながら少し横に流れる (Ken Burns)
        rounded(ctx, x, y, w, h, 44)
        ctx.clip()
        if prompt.startswith("icons:"):
            self._icon_panel(prompt[6:].split("|"), lt, dur, alpha)
            ctx.restore()
            return
        surf = self.art.surface(prompt, self.art_px)
        u = clamp(lt / max(dur, 0.1))
        z = 1.0 + 0.07 * ease(u)
        k = w / (WIN[2] * 1.12 * self.scale) * 1.12 * z  # 窓に対する表示倍率
        sw = self.art_px * k
        px = cx - sw / 2 + 22 * math.sin(u * 1.2 + len(prompt))
        py = cy - sw / 2 - 18 * u
        ctx.translate(px, py)
        ctx.scale(k, k)
        ctx.set_source_surface(surf, 0, 0)
        ctx.get_source().set_filter(cairo.FILTER_GOOD)
        ctx.paint_with_alpha(alpha)
        ctx.restore()

    def _icon_panel(self, names, lt, dur, alpha):
        """AI イラストの代わりに 3D アイコンで場面を組む: 主役を大きく中央に、脇役を周りに浮かべる。"""
        ctx = self.ctx
        x, y, w, h = WIN
        cx, cy = x + w / 2, y + h / 2
        seed = sum(map(ord, "".join(names)))
        cols = self.pal["blob"]
        g = cairo.LinearGradient(x, y, x + w, y + h)
        g.add_color_stop_rgba(0, *hexrgb(cols[seed % len(cols)], alpha))
        g.add_color_stop_rgba(1, *hexrgb(self.pal["bg"][0], alpha))
        ctx.set_source(g)
        ctx.paint()
        # 主役の後ろの光
        rg = cairo.RadialGradient(cx, cy, 0, cx, cy, w * 0.55)
        rg.add_color_stop_rgba(0, *hexrgb(self.pal["accent"], 0.45 * alpha))
        rg.add_color_stop_rgba(1, *hexrgb(self.pal["accent"], 0.0))
        ctx.set_source(rg)
        ctx.paint()
        # 放射状の光の筋がゆっくり回る
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(lt * 0.15)
        for k in range(12):
            ctx.rotate(math.pi / 6)
            ctx.move_to(0, 0)
            ctx.line_to(w, -w * 0.09)
            ctx.line_to(w, w * 0.09)
            ctx.close_path()
            ctx.set_source_rgba(1, 1, 1, 0.045 * alpha)
            ctx.fill()
        ctx.restore()
        t = lt
        main = names[0]
        size = 520
        pop = ease_out_back(lt / 0.5, 1.6)
        bob = 14 * math.sin(t * 2.0)
        sz = size * (0.85 + 0.15 * pop) * (1 + 0.04 * ease(lt / max(dur, 0.1)))
        self._icon(main, cx, cy + 20 + bob, sz, alpha)
        spots = [(-0.32, -0.3), (0.32, -0.28), (-0.3, 0.3), (0.31, 0.31)]
        for k, name in enumerate(names[1:5]):
            d = 0.25 + 0.2 * k
            if lt < d:
                continue
            u = ease_out_back((lt - d) / 0.4, 2.0)
            ox, oy = spots[(k + seed) % 4]
            px = cx + ox * w + 10 * math.sin(t * 1.4 + k * 2)
            py = cy + oy * h + 12 * math.cos(t * 1.7 + k)
            self._icon(name, px, py, 230 * max(u, 0.02), alpha, tilt=0.12 * math.sin(t + k))

    def _icon(self, name, x, y, size, alpha=1.0, tilt=0.0):
        try:
            surf = self.icons.get(name, int(260 * self.scale) * 2)
        except Exception:  # noqa: BLE001 — 名前違いのアイコンは描かない
            return
        ctx = self.ctx
        k = size / surf.get_width()
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(tilt)
        ctx.set_source_rgba(0, 0, 0, 0.25 * alpha)
        ctx.scale(1, 0.25)
        ctx.arc(0, size * 1.9, size * 0.32, 0, 2 * math.pi)
        ctx.fill()
        ctx.scale(1, 4)
        ctx.scale(k, k)
        ctx.set_source_surface(surf, -surf.get_width() / 2, -surf.get_height() / 2)
        ctx.get_source().set_filter(cairo.FILTER_GOOD)
        ctx.paint_with_alpha(alpha)
        ctx.restore()

    def _full(self, key, local, span, alpha=1.0, zoom_in=0.0):
        """全画面の絵をゆっくり寄りながら少し流す (Ken Burns)。"""
        ctx = self.ctx
        surf = self.art.full(key, self.w, self.h)
        u = clamp(local / max(span, 0.1))
        z = 1.0 + 0.08 * ease(u) + zoom_in
        dx = 26 * math.sin(u * 1.4 + len(key))
        ctx.save()
        ctx.translate(W / 2 + dx, H * 0.47)
        ctx.scale(z / self.scale, z / self.scale)
        ctx.translate(-self.w / 2, -self.h * 0.47)
        ctx.set_source_surface(surf, 0, 0)
        ctx.get_source().set_filter(cairo.FILTER_GOOD)
        ctx.paint_with_alpha(alpha)
        ctx.restore()

    def draw_full(self, timeline, i, s, lt):
        """枠なし・画面いっぱいの絵。絵が変わる時は前の絵に重ねて、寄りながらふわっと切り替える。"""
        cur = s["art"]
        if not cur:
            return
        j = i
        while j > 0 and not timeline.scenes[j]["new_art"]:
            j -= 1
        span = sum(sc["dur"] for sc in timeline.scenes[j:] if sc["art"] == cur)
        local = s["start"] + lt - timeline.scenes[j]["start"]
        if j > 0 and local < TRANS and timeline.scenes[j - 1]["art"]:
            pj = j - 1
            while pj > 0 and not timeline.scenes[pj]["new_art"]:
                pj -= 1
            prev_span = sum(sc["dur"] for sc in timeline.scenes[pj:j])
            prev_t = s["start"] + lt - timeline.scenes[pj]["start"]
            u = ease(local / TRANS)
            self._full(timeline.scenes[j - 1]["art"], prev_t, prev_span, zoom_in=0.05 * u)
            self._full(cur, local, span, alpha=u, zoom_in=0.05 * (1 - u))
        else:
            self._full(cur, local, span)
        # 上 (タイトル帯) と下 (字幕) を読みやすくする暗いグラデーション
        ctx = self.ctx
        for y0, y1, a0, a1 in ((0, 420, 0.55, 0.0), (1150, H, 0.0, 0.78)):
            g = cairo.LinearGradient(0, y0, 0, y1)
            g.add_color_stop_rgba(0, 0.03, 0.02, 0.08, a0)
            g.add_color_stop_rgba(1, 0.03, 0.02, 0.08, a1)
            ctx.set_source(g)
            ctx.rectangle(0, y0, W, y1 - y0)
            ctx.fill()

    def draw_window(self, timeline, i, s, lt):
        """今のシーンの絵。新しい絵になる時は前の絵を左へ送り、新しい絵を右から入れる。"""
        cur = s["art"]
        if not cur:
            return
        # 同じ絵が続いている間は、その絵が始まったシーンからの経過時間で寄り続ける
        j = i
        while j > 0 and not timeline.scenes[j]["new_art"]:
            j -= 1
        start = timeline.scenes[j]["start"]
        span = sum(sc["dur"] for sc in timeline.scenes[j:] if sc["art"] == cur and sc["start"] >= start)
        t_in = timeline.scenes[j]["start"]
        local = s["start"] + lt - t_in
        if j > 0 and local < TRANS and timeline.scenes[j - 1]["art"]:
            u = ease_out(local / TRANS)
            pj = j - 1
            while pj > 0 and not timeline.scenes[pj]["new_art"]:
                pj -= 1
            prev_t = s["start"] + lt - timeline.scenes[pj]["start"]
            prev_span = sum(sc["dur"] for sc in timeline.scenes[pj:j])
            self._window(timeline.scenes[j - 1]["art"], prev_t, prev_span, dx=-1150 * u,
                         alpha=1 - 0.4 * u, tilt=-0.06 * u)
            self._window(cur, local, span, dx=1150 * (1 - u), tilt=0.06 * (1 - u))
        elif j == 0 and local < 0.5:
            u = ease_out_back(local / 0.5, 1.2)
            ctx = self.ctx
            ctx.save()
            ctx.translate(W / 2, WIN[1] + WIN[3] / 2)
            ctx.scale(0.8 + 0.2 * u, 0.8 + 0.2 * u)
            ctx.translate(-W / 2, -(WIN[1] + WIN[3] / 2))
            self._window(cur, local, span, alpha=clamp(local / 0.25))
            ctx.restore()
        else:
            bob = 4 * math.sin((s["start"] + lt) * 1.1)
            self.ctx.save()
            self.ctx.translate(0, bob)
            self._window(cur, local, span)
            self.ctx.restore()

    # -- 上のタイトル帯
    def draw_pill(self, t):
        text = self.script.get("pill")
        if not text:
            return
        lines = text if isinstance(text, list) else [text]
        u = max(ease_out_back(t / 0.45, 1.4), 0.02)
        size = 54
        widths = [self.text_width(ln, size) for ln in lines]
        bw = max(widths) + 90
        bh = size * 1.25 * len(lines) + 46
        x, y = W / 2 - bw / 2, 210 - bh / 2 - 40
        ctx = self.ctx
        ctx.save()
        ctx.translate(W / 2, y + bh / 2)
        ctx.scale(u, u)
        ctx.translate(-W / 2, -(y + bh / 2))
        ctx.set_source_rgba(*hexrgb(self.pal["accent2"]))
        rounded(ctx, x + 8, y + 10, bw, bh, bh / 2.2)
        ctx.fill()
        ctx.set_source_rgba(*hexrgb(self.pal["pill"]))
        rounded(ctx, x, y, bw, bh, bh / 2.2)
        ctx.fill()
        ctx.set_source_rgba(1, 1, 1, 0.9)
        ctx.set_line_width(4)
        rounded(ctx, x, y, bw, bh, bh / 2.2)
        ctx.stroke()
        for k, ln in enumerate(lines):
            self.text(ln, W / 2, y + 23 + size * 0.62 + k * size * 1.25, size)
        ctx.restore()

    # -- 窓の上のチップ
    def draw_points(self, s, lt):
        for j, p in enumerate(s["spec"].get("points", [])):
            d = p.get("delay", 0.5 + j * 0.5)
            u = max(ease_out_back((lt - d) / 0.35, 2.0), 0.02)
            if lt < d:
                continue
            ax, ay = p.get("at", [0.5, 0.15 + 0.14 * j])
            x, y = WIN[0] + WIN[2] * ax, WIN[1] + WIN[3] * ay
            size = p.get("size", 46)
            label = p["text"]
            color = p.get("color", self.pal["accent"])
            tw = self.text_width(label, size)
            bw, bh = tw + 56, size * 1.55
            ctx = self.ctx
            ctx.save()
            ctx.translate(x, y + 4 * math.sin((s["start"] + lt) * 2 + j))
            ctx.scale(u, u)
            ctx.set_source_rgba(0, 0, 0, 0.3)
            rounded(ctx, -bw / 2 + 5, -bh / 2 + 8, bw, bh, bh / 2)
            ctx.fill()
            ctx.set_source_rgba(*hexrgb(color))
            rounded(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2)
            ctx.fill()
            self.text(label, 0, 0, size, color=p.get("text_color", "#1a0f33"))
            ctx.restore()

    def draw_cite(self, s, lt):
        cite = s["spec"].get("cite")
        if not cite:
            return
        a = ease((lt - 0.5) / 0.3) * ease((s["dur"] - lt) / 0.25)
        if a <= 0:
            return
        label = f"SOURCE: {cite}"
        size = 27
        while size > 18 and self.text_width(label, size) > WIN[2] - 92:  # 窓からはみ出さない大きさに
            size -= 1
        tw = self.text_width(label, size)
        x, y = WIN[0] + 26, WIN[1] + WIN[3] - 70
        ctx = self.ctx
        ctx.set_source_rgba(0.04, 0.02, 0.12, 0.72 * a)
        rounded(ctx, x, y, tw + 40, size * 1.7, 14)
        ctx.fill()
        self.text(label, x + 20, y + size * 0.85, size, color="#e8e2ff", alpha=a, align="left")

    # -- 大きい数字や言葉
    def draw_stat(self, s, lt):
        st = s["spec"].get("stat")
        if not st:
            return
        d = st.get("delay", 0.35)
        if lt < d:
            return
        u = max(ease_out_back((lt - d) / 0.4, 1.8), 0.02)
        txt = st["text"]
        if st.get("count") is not None:
            n = st["count"] * ease_out((lt - d) / 1.0)
            fmt = st.get("format", "{:,.0f}")
            txt = txt.replace("{n}", fmt.format(n))
        size = st.get("size", 92)
        ctx = self.ctx
        ctx.save()
        ctx.translate(W / 2, STAT_Y)
        ctx.scale(u, u)
        self.text(txt, 0, 0, size, color=self.pal["hl"], stroke="#140b2e", stroke_w=12)
        if st.get("label"):
            self.text(st["label"], 0, size * 0.85, 36, color="#ffffff", stroke="#140b2e")
        ctx.restore()

    # -- 字幕
    def draw_caption(self, t, timeline, s, lt):
        y = CAPTION_Y + (60 if s["spec"].get("stat", {}).get("label") else 0)
        for text, t0, t1, words in timeline.captions:
            if not (t0 <= t < t1):
                continue
            pop = ease_out_back((t - t0) / 0.18)
            ctx = self.ctx
            size = 70
            words = words or [(w, t0) for w in text.split()]
            active = max([k for k, (_, tw) in enumerate(words) if tw <= t + 0.03] or [0])
            space = size * 0.42
            widths = [self.text_width(w, size) for w, _ in words]
            # 長ければ 2 行に分ける
            rows = [list(range(len(words)))]
            if sum(widths) + space * (len(words) - 1) > W - 160 and len(words) > 1:
                half = (sum(widths)) / 2
                acc, cut = 0, 1
                for k, wd in enumerate(widths):
                    acc += wd
                    if acc >= half:
                        cut = max(1, k)
                        break
                rows = [list(range(cut)), list(range(cut, len(words)))]
            ctx.save()
            ctx.translate(W / 2, y)
            ctx.scale(0.88 + 0.12 * pop, 0.88 + 0.12 * pop)
            for r, row in enumerate(rows):
                rw = sum(widths[k] for k in row) + space * (len(row) - 1)
                x = -rw / 2
                yy = (r - (len(rows) - 1) / 2) * size * 1.15
                for k in row:
                    hl = k == active
                    self.text(words[k][0], x + widths[k] / 2, yy, size * (1.06 if hl else 1.0),
                              color=self.pal["hl"] if hl else "#ffffff", stroke="#0b0620", stroke_w=14)
                    x += widths[k] + space
            ctx.restore()
            return

    def draw_progress(self, t, total):
        """一番下の細い進行バー (最後まで見る気を少し後押しする)。"""
        ctx = self.ctx
        ctx.set_source_rgba(1, 1, 1, 0.15)
        ctx.rectangle(0, H - 10, W, 10)
        ctx.fill()
        ctx.set_source_rgba(*hexrgb(self.pal["accent"], 0.9))
        ctx.rectangle(0, H - 10, W * clamp(t / total), 10)
        ctx.fill()

    def frame(self, t, timeline):
        i, s, lt = timeline.scene_at(t)
        self.ctx.save()
        self.draw_background(t)
        if self.layout == "full" and not s["art"].startswith("icons:") if s["art"] else False:
            self.draw_full(timeline, i, s, lt)
        else:
            self.draw_window(timeline, i, s, lt)
        self.draw_cite(s, lt)
        self.draw_points(s, lt)
        self.draw_pill(t)
        self.draw_stat(s, lt)
        self.draw_caption(t, timeline, s, lt)
        self.draw_progress(t, timeline.total)
        self.ctx.set_source(cairo.SurfacePattern(self.grain))
        self.ctx.get_source().set_extend(cairo.EXTEND_REPEAT)
        self.ctx.paint()
        self.ctx.restore()
        self.surface.flush()
        return bytes(self.surface.get_data())
