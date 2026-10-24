import os
import requests

# GitHub SecretsからAPIキーを取得
API_KEY = os.getenv("ELEVENLABS_API_KEY")

# パラメータ設定
VOICE_ID = "pNInz6obpgDQGcFmaJgB"  # ボイスID
TEXT = """In the summer of 1858, London was paralyzed not by war, but by the overwhelming stench of the heavily polluted River Thames. The Industrial Revolution brought wealth, but also unparalleled sewage that festered directly outside the windows of the nation’s leaders. Desperate, Parliament finally funded Joseph Bazalgette's radical new solution: to trap the waste underground and move it far away. Bazalgette led a massive workforce of tens of thousands, excavating huge subterranean networks of brick intercepting sewers. This vast new infrastructure intercepted the flow and pumped it through hundreds of miles of sewer tunnels. By sealing the filth below ground, Bazalgette permanently transformed public health, ensuring a clean London and saving countless lives."""

url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

headers = {
    "Accept": "audio/mpeg",
    "Content-Type": "application/json",
    "xi-api-key": API_KEY
}

data = {
    "text": TEXT,
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
        "stability": 0.55,
        "similarity_boost": 0.75,
        "style": 0.0,
        "use_speaker_boost": True,
        "speed": 0.95
    }
}

response = requests.post(url, json=data, headers=headers)

if response.status_code == 200:
    with open("narration.mp3", "wb") as f:
        f.write(response.content)
    print("音声ファイルの生成に成功しました: narration.mp3")
else:
    print(f"エラーが発生しました: {response.status_code}, {response.text}")
