import os
import json
from PIL import Image, ImageDraw, ImageFont

if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

from moviepy.editor import ImageClip, AudioFileClip, concatenate_videoclips

W, H = 1080, 1920
INK = (20, 20, 20)

# 日本語が表示できるフォントを探す（Actionsでは fonts-noto-cjk を入れる）
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wrap_text(d, text, font, max_width):
    # 日本語は単語区切りがないので1文字ずつ折り返す
    lines, line = [], ""
    for ch in text:
        if d.textlength(line + ch, font=font) > max_width and line:
            lines.append(line)
            line = ch
        else:
            line += ch
    if line:
        lines.append(line)
    return lines


def draw_caption(d, text):
    font = load_font(84)
    y = 220
    # script.json 側の "\n" で意味の切れ目に改行できる
    lines = [l for part in text.split("\n") for l in wrap_text(d, part, font, W - 160)]
    for line in lines:
        x = (W - d.textlength(line, font=font)) / 2
        d.text((x, y), line, font=font, fill=(255, 255, 255),
               stroke_width=6, stroke_fill=INK)
        y += 110


def draw_stickman(d, cx=540, top=750):
    d.ellipse([cx - 80, top, cx + 80, top + 160], outline=INK, width=8)
    d.line([(cx, top + 160), (cx, top + 500)], fill=INK, width=8)
    d.line([(cx - 120, top + 260), (cx + 120, top + 260)], fill=INK, width=8)
    d.line([(cx, top + 500), (cx - 100, top + 700)], fill=INK, width=8)
    d.line([(cx, top + 500), (cx + 100, top + 700)], fill=INK, width=8)


def draw_pith_helmet(d, cx=540, top=750):
    d.chord([cx - 90, top - 50, cx + 90, top + 90], 180, 360, fill=(235, 225, 195), outline=INK, width=6)
    d.rectangle([cx - 130, top + 15, cx + 130, top + 35], fill=(235, 225, 195), outline=INK, width=6)


def draw_dunes(d, bg):
    shade = tuple(max(c - 30, 0) for c in bg)
    d.ellipse([-300, 1500, 700, 2300], fill=shade)
    d.ellipse([400, 1580, 1500, 2400], fill=shade)


# --- 地図（模式図）---
# 北緯22度線を y=1000、紅海を右側に置いた簡略図
PARALLEL_Y = 1000
BIR_TAWIL = [(240, 1000), (560, 1000), (560, 1130), (240, 1130)]
HALAIB = [(640, 1000), (860, 1000), (860, 840)]
LINE_1902 = [(100, 1000), (240, 1000), (240, 1130), (560, 1130), (560, 1000),
             (640, 1000), (860, 840)]


def draw_map_base(d):
    d.rectangle([100, 600, 860, 1400], fill=(232, 210, 165), outline=INK, width=6)
    d.rectangle([860, 600, 980, 1400], fill=(70, 130, 180), outline=INK, width=6)
    font = load_font(44)
    d.text((880, 1180), "紅\n海", font=font, fill=(255, 255, 255), spacing=8)
    d.text((140, 640), "エジプト", font=font, fill=INK)
    d.text((140, 1320), "スーダン", font=font, fill=INK)


def draw_dashed(d, y, x0, x1, color, width=6, dash=30):
    x = x0
    while x < x1:
        d.line([(x, y), (min(x + dash, x1), y)], fill=color, width=width)
        x += dash * 2


def draw_regions(d, halaib_fill, tawil_fill):
    d.polygon(HALAIB, fill=halaib_fill, outline=INK)
    d.polygon(BIR_TAWIL, fill=tawil_fill, outline=INK)
    small = load_font(36)
    d.text((660, 940), "ハライブ", font=small, fill=INK)
    d.text((260, 1045), "ビル・タウィール", font=small, fill=INK)


def draw_map1899(d):
    draw_map_base(d)
    draw_regions(d, (230, 140, 60), (232, 210, 165))
    d.line([(100, PARALLEL_Y), (860, PARALLEL_Y)], fill=(200, 30, 30), width=10)
    d.text((120, 1430), "赤＝1899年の国境（北緯22度）", font=load_font(48), fill=INK)


def draw_map1902(d):
    draw_map_base(d)
    draw_regions(d, (90, 150, 90), (230, 140, 60))
    draw_dashed(d, PARALLEL_Y, 100, 860, (200, 30, 30))
    d.line(LINE_1902, fill=(30, 60, 200), width=10, joint="curve")
    d.text((120, 1430), "青＝1902年の行政境界", font=load_font(48), fill=INK)


def draw_dispute(d):
    draw_map_base(d)
    draw_regions(d, (240, 190, 40), (160, 160, 160))
    draw_dashed(d, PARALLEL_Y, 100, 860, (200, 30, 30))
    d.line(LINE_1902, fill=(30, 60, 200), width=10, joint="curve")
    d.text((355, 1140), "？", font=load_font(90), fill=(200, 30, 30))
    font = load_font(46)
    d.text((120, 1430), "ハライブ 約20,580km²", font=font, fill=INK)
    d.text((120, 1500), "ビル・タウィール 約2,060km²", font=font, fill=INK)


def draw_unclaimed(d):
    draw_map_base(d)
    draw_regions(d, (232, 210, 165), (255, 255, 255))
    d.rectangle([240, 1000, 560, 1130], outline=(250, 210, 60), width=12)
    d.text((120, 1430), "どの国にも属さない 約2,060km²", font=load_font(48), fill=(255, 255, 255))


def draw_flag(d):
    draw_stickman(d)
    draw_pith_helmet(d)
    # 右手に旗
    d.line([(660, 1010), (760, 1010)], fill=INK, width=8)
    d.line([(760, 760), (760, 1450)], fill=INK, width=10)
    d.rectangle([760, 760, 960, 880], fill=(30, 90, 170), outline=INK, width=6)
    d.polygon([(860, 790), (880, 840), (840, 840)], fill=(250, 220, 60))


def draw_scene(config):
    bg = tuple(config["bg"])
    img = Image.new("RGB", (W, H), color=bg)
    d = ImageDraw.Draw(img)
    genre = config["genre"]

    maps = {"map1899": draw_map1899, "map1902": draw_map1902,
            "dispute": draw_dispute, "unclaimed": draw_unclaimed}
    if genre in maps:
        maps[genre](d)
    else:
        if genre in ("explorer", "flag"):
            draw_dunes(d, bg)
            d.ellipse([820, 520, 980, 680], fill=(250, 210, 80))
        if genre == "flag":
            draw_flag(d)
        else:
            draw_stickman(d)
        # 【既存】ジャンル別パーツ
        if genre == "industrial":
            d.rectangle([460, 710, 620, 760], fill=INK)
            d.rectangle([490, 850, 590, 900], fill=(240, 240, 240))
        elif genre == "aristocrat":
            d.rectangle([440, 650, 640, 750], fill=INK)
            d.rectangle([410, 730, 670, 750], fill=INK)
        elif genre == "explorer":
            draw_pith_helmet(d)
        elif genre == "modern":
            pass

    draw_caption(d, config["text"])
    return img


# 音声ファイルがある場合は読み込む、なければ全体で60秒（1分）にする
audio_path = "narration.mp3"
if os.path.exists(audio_path):
    audio = AudioFileClip(audio_path)
    total_duration = audio.duration
else:
    audio = None
    total_duration = 60.0

with open("script.json", "r", encoding="utf-8") as f:
    script_data = json.load(f)

scene_configs = script_data["scenes"]
num_scenes = len(scene_configs)
scene_duration = total_duration / num_scenes

clips = []

for i in range(1, num_scenes + 1):
    img_path = f"scene{i}.png"

    if not os.path.exists(img_path):
        draw_scene(scene_configs[i - 1]).save(img_path)

    clip = ImageClip(img_path).set_duration(scene_duration)
    clips.append(clip)

final_video = concatenate_videoclips(clips, method="compose")

if audio:
    final_video = final_video.set_audio(audio)

final_video.write_videofile("final_output.mp4", fps=60)
