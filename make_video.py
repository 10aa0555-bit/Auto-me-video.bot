import os
import json
from PIL import Image, ImageDraw

if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

from moviepy.editor import ImageClip, AudioFileClip, concatenate_videoclips

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
        config = scene_configs[i - 1]
        genre = config["genre"]
        bg_color = tuple(config["bg"])
        
        img = Image.new("RGB", (1080, 1920), color=bg_color)
        d = ImageDraw.Draw(img)
        
        # 【固定】スティックマン描画
        d.ellipse([460, 750, 620, 910], outline=(20, 20, 20), width=8)
        d.line([(540, 910), (540, 1250)], fill=(20, 20, 20), width=8)
        d.line([(420, 1010), (660, 1010)], fill=(20, 20, 20), width=8)
        d.line([(540, 1250), (440, 1450)], fill=(20, 20, 20), width=8)
        d.line([(540, 1250), (640, 1450)], fill=(20, 20, 20), width=8)
        
        # ジャンル別パーツ
        if genre == "industrial":
            d.rectangle([460, 710, 620, 760], fill=(20, 20, 20))
            d.rectangle([490, 850, 590, 900], fill=(240, 240, 240))
        elif genre == "aristocrat":
            d.rectangle([440, 650, 640, 750], fill=(20, 20, 20))
            d.rectangle([410, 730, 670, 750], fill=(20, 20, 20))
        elif genre == "modern":
            pass

        d.text((80, 200), config["text"], fill=(255, 255, 255))
        
        img.save(img_path)
        
    clip = ImageClip(img_path).set_duration(scene_duration)
    clips.append(clip)

final_video = concatenate_videoclips(clips, method="compose")

if audio:
    final_video = final_video.set_audio(audio)

final_video.write_videofile("final_output.mp4", fps=60)
