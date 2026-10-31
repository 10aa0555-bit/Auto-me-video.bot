# whatif — What if シリーズ (3D のミニチュアの街)

毎回同じミニチュアの 3D の街 (Three.js, `remotion/src/whatif/`) で「もしも」が起きる英語ショート。
台本は `whatif/<名前>_en.json`、書き出しは `remotion.yml` に `script=whatif/<名前>_en.json`。

## 型 (毎回同じ)

- 0〜2 秒: 金色の映画風タイトル (`whatif.top` 小さく / `big` 大きく / `bottom` 斜体) と同時に事件が始まる
- 時間のカウンター (`counter` / `sub`): DAY 1 → DAY 7 → … と進み、続きが気になるようにする
- 街の一角 → 街全体 → 世界、と規模を広げる。最後にどんでん返し
- 締めは問い (コメントを誘う)。**最後の 1.3 秒で街を最初の状態に巻き戻してループさせる** (`loop: true`、既定でオン)
- 63〜68 秒、ナレーション約 950〜1,000 文字。数字は Web で確認する
- 環境音 (波・風・街のざわめき・ヘリ) は自動で入る。BGM は入れず、投稿時に TikTok の曲を 10〜15% で付ける

## 投稿文の型 (動画より先に決める)

- タイトル: 「What if …?」+ 絵文字 1 つ
- 説明の 1 行目は「送って」型: `Send this to someone who …`
- 2 行目に「事実」型の一言 (驚く数字)
- 固定コメントは「どっちを選ぶ？」型: `Which would you choose: A or B? 👇`

## 投稿のルール

- 同じ型で **30 本** 出してから判断する (どれが当たるかは事前に分からない)
- 当たった 1 本はプロフィールに固定 (ピン留め) し、すぐ「Part 2」を作る
- 毎日同じ時刻に投稿 (日本時間 23 時ごろ)。1 日 2 本なら時間帯を変えて 1 週間比べる
- **AI の表示を付ける**: TikTok は投稿設定の「AI 生成コンテンツ」をオン、YouTube は「改変または合成されたコンテンツ」で「はい」
  (ナレーションが AI の声のため。表示しても再生数は落ちない)

## 台本の書式

```json
{
  "title": "What If the Sea Rose 1 Meter Every Day?",
  "whatif": {"top": "WHAT IF THE SEA", "big": "Rose", "bottom": "1 meter every day?"},
  "loop": true,
  "scenes": [
    {"narration": "…", "cam": {"pos": [x, y, z], "look": [x, y, z]}, "sea": -0.9, "cars": 1, "people": 1,
     "counter": "DAY 1", "sub": "+1 METER"}
  ],
  "post": {"title": "…", "description": "…", "hashtags": ["…"], "pinned_comment": "…"}
}
```

`sea` は海面の高さ (0 = 地面、街のビルは 3〜45、奥の山は 70〜125)。`cars` / `people` は 0〜1 の割合。
カメラの例: 全体 `{"pos":[0,80,105],"look":[0,0,-20]}`、浜辺 `{"pos":[0,42,-8],"look":[0,0,-85]}`、
真上寄り `{"pos":[0,150,90],"look":[0,0,-25]}`、山 `{"pos":[0,95,70],"look":[0,45,-260]}`。
