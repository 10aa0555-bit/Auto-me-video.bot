#!/usr/bin/env python3
"""Cosmic word-by-word short renderer.

Makes TikTok/Shorts-style videos: flat-vector space illustrations with slow
parallax zoom, and big one-or-two-word captions synced to the narration.

  python cosmic_video.py cosmic_script.json            # full render
  python cosmic_video.py cosmic_script.json --preview  # first 3 scenes, half res

Narration: if ELEVENLABS_API_KEY is set, each scene is voiced via the
ElevenLabs "with-timestamps" endpoint and captions are synced per word
(audio is cached in build/ so re-renders cost no credits). Without a key the
video is rendered silently with estimated word timing.
Optional background music: put bgm.mp3 next to the script (or set "bgm").
"""
import argparse
import base64
import hashlib
import json
import math
import os
import random
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
DEFAULT_FONT = os.path.join(HERE, "fonts", "Anton.ttf")

PALETTES = {
    "violet": {"bg": [(8, 6, 32), (40, 14, 82)], "arms": [(120, 60, 220), (70, 110, 255), (60, 220, 230), (200, 90, 240)], "glow": (255, 210, 120)},
    "ocean": {"bg": [(4, 14, 40), (10, 50, 96)], "arms": [(40, 120, 230), (60, 200, 240), (120, 240, 220), (90, 80, 220)], "glow": (220, 250, 255)},
    "ember": {"bg": [(24, 6, 20), (90, 20, 40)], "arms": [(250, 120, 60), (255, 70, 90), (255, 200, 90), (180, 50, 140)], "glow": (255, 230, 150)},
    "mint": {"bg": [(6, 20, 30), (16, 60, 70)], "arms": [(60, 220, 170), (120, 250, 200), (40, 160, 220), (230, 250, 160)], "glow": (240, 255, 210)},
    "magenta": {"bg": [(20, 4, 36), (96, 16, 110)], "arms": [(240, 70, 200), (150, 60, 250), (255, 140, 220), (80, 200, 255)], "glow": (255, 220, 250)},
}

SMALL_WORDS = {"a", "an", "the", "of", "to", "in", "on", "is", "it", "if", "and", "or", "but", "so", "we", "i", "my", "at", "by", "be", "for", "as", "no"}


# ----------------------------------------------------------------- helpers
def lerp(a, b, t):
    return a + (b - a) * t


def lerp_col(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def vgradient(w, h, top, bottom):
    t = np.linspace(0, 1, h)[:, None, None]
    arr = (np.array(top)[None, None, :] * (1 - t) + np.array(bottom)[None, None, :] * t)
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8), "RGB")


def radial_glow(size, color, falloff=2.2, alpha=255):
    """RGBA sprite: soft round glow."""
    r = size / 2
    y, x = np.mgrid[0:size, 0:size]
    d = np.sqrt((x - r + 0.5) ** 2 + (y - r + 0.5) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** falloff * alpha
    out = np.zeros((size, size, 4), np.uint8)
    out[..., :3] = color
    out[..., 3] = a.astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def paste_glow(canvas, cx, cy, size, color, falloff=2.2, alpha=255):
    g = radial_glow(int(size), color, falloff, alpha)
    canvas.alpha_composite(g, (int(cx - size / 2), int(cy - size / 2)))


def stars(draw, w, h, rng, n, cols=((255, 255, 255), (200, 220, 255), (255, 240, 200))):
    for _ in range(n):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        r = rng.choice([1, 1, 1, 2, 2, 3]) * w / 1350
        draw.ellipse([x - r, y - r, x + r, y + r], fill=rng.choice(cols) + (rng.randint(120, 255),))


# ----------------------------------------------------------- backgrounds
# Each generator returns (bg RGB, fg RGBA) drawn at the oversized canvas size.
# bg moves slowly, fg moves faster -> parallax.

def bg_base(w, h, pal, rng, n_stars=500):
    bg = vgradient(w, h, pal["bg"][0], pal["bg"][1]).convert("RGBA")
    neb = Image.new("RGBA", (w, h))
    nd = ImageDraw.Draw(neb)
    for _ in range(6):
        c = rng.choice(pal["arms"])
        x, y, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(w * 0.2, w * 0.5)
        nd.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=c + (40,))
    bg.alpha_composite(neb.filter(ImageFilter.GaussianBlur(w * 0.08)))
    stars(ImageDraw.Draw(bg), w, h, rng, n_stars)
    return bg


def gen_galaxy(w, h, pal, rng):
    bg = bg_base(w, h, pal, rng)
    S = int(max(w, h) * 1.1)
    g = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(g)
    c = S / 2
    # soft glowing disc, then crisp spiral arms made of flat dots
    disc = Image.new("RGBA", (S, S))
    dd = ImageDraw.Draw(disc)
    for i, frac in enumerate(np.linspace(0.9, 0.2, 6)):
        r = c * frac
        dd.ellipse([c - r, c - r, c + r, c + r], fill=pal["arms"][i % len(pal["arms"])] + (35,))
    g.alpha_composite(disc.filter(ImageFilter.GaussianBlur(S * 0.03)))
    arms = 2
    for a in range(arms):
        arm = Image.new("RGBA", (S, S))
        ad = ImageDraw.Draw(arm)
        for k in range(400):
            t = k / 400
            ang = a * 2 * math.pi / arms + t * 2.6 * math.pi
            rad = c * (0.06 + 0.86 * t)
            x, y = c + rad * math.cos(ang), c + rad * math.sin(ang)
            s = c * 0.09 * (1.1 - t)
            ad.ellipse([x - s, y - s, x + s, y + s], fill=pal["arms"][a % 2 + 1] + (60,))
        g.alpha_composite(arm.filter(ImageFilter.GaussianBlur(S * 0.012)))
        for k in range(700):
            t = rng.random() ** 0.8
            ang = a * 2 * math.pi / arms + t * 2.6 * math.pi
            rad = c * (0.06 + 0.86 * t) + rng.gauss(0, c * 0.03)
            x = c + rad * math.cos(ang) + rng.gauss(0, c * 0.025)
            y = c + rad * math.sin(ang) + rng.gauss(0, c * 0.025)
            s = rng.uniform(3, 11) * (1.2 - t) * S / 1500
            col = pal["arms"][rng.randrange(len(pal["arms"]))]
            d.ellipse([x - s, y - s, x + s, y + s], fill=col + (rng.randint(170, 255),))
    paste_glow(g, c, c, S * 0.42, pal["glow"], 1.6)
    paste_glow(g, c, c, S * 0.16, (255, 255, 255), 1.2)
    g = g.rotate(rng.uniform(-25, 25), resample=Image.BICUBIC)
    g = g.resize((S, int(S * 0.55)), Image.LANCZOS)
    fg = Image.new("RGBA", (w, h))
    fg.alpha_composite(g, ((w - S) // 2, (h - g.height) // 2))
    for _ in range(14):  # big bright stars in front
        paste_glow(fg, rng.uniform(0, w), rng.uniform(0, h), rng.uniform(w * 0.04, w * 0.11), pal["glow"], 1.4)
    return bg.convert("RGB"), fg


def gen_planet(w, h, pal, rng):
    bg = bg_base(w, h, pal, rng)
    fg = Image.new("RGBA", (w, h))
    R = w * rng.uniform(0.3, 0.36)
    cx, cy = w * rng.uniform(0.35, 0.65), h * rng.uniform(0.38, 0.62)
    cols = pal["arms"]
    tilt = rng.uniform(-20, 20)
    # ring (back half drawn first, front half after planet)
    ring = Image.new("RGBA", (w, h))
    rd = ImageDraw.Draw(ring)
    for i, k in enumerate(np.linspace(1.35, 1.9, 5)):
        rd.ellipse([cx - R * k, cy - R * k * 0.22, cx + R * k, cy + R * k * 0.22], outline=cols[i % len(cols)] + (220,), width=int(w * 0.012))
    ring = ring.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
    back = ring.copy()
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rectangle([0, 0, w, cy], fill=255)
    back.putalpha(Image.fromarray(np.minimum(np.array(back.getchannel("A")), np.array(m.rotate(tilt, center=(cx, cy))))))
    fg.alpha_composite(back)
    # planet body with flat bands
    body = Image.new("RGBA", (w, h))
    bd = ImageDraw.Draw(body)
    y = cy - R
    while y < cy + R:
        bh = rng.uniform(R * 0.08, R * 0.25)
        bd.rectangle([cx - R, y, cx + R, y + bh], fill=lerp_col(rng.choice(cols), (255, 255, 255), rng.uniform(0, 0.3)) + (255,))
        y += bh
    body = body.rotate(tilt, center=(cx, cy), resample=Image.BICUBIC)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    lit = Image.new("L", (w, h), 0)  # crescent shadow on the lower right
    ImageDraw.Draw(lit).ellipse([cx - R * 1.3, cy - R * 1.3, cx + R * 0.9, cy + R * 0.9], fill=255)
    shade = Image.fromarray((np.minimum(255 - np.array(lit), np.array(mask)) * 0.6).astype(np.uint8))
    planet = Image.new("RGBA", (w, h))
    planet.paste(body, (0, 0), mask)
    dark = Image.new("RGBA", (w, h), pal["bg"][0] + (255,))
    planet.paste(dark, (0, 0), shade)
    paste_glow(fg, cx, cy, R * 2.6, cols[1], 2.5, 120)
    fg.alpha_composite(planet)
    front = ring.copy()
    m2 = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m2).rectangle([0, cy, w, h], fill=255)
    front.putalpha(Image.fromarray(np.minimum(np.array(front.getchannel("A")), np.array(m2.rotate(tilt, center=(cx, cy))))))
    fg.alpha_composite(front)
    for _ in range(3):  # moons
        mr = rng.uniform(w * 0.02, w * 0.05)
        mx, my = rng.uniform(0, w), rng.uniform(0, h)
        ImageDraw.Draw(fg).ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=lerp_col(rng.choice(cols), (255, 255, 255), 0.5) + (255,))
    return bg.convert("RGB"), fg


def gen_sun(w, h, pal, rng):
    bg = bg_base(w, h, pal, rng, 300)
    fg = Image.new("RGBA", (w, h))
    cx, cy = w / 2, h * rng.uniform(0.4, 0.6)
    R = w * 0.3
    rays = Image.new("RGBA", (w, h))
    rd = ImageDraw.Draw(rays)
    n = 28
    for i in range(n):
        a0 = i * 2 * math.pi / n
        a1 = a0 + math.pi / n * 0.7
        L = R * rng.uniform(2.2, 4.0)
        rd.polygon([(cx, cy), (cx + L * math.cos(a0), cy + L * math.sin(a0)), (cx + L * math.cos(a1), cy + L * math.sin(a1))], fill=pal["glow"] + (40,))
    fg.alpha_composite(rays.filter(ImageFilter.GaussianBlur(w * 0.01)))
    paste_glow(fg, cx, cy, R * 4.5, pal["arms"][0], 1.8, 200)
    d = ImageDraw.Draw(fg)
    for i, k in enumerate([1.25, 1.12, 1.0]):
        col = lerp_col(pal["arms"][2], pal["glow"], i / 2)
        d.ellipse([cx - R * k, cy - R * k, cx + R * k, cy + R * k], fill=col + (255,))
    for _ in range(40):  # flat surface spots
        a, rr = rng.uniform(0, 2 * math.pi), rng.uniform(0, R * 0.85)
        s = rng.uniform(R * 0.03, R * 0.12)
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        d.ellipse([x - s, y - s, x + s, y + s], fill=lerp_col(pal["arms"][0], pal["glow"], 0.5) + (255,))
    paste_glow(fg, cx, cy, R * 1.6, (255, 255, 255), 2.0, 160)
    return bg.convert("RGB"), fg


def gen_void(w, h, pal, rng):
    bg = vgradient(w, h, (3, 3, 10), pal["bg"][0]).convert("RGBA")
    stars(ImageDraw.Draw(bg), w, h, rng, 220)
    fg = Image.new("RGBA", (w, h))
    for _ in range(5):  # few distant dying stars
        paste_glow(fg, rng.uniform(0, w), rng.uniform(0, h), rng.uniform(w * 0.05, w * 0.12), rng.choice(pal["arms"]), 1.6, 180)
    cx, cy, r = w / 2, h * 0.62, w * 0.07  # a last red star fading out
    paste_glow(fg, cx, cy, r * 9, (200, 40, 60), 2.0, 170)
    ImageDraw.Draw(fg).ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 110, 80, 255))
    paste_glow(fg, cx, cy, r * 2.6, (255, 220, 180), 1.5, 220)
    return bg.convert("RGB"), fg


def gen_nebula(w, h, pal, rng):
    bg = bg_base(w, h, pal, rng, 700)
    fg = Image.new("RGBA", (w, h))
    clouds = Image.new("RGBA", (w, h))
    cd = ImageDraw.Draw(clouds)
    for _ in range(26):
        c = rng.choice(pal["arms"])
        x, y = rng.gauss(w / 2, w * 0.3), rng.gauss(h / 2, h * 0.22)
        r = rng.uniform(w * 0.08, w * 0.3)
        cd.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=c + (rng.randint(60, 130),))
    fg.alpha_composite(clouds.filter(ImageFilter.GaussianBlur(w * 0.03)))
    # crisp flat layer on top, vector style
    flat = Image.new("RGBA", (w, h))
    fd = ImageDraw.Draw(flat)
    for _ in range(10):
        c = rng.choice(pal["arms"])
        x, y = rng.gauss(w / 2, w * 0.3), rng.gauss(h / 2, h * 0.2)
        r = rng.uniform(w * 0.04, w * 0.12)
        fd.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=c + (140,))
    fg.alpha_composite(flat)
    for _ in range(10):
        paste_glow(fg, rng.uniform(0, w), rng.uniform(0, h), rng.uniform(w * 0.04, w * 0.1), pal["glow"], 1.5)
    return bg.convert("RGB"), fg


def gen_creature(w, h, pal, rng):
    """Original mascot: a small round 'stardust blob' sitting on a tiny planet."""
    bg = bg_base(w, h, pal, rng)
    fg = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(fg)
    cx = w / 2
    # tiny planet horizon
    PR = w * 1.1
    py = h * 0.78 + PR
    d.ellipse([cx - PR, py - PR, cx + PR, py + PR], fill=lerp_col(pal["arms"][0], (0, 0, 0), 0.35) + (255,))
    for _ in range(18):
        a = rng.uniform(math.pi * 1.25, math.pi * 1.75)
        rr = PR * rng.uniform(0.85, 0.98)
        x, y, s = cx + rr * math.cos(a), py + rr * math.sin(a), rng.uniform(w * 0.01, w * 0.035)
        d.ellipse([x - s, y - s * 0.5, x + s, y + s * 0.5], fill=lerp_col(pal["arms"][0], (0, 0, 0), 0.55) + (255,))
    # blob body
    by, br = h * 0.78 - w * 0.17, w * 0.2
    paste_glow(fg, cx, by, br * 4, pal["arms"][2], 2.2, 110)
    body = lerp_col(pal["bg"][1], pal["arms"][1], 0.45)
    d.ellipse([cx - br, by - br * 1.05, cx + br, by + br * 0.95], fill=body + (255,))
    d.ellipse([cx - br * 0.55, by + br * 0.75, cx - br * 0.15, by + br * 1.05], fill=body + (255,))  # feet
    d.ellipse([cx + br * 0.15, by + br * 0.75, cx + br * 0.55, by + br * 1.05], fill=body + (255,))
    d.ellipse([cx - br * 0.85, by - br * 0.9, cx + br * 0.2, by - br * 0.1], fill=lerp_col(body, (255, 255, 255), 0.18) + (255,))  # highlight
    for ex in (-0.38, 0.38):  # glowing eyes
        x, y = cx + br * ex, by - br * 0.15
        paste_glow(fg, x, y, br * 0.9, pal["glow"], 1.6, 220)
        d.ellipse([x - br * 0.15, y - br * 0.18, x + br * 0.15, y + br * 0.18], fill=(250, 250, 255, 255))
        d.ellipse([x - br * 0.06, y - br * 0.1, x + br * 0.06, y + br * 0.02], fill=(20, 20, 50, 255))
    return bg.convert("RGB"), fg


def gen_city(w, h, pal, rng):
    bg = vgradient(w, h, pal["bg"][0], lerp_col(pal["bg"][1], pal["arms"][0], 0.4)).convert("RGBA")
    stars(ImageDraw.Draw(bg), w, int(h * 0.6), rng, 300)
    mr = w * 0.12
    mx, my = w * rng.uniform(0.25, 0.75), h * 0.25
    paste_glow(bg, mx, my, mr * 5, pal["glow"], 2.0, 140)
    ImageDraw.Draw(bg).ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=pal["glow"] + (255,))
    fg = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(fg)
    for layer, (base, dark) in enumerate([(0.62, 0.55), (0.7, 0.75), (0.78, 0.9)]):
        x = -w * 0.05
        col = lerp_col(pal["arms"][layer % len(pal["arms"])], (5, 5, 15), dark)
        while x < w * 1.05:
            bw = rng.uniform(w * 0.06, w * 0.16)
            top = h * base - rng.uniform(0, h * 0.18)
            d.rectangle([x, top, x + bw, h], fill=col + (255,))
            if layer == 2:  # lit windows
                for wy in np.arange(top + w * 0.03, h, w * 0.045):
                    for wx in np.arange(x + w * 0.015, x + bw - w * 0.02, w * 0.035):
                        if rng.random() < 0.35:
                            d.rectangle([wx, wy, wx + w * 0.015, wy + w * 0.02], fill=pal["glow"] + (230,))
            x += bw + rng.uniform(0, w * 0.02)
    return bg.convert("RGB"), fg


GENERATORS = {"galaxy": gen_galaxy, "planet": gen_planet, "sun": gen_sun, "void": gen_void,
              "nebula": gen_nebula, "creature": gen_creature, "city": gen_city}


# --------------------------------------------------------------- captions
def group_words(words):
    """Merge words into 1-2 word caption groups (small words cling to the next)."""
    groups, cur = [], []
    for wd in words:
        cur.append(wd)
        bare = re.sub(r"[^a-z']", "", wd["text"].lower())
        text_len = sum(len(x["text"]) for x in cur)
        punct = wd["text"][-1:] in ".,!?;:"
        if bare in SMALL_WORDS and not punct and len(cur) < 2 and text_len < 9:
            continue
        groups.append(cur)
        cur = []
    if cur:
        groups.append(cur)
    out = []
    for g in groups:
        text = " ".join(re.sub(r"[^\w'’\-]", "", x["text"]) for x in g).upper().strip()
        if text:
            out.append({"text": text, "start": g[0]["start"], "end": g[-1]["end"]})
    return out


def render_caption(text, W, H, font_path, rng):
    max_w = W * 0.86
    size = int(min(W, H) * 0.19)
    while True:
        font = ImageFont.truetype(font_path, size)
        bbox = font.getbbox(text)
        if bbox[2] - bbox[0] <= max_w or size < 40:
            break
        size -= 4
    stroke = max(3, size // 22)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = size // 2
    cw, ch = tw + pad * 2, th + pad * 2
    origin = (pad - bbox[0], pad - bbox[1])
    mask = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(mask).text(origin, text, font=font, fill=255)
    outline = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(outline).text(origin, text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    # warm yellow -> pale green gradient, slightly varied per caption
    hue = rng.uniform(-1, 1)
    top = (255, 246, 150 + int(30 * hue))
    bot = (175 + int(30 * hue), 240, 150)
    grad = vgradient(cw, ch, top, bot).convert("RGBA")
    img = Image.new("RGBA", (cw, ch))
    shadow = Image.new("RGBA", (cw, ch), (0, 0, 10, 0))
    shadow.putalpha(outline.filter(ImageFilter.GaussianBlur(size / 10)).point(lambda v: int(v * 0.85)))
    img.alpha_composite(shadow, (stroke, stroke * 2))
    edge = Image.new("RGBA", (cw, ch), (25, 20, 40, 0))
    edge.putalpha(outline)
    img.alpha_composite(edge)
    grad.putalpha(mask)
    img.alpha_composite(grad)
    return img


# ---------------------------------------------------------------- narration
def estimate_words(text, t0):
    words, t = [], t0
    for wd in text.split():
        dur = 0.13 + 0.055 * len(wd)
        words.append({"text": wd, "start": t, "end": t + dur})
        t += dur + (0.32 if wd[-1] in ".!?" else 0.14 if wd[-1] in ",;:" else 0.04)
    return words, t - t0


def tts_scene(text, cfg, idx):
    """Return (mp3 path or None, words with local times, duration)."""
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        w, d = estimate_words(text, 0.0)
        return None, w, d
    import requests
    voice = cfg.get("voice_id", "pNInz6obpgDQGcFmaJgB")
    settings = cfg.get("voice_settings", {"stability": 0.5, "similarity_boost": 0.75, "style": 0.15, "use_speaker_boost": True, "speed": 1.0})
    payload = {"text": text, "model_id": cfg.get("model_id", "eleven_multilingual_v2"), "voice_settings": settings}
    h = hashlib.sha1(json.dumps([voice, payload], sort_keys=True).encode()).hexdigest()[:12]
    base = os.path.join(BUILD, f"vo_{idx:02d}_{h}")
    if not os.path.exists(base + ".json"):
        r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps",
                          json=payload, headers={"xi-api-key": key, "Content-Type": "application/json"}, timeout=120)
        if r.status_code != 200:
            sys.exit(f"ElevenLabs error {r.status_code}: {r.text[:300]}")
        data = r.json()
        with open(base + ".mp3", "wb") as f:
            f.write(base64.b64decode(data["audio_base64"]))
        with open(base + ".json", "w") as f:
            json.dump(data["alignment"], f)
    al = json.load(open(base + ".json"))
    chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words, cur = [], None
    for c, s, e in zip(chars, st, en):
        if c.isspace():
            if cur:
                words.append(cur)
            cur = None
        elif cur is None:
            cur = {"text": c, "start": s, "end": e}
        else:
            cur["text"] += c
            cur["end"] = e
    if cur:
        words.append(cur)
    return base + ".mp3", words, (en[-1] if en else 0.0)


# ------------------------------------------------------------------ render
class Scene:
    def __init__(self, cfg, idx, W, H, seed):
        self.cfg = cfg
        rng = random.Random(seed * 1000 + idx)
        pal = PALETTES[cfg.get("palette", "violet")]
        self.cw, self.ch = int(W * 1.3), int(H * 1.3)
        gen = GENERATORS[cfg.get("bg", "galaxy")]
        bg, fg = gen(self.cw, self.ch, pal, rng)
        self.bg, self.fg = bg, fg
        self.W, self.H = W, H
        # motion: zoom in or out, gentle drift
        self.zoom_in = rng.random() < 0.7
        self.drift = (rng.uniform(-1, 1), rng.uniform(-1, 1))
        # floating bokeh particles
        self.parts = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(W * 0.006, W * 0.03), rng.uniform(-1, 1) * W * 0.02,
                       rng.uniform(-1, 1) * H * 0.02, rng.uniform(0, 6.28), rng.choice(pal["arms"] + [pal["glow"]])) for _ in range(22)]
        self.sprites = {}

    def _view(self, img, t, dur, strength):
        p = ease(t / max(dur, 0.01))
        z0, z1 = (1.0, 1.0 + 0.18 * strength) if self.zoom_in else (1.0 + 0.18 * strength, 1.0)
        z = lerp(z0, z1, p)
        vw, vh = self.W * 1.15 / z, self.H * 1.15 / z  # visible window in canvas px (canvas is 1.3x)
        mx, my = (self.cw - vw) / 2, (self.ch - vh) / 2
        cx = self.cw / 2 + self.drift[0] * mx * 0.8 * (p - 0.5)
        cy = self.ch / 2 + self.drift[1] * my * 0.8 * (p - 0.5)
        box = (cx - vw / 2, cy - vh / 2, cx + vw / 2, cy + vh / 2)
        return img.resize((self.W, self.H), Image.BILINEAR, box=box)

    def frame(self, t, dur):
        frame = self._view(self.bg, t, dur, 0.55).convert("RGBA")
        frame.alpha_composite(self._view(self.fg, t, dur, 1.0))
        for (x, y, s, vx, vy, ph, col) in self.parts:
            key = (int(s), col)
            if key not in self.sprites:
                self.sprites[key] = radial_glow(int(s * 4), col, 1.8, 210)
            a = 0.5 + 0.5 * math.sin(ph + t * 2.2)
            sp = self.sprites[key]
            px, py = (x + vx * t) % self.W, (y + vy * t) % self.H
            if a > 0.05:
                spa = sp.copy()
                spa.putalpha(sp.getchannel("A").point(lambda v, a=a: int(v * a)))
                frame.alpha_composite(spa, (int(px - sp.width / 2), int(py - sp.height / 2)))
        return frame


def vignette(W, H):
    y, x = np.mgrid[0:H, 0:W]
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    a = np.clip((d - 0.55) / 0.9, 0, 1) ** 1.5 * 200
    out = np.zeros((H, W, 4), np.uint8)
    out[..., 3] = a.astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script", nargs="?", default="cosmic_script.json")
    ap.add_argument("--preview", action="store_true", help="first 3 scenes at half resolution")
    ap.add_argument("-o", "--output", default=None)
    args = ap.parse_args()

    cfg = json.load(open(args.script, encoding="utf-8"))
    W, H = cfg.get("size", [1080, 1920])
    fps = cfg.get("fps", 30)
    scenes_cfg = cfg["scenes"]
    if args.preview:
        W, H = W // 2, H // 2
        scenes_cfg = scenes_cfg[:3]
    out = args.output or cfg.get("output", "cosmic_output.mp4")
    if args.preview:
        out = out.replace(".mp4", "_preview.mp4")
    font_path = os.path.join(os.path.dirname(os.path.abspath(args.script)), cfg["font"]) if cfg.get("font") else DEFAULT_FONT
    os.makedirs(BUILD, exist_ok=True)
    gap = cfg.get("scene_gap", 0.35)
    tail = cfg.get("tail", 1.2)

    # 1) narration + timing
    timeline, audio_parts, t = [], [], 0.0
    for i, sc in enumerate(scenes_cfg):
        mp3, words, dur = tts_scene(sc["text"], cfg, i)
        dur = max(dur, sc.get("min_duration", 0)) + gap
        timeline.append({"start": t, "dur": dur, "words": [{**w, "start": w["start"] + t, "end": w["end"] + t} for w in words]})
        audio_parts.append((mp3, t))
        t += dur
    total = t + tail
    timeline[-1]["dur"] += tail
    print(f"{len(timeline)} scenes, {total:.1f}s, {W}x{H}@{fps}")

    # 2) captions
    rng = random.Random(cfg.get("seed", 7))
    caps = []
    for tl in timeline:
        for g in group_words(tl["words"]):
            caps.append({**g, "img": render_caption(g["text"], W, H, font_path, rng)})
    for a, b in zip(caps, caps[1:]):
        a["until"] = b["start"]
    if caps:
        caps[-1]["until"] = total - 0.4

    # 3) audio track
    audio_path = os.path.join(BUILD, "mix.m4a")
    have_vo = any(p for p, _ in audio_parts)
    bgm = cfg.get("bgm") or ("bgm.mp3" if os.path.exists("bgm.mp3") else None)
    if have_vo or bgm:
        cmd, filt, labels = ["ffmpeg", "-v", "error", "-y"], [], []
        n = 0
        for p, off in audio_parts:
            if p:
                cmd += ["-i", p]
                filt.append(f"[{n}:a]adelay={int(off * 1000)}|{int(off * 1000)}[a{n}]")
                labels.append(f"[a{n}]")
                n += 1
        if bgm:
            cmd += ["-stream_loop", "-1", "-i", bgm]
            filt.append(f"[{n}:a]volume={cfg.get('bgm_volume', 0.18)},afade=t=out:st={max(total - 2, 0)}:d=2[a{n}]")
            labels.append(f"[a{n}]")
            n += 1
        filt.append(f"{''.join(labels)}amix=inputs={n}:normalize=0,atrim=0:{total}[out]")
        cmd += ["-filter_complex", ";".join(filt), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", audio_path]
        subprocess.run(cmd, check=True)
    else:
        audio_path = None
        print("No ELEVENLABS_API_KEY / bgm: rendering silent video with estimated timing.")

    # 4) video frames -> ffmpeg
    scenes = [Scene(sc, i, W, H, cfg.get("seed", 7)) for i, sc in enumerate(scenes_cfg)]
    vig = vignette(W, H)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-"]
    if audio_path:
        cmd += ["-i", audio_path, "-c:a", "copy", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    nframes = int(total * fps)
    xfade = 0.3
    ci = 0
    for fi in range(nframes):
        tt = fi / fps
        si = max(i for i, tl in enumerate(timeline) if tl["start"] <= tt + 1e-9)
        tl = timeline[si]
        lt = tt - tl["start"]
        img = scenes[si].frame(lt, tl["dur"])
        if si > 0 and lt < xfade:  # crossfade from previous scene
            ptl = timeline[si - 1]
            prev = scenes[si - 1].frame(tt - ptl["start"], ptl["dur"])
            img = Image.blend(prev, img, ease(lt / xfade))
        if scenes_cfg[si].get("fade_out") and tl["dur"] - lt < 1.5:  # dim to black (e.g. "burn out")
            k = ease((1.5 - (tl["dur"] - lt)) / 1.5) * 0.85
            img = Image.blend(img, Image.new("RGBA", (W, H), (0, 0, 0, 255)), k)
        img.alpha_composite(vig)
        if tt > total - 0.6:
            img = Image.blend(img, Image.new("RGBA", (W, H), (0, 0, 0, 255)), ease((tt - (total - 0.6)) / 0.6))
        # caption
        while ci + 1 < len(caps) and caps[ci + 1]["start"] <= tt:
            ci += 1
        if caps and caps[ci]["start"] <= tt < caps[ci]["until"]:
            c = caps[ci]
            age = tt - c["start"]
            s = 1.0 + 0.14 * (1 - ease(age / 0.14))
            cap = c["img"]
            if s != 1.0:
                cap = cap.resize((int(cap.width * s), int(cap.height * s)), Image.BILINEAR)
            if age < 0.05:
                cap = cap.copy()
                cap.putalpha(cap.getchannel("A").point(lambda v, a=age / 0.05: int(v * a)))
            img.alpha_composite(cap, (int((W - cap.width) / 2), int(H * cfg.get("caption_y", 0.5) - cap.height / 2)))
        proc.stdin.write(img.convert("RGB").tobytes())
        if fi % (fps * 5) == 0:
            print(f"  {tt:5.1f}s / {total:.1f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
