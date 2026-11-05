"""VOICEVOX (無料の日本語音声合成) で読み上げる。CI では Docker の voicevox_engine を立てて使う。

使う声の利用規約: 動画の説明欄などに「VOICEVOX:<キャラクター名>」のクレジットを書く。
"""
import io
import os
import wave

import requests

URL = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021")


def speaker_id(name, style="ノーマル"):
    """キャラクター名とスタイル名から speaker id を探す (id は版によって変わることがあるため)。"""
    for sp in requests.get(f"{URL}/speakers", timeout=30).json():
        if sp["name"] == name:
            for st in sp["styles"]:
                if st["name"] == style:
                    return st["id"]
            return sp["styles"][0]["id"]
    raise RuntimeError(f"VOICEVOX に {name} の声がありません")


def query(text, speaker):
    r = requests.post(f"{URL}/audio_query", params={"text": text, "speaker": speaker}, timeout=60)
    r.raise_for_status()
    return r.json()


def mora_count(text, speaker):
    """読みのモーラ数 (間 (、) は数えない)。字幕の切れ目の時刻を割り当てるのに使う。"""
    return sum(len(ap["moras"]) for ap in query(text, speaker)["accent_phrases"])


def synth(text, speaker, speed=1.0, pitch=0.0, intonation=1.0):
    """読み上げて (wav のバイト列, 各モーラの開始秒のリスト, 全体の秒数) を返す。"""
    q = query(text, speaker)
    q.update({"speedScale": speed, "pitchScale": pitch, "intonationScale": intonation,
              "prePhonemeLength": 0.05, "postPhonemeLength": 0.12})
    r = requests.post(f"{URL}/synthesis", params={"speaker": speaker}, json=q, timeout=180)
    r.raise_for_status()
    wav = r.content
    with wave.open(io.BytesIO(wav)) as w:
        dur = w.getnframes() / w.getframerate()
    # audio_query の長さは等速のもの。最後に実際の音の長さに合わせて伸び縮みさせる
    t = q["prePhonemeLength"]
    starts = []
    for ap in q["accent_phrases"]:
        for m in ap["moras"]:
            starts.append(t)
            t += (m.get("consonant_length") or 0) + m["vowel_length"]
        if ap.get("pause_mora"):
            t += ap["pause_mora"]["vowel_length"]
    t += q["postPhonemeLength"]
    k = dur / t if t else 1.0
    return wav, [s * k for s in starts], dur
