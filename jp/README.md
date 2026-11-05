# jp/ — 日本語の雑学・心理学ショート (中高生・大学生向け)

- 書き出し: `.github/workflows/remotion.yml` に `script=jp/<名前>.json`。`tools/ja_prep.py` → Remotion の Cosmic (`lang: "ja"`)
- 声: VOICEVOX (CI で Docker を立てる)。**投稿の説明欄に「VOICEVOX:<キャラクター名>」のクレジットが必須** (台本の post.description に入れておく)
- 絵: `character` (同じ人物) + 場面ごとの `art` を AI の 1 枚絵で描く (白黒アニメ調、`art_style`)。既存のアニメのキャラクターや映像は使わない
- 字幕: `say` を `/` で区切ったかたまりごとに真ん中に大きく出す。`|` はその字幕の中の改行 (読まない)。8 文字を超えるかたまりには `|` を入れる
- `hot` に入れたかたまりは赤、`number` を入れた場面は上に「1 /5」と出る。`hook` は 1 場面目の上の黄色いタイトル
- 尺は 61〜75 秒。ナレーションの速さは `voice.speed` (1.2 前後) で調整
- 中身は役に立つ・前向きな心理学や雑学にする (人をだます・傷つける使い方は勧めない)

## 手元の映像で仕上げる (アニメの切り抜きなど、リポジトリに置けない映像)
1. CI で声と字幕の時刻だけ作る: `script=jp/<名前>.json`, `options=--voice-only` → renders に `<名前>_voice.m4a` と `<名前>_props.json`
2. このコンテナで: `python tools/ja_clips.py deliver/jp/<名前>_props.json deliver/jp/<名前>_voice.m4a <映像>... -o deliver/jp/<名前>_hq.mp4`
   (映像は 2〜3 秒ごとに切り替え、白黒寄りの色 + ゆっくりズーム。映像は remotion/public/job と deliver/ だけに置く = git に入らない)
