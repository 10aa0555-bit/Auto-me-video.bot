import os
from PIL import Image, ImageDraw

# 古いPillowとの互換性対応（エラー防止用）
if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

from moviepy.editor import ImageClip, AudioFileClip, concatenate_videoclips

# 1. 音声ファイルの読み込みと全体の尺（時間）の計算
audio = AudioFileClip("narration.mp3")
total_duration = audio.duration
num_scenes = 6
scene_duration = total_duration / num_scenes

clips = []

# 2. シーンごとのジャンルや演出設定（ここで服・背景・小道具を切り替える）
scene_configs = [
    {"genre": "industrial", "bg": (160, 140, 120), "text": "産業革命の足音"},
    {"genre": "industrial", "bg": (150, 130, 110), "text": "街を覆う煙と病"},
    {"genre": "aristocrat", "bg": (70, 60, 50),   "text": "貴族たちの企み"},
    {"genre": "aristocrat", "bg": (60, 50, 40),   "text": "密室の契約書"},
    {"genre": "modern",     "bg": (30, 40, 50),   "text": "現代への教訓"},
    {"genre": "modern",     "bg": (20, 30, 40),   "text": "マインドを変えろ"},
]

# 3. シーンごとに画像を自動生成してクリップを作成するループ
for i in range(1, num_scenes + 1):
    img_path = f"scene{i}.png"
    
    # 画像ファイルが存在しない場合のみ、自動で描画して作成する
    if not os.path.exists(img_path):
        config = scene_configs[i - 1]
        genre = config["genre"]
        
        # 3-1. 背景の描画（セピア調やテーマカラー）
        img = Image.new("RGB", (1080, 1920), color=config["bg"])
        d = ImageDraw.Draw(img)
        
        # 3-2. 【固定】基本のスティックマンを描画（頭、体、手足）
        # 頭（円）
        d.ellipse([460, 750, 620, 910], outline=(20, 20, 20), width=8)
        # 体（縦線）
        d.line([(540, 910), (540, 1250)], fill=(20, 20, 20), width=8)
        # 腕（横線）
        d.line([(420, 1010), (660, 1010)], fill=(20, 20, 20), width=8)
        # 脚（斜め線）
        d.line([(540, 1250), (440, 1450)], fill=(20, 20, 20), width=8)
        d.line([(540, 1250), (640, 1450)], fill=(20, 20, 20), width=8)
        
        # 3-3. 【ジャンル別】服・帽子・小道具のカスタマイズ
        if genre == "industrial":
            # 産業革命風：ハンチング帽やマスク（ハンカチ）を追加
            d.rectangle([460, 710, 620, 760], fill=(20, 20, 20)) # 帽子
            d.rectangle([490, 850, 590, 900], fill=(240, 240, 240)) # マスク
        elif genre == "aristocrat":
            # 貴族風：シルクハットを追加
            d.rectangle([440, 650, 640, 750], fill=(20, 20, 20))
            d.rectangle([410, 730, 670, 750], fill=(20, 20, 20)) # つば
        elif genre == "modern":
            # 現代・自己啓発風：シンプルにスタイリッシュなアクセント
            pass

        # 3-4. シーンごとの字幕テキストを描画
        d.text((80, 200), config["text"], fill=(255, 255, 255))
        
        img.save(img_path)
        
    clip = ImageClip(img_path).set_duration(scene_duration)
    clips.append(clip)

# 4. すべてのクリップを結合し、音声を合わせて60fpsで動画として書き出し
final_video = concatenate_videoclips(clips, method="compose")
final_video = final_video.set_audio(audio)
final_video.write_videofile("final_output.mp4", fps=60)
