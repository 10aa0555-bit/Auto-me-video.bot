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


# ---------------------------------------------------------------- AI イラスト

ART_STYLE = ("stylized 3D animated-film cartoon illustration, rounded friendly shapes, expressive, "
             "soft studio lighting, vibrant saturated colors, high detail, no text, no letters, no watermark")
CUTOUT_HINT = "single subject, full body, centered, isolated on a plain pure white background, no shadow"


def _cf_credentials():
    """Secrets に改行や「Bearer 」、ID とトークンの取り違えが混ざっていても使えるように取り出す。"""
    import re
    parts = re.findall(r"[A-Za-z0-9_-]{20,}", " ".join(
        [os.environ.get("CF_ACCOUNT_ID", ""), os.environ.get("CF_API_TOKEN", "")]))
    ids = [p for p in parts if re.fullmatch(r"[0-9a-f]{32}", p)]
    tokens = [p for p in parts if p not in ids]
    token = tokens[-1] if tokens else os.environ.get("CF_API_TOKEN", "").strip()
    if ids:
        return ids[0], token
    # アカウント ID が見つからなければ、トークンで見られるアカウントから取る
    try:
        r = requests.get("https://api.cloudflare.com/client/v4/accounts",
                         headers={"Authorization": f"Bearer {token}"}, timeout=30)
        accts = r.json().get("result") or []
        if accts:
            return accts[0]["id"], token
        print(f"  Cloudflare のアカウント ID が見つかりません ({r.status_code} {r.json().get('errors')})")
    except Exception as e:
        print(f"  Cloudflare のアカウント ID が見つかりません ({e})")
    return os.environ.get("CF_ACCOUNT_ID", "").strip(), token


class AIArt:
    """台本に書いた説明文から AI でイラストを描く (結果は保存して再利用)。

    使う画像生成サービスは環境変数で決まる:
    - GEMINI_API_KEY: Google Gemini の画像生成 (高品質、有料)
    - CF_ACCOUNT_ID + CF_API_TOKEN: Cloudflare Workers AI の FLUX.1 schnell (無料枠あり、Apache 2.0)
    どちらも無ければ None を返し、呼び出し側は 3D アイコンで代用する。
    """

    def __init__(self, style=None):
        self.dir = os.path.join(CACHE, "art")
        os.makedirs(self.dir, exist_ok=True)
        self.style = style or ART_STYLE
        self.mem = {}
        forced = os.environ.get("GEO_ART_PROVIDER")
        if forced:
            self.provider = forced
        elif os.environ.get("GEMINI_API_KEY"):
            self.provider = "gemini"
        elif os.environ.get("CF_ACCOUNT_ID") and os.environ.get("CF_API_TOKEN"):
            self.provider = "cloudflare"
        else:
            self.provider = None

    def _path(self, prompt, kind):
        import hashlib
        h = hashlib.sha256(f"{self.style}|{kind}|{prompt}".encode()).hexdigest()[:20]
        return os.path.join(self.dir, f"{kind}_{h}.png")

    def _generate(self, prompt, aspect):
        import base64
        if self.provider == "gemini":
            model = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
            r = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"},
                json={"contents": [{"parts": [{"text": prompt}]}],
                      "generationConfig": {"responseModalities": ["IMAGE"],
                                           "imageConfig": {"aspectRatio": aspect}}},
                timeout=180)
            r.raise_for_status()
            for cand in r.json().get("candidates", []):
                for part in cand.get("content", {}).get("parts", []):
                    data = (part.get("inlineData") or part.get("inline_data") or {}).get("data")
                    if data:
                        return base64.b64decode(data)
            raise RuntimeError(f"Gemini が画像を返しませんでした: {r.text[:300]}")
        if self.provider == "cloudflare":
            acct, token = _cf_credentials()
            r = requests.post(
                f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/black-forest-labs/flux-1-schnell",
                headers={"Authorization": f"Bearer {token}"},
                json={"prompt": prompt, "steps": 8}, timeout=180)
            r.raise_for_status()
            return base64.b64decode(r.json()["result"]["image"])
        raise RuntimeError("AI イラストのサービスが設定されていません")

    def prepare(self, prompt, kind):
        """kind: "cutout" (地図に乗せる切り抜き) / "card" (全画面の挿絵)。保存先のパスを返す。"""
        path = self._path(prompt, kind)
        if os.path.exists(path):
            return path
        if not self.provider:
            return None
        if kind == "cutout":
            full = f"{prompt}. {CUTOUT_HINT}. {self.style}"
            raw = self._generate(full, "1:1")
            png = _cutout(raw)
        else:
            full = f"{prompt}. Cinematic vertical composition. {self.style}"
            png = self._generate(full, "9:16")
        with open(path, "wb") as f:
            f.write(png)
        print(f"  AI イラスト生成 ({self.provider}, {kind}): {prompt[:60]}")
        return path

    def get(self, prompt, kind, size):
        """cairo サーフェス (size px 角に収まる大きさ) または None。"""
        key = (prompt, kind, int(size))
        if key not in self.mem:
            path = self._path(prompt, kind)
            if not os.path.exists(path):
                self.mem[key] = None
            else:
                with open(path, "rb") as f:
                    surf = _png_surface(f.read(), int(size))
                self.mem[key] = _sticker(surf) if kind == "cutout" else surf
        return self.mem[key]


_REMBG = []


def _cutout(data):
    """白っぽい無地の背景を消して PNG (透過) にする。rembg があればそれを使う。"""
    import cv2
    import numpy as np
    try:
        from rembg import new_session, remove
        # 既定のモデルは 1GB あり Actions のメモリが足りなくなるので、軽いモデル (約 170MB) を使う
        if not _REMBG:
            _REMBG.append(new_session("isnet-general-use"))
        out = remove(data, session=_REMBG[0])
        img = cv2.imdecode(np.frombuffer(out, np.uint8), cv2.IMREAD_UNCHANGED)
    except ImportError:
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        h, w = img.shape[:2]
        mask = np.zeros((h + 2, w + 2), np.uint8)
        flags = 4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8)
        # 画像の縁から、背景色に近い所を塗りつぶして背景とみなす
        for x in range(0, w, 16):
            for y in (0, h - 1):
                if mask[y + 1, x + 1] == 0 and img[y, x].min() > 200:
                    cv2.floodFill(img, mask, (x, y), 0, (14, 14, 14), (14, 14, 14), flags)
        for y in range(0, h, 16):
            for x in (0, w - 1):
                if mask[y + 1, x + 1] == 0 and img[y, x].min() > 200:
                    cv2.floodFill(img, mask, (x, y), 0, (14, 14, 14), (14, 14, 14), flags)
        bg = mask[1:-1, 1:-1] > 0
        alpha = np.where(bg, 0, 255).astype(np.uint8)
        alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        alpha = cv2.erode(alpha, np.ones((2, 2), np.uint8))
        alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)
        img = np.dstack([img, alpha])
    # 余白を詰めて正方形にそろえる (サイズ指定どおりの大きさで出るように)
    a = img[..., 3]
    ys, xs = np.nonzero(a > 10)
    if len(xs):
        img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = img.shape[:2]
    s = max(h, w)
    sq = np.zeros((s, s, 4), np.uint8)
    sq[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = img
    ok, buf = cv2.imencode(".png", sq)
    return buf.tobytes()


# ---------------------------------------------------------------- 本物の写真 (ウィキメディア・コモンズ)

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "geo-short-video-bot/1.0 (https://github.com/10aa0555-bit/Auto-me-video.bot)"}


def _is_free(meta, allow_by=False):
    """パブリックドメインか CC0 の画像だけを使う (クレジット表記の義務が無く、収益化しても安全)。

    allow_by=True なら CC BY (表示のみ、継承 SA は除く) も許す。その場合は説明欄に作者とライセンスを書く。
    """
    lic = (meta.get("LicenseShortName", {}).get("value", "") + " " +
           meta.get("License", {}).get("value", "")).lower()
    if any(k in lic for k in ("public domain", "pd-", "pd ", "cc0")) or lic.strip() == "pd":
        return True
    return allow_by and ("cc by" in lic or "cc-by" in lic) and "sa" not in lic.replace("cc-by", "").replace("cc by", "") \
        and "nc" not in lic and "nd" not in lic


class Photos:
    """コモンズから著作権切れの写真・絵画を探して保存する。"""

    def __init__(self, allow_by=False):
        self.dir = os.path.join(CACHE, "photos")
        os.makedirs(self.dir, exist_ok=True)
        self.credits = []
        self.allow_by = allow_by

    def _path(self, key):
        import hashlib
        return os.path.join(self.dir, hashlib.sha256(key.encode()).hexdigest()[:20] + ".jpg")

    def _query(self, params):
        params = dict(params, format="json", prop="imageinfo",
                      iiprop="url|extmetadata|size|mime", iiurlwidth=1400)
        r = requests.get(COMMONS_API, params=params, headers=UA, timeout=60)
        r.raise_for_status()
        pages = r.json().get("query", {}).get("pages", {})
        return sorted(pages.values(), key=lambda p: p.get("index", 0))

    def prepare(self, spec):
        """spec: {"file": "File:...jpg"} または {"query": "検索語"}。保存先のパス (見つからなければ None)。"""
        key = spec.get("file") or spec.get("query")
        path = self._path(key)
        meta_path = path + ".json"
        if os.path.exists(path) and os.path.exists(meta_path):
            import json
            with open(meta_path, encoding="utf-8") as f:
                self.credits.append(json.load(f))
            return path
        if spec.get("file"):
            pages = self._query({"action": "query", "titles": spec["file"]})
        else:
            pages = self._query({"action": "query", "generator": "search", "gsrnamespace": 6,
                                 "gsrsearch": f"{spec['query']} filetype:bitmap", "gsrlimit": 15})
        for p in pages:
            info = (p.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata", {})
            if info.get("mime") not in ("image/jpeg", "image/png") or info.get("width", 0) < 500:
                continue
            if not _is_free(meta, self.allow_by):
                continue
            data = requests.get(info.get("thumburl") or info["url"], headers=UA, timeout=120).content
            import cv2
            import numpy as np
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                continue
            cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 92])
            import re
            artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
            credit = {"title": p.get("title"), "license": meta.get("LicenseShortName", {}).get("value", ""),
                      "url": info.get("descriptionurl", ""), "artist": artist[:80]}
            import json
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(credit, f, ensure_ascii=False)
            self.credits.append(credit)
            print(f"  写真: {credit['title']} ({credit['license']})")
            return path
        print(f"  写真が見つかりません (パブリックドメインに限定): {key}")
        return None

    def path_for(self, spec):
        path = self._path(spec.get("file") or spec.get("query"))
        return path if os.path.exists(path) else None
