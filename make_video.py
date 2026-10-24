import os
from PIL import Image
if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.Resampling.LANCZOS

from moviepy.editor import ImageClip, AudioFileClip, concatenate_videoclips

# 音声ファイルの読み込み
audio = AudioFileClip("narration.mp3")
total_duration = audio.duration  # 音声の全体尺を取得

# シーン数（6カット）と1カットあたりの時間を計算
num_scenes = 6
scene_duration = total_duration / num_scenes

clips = []
# scene1.png ～ scene6.png を順番に読み込んで繋げる
for i in range(1, num_scenes + 1):
    img_path = f"scene{i}.png"
    
    # 画像が存在しない場合のフォールバック（黒背景など）
     # 画像が存在しない場合は自動で生成する
    if not os.path.exists(img_path):
        img = Image.new("RGB", (1080, 1920), color=(20, 20, 20))
        img.save(img_path)
        
    clip = ImageClip(img_path).set_duration(scene_duration)
    clips.append(clip)
    
    clips.append(clip)

# 画像クリップを連結して音声をセット
video = concatenate_videoclips(clips, method="compose")
final_video = video.set_audio(audio)

# ショート動画サイズ (1080x1920) にリサイズして出力
final_video = final_video.resize((1080, 1920))
final_video.write_videofile("final_output.mp4", fps=24, codec="libx264", audio_codec="aac")

print("動画の結合が完了しました: final_output.mp4")
