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

from . import sfx, tts
from .render import Renderer, Timeline

PAD = 0.35          # シーン末尾の間 (秒)
CHARS_PER_SEC = {"ja": 7.5, "en": 15.0}  # 音声なしの時の尺の目安


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
            cps = CHARS_PER_SEC[script.get("lang", "ja")]
            d = sc.get("duration") or len(sc.get("narration", "")) / cps + 0.6
        durs.append(max(d, sc.get("min_duration", 1.5)))
    return durs


def mix_audio(workdir, durations, out_path, sfx_wav, have_voice, bgm=None):
    """ナレーション (あれば) + 効果音 + BGM (任意) を 1 本の音声にする。"""
    inputs, filters, mix = [], [], []
    total = sum(durations)
    if have_voice:
        for i, d in enumerate(durations):
            inputs += ["-i", os.path.join(workdir, f"scene_{i:02d}.mp3")]
            filters.append(f"[{i}:a]aresample=44100,apad=whole_dur={d:.3f}[a{i}]")
        n = len(durations)
        filters.append("".join(f"[a{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[voice]")
        mix.append("[voice]")
    k = len(inputs) // 2
    inputs += ["-i", sfx_wav]
    filters.append(f"[{k}:a]aresample=44100[fx]")
    mix.append("[fx]")
    if bgm:
        inputs += ["-stream_loop", "-1", "-i", bgm]
        filters.append(f"[{k + 1}:a]volume=0.12,atrim=0:{total:.3f},"
                       f"afade=t=out:st={total - 2:.3f}:d=2[bg]")
        mix.append("[bg]")
    filters.append("".join(mix) + f"amix=inputs={len(mix)}:duration=longest:normalize=0,"
                   f"atrim=0:{total:.3f}[out]")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex",
                           ";".join(filters), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", out_path])


def write_post(script, path):
    """投稿用のタイトル・説明・ハッシュタグをテキストに書き出す。"""
    post = script.get("post")
    if not post:
        return
    lines = [post.get("title", script.get("title", "")), "", post.get("description", ""), "",
             " ".join(post.get("hashtags", []))]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).strip() + "\n")
    print(f"投稿文: {path}")


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

    fx = out.replace(".mp4", "_sfx.wav")
    sfx.render_track(timeline.sfx, timeline.total, fx)
    audio = out.replace(".mp4", "_audio.m4a")
    mix_audio(workdir, durations, audio, fx, have_audio, args.bgm)
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", silent, "-i", audio,
                           "-c:v", "copy", "-c:a", "copy", "-shortest", out])
    for f in (silent, audio, fx):
        os.remove(f)
    write_post(script, out.replace(".mp4", "_post.txt"))
    print(f"完成: {out} ({timeline.total:.1f}秒)")


if __name__ == "__main__":
    main()
