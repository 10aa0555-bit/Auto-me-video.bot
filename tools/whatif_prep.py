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
from geo_short import sfx, tts  # noqa: E402
from geo_short.build import mix_audio, scene_durations, write_post  # noqa: E402
from geo_short.render import Timeline  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "remotion")
FPS = 30


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

    workdir = os.path.join("out", f"{name}_audio")
    alignments = None if args.no_tts else tts.synthesize(script, workdir)
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
        if i and s["spec"].get("cam"):
            ev.append((max(0, s["start"] - 0.1), "whoosh", {"seed": i}))
        prev = c
    fx = os.path.join(job, "sfx.wav")
    sfx.render_track(ev, tl.total, fx)
    audio = os.path.join(job, "audio.m4a")
    mix_audio(workdir, durations, audio, fx, have_audio)
    os.remove(fx)

    scenes = [{"spec": sc, "start": s["start"], "dur": s["dur"]} for sc, s in zip(script["scenes"], tl.scenes)]
    captions = [{"text": c[0], "start": c[1], "end": c[2], "words": [[w, t] for w, t in (c[3] or [])]}
                for c in tl.captions]
    n = int(round(tl.total * FPS))
    props = {"frames": n, "fps": FPS, "title": script["whatif"], "scenes": scenes, "captions": captions,
             "audio": "audio.m4a"}
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    write_post(script, os.path.join(ROOT, "out", f"{name}_post.txt"))
    with open(os.path.join(ROOT, "props.json"), "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    print(f"props.json: {len(scenes)} シーン {tl.total:.1f} 秒 ({n} フレーム), 音声 {'あり' if have_audio else 'なし'}")


if __name__ == "__main__":
    main()
