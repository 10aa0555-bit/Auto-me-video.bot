"""What if シリーズ (3D のミニチュアの街) の台本から、Remotion の WhatIf 用の素材と props.json を作る。

使い方:
    python tools/whatif_prep.py whatif/sea_rise_en.json            # 音声あり (Kokoro)
    python tools/whatif_prep.py whatif/sea_rise_en.json --no-tts   # 無音で見た目の確認
その後:
    cd remotion && npx remotion render src/index.ts WhatIf out/<名前>.mp4 --props=props.json --gl=swangle
"""
import argparse
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import wave  # noqa: E402

import numpy as np  # noqa: E402

from geo_short import ambient, sfx, tts  # noqa: E402
from geo_short.assets import AIArt  # noqa: E402
from geo_short.build import mix_audio, scene_durations, write_post  # noqa: E402
from geo_short.render import Timeline  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "remotion")
FPS = 30
REWIND = 1.3  # 最後の巻き戻しの秒数
# 動物ドキュメンタリーの動物の絵柄 (台本の "art_style" で上書きできる)
NATURE_STYLE = ("storybook 2D wildlife illustration, soft painterly shading, natural realistic colors, detailed but clean shapes, "
                "gentle rim light, side view, no text, no frame")
# ダークなモチベーション (noir) の 1 枚絵: 同じ男性を、雨の夜の街の 2D イラストで描く
NOIR_STYLE = ("high quality 2D digital illustration, anime-inspired cel shading, cinematic moody lighting, "
              "muted teal shadows and warm amber lights, detailed background, painterly atmosphere, no text, no watermark, no logo")


def draw_character_art(script, job):
    """noir の 1 枚絵: "character" (同じ人物の見た目) + 場面ごとの "art" (構図) を AI で描く。
    描けなければ "fallback" のコードの場面にする。場面の dict を書きかえる。"""
    character = script.get("character")
    if not character:
        return
    art = AIArt(script.get("art_style") or NOIR_STYLE, seed=character.get("seed", 4242))
    for sc in script["scenes"]:
        if not sc.get("art"):
            continue
        who = f" The man: {character['look']}." if sc.get("man", True) else ""
        try:
            path = art.prepare(f"{sc['art']}.{who}", "card")
        except Exception as e:  # 無料枠切れなど
            print(f"  絵を描けませんでした ({e}): {sc['art'][:50]}")
            path = None
        sc["fallback"] = sc.get("fallback") or (sc.get("scene") if sc.get("scene") not in (None, "art") else "street")
        sc["scene"] = "art"
        if path:
            shutil.copy(path, os.path.join(job, os.path.basename(path)))
            sc["img"] = os.path.basename(path)
        else:
            print(f"  ⚠ 絵がありません (コードの場面 {sc['fallback']} で代用): {sc['art'][:50]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--no-tts", action="store_true")
    args = ap.parse_args()

    with open(args.script, encoding="utf-8") as f:
        script = json.load(f)
    name = os.path.splitext(os.path.basename(args.script))[0]
    job = os.path.join(ROOT, "public", "job")
    shutil.rmtree(job, ignore_errors=True)
    os.makedirs(job)
    fonts = os.path.join(os.path.dirname(__file__), "..", "fonts")
    for f in os.listdir(fonts):
        if f.startswith("Poppins"):
            shutil.copy(os.path.join(fonts, f), job)

    # 動物ドキュメンタリー: 場面の "pose" ごとに、同じ絵柄の動物を AI で描いて切り抜く (結果は保存して再利用)
    animal = script.get("animal")
    if animal:
        import zlib
        art = AIArt(script.get("art_style") or NATURE_STYLE, seed=animal.get("seed", zlib.crc32(animal["name"].encode()) % 100000))
        for sc in script["scenes"]:
            pose = sc.get("pose")
            if sc.get("scene") != "nature" or not pose:
                continue
            prompt = f"{animal.get('look', '')} {animal['name']}, {pose}, full body, the same character design in every picture"
            try:
                path = art.prepare(prompt, "cutout")
            except Exception as e:  # 無料枠切れなど。動物なしで背景だけにする
                print(f"  動物の絵を描けませんでした ({e}): {pose}")
                path = None
            if path:
                shutil.copy(path, os.path.join(job, os.path.basename(path)))
                sc["animal"] = os.path.basename(path)
            else:
                print(f"  ⚠ 動物の絵がありません: {pose}")

    draw_character_art(script, job)

    workdir = os.path.join("out", f"{name}_audio")
    # "silent": ナレーションなし (字幕と効果音だけ)。場面の長さは各シーンの "duration" で決める
    silent = bool(script.get("silent"))
    alignments = None if (args.no_tts or silent) else tts.synthesize(script, workdir)
    have_audio = alignments is not None
    durations = scene_durations(script, workdir, have_audio)
    # Timeline は地図のカメラを前提にしているので、字幕の時刻を出すためだけに仮のカメラを入れる
    tl_script = json.loads(json.dumps(script))
    tl_script["scenes"][0]["camera"] = {"center": [0, 0], "span": 10}
    tl = Timeline(tl_script, durations, alignments)

    # 効果音: タイトルの頭に低い一撃、カウンター (DAY 7 など) が変わるたびにドン、場面転換に風切り音
    ev = [(0.05, "thud", {}), (0.1, "riser", {})]
    prev = None
    for i, s in enumerate(tl.scenes):
        c = s["spec"].get("counter")
        if c and c != prev:
            ev.append((s["start"] + 0.02, "thud", {}))
        if i and s["spec"].get("cam") and (script.get("style") != "diorama" or s["spec"].get("cut")):
            ev.append((max(0, s["start"] - 0.1), "whoosh", {"seed": i}))
        prev = c
        if script.get("theme") == "nature" and i:
            ev.append((max(0, s["start"] - 0.15), "whoosh", {"dur": 0.5, "seed": 40 + i}))
        # 台本で場面ごとに指定した効果音 (秒は場面の頭から)
        for st, kind, *kw in s["spec"].get("sfx", []):
            ev.append((s["start"] + st, kind, kw[0] if kw else {}))
    scenes = [{"spec": sc, "start": s["start"], "dur": s["dur"]} for sc, s in zip(script["scenes"], tl.scenes)]
    # 最後の場面で街を最初の状態に巻き戻し、動画をループさせる (見終わった瞬間に頭とつながる)
    story = "hook" in script  # Rick 風の物語 (キャラクター + 海や街の舞台)
    cosmic = script.get("style") == "cosmic"  # フラットな宇宙アニメ + 1 語ずつの巨大テロップ
    diorama = script.get("style") == "diorama"  # しくみ解説のジオラマ (3D の模型)
    rewind = 0.0 if (story or cosmic or diorama) else (REWIND if scenes[-1]["spec"].get("rewind", script.get("loop", True)) else 0.0)
    if rewind:
        scenes[-1]["spec"]["rewind"] = rewind
        ev.append((tl.total - rewind - 0.05, "whoosh", {"dur": 0.9, "seed": 77}))
    fx = os.path.join(job, "sfx.wav")
    sfx.render_track(ev, tl.total, fx)
    # 効果音に環境音 (波・風・街・ヘリ) を重ねる
    with wave.open(fx, "rb") as w:
        fxs = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32767
    amb = (ambient.render_nature(scenes, tl.total) if (cosmic and script.get("theme") == "nature") or diorama else
           ambient.render_noir(scenes, tl.total) if cosmic and script.get("theme") == "noir" else
           ambient.render_space(scenes, tl.total) if cosmic else
           ambient.render_story(scenes, tl.total) if story else ambient.render(scenes, tl.total, rewind))
    m = min(len(fxs), len(amb))
    both = np.clip(fxs[:m] + amb[:m] * 0.5, -1, 1)
    with wave.open(fx, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(ambient.SR)
        w.writeframes((both * 32767).astype(np.int16).tobytes())
    audio = os.path.join(job, "audio.m4a")
    mix_audio(workdir, durations, audio, fx, have_audio)
    os.remove(fx)

    captions = [{"text": c[0], "start": c[1], "end": c[2], "words": [[w, t] for w, t in (c[3] or [])]}
                for c in tl.captions]
    if not silent and script.get("theme") == "nature":
        # ナレーションの字幕は 2〜3 語ずつだと細かすぎるので、6〜8 語の 1 行にまとめる (場面をまたがない)
        merged = []
        for c in captions:
            last = merged[-1] if merged else None
            same_scene = last and any(s["start"] <= last["start"] < s["start"] + s["dur"] and s["start"] <= c["start"] < s["start"] + s["dur"] for s in tl.scenes)
            # 文の切れ目 (声の間が 0.25 秒以上) では行を分ける
            pause = c["start"] - last["end"] if last else 0
            if last and same_scene and pause < 0.25 and len(last["text"].split()) + len(c["text"].split()) <= 8 and not last["text"].rstrip().endswith((".", "?", "!")):
                last["text"] += " " + c["text"]
                last["end"] = c["end"]
                last["words"] += c["words"]
            else:
                merged.append(dict(c, words=list(c["words"])))
        captions = merged
    if silent:
        # 字幕は各シーンの "subs" (行のリスト) を、シーンの中で均等に出す
        captions = []
        for sc, s in zip(script["scenes"], tl.scenes):
            subs = sc.get("subs", [])
            for k, line in enumerate(subs):
                a = s["start"] + 0.3 + (s["dur"] - 0.6) * k / max(1, len(subs))
                b = s["start"] + 0.3 + (s["dur"] - 0.6) * (k + 1) / max(1, len(subs))
                captions.append({"text": line, "start": round(a, 3), "end": round(b, 3), "words": []})
    n = int(round(tl.total * FPS))
    props = {"frames": n, "fps": FPS, "scenes": scenes, "captions": captions, "audio": "audio.m4a"}
    if cosmic:
        props["theme"] = script.get("theme", "cosmic")
        # 自然ドキュメンタリーはナレーションがあっても、言葉を 1 語ずつではなく字幕の行で出す
        props["subs"] = silent or script.get("theme") == "nature"
        if animal:
            props["animalCard"] = {"name": animal["name"], "latin": animal.get("latin", "")}
    elif diorama:
        props["plaque"] = script.get("plaque", "")
    elif story:
        props["hook"] = script["hook"]
    else:
        props["title"] = script["whatif"]
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    write_post(script, os.path.join(ROOT, "out", f"{name}_post.txt"))
    with open(os.path.join(ROOT, "props.json"), "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    print(f"props.json: {len(scenes)} シーン {tl.total:.1f} 秒 ({n} フレーム), 音声 {'あり' if have_audio else 'なし'}")


if __name__ == "__main__":
    main()
