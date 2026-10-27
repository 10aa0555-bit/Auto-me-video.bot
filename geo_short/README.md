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

## 見た目

台本のトップレベルに `"style"` を書いて切り替えます。

- `"satellite"` (既定): NASA Blue Marble の衛星写真 + 流れる雲。初回に 21600px 版
  (約 1.9km/px, パブリックドメイン) を NASA から `~/.cache/geo_short/` に取得し、
  取れなければ `basemap-data` 同梱の 5400px 版を使います。`GEO_SAT_TEXTURE` で任意の画像を指定可。
- `"parchment"`: 古地図風のフラットな配色

## GitHub Actions

`scripts/*.json` を push すると、変更された台本の動画が自動で作られます (手動実行も可)。
Secrets に `ELEVENLABS_API_KEY` が必要です。完成した mp4 と投稿文は Actions の成果物と
`renders` ブランチに置かれます。

音声: ナレーション (ElevenLabs) + 効果音 + BGM。BGM はナレーション中だけ自動で下がり、
全体の音量は TikTok / YouTube 推奨の -14 LUFS に揃えます。

## 台本の書き方

トップレベル:

| キー | 内容 |
|---|---|
| `voice` | `{"id": ElevenLabs のボイス ID, "model": ..., "settings": {...}}` |
| `lang` | `"en"` で英語 (1〜3 語ずつの TikTok 風字幕・Poppins フォント)。既定は `"ja"` |
| `music` | BGM `{"prompt": "英語で曲の雰囲気", "volume": 0.22}`。ElevenLabs Music で生成し、使えなければ合成 BGM。`false` で BGM なし |
| `post` | 投稿用 `{"title", "description", "hashtags"}` → `out/<名前>_post.txt` に書き出し |
| `regions` | 現在の国境に無い地域を `[[経度, 緯度], ...]` で定義 (例: 東プロイセン南部) |
| `scenes` | シーンの配列 (下表) |

シーン (1 シーン = ナレーション 1〜2 文):

| キー | 内容 |
|---|---|
| `narration` | ナレーション兼字幕 |
| `tts` | 読み上げだけ変えたい時 (数字の読み・固有名詞など) |
| `camera` | `{"center": [経度, 緯度], "span": 画面幅の経度}`。省略で前シーンのまま |
| `fill` | `{"国": "#色"}` または `{"国": "flag:pl"}` (国旗を国の形で貼る)。`null` で元に戻す。次のシーンにも引き継がれる |
| `reset_fills` | `true` で塗りを全消去 |
| `outline` | 光る輪郭で強調する国のリスト |
| `labels` | `[{"text", "at": [経度, 緯度] or "of": "国", "size", "color", "delay"}]` |
| `markers` | `[{"at", "type": pulse/pin/star/dot, "color", "label", "delay"}]` |
| `lines` | `[{"path": [[経度, 緯度], ...], "style": solid/dashed/arrow/arrow_dashed, "curve", "color", "width", "delay", "draw_time", "label"}]`。`"label": "auto"` で距離を自動計算してカウントアップ、`"label": "{n} KM", "count": 65` で任意の数字 |
| `icons` | 3D イラスト `[{"name", "at" or "of", "size", "count", "spread", "to", "travel_time", "anim": bob/shake/none, "label", "delay"}]` |
| `circles` | 半径◯km の円 `[{"at", "radius_km", "color", "label", "delay"}]` |
| `texts` | 大きい文字 `[{"text": "{n} PEOPLE", "count": 2000000, "accent": ["PEOPLE"], "at" or "y", "size"}]` |
| `banner` | タイトル帯 `{"lines": ["MOST DANGEROUS", "PLACE IN EUROPE?"], "colors", "y", "delay"}` |
| `year` | 画面上部に出す年号 |
| `flash` | `true` でシーン頭に白フラッシュ |

国の指定は ISO 3 文字コード (`POL`, `LTU`, ...)。国の一部だけ塗るときは `"RUS@20.5,54.7"` のように
その地点を含む島・飛び地だけを指定できます。地図データは Natural Earth 1:50m (パブリックドメイン)。
クリミア半島は国連の立場に合わせてウクライナ (`UKR`) に含めています。

アイコン名は [Fluent Emoji](https://github.com/microsoft/fluentui-emoji/tree/main/assets) のフォルダ名
(例: `castle`, `ship`, `person walking`, `loudly crying face`)。場面転換の風切り音・ポップ音などの
効果音は自動で付きます。

## 素材のライセンス

すべて商用利用 (収益化) 可能です。

- 衛星画像: NASA Blue Marble (パブリックドメイン)
- 国境: Natural Earth (パブリックドメイン)
- 3D アイコン: Microsoft Fluent Emoji (MIT)
- 国旗: flag-icons (MIT)
- フォント: Poppins (SIL OFL, `fonts/OFL.txt`)
- 効果音・合成 BGM: プログラムで合成
