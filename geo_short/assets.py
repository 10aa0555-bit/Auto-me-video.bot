"""フォント・3D アイコン・国旗の取得とキャッシュ。

- アイコン: Microsoft Fluent Emoji 3D (MIT License)
- 国旗: flag-icons (MIT License)
- フォント: Poppins (SIL Open Font License, fonts/ に同梱)
"""
import io
import os
import shutil
import subprocess
import tarfile
import urllib.parse

import cairo
import requests

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.expanduser("~/.cache/geo_short")
FLUENT = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/"
FLAGS_TGZ = "https://registry.npmjs.org/flag-icons/-/flag-icons-7.6.0.tgz"


def install_fonts():
    """同梱フォントをユーザーフォントに登録する (fontconfig 経由で cairo から使えるように)。"""
    src = os.path.join(ROOT, "fonts")
    dst = os.path.expanduser("~/.local/share/fonts/geo_short")
    if not os.path.isdir(src):
        return
    os.makedirs(dst, exist_ok=True)
    changed = False
    for f in os.listdir(src):
        if f.endswith((".ttf", ".otf")) and not os.path.exists(os.path.join(dst, f)):
            shutil.copy(os.path.join(src, f), dst)
            changed = True
    if changed:
        subprocess.run(["fc-cache", "-f", dst], check=False)


def _get(url):
    r = requests.get(url, timeout=60)
    return r.content if r.status_code == 200 else None


def _png_surface(data, size):
    """PNG バイト列を size px 角に収まるよう縮小した cairo サーフェスにする。"""
    src = cairo.ImageSurface.create_from_png(io.BytesIO(data))
    k = size / max(src.get_width(), src.get_height())
    w, h = max(1, int(src.get_width() * k)), max(1, int(src.get_height() * k))
    out = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    c = cairo.Context(out)
    c.scale(k, k)
    c.set_source_surface(src)
    c.get_source().set_filter(cairo.FILTER_BEST)
    c.paint()
    return out


class Icons:
    """名前 ("cityscape", "loudly crying face" など) から 3D アイコンを返す。"""

    def __init__(self):
        self.dir = os.path.join(CACHE, "icons")
        os.makedirs(self.dir, exist_ok=True)
        self.mem = {}

    def _fetch(self, name):
        path = os.path.join(self.dir, name.lower().replace(" ", "_") + ".png")
        if os.path.exists(path):
            with open(path, "rb") as f:
                return f.read()
        folder = name[0].upper() + name[1:].lower()
        stem = name.lower().replace(" ", "_").replace("-", "_")
        base = FLUENT + urllib.parse.quote(folder)
        for url in (f"{base}/3D/{stem}_3d.png", f"{base}/Default/3D/{stem}_3d_default.png"):
            data = _get(url)
            if data:
                with open(path, "wb") as f:
                    f.write(data)
                return data
        raise KeyError(f"アイコンが見つかりません: '{name}' "
                       "(https://github.com/microsoft/fluentui-emoji/tree/main/assets の名前を指定)")

    def get(self, name, size, sticker=True):
        key = (name, int(size), sticker)
        if key not in self.mem:
            surf = _png_surface(self._fetch(name), int(size))
            self.mem[key] = _sticker(surf) if sticker else surf
        return self.mem[key]


def _sticker(src):
    """アイコンの周りに白いフチを付けてステッカー風にする (サイズは同じに保つ)。"""
    import cv2
    import numpy as np
    w, h = src.get_width(), src.get_height()
    r = max(2, int(w * 0.045))
    # 周囲に余白を作ってからフチを描き、元のサイズに縮める
    pw, ph = w + 4 * r, h + 4 * r
    pad = cairo.ImageSurface(cairo.FORMAT_ARGB32, pw, ph)
    c = cairo.Context(pad)
    c.set_source_surface(src, 2 * r, 2 * r)
    c.paint()
    pad.flush()
    arr = np.ndarray((ph, pad.get_stride() // 4, 4), np.uint8, buffer=pad.get_data())[:, :pw]
    alpha = arr[..., 3].copy()
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    edge = cv2.GaussianBlur(cv2.dilate(alpha, ker), (0, 0), 0.8)
    out = cairo.ImageSurface(cairo.FORMAT_ARGB32, pw, ph)
    oarr = np.ndarray((ph, out.get_stride() // 4, 4), np.uint8, buffer=out.get_data())[:, :pw]
    oarr[...] = edge[..., None]  # 白 (プリマルチプライド)
    out.mark_dirty()
    c = cairo.Context(out)
    c.set_source_surface(pad)
    c.paint()
    fin = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    c = cairo.Context(fin)
    c.scale(w / pw, h / ph)
    c.set_source_surface(out)
    c.get_source().set_filter(cairo.FILTER_BEST)
    c.paint()
    return fin


class Flags:
    """ISO 3166-1 alpha-2 コード (小文字) から国旗画像 (4:3) を返す。"""

    def __init__(self):
        self.dir = os.path.join(CACHE, "flags")
        self.mem = {}

    def _ensure(self):
        if os.path.isdir(self.dir) and os.listdir(self.dir):
            return
        os.makedirs(self.dir, exist_ok=True)
        data = _get(FLAGS_TGZ)
        if not data:
            raise RuntimeError("flag-icons を取得できませんでした")
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            for m in tar.getmembers():
                if m.name.startswith("package/flags/4x3/") and m.name.endswith(".svg"):
                    with open(os.path.join(self.dir, os.path.basename(m.name)), "wb") as f:
                        f.write(tar.extractfile(m).read())

    def get(self, code, width=1200):
        code = code.lower()
        if code not in self.mem:
            self._ensure()
            import cairosvg
            svg = os.path.join(self.dir, f"{code}.svg")
            if not os.path.exists(svg):
                raise KeyError(f"国旗が見つかりません: {code}")
            png = cairosvg.svg2png(url=svg, output_width=width)
            self.mem[code] = cairo.ImageSurface.create_from_png(io.BytesIO(png))
        return self.mem[code]
