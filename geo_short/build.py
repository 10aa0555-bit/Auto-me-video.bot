"""台本 JSON から地理ショート動画 (1080x1920) を生成する。

使い方:
    python -m geo_short.build scripts/kaliningrad.json -o out/kaliningrad.mp4
    python -m geo_short.build scripts/kaliningrad.json --preview      # 低解像度で確認
    python -m geo_short.build scripts/kaliningrad.json --still 12.5   # 指定秒の 1 枚だけ PNG 出力
"""
import argparse
import json
import os
import subprocess
import sys
import time

from . import tts
from .render import Renderer, Timeline

PAD = 0.35          # シーン末尾の間 (秒)
CHARS_PER_SEC = 7.5  # 音声なしの時の尺の目安 (日本語)


def probe_duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "csv=p=0", path])
    return float(out)


def scene_durations(script, workdir, have_audio):
    durs = []
    for i, sc in enumerate(script["scenes"]):
        if have_audio:
            d = probe_duration(os.path.join(workdir, f"scene_{i:02d}.mp3")) + PAD
        else:
            d = sc.get("duration") or len(sc.get("narration", "")) / CHARS_PER_SEC + 0.6
        durs.append(max(d, sc.get("min_duration", 1.5)))
    return durs


def mix_audio(script, workdir, durations, out_path, bgm=None):
    inputs, filters = [], []
    for i, d in enumerate(durations):
        inputs += ["-i", os.path.join(workdir, f"scene_{i:02d}.mp3")]
        filters.append(f"[{i}:a]aresample=44100,apad=whole_dur={d:.3f}[a{i}]")
    n = len(durations)
    filters.append("".join(f"[a{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[voice]")
    total = sum(durations)
    if bgm:
        inputs += ["-stream_loop", "-1", "-i", bgm]
        filters.append(f"[{n}:a]volume=0.12,atrim=0:{total:.3f},afade=t=out:st={total - 2:.3f}:d=2[bg]")
        filters.append("[voice][bg]amix=inputs=2:duration=first:normalize=0[out]")
        last = "[out]"
    else:
        last = "[voice]"
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex",
                           ";".join(filters), "-map", last, "-c:a", "aac", "-b:a", "192k", out_path])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("-o", "--out")
    ap.add_argument("--preview", action="store_true", help="540x960 / 15fps で素早く確認")
    ap.add_argument("--still", type=float, help="この秒数のフレームを PNG で書き出して終了")
    ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--bgm", help="BGM ファイル (任意)")
    ap.add_argument("--fps", type=int, default=30)
    args = ap.parse_args()

    with open(args.script, encoding="utf-8") as f:
        script = json.load(f)
    name = os.path.splitext(os.path.basename(args.script))[0]
    out = args.out or os.path.join("out", f"{name}.mp4")
    workdir = os.path.join("out", f"{name}_audio")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    alignments = None if args.no_tts or args.still is not None else tts.synthesize(script, workdir)
    have_audio = alignments is not None
    if not have_audio and args.still is None:
        print("※ ELEVENLABS_API_KEY が無いため無音で書き出します (尺は文字数から推定)")
    durations = scene_durations(script, workdir, have_audio)
    timeline = Timeline(script, durations, alignments)

    scale = 0.5 if args.preview else 1.0
    fps = 15 if args.preview else args.fps
    r = Renderer(script, scale=scale)

    if args.still is not None:
        png = out.replace(".mp4", f"_{args.still:.1f}s.png")
        r.frame(args.still, timeline)
        r.surface.write_to_png(png)
        print(png)
        return

    silent = out.replace(".mp4", "_video.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgra",
                           "-s", f"{r.w}x{r.h}", "-r", str(fps), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                           "-pix_fmt", "yuv420p", silent], stdin=subprocess.PIPE)
    n = int(timeline.total * fps)
    t0 = time.time()
    for k in range(n):
        ff.stdin.write(r.frame(k / fps, timeline))
        if k % (fps * 5) == 0:
            print(f"  {k}/{n} フレーム ({time.time() - t0:.0f}s)", file=sys.stderr)
    ff.stdin.close()
    ff.wait()

    if have_audio:
        audio = out.replace(".mp4", "_audio.m4a")
        mix_audio(script, workdir, durations, audio, args.bgm)
        subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", silent, "-i", audio,
                               "-c:v", "copy", "-c:a", "copy", "-shortest", out])
        os.remove(silent)
        os.remove(audio)
    else:
        os.replace(silent, out)
    print(f"完成: {out} ({timeline.total:.1f}秒)")


if __name__ == "__main__":
    main()
