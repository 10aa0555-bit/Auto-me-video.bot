"""アニメの名言集 (日本語・縦書き・声なし) の台本から、Remotion の Quotes 用の素材と props.json を作る。

使い方:
    python tools/quotes_prep.py quotes/anime_quotes_01.json
台本の形:
    {"title": ["心に刺さる", "アニメの名言", "5選"],
     "quotes": [{"text": "あきらめたら\\nそこで試合終了ですよ", "who": "安西先生", "work": "SLAM DUNK",
                 "bg": "an empty school gym at sunset ...", "particles": "light"}],
     "post": {...}}
背景はオリジナルのアニメ調の景色を AI で描く (人物や既存のキャラクターは描かない)。描けないときはグラデーションの空にする。
"""
import json
import os
import shutil
import subprocess
import sys
import wave

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np  # noqa: E402

from geo_short import sfx  # noqa: E402
from geo_short.ambient import SR, _shaped_noise  # noqa: E402
from geo_short.assets import AIArt  # noqa: E402
from geo_short.build import write_post  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "remotion")
FPS = 30
ANIME_STYLE = ("anime movie background art, hand-painted look, cinematic lighting, rich colors, highly detailed scenery, "
               "soft atmospheric depth, vertical composition, no people, no characters, no text, no logo")


def quote_duration(text):
    """読む時間: 文字数に合わせて 8〜13 秒 (余韻込み)。"""
    n = len(text.replace("\n", ""))
    return max(8.0, min(13.0, 4.5 + n * 0.2))


def main():
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        script = json.load(f)
    name = os.path.splitext(os.path.basename(path))[0]
    job = os.path.join(ROOT, "public", "job")
    shutil.rmtree(job, ignore_errors=True)
    os.makedirs(job)

    art = AIArt(script.get("art_style") or ANIME_STYLE)
    scenes, t = [], 0.0
    intro = {"kind": "intro", "start": 0.0, "dur": 3.0, "particles": "light", "tint": "#203a6a"}
    scenes.append(intro)
    t = intro["dur"]
    for q in script["quotes"]:
        bg = None
        if q.get("bg"):
            try:
                p = art.prepare(q["bg"], "card")
                if p:
                    shutil.copy(p, os.path.join(job, os.path.basename(p)))
                    bg = os.path.basename(p)
            except Exception as e:  # 無料枠切れなど。グラデーションの空で代用
                print(f"  背景を描けませんでした ({e}): {q['bg'][:50]}")
        d = q.get("duration") or quote_duration(q["text"])
        scenes.append({"kind": "quote", "start": t, "dur": d, "text": q["text"], "who": q.get("who"), "work": q.get("work"),
                       "bg": bg, "particles": q.get("particles", "light"), "tint": q.get("tint", "#1b2a4a")})
        t += d
    # 1 つ目の背景をタイトルにも使う
    intro["bg"] = scenes[1]["bg"] if len(scenes) > 1 else None
    outro = {"kind": "outro", "start": t, "dur": 4.0, "bg": scenes[-1]["bg"], "particles": "light", "tint": "#1b2a4a"}
    scenes.append(outro)
    total = t + outro["dur"]

    # 音: 静かな風 + 名言が出るたびに小さなチャイム (曲は投稿時にユーザーが入れる)
    n = int(total * SR)
    tt = np.arange(n) / SR
    air = _shaped_noise(n, 200, 1800, 81) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * tt) ** 2) * 0.12
    ev = [(0.1, "ding", {})] + [(s["start"] + 0.3, "ding", {}) for s in scenes if s["kind"] == "quote"]
    fx = os.path.join(job, "fx.wav")
    sfx.render_track(ev, total, fx, gain=0.25)
    with wave.open(fx, "rb") as w:
        fxs = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32767
    m = min(len(fxs), n)
    mix = air[:m] + fxs[:m]
    fade = np.minimum(1, tt[:m] / 1.0) * np.minimum(1, (total - tt[:m]) / 1.0)
    mix = np.clip(mix * fade, -1, 1)
    with wave.open(fx, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    audio = os.path.join(job, "audio.m4a")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", fx, "-af", "loudnorm=I=-20:TP=-2", "-c:a", "aac", "-b:a", "160k", audio], check=True)
    os.remove(fx)

    props = {"frames": int(round(total * FPS)), "fps": FPS, "title": script["title"], "scenes": scenes, "audio": "audio.m4a"}
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    write_post(script, os.path.join(ROOT, "out", f"{name}_post.txt"))
    with open(os.path.join(ROOT, "props.json"), "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    print(f"props.json: 名言 {len(script['quotes'])} 個 {total:.1f} 秒, 背景 {sum(1 for s in scenes if s.get('bg'))} 枚")


if __name__ == "__main__":
    main()
