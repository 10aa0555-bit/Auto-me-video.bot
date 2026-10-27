"""ElevenLabs でシーンごとのナレーション音声と文字タイムスタンプを生成する。"""
import base64
import json
import os

import requests

DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"
API = "https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps"


def synthesize(script, workdir):
    """各シーンの音声を workdir/scene_XX.mp3 に保存し、alignment のリストを返す。

    API キーが無い場合は None を返す (無音プレビュー用)。
    """
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        return None
    voice = script.get("voice", {})
    voice_id = voice.get("id", DEFAULT_VOICE)
    settings = {
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.2,
        "use_speaker_boost": True,
        "speed": 1.08,
    }
    settings.update(voice.get("settings", {}))
    os.makedirs(workdir, exist_ok=True)
    alignments = []
    for i, sc in enumerate(script["scenes"]):
        mp3 = os.path.join(workdir, f"scene_{i:02d}.mp3")
        meta = os.path.join(workdir, f"scene_{i:02d}.json")
        # 読み上げ専用テキスト (tts) があればそちらを使う。字幕は narration のまま
        text = sc.get("tts", sc.get("narration", ""))
        if os.path.exists(mp3) and os.path.exists(meta):
            with open(meta, encoding="utf-8") as f:
                cached = json.load(f)
            if cached.get("text") == text:
                alignments.append(cached.get("alignment") if "tts" not in sc else None)
                continue
        r = requests.post(
            API.format(voice=voice_id),
            headers={"xi-api-key": key, "Content-Type": "application/json"},
            json={"text": text, "model_id": voice.get("model", "eleven_multilingual_v2"),
                  "voice_settings": settings},
            timeout=120,
        )
        if r.status_code != 200:
            raise RuntimeError(f"ElevenLabs エラー (scene {i}): {r.status_code} {r.text[:300]}")
        data = r.json()
        with open(mp3, "wb") as f:
            f.write(base64.b64decode(data["audio_base64"]))
        al = data.get("alignment")
        with open(meta, "w", encoding="utf-8") as f:
            json.dump({"text": text, "alignment": al}, f, ensure_ascii=False)
        alignments.append(al if "tts" not in sc else None)
        print(f"  ナレーション生成: scene {i}")
    return alignments


def music(prompt, seconds, path):
    """ElevenLabs Music で BGM を作る。使えなければ False (呼び出し側で合成 BGM に切り替え)。"""
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key or not prompt:
        return False
    if os.path.exists(path) and os.path.exists(path + ".prompt"):
        with open(path + ".prompt", encoding="utf-8") as f:
            if f.read() == f"{prompt}|{seconds:.0f}":
                return True
    try:
        r = requests.post(
            "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
            headers={"xi-api-key": key, "Content-Type": "application/json"},
            json={"prompt": prompt, "music_length_ms": int(seconds * 1000) + 2000,
                  "force_instrumental": True},
            timeout=300,
        )
    except requests.RequestException as e:
        print(f"  ElevenLabs Music に接続できません ({e})。合成 BGM を使います")
        return False
    if r.status_code != 200 or not r.headers.get("content-type", "").startswith("audio"):
        print(f"  ElevenLabs Music が使えません ({r.status_code} {r.text[:200]})。合成 BGM を使います")
        return False
    with open(path, "wb") as f:
        f.write(r.content)
    with open(path + ".prompt", "w", encoding="utf-8") as f:
        f.write(f"{prompt}|{seconds:.0f}")
    print("  BGM 生成: ElevenLabs Music")
    return True
