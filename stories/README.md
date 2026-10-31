# 物語シリーズ (Rick 風アニメ・ストーリー)

丸い白い顔のキャラ + 3D の舞台で、本当にあった「信じられない話」を 61〜75 秒で語る。

- 台本: `stories/*.json` (`"hook"` があると物語モード)。書き出しは `remotion.yml` に `script=stories/<名前>.json`
- 声は Kokoro `am_michael`、速さ 1.08。BGM なし (投稿時にユーザーが入れる)
- 冒頭 2.6 秒は `hook` の 3 行 (1 行目が黄色)。カウンター (`counter` / `sub`) で進み具合を見せる
- 舞台 `set`: `ocean` (船・島・氷山・機雷) / `forest` (塔・トラック・小屋・池) / `city`
- 空 `sky`: `day` / `sunset` / `night` / `storm`。`lightning` で稲光、`strike {pos, delay}` で落雷、`blast` で爆発、`sink` で沈没
- キャラ: `face` (normal/happy/shock/scream/worried/smug)、`face2` + `at` で途中から表情を変える、`fire` (秒) で髪が燃える、`hat`
- 字幕は画面の下寄り (H*0.74) でキャラの顔に被らない
- 事実が怪しいところは "he said" / "people say" でぼかす
- 締めは二択の問い ("luckiest or unluckiest?")

## できたもの
1. alvarenga_en — 30 時間の釣りが 438 日の漂流に
2. violet_jessop_en — タイタニックと他 2 隻の沈没から生還
3. roy_sullivan_en — カミナリに 7 回打たれた男
