import os
import requests

# GitHub SecretsからAPIキーを取得
API_KEY = os.getenv("ELEVENLABS_API_KEY")

# パラメータ設定
VOICE_ID = "pNInz6obpgDQGcFmaJgB"  # ボイスID
TEXT = """There is a patch of desert in Africa that no country on Earth wants. It's called Bir Tawil: about two thousand square kilometers of sand and rock between Egypt and Sudan. In 1899, the British drew a straight border along the twenty-second parallel. But in 1902, they drew a second, administrative line that bent around the grazing lands of local tribes. Here's the catch. Under the first line, the Halaib Triangle on the Red Sea coast belongs to Egypt. Under the second, it belongs to Sudan. Both countries want Halaib, so each insists on the line that gives it to them, and each of those lines hands Bir Tawil to the other side. Claiming Bir Tawil would mean giving up Halaib, a territory ten times larger. So nobody does. In 2014, an American farmer planted a flag there so that his daughter could become a real princess. No government recognized it. Bir Tawil remains one of the last unclaimed lands on Earth."""

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
