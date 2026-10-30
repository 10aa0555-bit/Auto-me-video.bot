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
    """タイル 1 枚。一時的な失敗は待ってやり直し、それでも取れなければ None。"""
    import time
    path = os.path.join(TILE_CACHE, f"{z}_{x}_{y}.jpg")
    if not os.path.exists(path):
        data = None
        for wait in (0, 2, 5):
            time.sleep(wait)
            try:
                data = _get(TILES.format(z=z, x=x, y=y))
            except requests.RequestException:
                data = None
            if data:
                break
        if not data:
            return None
        os.makedirs(TILE_CACHE, exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    return cv2.imread(path, cv2.IMREAD_COLOR)


def tile_mosaic(x0, y0, x1, y1, z):
    """Sentinel-2 cloudless のタイルを並べ、範囲 (正規化メルカトル) ちょうどの画像にする。"""
    n = 2 ** z
    tx0, tx1 = int(x0 * n), int(math.ceil(x1 * n))
    ty0, ty1 = int(y0 * n), int(math.ceil(y1 * n))
    if (tx1 - tx0) * (ty1 - ty0) > 1600:
        raise OSError("タイルが多すぎます")
    big = np.zeros(((ty1 - ty0) * 256, (tx1 - tx0) * 256, 3), np.uint8)
    missing, total = 0, (tx1 - tx0) * (ty1 - ty0)
    for ty in range(ty0, ty1):
        for tx in range(tx0, tx1):
            img = _tile(z, tx % n, ty)
            if img is None:
                missing += 1
                if missing > max(2, total * 0.02):  # 取れないタイルが多いなら早めにあきらめる
                    raise OSError(f"タイルが {missing} 枚取れませんでした ({z}/{tx % n}/{ty})")
                continue
            big[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = img
    if missing:  # 少しの欠けなら下の段の地図が透けるだけなので許す
        print(f"  タイルが {missing}/{total} 枚取れませんでした (下の段で補います)")
    ppu = 256 * n
    ox, oy = int((x0 * n - tx0) * 256), int((y0 * n - ty0) * 256)
    return big[oy:oy + int((y1 - y0) * ppu), ox:ox + int((x1 - x0) * ppu)], ppu


def _grade_tiles(img):
    """Sentinel-2 はもともと色が濃いので、Blue Marble 用の補正は使わず、少し落ち着かせるだけにする。"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] *= 0.82
    hsv[..., 2] *= 0.88  # 砂漠が白飛びして字幕が読みにくくならないよう少し暗く
    img = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    lab[..., 0] = cv2.createCLAHE(clipLimit=1.3, tileGridSize=(16, 16)).apply(lab[..., 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


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
    # 全体を覆う粗い段から始め、足りないカメラは場所ごとに固まりへ分けて細かい段を足す
    # (離れた場所を 1 枚にまとめると画像の上限に当たって粗くなるため)
    levels, todo = [], [sorted(cams, key=lambda c: -c[2])]
    while todo and len(levels) < 12:
        group = todo.pop(0)
        x0, y0, x1, y1 = _bounds(group)
        need = W / min(c[2] for c in group)  # 一番寄るカメラに必要な密度
        ppu = min(need * 1.1, MAX_TEX / max(x1 - x0, y1 - y0))
        levels.append([x0, y0, x1, y1, ppu, need * 1.1])
        rest = [c for c in group if W / c[2] > ppu * 1.25]  # この段で足りないカメラ
        clusters = []
        for c in sorted(rest, key=lambda c: c[2]):
            for cl in clusters:
                if math.hypot(cl[0][0] - c[0], cl[0][1] - c[1]) < max(cl[0][2], c[2]) * 2:
                    cl.append(c)
                    break
            else:
                clusters.append([c])
        todo += clusters
    levels.sort(key=lambda lv: lv[4])  # 粗い段から順に重ねる
    need_of = [lv[5] for lv in levels]
    credits = []
    src = None
    out = []
    for i, (x0, y0, x1, y1, ppu, _) in enumerate(levels):
        img = None
        if use_tiles:
            # 寄りの段は足りない側に丸めない。画像の上限で抑えた広い段は、上限を超えないよう切り下げる
            capped = ppu < need_of[i] * 1.05
            z = math.floor(math.log2(ppu / 256)) if capped else math.ceil(math.log2(ppu / 256) - 0.15)
            z = min(max(z, 2), MAX_TILE_Z)
            try:
                img, ppu = tile_mosaic(x0, y0, x1, y1, z)
                sigma = max(2.0, min(12.0, ppu / 21600 * 8))
                if TILE_CREDIT not in credits:
                    credits.append(TILE_CREDIT)
                src_name = f"Sentinel-2 z{z}"
                grade = _grade_tiles
            except (OSError, requests.RequestException) as e:
                print(f"  地図タイルを使えません ({e})。この段は Blue Marble で代用します")
        if img is None:
            if src is None:
                src = cv2.imread(find_texture(), cv2.IMREAD_COLOR)
            ppu = min(ppu, src.shape[1] * 1.5)
            img = _from_bluemarble(src, x0, y0, x1, y1, ppu)
            sigma = max(2.0, ppu / 21600 * 8)
            src_name = "Blue Marble"
            grade = _grade
        files = {}
        for look in looks:
            tex = _relief(img, sigma) if look == "relief" else grade(img)
            name = f"map{i}_{look}.jpg"
            cv2.imwrite(os.path.join(job, name), tex, [cv2.IMWRITE_JPEG_QUALITY, 92])
            files[look] = name
        out.append({"x0": x0, "y0": y0, "ppu": ppu, "w": img.shape[1], "h": img.shape[0], "files": files})
        print(f"地図 {i}: {src_name} {img.shape[1]}x{img.shape[0]}px")
    return out, credits


def prepare_shapes(script, tl):
    """塗り・輪郭に使う国の形を、正規化メルカトル座標の輪郭 (間引き済み) にする。"""
    from geo_short.geo import World, merc_arr
    keys = set()
    for sc in script["scenes"]:
        keys |= set(sc.get("fill", {})) | set(sc.get("outline", []))
    if not keys:
        return {}
    world = World()
    for name, coords in script.get("regions", {}).items():
        world.add_region(name, coords)
    spans = [math.exp(s["cam_to"][2]) for s in tl.scenes if s["cam_to"]]
    eps = (min(spans) if spans else 0.05) / W * 0.6  # 画面で 0.6px 以下の凹凸は省く
    out = {}
    for k in sorted(keys):
        if k in world.custom:
            polys = [[[p for p in r.lods[0]] for r in poly] for poly in world.custom[k].polygons]
            polys = [[np.asarray(r) for r in poly] for poly in polys]
        else:
            polys = [[merc_arr(r) for r in poly] for poly in world.raw_polygons(k)]
        rings = []
        for poly in polys:
            for r in poly:
                a = cv2.approxPolyDP(np.round(np.asarray(r, np.float64) * 1e7).astype(np.int32).reshape(-1, 1, 2),
                                     eps * 1e7, True).reshape(-1, 2) / 1e7
                if len(a) >= 3:
                    rings.append([[round(x, 7), round(y, 7)] for x, y in a])
        out[k] = rings
    return out


def prepare_swarms(script):
    """swarm (人が住む場所の点の群れ) を、線に沿ってばらまいた点の列にする。"""
    rng = np.random.default_rng(7)
    for sc in script["scenes"]:
        for sw in sc.get("swarms", []):
            path = np.asarray(sw["path"], dtype=np.float64)
            seg = np.hypot(*np.diff(path, axis=0).T)
            cum = np.concatenate([[0], np.cumsum(seg)])
            n = sw.get("count", 300)
            spread = sw.get("spread_km", 8) / 111.0
            pts = []
            for d in np.sort(rng.random(n)) * cum[-1]:
                i = min(np.searchsorted(cum, d, side="right") - 1, len(seg) - 1)
                u = (d - cum[i]) / max(seg[i], 1e-9)
                p = path[i] + (path[i + 1] - path[i]) * u
                nx, ny = -(path[i + 1][1] - path[i][1]), path[i + 1][0] - path[i][0]
                norm = math.hypot(nx, ny) or 1
                off = rng.normal(0, spread)
                pts.append([round(p[0] + nx / norm * off, 4), round(p[1] + ny / norm * off, 4),
                            round(d / cum[-1], 3)])
            sw["pts"] = pts


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
    prepare_swarms(script)
    shapes = prepare_shapes(script, tl)
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

    scenes = [{"spec": s["spec"], "start": s["start"], "dur": s["dur"],
               "fillsBefore": s["fills_before"], "fillsAfter": s["fills_after"]} for s in tl.scenes]
    captions = [{"text": c[0], "start": c[1], "end": c[2], "words": [[w, t] for w, t in (c[3] or [])]}
                for c in tl.captions]
    props = {"name": name, "fps": FPS, "frames": n, "scenes": scenes, "captions": captions,
             "camera": cams, "shapes": shapes, "maps": tex or [], "credits": credits, "audio": "audio.m4a",
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
