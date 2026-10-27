# geo_short — 地図アニメの地理ショート自動生成

台本 JSON を書くだけで、地図のズーム／国の塗り替え／年号／矢印／字幕付きの縦型ショート (1080x1920) を生成します。
ナレーションは ElevenLabs (`ELEVENLABS_API_KEY`) で生成し、字幕は音声のタイムスタンプに同期します。キーが無ければ無音で書き出します。

```bash
pip install -r geo_short/requirements.txt          # + ffmpeg, 日本語フォント (fonts-noto-cjk 推奨)
python -m geo_short.build scripts/kaliningrad.json                  # out/kaliningrad.mp4
python -m geo_short.build scripts/kaliningrad.json --preview        # 低解像度で素早く確認
python -m geo_short.build scripts/kaliningrad.json --still 20       # 20 秒地点を PNG で確認
python -m geo_short.build scripts/kaliningrad.json --bgm bgm.mp3    # BGM を薄く敷く
```

GitHub Actions の「Geo Short Video」を手動実行しても作れます (Secrets に `ELEVENLABS_API_KEY` が必要)。

## 台本の書き方

トップレベル:

| キー | 内容 |
|---|---|
| `voice` | `{"id": ElevenLabs のボイス ID, "model": ..., "settings": {...}}` |
| `regions` | 現在の国境に無い地域を `[[経度, 緯度], ...]` で定義 (例: 東プロイセン南部) |
| `scenes` | シーンの配列 (下表) |

シーン (1 シーン = ナレーション 1〜2 文):

| キー | 内容 |
|---|---|
| `narration` | ナレーション兼字幕 |
| `tts` | 読み上げだけ変えたい時 (数字の読み・固有名詞など) |
| `camera` | `{"center": [経度, 緯度], "span": 画面幅の経度}`。省略で前シーンのまま |
| `fill` | `{"国": "#色"}`。`null` で元に戻す。塗りは次のシーンにも引き継がれる |
| `reset_fills` | `true` で塗りを全消去 |
| `outline` | 光る輪郭で強調する国のリスト |
| `labels` | `[{"text", "at": [経度, 緯度] or "of": "国", "size", "color", "delay"}]` |
| `markers` | `[{"at", "type": pulse/pin/star/dot, "color", "label", "delay"}]` |
| `lines` | `[{"path": [[経度, 緯度], ...], "style": solid/dashed/arrow/arrow_dashed, "curve", "color", "width", "delay", "draw_time"}]` |
| `year` | 画面上部に出す年号 |
| `flash` | `true` でシーン頭に白フラッシュ |

国の指定は ISO 3 文字コード (`POL`, `LTU`, ...)。国の一部だけ塗るときは `"RUS@20.5,54.7"` のように
その地点を含む島・飛び地だけを指定できます。地図データは Natural Earth 1:50m (パブリックドメイン)。
