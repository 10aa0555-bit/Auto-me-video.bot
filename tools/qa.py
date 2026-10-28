"""書き出した MP4 の品質検査。結果を Markdown で出し、代表フレームを並べた画像を作る。

使い方: python tools/qa.py out/look_better_en.mp4 [--grid out/look_better_en_grid.jpg]
"""
import argparse
import json
import re
import subprocess


def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                   "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration",
                                   "-of", "json", path])
    return json.loads(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--grid")
    args = ap.parse_args()
    p = probe(args.video)
    v = next(s for s in p["streams"] if s["codec_type"] == "video")
    a = next((s for s in p["streams"] if s["codec_type"] == "audio"), None)
    dur = float(p["format"]["duration"])
    num, den = map(int, v["r_frame_rate"].split("/"))
    fps = num / den

    # 最後まで読めるか (デコードエラー)
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", args.video, "-f", "null", "-"],
                         capture_output=True, text=True).stderr.strip()
    black = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", subprocess.run(
        ["ffmpeg", "-i", args.video, "-vf", "blackdetect=d=0.3:pix_th=0.08", "-an", "-f", "null", "-"],
        capture_output=True, text=True).stderr)
    silence = re.findall(r"silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)", subprocess.run(
        ["ffmpeg", "-i", args.video, "-af", "silencedetect=n=-45dB:d=1.2", "-vn", "-f", "null", "-"],
        capture_output=True, text=True).stderr)
    loud = subprocess.run(["ffmpeg", "-i", args.video, "-af", "loudnorm=print_format=json", "-vn", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    lufs = re.search(r'"input_i" : "([-\d.]+)"', loud)
    peak = re.search(r'"input_tp" : "([-\d.]+)"', loud)

    checks = [
        ("解像度 1080x1920", v["width"] == 1080 and v["height"] == 1920, f"{v['width']}x{v['height']}"),
        ("フレームレート 30fps", abs(fps - 30) < 0.1, f"{fps:.2f}fps"),
        ("尺 30〜45 秒", 30 <= dur <= 45.5, f"{dur:.1f}秒"),
        ("音声あり (AAC)", a is not None and a["codec_name"] == "aac", a["codec_name"] if a else "なし"),
        ("最後までデコードできる", not dec, dec[:200] or "エラーなし"),
        ("黒画面 (0.3 秒以上) が無い", not black, ", ".join(f"{s}-{e}s" for s, e in black) or "なし"),
        ("無音 (1.2 秒以上) が無い", not silence, ", ".join(f"{s}-{e}s" for s, e in silence) or "なし"),
        ("音量 -14 LUFS 前後", lufs and abs(float(lufs.group(1)) + 14) <= 1.5,
         f"{lufs.group(1) if lufs else '?'} LUFS / ピーク {peak.group(1) if peak else '?'} dBTP"),
    ]
    print(f"## 品質検査: {args.video}\n")
    for name, ok, detail in checks:
        print(f"- {'✅' if ok else '❌'} {name}: {detail}")

    if args.grid:
        n = 12
        times = [dur * (k + 0.5) / n for k in range(n)]
        tiles = []
        for k, t in enumerate(times):
            f = f"/tmp/qa_{k}.png"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", args.video,
                            "-frames:v", "1", "-vf", "scale=270:480", f], check=True)
            tiles.append(f)
        subprocess.run(["ffmpeg", "-y", "-v", "error", *sum([["-i", f] for f in tiles], []),
                        "-filter_complex", "".join(f"[{k}:v]" for k in range(n)) + f"xstack=inputs={n}:layout=" +
                        "|".join(f"{(k % 6) * 270}_{(k // 6) * 480}" for k in range(n)),
                        "-frames:v", "1", "-q:v", "3", args.grid], check=True)
        print(f"\n代表フレーム: {args.grid}")


if __name__ == "__main__":
    main()
