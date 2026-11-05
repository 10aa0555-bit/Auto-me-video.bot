"""storyboard.json から 9:16 の簡易映像(無音 mp4)を組み立てる。

- 6クリップ x 10秒 + エンドカード1秒 = 61秒。
- 音声は付けない(ナレーションは後から手動で合わせる)。API キー不要。
- 各場面はシンプルな静止画(背景色 + 棒人間 + 英語字幕)で、字幕は後から声に合わせる目安。
"""
import json
import textwrap
from PIL import Image, ImageDraw, ImageFont

if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

from moviepy.editor import ImageClip, concatenate_videoclips

W, H, FPS = 1080, 1920, 24
INK = (20, 20, 20)

# クリップごとの背景色(夕方の金色→屋根の夕焼け→カフェ→玄関→中世→夜)
BG = {1: (222, 196, 150), 2: (232, 150, 110), 3: (214, 180, 140),
      4: (205, 170, 130), 5: (110, 90, 80), 6: (40, 50, 80)}

FONT_PATHS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]


def font(size):
    for p in FONT_PATHS:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def stickman(d, cx=540, top=820):
    d.ellipse([cx - 80, top, cx + 80, top + 160], fill=(255, 255, 255), outline=INK, width=8)
    d.line([(cx, top + 160), (cx, top + 500)], fill=INK, width=8)
    d.line([(cx - 120, top + 260), (cx + 120, top + 260)], fill=INK, width=8)
    d.line([(cx, top + 500), (cx - 100, top + 700)], fill=INK, width=8)
    d.line([(cx, top + 500), (cx + 100, top + 700)], fill=INK, width=8)
    d.rectangle([cx - 40, top + 190, cx + 40, top + 290], fill=(200, 40, 40))  # 赤いリュック


def frame(index, title, subtitle, end_card=None):
    img = Image.new("RGB", (W, H), BG[index])
    d = ImageDraw.Draw(img)
    # 白い線(国境)を地面に引く
    d.line([(0, 1560), (W, 1560)], fill=(255, 255, 255), width=14)
    if index != 5:
        stickman(d)
    d.text((60, 110), f"CLIP {index}/6  -  {title}", font=font(44), fill=INK)
    y = 1620
    for line in textwrap.wrap(subtitle, width=34):
        d.text((60, y), line, font=font(46), fill=(255, 255, 255), stroke_width=3, stroke_fill=INK)
        y += 62
    if end_card:
        d.rectangle([0, 760, W, 1060], fill=(0, 0, 0))
        d.text((60, 880), end_card, font=font(64), fill=(255, 255, 255))
    return img


with open("storyboard.json", encoding="utf-8") as f:
    sb = json.load(f)

clips = []
for c in sorted(sb["clips"], key=lambda c: c["index"]):
    path = f"scene{c['index']}.png"
    frame(c["index"], c["location"].split("(")[0], c["vo_en"]).save(path)
    clips.append(ImageClip(path).set_duration(c["end_sec"] - c["start_sec"]))

ec = sb["end_card"]
last = sorted(sb["clips"], key=lambda c: c["index"])[-1]
frame(last["index"], last["location"].split("(")[0], last["vo_en"], ec["overlay_en"]).save("scene_end.png")
clips.append(ImageClip("scene_end.png").set_duration(ec["end_sec"] - ec["start_sec"]))

video = concatenate_videoclips(clips, method="compose")
print(f"total duration: {video.duration}s")
video.write_videofile("final_output.mp4", fps=FPS, audio=False)
