# explainer — 科学解説ショートの制作手順

外見・心理・科学の疑問を、フラットなベクター風イラストと字幕で 30〜45 秒にまとめる縦型ショート (1080x1920, 30fps) を作る。

## 仕組み

| 工程 | やり方 | 費用 |
|---|---|---|
| ナレーション | Kokoro (af_heart, Apache 2.0 で商用可)。ElevenLabs のクレジットがあれば自動でそちらを使う | 無料 |
| イラスト | Cloudflare Workers AI の FLUX.1 schnell (1024px 角, 1 枚約 100 neuron)。描いた絵は保存して再利用 | 無料枠 1 日 10,000 neuron (約 100 枚) |
| 動き | 自前の描画 (cairo): ゆっくり寄るカメラ、横から入れ替わる絵の窓、弾むチップ、数字のカウントアップ、漂う光と星、フィルムの粒 | 無料 |
| 字幕 | ナレーションの時刻に合わせた単語ハイライト。SRT も書き出す | 無料 |
| 音 | 効果音 (合成)、合成 BGM をナレーション中だけ下げ、-14 LUFS に揃える | 無料 |
| 書き出し | GitHub Actions「Explainer Short」。`shorts/*.json` を push すると作られ、`renders` ブランチに置かれる | 無料 |

FLUX.2 / Phoenix も試したが、1 枚で無料枠の大半を使うので使わない (比較: `tools/art_preview.py`)。

## 1 本作る流れ

1. **ネタと事実確認**: 主張を箇条書きにし、主張ごとに論文・専門機関の資料を確認して
   `shorts/<名前>.sources.md` に書く。小さい研究は「In one study」、知覚の研究は「is rated / is read as」と言い、断定しない。
2. **台本**: `shorts/<名前>.json` (下の書式)。9〜10 シーン、1 シーン 1〜2 文、合計 30〜45 秒。
   - 0〜2 秒: 自分ごとの問い / 意外な事実 (`pill` に動画の問い)
   - 2〜8 秒: 見覚えのある場面
   - 本編: 1 シーン 1 つの要点 + 出典 (`cite`)
   - 結論 → 最後はコメントしたくなる短い問い (チャンネル登録のお願いはしない)
3. **静止画で確認**: `python -m explainer.build shorts/<名前>.json --still 5` (絵が無い所は仮の模様になる)
4. **push** すると Actions が作る。出来た mp4 / srt / 投稿文は `renders` ブランチ。
5. **検査**: `python tools/qa.py out/<名前>.mp4 --grid out/<名前>_grid.jpg`
   (解像度・fps・尺・デコード・黒画面・無音・音量) と、代表フレームで絵の破綻 (手・目・文字) を目で見る。
   破綻した絵は `art` の説明を少し変えると描き直される。

## 台本の書式

```json
{
  "title": "…", "palette": "night | ocean | dawn",
  "pill": ["上の帯 1 行目", "2 行目"],
  "scenes": [
    {
      "narration": "読み上げ兼字幕",
      "art": "英語でイラストの説明 (省略すると前の絵のまま)",
      "points": [{"text": "SLEEP", "at": [0.25, 0.14], "delay": 1.2, "color": "#2ee6c5"}],
      "stat": {"text": "{n} SECONDS", "count": 0.1, "format": "{:.1f}", "label": "小さい説明", "delay": 0.5},
      "cite": "Author et al., Journal 2020",
      "min_duration": 2.5
    }
  ],
  "post": {"title": "…", "description": "…", "hashtags": ["…"], "pinned_comment": "…"}
}
```

`points` の `at` は絵の窓の中の位置 (0〜1)。絵の主役 (顔) に重ならないよう、上端 (0.12〜0.15) か下端 (0.85) に置く。

## 気をつけること

- 人物は毎回同じ見た目にはならない (無料の FLUX schnell の限界)。主人公を固定せず、場面ごとの人物にする。
- 健康・外見の話は不安をあおらない。危険な方法 (bone smashing など) は「やらないで」と明言する。
- TikTok の収益化 (Creator Rewards) は 1 分超が条件。このシリーズは YouTube Shorts 向けに 30〜45 秒。
