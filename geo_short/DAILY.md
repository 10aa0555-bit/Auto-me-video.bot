# 毎日の地理ショート作成手順

定期タスクから起動されたセッションは、この手順で英語の地理ショートを 1 本作り、
完成した動画と投稿文をユーザーに送る。投稿 (TikTok / YouTube へのアップロード) は
ユーザーが自分で行うので、こちらからは投稿しない。

## 0. 準備

- リポジトリ `10aa0555-bit/Auto-me-video.bot` のブランチ `claude/geo-short-generator` で作業する
  (無ければ add_repo して clone)。main には push しない。
- `pip install -r geo_short/requirements.txt` (ローカルで静止画を確認するため)。

## 1. ネタを選ぶ

- `scripts/TOPICS.md` の「候補」の一番上から選ぶ。
- 既存の台本 (`scripts/*_en.json`) と内容がかぶらないこと。

## 2. 事実を調べる

- ナレーションに入れる数字・年・固有名詞は、すべて Web 検索で 2 つ以上の情報源で確認する。
  食い違う数字は使わないか、「around」「over」などで幅を持たせる。
- 国境・領土は国連の立場に合わせる (例: クリミアはウクライナ)。政治的に揉めている話は
  どちらかの肩を持たない言い方にする。
- 裏が取れないネタは飛ばし、TOPICS.md にその理由を書いて次の候補へ。

## 3. 台本を書く

`geo_short/README.md` の書き方と「伸びるショートのための台本の型」、既存の
`scripts/*_en.json` (特に `true_size_en.json`, `france_brazil_en.json`) を手本にする。

- ファイル名は `scripts/<短い英語のスラッグ>_en.json`。`"lang": "en"`, `"style": "satellite"`。
- **61〜75 秒** (TikTok の収益化は 1 分超が条件)、10〜12 シーン。1 シーン = ナレーション 1〜2 文。
- 発端 → 意外な展開 → オチの物語にし、途中に続きが気になる一言を入れる。
- 主役や山場は AI イラスト: `icons` に `"ai": "英語の説明"` (+ 代用の `name`)、山場 1〜2 か所に
  全画面の `card`。絵は毎回そのネタ専用に描く。
- 1 シーン目: 答えが気になる問いかけ + `banner`。
- 1.5〜3 秒ごとに何か変化 (国旗の塗り `flag:xx`、3D アイコン、数字のカウントアップ、矢印、
  `ghosts` で国の形を動かす、カメラ移動)。
- 数字や年は `tts` に英単語で書く (例: "in eighteen sixty-seven")。
- 最後のシーン: コメントを誘う質問 + `cta` ("FOLLOW FOR MORE")、`min_duration` を 5 秒程度に。
- `post` に title / description / hashtags (6〜8 個、#geography #maps #shorts を含む) /
  pinned_comment を書く。
- アイコン名は Fluent Emoji 3D に実在するもの (使う前に `geo_short.assets.Icons().get(name, 64)` で確認)。

## 4. 静止画で確認する

```bash
for t in 1.5 8 15 22 30 38 46; do python -m geo_short.build scripts/<name>.json --still $t; done
```

画像を実際に見て、文字の重なり、画面外にはみ出た要素、国旗の向き、カメラ位置の間違いを直す。

## 5. push して動画を作る

- 台本と TOPICS.md (作成済みに移した行) だけをコミットして push する。
  `scripts/*.json` の push で GitHub Actions「Geo Short Video」が自動で動画を作る
  (ナレーションは ElevenLabs、クレジットが足りなければ無料の Kokoro)。
- `gh run list -R 10aa0555-bit/Auto-me-video.bot -L 1` で run を見つけ、完了まで待つ
  (sleep ではなくバックグラウンドの until ループで待つ)。
- 失敗したら GitHub MCP の get_job_logs でログを読み、台本を直して push し直す。
  エンジン (`geo_short/*.py`) の不具合なら最小限の修正をする。

## 6. 送る

- `git fetch origin renders` して `git show FETCH_HEAD:<name>.mp4 > out/<name>.mp4`、
  `<name>_post.txt` も同様に取り出す。
- ffmpeg でフレームを数枚抜いて中身を確認してから、SendUserFile (status: proactive) で
  mp4 を送る。
- メッセージ (日本語) には: ネタの一言説明、投稿用のタイトル・説明・ハッシュタグ・固定コメント
  (英語、そのままコピペできる形)、確認した事実と情報源の URL。

## してはいけないこと

- TikTok / YouTube への投稿、main への push、他人のリポジトリへの書き込み。
- 確認していない数字をナレーションに入れること。
