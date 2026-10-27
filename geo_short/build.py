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

from . import bgm, sfx, tts
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


def mix_audio(workdir, durations, out_path, sfx_wav, have_voice, bgm_path=None, bgm_volume=0.22):
    """ナレーション + 効果音 + BGM を 1 本にする。

    BGM はナレーション中だけ自動で下がり (サイドチェイン)、最後に -14 LUFS に揃える。
    """
    inputs, filters = [], []
    total = sum(durations)
    if have_voice:
        for i, d in enumerate(durations):
            inputs += ["-i", os.path.join(workdir, f"scene_{i:02d}.mp3")]
            filters.append(f"[{i}:a]aresample=44100,apad=whole_dur={d:.3f}[a{i}]")
        n = len(durations)
        filters.append("".join(f"[a{i}]" for i in range(n)) +
                       f"concat=n={n}:v=0:a=1,aformat=channel_layouts=stereo,asplit=2[voice][key]")
    k = len(inputs) // 2
    inputs += ["-i", sfx_wav]
    filters.append(f"[{k}:a]aresample=44100,aformat=channel_layouts=stereo[fx]")
    mix = (["[voice]"] if have_voice else []) + ["[fx]"]
    if bgm_path:
        inputs += ["-stream_loop", "-1", "-i", bgm_path]
        filters.append(f"[{k + 1}:a]aresample=44100,aformat=channel_layouts=stereo,"
                       f"volume={bgm_volume},atrim=0:{total:.3f},"
                       f"afade=t=out:st={max(total - 2, 0):.3f}:d=2[bg0]")
        if have_voice:
            filters.append("[bg0][key]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=400[bg]")
        else:
            filters.append("[bg0]anull[bg]")
        mix.append("[bg]")
    elif have_voice:
        filters.append("[key]anullsink")
    filters.append("".join(mix) + f"amix=inputs={len(mix)}:duration=longest:normalize=0,"
                   f"atrim=0:{total:.3f},loudnorm=I=-14:TP=-1.5:LRA=11[out]")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex",
                           ";".join(filters), "-map", "[out]", "-ar", "44100",
                           "-c:a", "aac", "-b:a", "192k", out_path])


def prepare_bgm(script, workdir, total, override=None):
    """BGM のファイルを用意する: --bgm 指定 > ElevenLabs Music > 合成 BGM。"""
    if override:
        return override
    spec = script.get("music", {})
    if spec is False or spec == "none":
        return None
    os.makedirs(workdir, exist_ok=True)
    mp3 = os.path.join(workdir, "bgm_elevenlabs.mp3")
    if tts.music(spec.get("prompt"), total, mp3):
        return mp3
    wav = os.path.join(workdir, "bgm_synth.wav")
    bgm.render(total, wav, bpm=spec.get("bpm", 98))
    print("  BGM: 合成 (ドキュメンタリー風)")
    return wav


def prepare_art(script):
    """台本に書かれた AI イラストを先にまとめて描いておく (失敗しても 3D アイコンで代用して続ける)。"""
    from .assets import AIArt
    art = AIArt(script.get("art_style"))
    jobs = [(ic["ai"], "cutout") for sc in script["scenes"] for ic in sc.get("icons", []) if ic.get("ai")]
    jobs += [(sc["card"]["ai"], "card") for sc in script["scenes"] if sc.get("card", {}).get("ai")]
    if not jobs:
        return
    if not art.provider:
        print("※ AI イラストのサービスが未設定のため、3D アイコンで代用します")
        return
    for prompt, kind in dict.fromkeys(jobs):
        try:
            art.prepare(prompt, kind)
        except Exception as e:  # noqa: BLE001 — 1 枚の失敗で動画全体を止めない
            print(f"  AI イラスト失敗 ({kind}): {prompt[:50]} -> {e}")


def write_post(script, path):
    """投稿用のタイトル・説明・ハッシュタグをテキストに書き出す。"""
    post = script.get("post")
    if not post:
        return
    lines = [post.get("title", script.get("title", "")), "", post.get("description", ""), "",
             " ".join(post.get("hashtags", []))]
    if post.get("pinned_comment"):
        lines += ["", "--- 固定コメント ---", post["pinned_comment"]]
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
    ap.add_argument("--require-tts", action="store_true", help="ナレーションを作れなければ失敗させる (CI 用)")
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
    if args.require_tts and not have_audio:
        sys.exit("ELEVENLABS_API_KEY が設定されていません (GitHub の Secrets を確認してください)")
    if not have_audio and args.still is None:
        print("※ ELEVENLABS_API_KEY が無いため無音で書き出します (尺は文字数から推定)")
    durations = scene_durations(script, workdir, have_audio)
    timeline = Timeline(script, durations, alignments)

    prepare_art(script)
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
    music = prepare_bgm(script, workdir, timeline.total, args.bgm)
    mix_audio(workdir, durations, audio, fx, have_audio, music,
              script.get("music", {}).get("volume", 0.22) if isinstance(script.get("music"), dict) else 0.22)
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", silent, "-i", audio,
                           "-c:v", "copy", "-c:a", "copy", "-shortest", out])
    for f in (silent, audio, fx):
        os.remove(f)
    write_post(script, out.replace(".mp4", "_post.txt"))
    print(f"完成: {out} ({timeline.total:.1f}秒)")


if __name__ == "__main__":
    main()
