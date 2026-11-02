"""シーンごとのナレーション音声と文字タイムスタンプを生成する。

- ElevenLabs (有料の高品質音声)。残りクレジットが足りないときは自動で Kokoro に切り替える
- Kokoro (無料・Apache 2.0 のオープンソース音声合成。GitHub Actions 上で動かす)

一度作った音声は ~/.cache/geo_short/tts に内容のハッシュで保存し、作り直しでは再利用する
(クレジットを無駄にしない)。
"""
import base64
import hashlib
import json
import os
import shutil
import subprocess

import requests

DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"
DEFAULT_KOKORO_VOICE = "af_heart"  # Kokoro で一番品質評価の高い声
API = "https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps"
CACHE = os.path.expanduser("~/.cache/geo_short/tts")


def _texts(script):
    return [sc.get("tts", sc.get("narration", "")) for sc in script["scenes"]]


def _cache_key(engine, params, text):
    h = hashlib.sha256(json.dumps([engine, params, text], sort_keys=True, ensure_ascii=False).encode())
    return h.hexdigest()[:24]


def _cached(key):
    mp3, meta = os.path.join(CACHE, key + ".mp3"), os.path.join(CACHE, key + ".json")
    if os.path.exists(mp3) and os.path.exists(meta):
        with open(meta, encoding="utf-8") as f:
            return mp3, json.load(f).get("alignment")
    return None


def _store(key, mp3_src, alignment):
    os.makedirs(CACHE, exist_ok=True)
    shutil.copy(mp3_src, os.path.join(CACHE, key + ".mp3"))
    with open(os.path.join(CACHE, key + ".json"), "w", encoding="utf-8") as f:
        json.dump({"alignment": alignment}, f, ensure_ascii=False)


# ---------------------------------------------------------------- ElevenLabs

def _eleven_settings(voice):
    settings = {"stability": 0.5, "similarity_boost": 0.75, "style": 0.2,
                "use_speaker_boost": True, "speed": 1.08}
    settings.update(voice.get("settings", {}))
    return settings


def _eleven_remaining(key):
    """残りクレジット (文字数)。取得できなければ None。"""
    try:
        r = requests.get("https://api.elevenlabs.io/v1/user/subscription",
                         headers={"xi-api-key": key}, timeout=30)
        if r.status_code != 200:
            return None
        d = r.json()
        return d["character_limit"] - d["character_count"]
    except (requests.RequestException, KeyError, ValueError):
        return None


def _eleven(text, voice, key, out_mp3):
    r = requests.post(
        API.format(voice=voice.get("id", DEFAULT_VOICE)),
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        json={"text": text, "model_id": voice.get("model", "eleven_multilingual_v2"),
              "voice_settings": _eleven_settings(voice)},
        timeout=120,
    )
    if r.status_code != 200:
        raise RuntimeError(f"ElevenLabs エラー: {r.status_code} {r.text[:300]}")
    data = r.json()
    with open(out_mp3, "wb") as f:
        f.write(base64.b64decode(data["audio_base64"]))
    return data.get("alignment")


# ---------------------------------------------------------------- Kokoro

_kokoro = {}


def _kokoro_tts(text, voice, out_mp3, lang="en"):
    """Kokoro で読み上げ、単語の時刻から ElevenLabs と同じ形の alignment を作る。"""
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    code = "a" if lang == "en" else "j"
    if code not in _kokoro:
        _kokoro[code] = KPipeline(lang_code=code)
    pipe = _kokoro[code]
    name = voice.get("kokoro_voice", DEFAULT_KOKORO_VOICE)
    speed = voice.get("settings", {}).get("speed", 1.05)
    chunks, offset = [], 0.0
    starts = [None] * len(text)
    pos = 0
    for res in pipe(text, voice=name, speed=speed):
        audio = res.audio
        if audio is None:
            continue
        audio = audio.cpu().numpy() if hasattr(audio, "cpu") else np.asarray(audio)
        for tok in (getattr(res, "tokens", None) or []):
            if tok.start_ts is None or not tok.text.strip():
                continue
            i = text.find(tok.text, pos)
            if i < 0:
                continue
            for k in range(i, i + len(tok.text)):
                starts[k] = offset + tok.start_ts
            pos = i + len(tok.text)
        chunks.append(audio)
        offset += len(audio) / 24000
    wav = out_mp3[:-4] + ".wav"
    sf.write(wav, np.concatenate(chunks), 24000)
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", wav, "-b:a", "192k", out_mp3])
    os.remove(wav)
    # 時刻の無い文字 (句読点など) は直前の値で埋める
    last = 0.0
    for k in range(len(starts)):
        if starts[k] is None:
            starts[k] = last
        last = starts[k]
    return {"characters": list(text), "character_start_times_seconds": starts}


# ---------------------------------------------------------------- まとめ

def synthesize(script, workdir, engine=None):
    """各シーンの音声を workdir/scene_XX.mp3 に置き、alignment のリストを返す。

    使えるエンジンが無ければ None を返す (無音プレビュー用)。
    """
    voice = script.get("voice", {})
    engine = engine or os.getenv("GEO_TTS") or voice.get("engine", "auto")
    key = os.getenv("ELEVENLABS_API_KEY")
    texts = _texts(script)
    os.makedirs(workdir, exist_ok=True)

    if engine == "auto":
        engine = "kokoro"
        if key:
            eparams = [voice.get("id", DEFAULT_VOICE), voice.get("model"), _eleven_settings(voice)]
            need = sum(len(t) for t, sc in zip(texts, script["scenes"])
                       if not _cached(_cache_key("elevenlabs", eparams, t)))
            remaining = _eleven_remaining(key)
            if need == 0 or (remaining is not None and remaining >= need):
                engine = "elevenlabs"
            else:
                print(f"  ElevenLabs のクレジット不足 (必要 {need} / 残り {remaining})。Kokoro で読み上げます")
        if engine == "kokoro":
            try:
                import kokoro  # noqa: F401
            except ImportError:
                print("  Kokoro が入っていないため、ナレーション無しで書き出します")
                return None
    if engine == "elevenlabs" and not key:
        return None

    params = ([voice.get("id", DEFAULT_VOICE), voice.get("model"), _eleven_settings(voice)]
              if engine == "elevenlabs" else
              [voice.get("kokoro_voice", DEFAULT_KOKORO_VOICE), voice.get("settings", {}).get("speed", 1.05)])
    print(f"  ナレーション: {engine}")
    alignments = []
    for i, (text, sc) in enumerate(zip(texts, script["scenes"])):
        mp3 = os.path.join(workdir, f"scene_{i:02d}.mp3")
        ck = _cache_key(engine, params, text)
        hit = _cached(ck)
        if hit:
            shutil.copy(hit[0], mp3)
            al = hit[1]
        else:
            if engine == "elevenlabs":
                al = _eleven(text, voice, key, mp3)
            else:
                al = _kokoro_tts(text, voice, mp3, script.get("lang", "en"))
            _store(ck, mp3, al)
            print(f"  ナレーション生成: scene {i}")
        # 読み上げ専用テキスト (tts) を使った場合は字幕と文字が一致しないので時刻は使わない
        alignments.append(al if "tts" not in sc else None)
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
