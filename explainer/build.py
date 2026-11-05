"""台本 JSON から科学解説ショート (1080x1920) を作る。

使い方:
    python -m explainer.build shorts/look_better.json            # out/look_better.mp4
    python -m explainer.build shorts/look_better.json --still 5   # 5 秒地点の PNG
    python -m explainer.build shorts/look_better.json --preview   # 540x960 で素早く確認

ナレーション・効果音・BGM・音量調整は geo_short と同じ仕組みを使う。
"""
import argparse
import json
import os
import subprocess
import sys
import time

from geo_short import sfx, tts
from geo_short.build import mix_audio, prepare_bgm, scene_durations, write_post

from .render import Art, Renderer, Timeline


def prepare_art(script):
    """台本のイラストを先にまとめて描く (失敗しても仮の絵で続ける)。"""
    art = Art(script.get("art_style"))
    prompts = list(dict.fromkeys(sc["art"] for sc in script["scenes"] if sc.get("art")))
    missing = [p for p in prompts if not os.path.exists(art.path(p))]
    if not art.ai.provider:
        if missing:
            print(f"※ AI イラストのサービスが未設定です。{len(missing)} 枚を仮の絵で代用します")
        return
    print(f"イラスト: {len(prompts)} 枚 (新しく描く {len(missing)} 枚, {art.ai.provider})")
    for p in missing:
        try:
            art.prepare(p)
        except Exception as e:  # noqa: BLE001 — 1 枚の失敗で動画全体を止めない
            print(f"  イラスト失敗: {p[:50]} -> {e}")


def _srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_srt(timeline, path):
    with open(path, "w", encoding="utf-8") as f:
        for k, (text, t0, t1, _) in enumerate(timeline.captions, 1):
            f.write(f"{k}\n{_srt_time(t0)} --> {_srt_time(t1)}\n{text}\n\n")
    print(f"字幕: {path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("-o", "--out")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--still", type=float)
    ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--require-tts", action="store_true")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--icons", action="store_true", help="AI イラストの代わりに 3D アイコンで作る (出力名に _icons)")
    args = ap.parse_args()

    with open(args.script, encoding="utf-8") as f:
        script = json.load(f)
    script.setdefault("lang", "en")
    name = os.path.splitext(os.path.basename(args.script))[0]
    out = args.out or os.path.join("out", f"{name}{'_icons' if args.icons else ''}.mp4")
    workdir = os.path.join("out", f"{name}_audio")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    alignments = None if args.no_tts or args.still is not None else tts.synthesize(script, workdir)
    have_audio = alignments is not None
    if args.require_tts and not have_audio:
        sys.exit("ナレーションを作れませんでした")
    durations = scene_durations(script, workdir, have_audio)
    timeline = Timeline(script, durations, alignments, icon_mode=args.icons)
    if not args.icons:
        prepare_art(script)
    scale = 0.5 if args.preview else 1.0
    fps = 15 if args.preview else args.fps
    r = Renderer(script, scale=scale, icon_mode=args.icons)

    if args.still is not None:
        png = out.replace(".mp4", f"_{args.still:.1f}s.png")
        r.frame(args.still, timeline)
        r.surface.write_to_png(png)
        print(png)
        return

    silent = out.replace(".mp4", "_video.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgra",
                           "-s", f"{r.w}x{r.h}", "-r", str(fps), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                           "-pix_fmt", "yuv420p", silent], stdin=subprocess.PIPE)
    n = int(timeline.total * fps)
    t0 = time.time()
    for k in range(n):
        ff.stdin.write(r.frame(k / fps, timeline))
        if k % (fps * 5) == 0:
            print(f"  {k}/{n} フレーム ({time.time() - t0:.0f}s)", file=sys.stderr)
    ff.stdin.close()
    ff.wait()

    sfx_wav = os.path.join(workdir, "sfx.wav")
    os.makedirs(workdir, exist_ok=True)
    sfx.render_track(timeline.sfx, timeline.total, sfx_wav)
    spec = script.get("music", {})
    bgm_path = prepare_bgm(script, workdir, timeline.total)
    audio = out.replace(".mp4", "_audio.m4a")
    mix_audio(workdir, durations, audio, sfx_wav, have_audio, bgm_path, spec.get("volume", 0.18) if spec else 0.18)
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", silent, "-i", audio, "-c:v", "copy",
                           "-c:a", "copy", "-shortest", "-movflags", "+faststart", out])
    os.remove(silent)
    os.remove(audio)
    write_srt(timeline, out.replace(".mp4", ".srt"))
    write_post(script, out.replace(".mp4", "_post.txt"))
    print(f"完成: {out} ({timeline.total:.1f}秒)")


if __name__ == "__main__":
    main()
