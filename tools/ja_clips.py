"""日本語の心理学ショートを、手元の映像の切り抜きで仕上げる (このコンテナの中だけで書き出す)。

CI の --voice-only で作った声 (<名前>_voice.m4a) と字幕の時刻 (<名前>_props.json) に、
ユーザーが用意した映像を 2〜3 秒ごとに切り替えて重ねる。映像はリポジトリに入れない (公開リポジトリのため)。

使い方:
    python tools/ja_clips.py deliver/jp/psych_5_ja_props.json deliver/jp/psych_5_ja_voice.m4a clips/*.mp4 -o deliver/jp/psych_5_ja_hq.mp4
"""
import argparse
import json
import os
import random
import shutil
import subprocess

ROOT = os.path.join(os.path.dirname(__file__), "..")
REMOTION = os.path.join(ROOT, "remotion")


def duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("props")
    ap.add_argument("voice")
    ap.add_argument("clips", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--cut", type=float, default=2.6, help="1 カットのだいたいの長さ (秒)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--scale", type=float, default=1.0, help="確認用に小さく書き出すとき 0.5")
    args = ap.parse_args()

    with open(args.props, encoding="utf-8") as f:
        props = json.load(f)
    job = os.path.join(REMOTION, "public", "job")
    shutil.rmtree(job, ignore_errors=True)
    os.makedirs(job)
    for f in os.listdir(os.path.join(ROOT, "fonts")):
        if f.startswith("Poppins"):
            shutil.copy(os.path.join(ROOT, "fonts", f), job)

    # 映像は音を消し、30fps の扱いやすい形にそろえて job/ に置く
    clips = []
    for k, c in enumerate(args.clips):
        dst = os.path.join(job, f"c{k}.mp4")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", c, "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
                        "-crf", "18", "-pix_fmt", "yuv420p", dst], check=True)
        clips.append((os.path.basename(dst), duration(dst)))
    print(f"映像 {len(clips)} 本")

    # 場面ごとに 2〜3 秒のカットに分け、映像を順番に (同じものが続かないように) 当てる
    rnd = random.Random(args.seed)
    order = list(range(len(clips)))
    rnd.shuffle(order)
    plan, q = [], 0
    for s in props["scenes"]:
        n = max(1, round(s["dur"] / args.cut))
        for j in range(n):
            st = s["start"] + s["dur"] * j / n
            d = s["dur"] / n
            src, cd = clips[order[q % len(order)]]
            q += 1
            if q % len(order) == 0:
                rnd.shuffle(order)
            fr = rnd.uniform(0, max(0.0, cd - d - 0.1))
            plan.append({"src": src, "start": round(st, 3), "dur": round(d + 1 / 30, 3), "from": round(fr, 3),
                         "zoom": 1.0 + 0.04 * rnd.random()})
    props["clips"] = plan

    # 声は -14 LUFS にそろえる (1 回で loudnorm すると小さめになるので、測ってから音量を足し、ピークは抑える)
    log = subprocess.run(["ffmpeg", "-v", "info", "-i", args.voice, "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    lufs = float(log.split("Integrated loudness:")[1].split("I:")[1].split("LUFS")[0])
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", args.voice, "-af",
                    f"volume={-13.4 - lufs:.2f}dB,alimiter=limit=0.85:level=false", "-ar", "48000",
                    "-c:a", "aac", "-b:a", "192k", os.path.join(job, "audio.m4a")], check=True)
    props["audio"] = "audio.m4a"
    with open(os.path.join(REMOTION, "props.json"), "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)

    browser = subprocess.check_output("ls -d /opt/pw-browsers/chromium_headless_shell-*/*/chrome-headless-shell | head -1",
                                      shell=True, text=True).strip()
    raw = os.path.abspath(args.out + ".raw.mp4")
    cmd = ["npx", "remotion", "render", "src/index.ts", "Cosmic", raw, "--props=props.json", "--concurrency=100%",
           f"--scale={args.scale}", "--log=error"]
    if browser:
        cmd.append(f"--browser-executable={browser}")
    subprocess.run(cmd, cwd=REMOTION, check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw, "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "9M",
                    "-bufsize", "18M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "copy", args.out], check=True)
    os.remove(raw)
    print(f"書き出し: {args.out}")


if __name__ == "__main__":
    main()
