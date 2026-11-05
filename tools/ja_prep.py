"""日本語の雑学・心理学ショート (中高生・大学生向け) の台本から、Remotion の Cosmic 用の素材と props.json を作る。

声は VOICEVOX (無料・クレジット表記で商用可)。絵は whatif_prep と同じ AI の 1 枚絵 (同じ人物)。
字幕は台本の "say" を "/" で区切ったかたまりごとに、画面の真ん中に大きく出す (読み上げに合わせて切り替わる)。

使い方:
    python tools/ja_prep.py jp/psych_5_ja.json            # VOICEVOX が 127.0.0.1:50021 で動いていること
    python tools/ja_prep.py jp/psych_5_ja.json --no-tts   # 声なし (字幕の位置などの確認用、時刻は文字数から見積もる)
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import wave

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np  # noqa: E402

from geo_short import ambient, sfx  # noqa: E402
from geo_short.build import write_post  # noqa: E402
from whatif_prep import draw_character_art  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "remotion")
FPS = 30
GAP = 0.3  # 場面と場面のあいだの間 (秒)
LEAD = 0.25  # 最初の声が出るまで


def clean(chunk):
    """字幕に出す文字: 文末の 。、 と空白を取る (？！ は残す)。"""
    return re.sub(r"[。、,\s]+$", "", chunk.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--no-art", action="store_true", help="AI の絵を描かない (映像は手元で別に用意するとき)")
    args = ap.parse_args()
    with open(args.script, encoding="utf-8") as f:
        script = json.load(f)
    name = os.path.splitext(os.path.basename(args.script))[0]
    job = os.path.join(ROOT, "public", "job")
    shutil.rmtree(job, ignore_errors=True)
    os.makedirs(job)

    if not args.no_art:
        draw_character_art(script, job)

    voice = script.get("voice", {})
    speaker = None
    if not args.no_tts:
        from geo_short import voicevox
        speaker = voicevox.speaker_id(voice.get("name", "青山龍星"), voice.get("style", "ノーマル"))
        print(f"VOICEVOX: {voice.get('name', '青山龍星')} (id {speaker})")

    scenes, captions, voice_parts = [], [], []
    t = 0.0
    for i, sc in enumerate(script["scenes"]):
        chunks = [c for c in sc["say"].split("/") if c.strip()]
        text = "".join(chunks).replace("|", "")  # 「|」は字幕の改行 (読まない)
        lead = LEAD if i == 0 else 0.0
        if speaker is not None:
            wav, mora_starts, vdur = voicevox.synth(text, speaker, voice.get("speed", 1.15), voice.get("pitch", 0.0),
                                                    voice.get("intonation", 1.1))
            path = os.path.join(job, f"v{i}.wav")
            with open(path, "wb") as f:
                f.write(wav)
            voice_parts.append((t + lead, path))
            # かたまりごとのモーラ数で、文全体のモーラの時刻に切れ目を割り当てる
            counts = [max(1, voicevox.mora_count(c.replace("|", ""), speaker)) for c in chunks]
            total_m = sum(counts)
            n = len(mora_starts)
            starts, acc = [], 0
            for c in counts:
                idx = min(n - 1, round(acc / total_m * n)) if n else 0
                starts.append(mora_starts[idx] if n else 0.0)
                acc += c
        else:
            # 声なし: 1 文字 0.13 秒で見積もる
            lens = [len(c.replace("|", "")) for c in chunks]
            vdur = sum(lens) * 0.13 + 0.3
            starts = [sum(lens[:k]) * 0.13 for k in range(len(chunks))]
        dur = max(sc.get("min_dur", 0), lead + vdur + GAP)
        for k, c in enumerate(chunks):
            a = t + lead + starts[k]
            b = t + lead + (starts[k + 1] if k + 1 < len(chunks) else vdur - 0.05)
            captions.append({"text": clean(c), "start": round(a, 3), "end": round(max(a + 0.2, b), 3), "words": []})
        spec = {k: v for k, v in sc.items() if k not in ("say", "art")}
        scenes.append({"spec": spec, "start": round(t, 3), "dur": round(dur, 3)})
        t += dur
    total = t + 0.4
    scenes[-1]["dur"] = round(scenes[-1]["dur"] + 0.4, 3)
    print(f"尺: {total:.1f} 秒 (61〜75 秒が目安)")

    # 効果音 (場面転換の風切り音、番号の場面の頭にドン) + 環境音 (雨・低いうなり)
    ev = [(0.02, "thud", {})]
    for i, s in enumerate(scenes):
        if i:
            ev.append((max(0, s["start"] - 0.12), "whoosh", {"dur": 0.5, "seed": i}))
        if s["spec"].get("number"):
            ev.append((s["start"] + 0.02, "thud", {}))
    fx = os.path.join(job, "fx.wav")
    sfx.render_track(ev, total, fx, gain=0.3)
    with wave.open(fx, "rb") as w:
        fxs = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32767
    amb = ambient.render_noir(scenes, total)
    m = min(len(fxs), len(amb))
    bed = np.clip(fxs[:m] + amb[:m] * 0.5, -1, 1)
    with wave.open(fx, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(ambient.SR)
        w.writeframes((bed * 32767).astype(np.int16).tobytes())

    audio = os.path.join(job, "audio.m4a")
    if voice_parts:
        # 声を場面の時刻に置いて、効果音・環境音と重ね、-14 LUFS にそろえる
        ins, filt = ["-i", fx], []
        for k, (at, p) in enumerate(voice_parts):
            ins += ["-i", p]
            filt.append(f"[{k + 1}:a]aresample={ambient.SR},adelay={int(at * 1000)}:all=1[v{k}]")
        vs = "".join(f"[v{k}]" for k in range(len(voice_parts)))
        filt.append(f"{vs}amix=inputs={len(voice_parts)}:duration=longest:normalize=0,volume=1.0[voice]")
        filt.append("[0:a]volume=0.6[bed]")
        filt.append(f"[voice][bed]amix=inputs=2:duration=longest:normalize=0,atrim=0:{total:.3f},loudnorm=I=-14:TP=-1.5:LRA=11[out]")
        subprocess.run(["ffmpeg", "-y", "-v", "error", *ins, "-filter_complex", ";".join(filt), "-map", "[out]",
                        "-ar", "48000", "-c:a", "aac", "-b:a", "192k", audio], check=True)
    else:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", fx, "-af", "loudnorm=I=-20:TP=-2", "-c:a", "aac", "-b:a", "160k", audio], check=True)
    for f in os.listdir(job):
        if f.endswith(".wav"):
            os.remove(os.path.join(job, f))

    props = {"frames": int(round(total * FPS)), "fps": FPS, "scenes": scenes, "captions": captions, "audio": "audio.m4a",
             "theme": script.get("theme", "noir"), "lang": "ja", "subs": False}
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    write_post(script, os.path.join(ROOT, "out", f"{name}_post.txt"))
    with open(os.path.join(ROOT, "props.json"), "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    print(f"props.json: {len(scenes)} 場面, 字幕 {len(captions)} 個, 絵 {sum(1 for s in scenes if s['spec'].get('img'))} 枚")


if __name__ == "__main__":
    main()
