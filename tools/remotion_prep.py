"""geo_short の台本を Remotion で書き出すための素材と props.json を作る。

ナレーション・効果音・字幕の時刻・カメラの動きは geo_short と同じ計算を使い、
アニメーション (弾む・歩く・寄る) だけを Remotion 側 (remotion/src) で描く。

使い方:
    python tools/remotion_prep.py scripts/zanzibar_war_en.json            # 音声あり (Kokoro)
    python tools/remotion_prep.py scripts/zanzibar_war_en.json --no-tts   # 無音で絵の確認
    python tools/remotion_prep.py scripts/zanzibar_war_en.json --scenes 4 # 最初の 4 シーンだけ
その後:
    cd remotion && npx remotion render src/index.ts Short out/<名前>.mp4 --props=props.json
"""
import argparse
import hashlib
import json
import math
import os
import shutil
import sys
import urllib.parse

import cv2
import numpy as np
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from geo_short import sfx, tts  # noqa: E402
from geo_short.assets import FLUENT, AIArt, _get  # noqa: E402
from geo_short.build import mix_audio, scene_durations, write_post  # noqa: E402
from geo_short.render import Timeline  # noqa: E402
from geo_short.satellite import _grade, _relief, find_texture  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "remotion")
W, H, FPS = 1080, 1920, 30
MAX_TEX = 8000  # 地図画像の長辺の上限 (ブラウザで扱える大きさ)


def fluent_flat(name, dest_dir):
    """Fluent Emoji の 2D (Flat) 版 SVG を取ってくる。AI イラストが無いときの代わり。"""
    folder = name[0].upper() + name[1:].lower()
    stem = name.lower().replace(" ", "_").replace("-", "_")
    base = FLUENT + urllib.parse.quote(folder)
    for url in (f"{base}/Flat/{stem}_flat.svg", f"{base}/Default/Flat/{stem}_flat_default.svg"):
        data = _get(url)
        if data:
            path = os.path.join(dest_dir, f"flat_{stem}.svg")
            with open(path, "wb") as f:
                f.write(data)
            return path
    return None


def prepare_art(script, job):
    """アイコンごとに画像を用意し、job からの相対パスを ic["src"] に入れる。"""
    art = AIArt(script.get("art_style"))
    for sc in script["scenes"]:
        for ic in sc.get("icons", []):
            path = None
            if ic.get("ai"):
                try:
                    path = art.prepare(ic["ai"], "cutout")
                except Exception as e:  # 無料枠切れなど。アイコンで代用して続ける
                    print(f"  AI イラストを描けませんでした ({e}): {ic['ai'][:50]}")
            if path:
                dst = os.path.join(job, os.path.basename(path))
                shutil.copy(path, dst)
                ic["src"], ic["kind"] = os.path.basename(path), "ai"
                continue
            flat = fluent_flat(ic.get("name", "sparkles"), job)
            if flat:
                ic["src"], ic["kind"] = os.path.basename(flat), "flat"
            else:
                print(f"  アイコンが見つかりません: {ic.get('name')}")


TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"
TILE_CREDIT = ("Map imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH, https://s2maps.eu "
               "(contains modified Copernicus Sentinel data 2016), CC BY 4.0")
TILE_CACHE = os.path.join(os.path.expanduser("~/.cache/geo_short"), "tiles")
MAX_TILE_Z = 13


def _tile(z, x, y):
    path = os.path.join(TILE_CACHE, f"{z}_{x}_{y}.jpg")
    if not os.path.exists(path):
        data = _get(TILES.format(z=z, x=x, y=y))
        if not data:
            raise OSError(f"タイルを取得できません: {z}/{x}/{y}")
        os.makedirs(TILE_CACHE, exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise OSError(f"タイルを読めません: {path}")
    return img


def tile_mosaic(x0, y0, x1, y1, z):
    """Sentinel-2 cloudless のタイルを並べ、範囲 (正規化メルカトル) ちょうどの画像にする。"""
    n = 2 ** z
    tx0, tx1 = int(x0 * n), int(math.ceil(x1 * n))
    ty0, ty1 = int(y0 * n), int(math.ceil(y1 * n))
    if (tx1 - tx0) * (ty1 - ty0) > 1600:
        raise OSError("タイルが多すぎます")
    big = np.zeros(((ty1 - ty0) * 256, (tx1 - tx0) * 256, 3), np.uint8)
    for ty in range(ty0, ty1):
        for tx in range(tx0, tx1):
            big[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = _tile(z, tx % n, ty)
    ppu = 256 * n
    ox, oy = int((x0 * n - tx0) * 256), int((y0 * n - ty0) * 256)
    return big[oy:oy + int((y1 - y0) * ppu), ox:ox + int((x1 - x0) * ppu)], ppu


def _bounds(cams, grow=1.6):
    xs, ys = [], []
    for cx, cy, span in cams:
        span *= grow  # 途中で引く分と余白
        xs += [cx - span / 2, cx + span / 2]
        ys += [cy - span * H / W / 2, cy + span * H / W / 2]
    return max(min(xs), 0.0), max(min(ys), 0.0), min(max(xs), 1.0), min(max(ys), 1.0)


def _from_bluemarble(src, x0, y0, x1, y1, ppu):
    """正距円筒の Blue Marble から、範囲をメルカトルで切り出す (ppu: 1 単位あたりの px)。"""
    sh, sw = src.shape[:2]
    ow, oh = int((x1 - x0) * ppu), int((y1 - y0) * ppu)
    mx = x0 + (np.arange(ow, dtype=np.float64) + 0.5) / ppu
    my = y0 + (np.arange(oh, dtype=np.float64) + 0.5) / ppu
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * my))))
    map_x = np.tile((mx * sw - 0.5).astype(np.float32), (oh, 1))
    map_y = np.tile(((90 - lat) / 180 * sh - 0.5).astype(np.float32)[:, None], (1, ow))
    return cv2.remap(src, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def map_textures(timeline, job, looks, use_tiles=True):
    """カメラが通る範囲の地図を、ズームの段階ごとに切り出す。

    広い範囲の粗い画像の上に、寄るシーンの狭い範囲だけ細かい画像を重ねる (最大 3 段)。
    Sentinel-2 のタイルが取れればそれを、取れなければ Blue Marble を使う。
    """
    cams = []
    for s in timeline.scenes:
        for cam in (s["cam_from"], s["cam_to"]):
            if cam:
                cams.append((cam[0], cam[1], math.exp(cam[2])))
    if not cams:
        return None, []
    levels, todo = [], sorted(cams, key=lambda c: -c[2])
    while todo and len(levels) < 3:
        x0, y0, x1, y1 = _bounds(todo)
        need = W / min(c[2] for c in todo)  # 一番寄るカメラに必要な密度
        ppu = min(need * 1.1, MAX_TEX / max(x1 - x0, y1 - y0))
        levels.append([x0, y0, x1, y1, ppu])
        todo = [c for c in todo if W / c[2] > ppu * 1.25]  # この段で足りないカメラだけ次の段へ
    credits = []
    src = None
    out = []
    for i, (x0, y0, x1, y1, ppu) in enumerate(levels):
        img = None
        if use_tiles:
            z = min(max(int(round(math.log2(ppu / 256))), 2), MAX_TILE_Z)
            try:
                img, ppu = tile_mosaic(x0, y0, x1, y1, z)
                sigma = max(2.0, min(12.0, ppu / 21600 * 8))
                if TILE_CREDIT not in credits:
                    credits.append(TILE_CREDIT)
                src_name = f"Sentinel-2 z{z}"
            except (OSError, requests.RequestException) as e:
                print(f"  地図タイルを使えません ({e})。Blue Marble で代用します")
                use_tiles = False
        if img is None:
            if src is None:
                src = cv2.imread(find_texture(), cv2.IMREAD_COLOR)
            ppu = min(ppu, src.shape[1] * 1.5)
            img = _from_bluemarble(src, x0, y0, x1, y1, ppu)
            sigma = max(2.0, ppu / 21600 * 8)
            src_name = "Blue Marble"
        files = {}
        for look in looks:
            tex = _relief(img, sigma) if look == "relief" else _grade(img)
            name = f"map{i}_{look}.jpg"
            cv2.imwrite(os.path.join(job, name), tex, [cv2.IMWRITE_JPEG_QUALITY, 92])
            files[look] = name
        out.append({"x0": x0, "y0": y0, "ppu": ppu, "w": img.shape[1], "h": img.shape[0], "files": files})
        print(f"地図 {i}: {src_name} {img.shape[1]}x{img.shape[0]}px")
    return out, credits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--no-tiles", action="store_true", help="地図タイルを使わず Blue Marble だけで作る")
    ap.add_argument("--scenes", type=int, help="最初の N シーンだけ (試作用)")
    args = ap.parse_args()

    with open(args.script, encoding="utf-8") as f:
        script = json.load(f)
    if args.scenes:
        script["scenes"] = script["scenes"][:args.scenes]
    name = os.path.splitext(os.path.basename(args.script))[0]
    job = os.path.join(ROOT, "public", "job")
    shutil.rmtree(job, ignore_errors=True)
    os.makedirs(job)

    workdir = os.path.join("out", f"{name}_audio")
    alignments = None if args.no_tts else tts.synthesize(script, workdir)
    have_audio = alignments is not None
    durations = scene_durations(script, workdir, have_audio)
    tl = Timeline(script, durations, alignments)
    total = tl.total

    prepare_art(script, job)
    fonts = os.path.join(os.path.dirname(__file__), "..", "fonts")
    for f in os.listdir(fonts):
        if f.startswith("Poppins"):
            shutil.copy(os.path.join(fonts, f), job)
    looks = {"satellite"} | {sc.get("base", "satellite") for sc in script["scenes"] if not sc.get("blueprint")}
    tex, credits = map_textures(tl, job, sorted(looks), not args.no_tiles)

    fx = os.path.join(job, "sfx.wav")
    sfx.render_track(tl.sfx, total, fx)
    audio = os.path.join(job, "audio.m4a")
    mix_audio(workdir, durations, audio, fx, have_audio)
    os.remove(fx)

    n = int(round(total * FPS))
    cams = []
    for k in range(n):
        _, s, lt = tl.scene_at(k / FPS)
        cx, cy, ls = tl.camera(s, lt) if s["cam_to"] else (0.5, 0.5, 0.0)
        cams.append([round(cx, 7), round(cy, 7), round(math.exp(ls), 7)])

    scenes = [{"spec": s["spec"], "start": s["start"], "dur": s["dur"]} for s in tl.scenes]
    captions = [{"text": c[0], "start": c[1], "end": c[2], "words": [[w, t] for w, t in (c[3] or [])]}
                for c in tl.captions]
    props = {"name": name, "fps": FPS, "frames": n, "scenes": scenes, "captions": captions,
             "camera": cams, "maps": tex or [], "credits": credits, "audio": "audio.m4a",
             "captionStyle": script.get("captions", "plain"),
             "version": hashlib.sha1(str(os.path.getmtime(audio)).encode()).hexdigest()[:8]}
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    post = os.path.join(ROOT, "out", f"{name}_post.txt")
    write_post(script, post)
    if credits and os.path.exists(post):
        txt = open(post, encoding="utf-8").read()
        title, rest = txt.split("\n", 1)
        desc, tail = (rest.split("\n#", 1) + [""])[:2]
        with open(post, "w", encoding="utf-8") as f:
            f.write(title + "\n" + desc.rstrip() + "\n\n" + "\n".join(credits) + "\n\n#" + tail if tail
                    else txt.rstrip() + "\n\n" + "\n".join(credits) + "\n")
    with open(os.path.join(ROOT, "props.json"), "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    print(f"props.json: {len(scenes)} シーン {total:.1f} 秒 ({n} フレーム), 音声 {'あり' if have_audio else 'なし'}")


if __name__ == "__main__":
    main()
