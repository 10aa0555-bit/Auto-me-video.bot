---
name: animal-doc
description: Turn a pasted 2D wildlife documentary script (the ChatGPT format in docs/chatgpt_animal_doc_prompt.md, or a free-form brief like "FROZEN… BUT STILL ALIVE") into a finished 60–75 s vertical short with the Cosmic engine (nature theme, silent, English subtitles), render it on GitHub Actions, QA it and send it. Use whenever the user pastes an animal / nature documentary script or brief.
---

# 動物ドキュメンタリー (2D・ナレーションなし) を台本から作る

ユーザーがチャット欄に台本を貼ったら、設定を聞き直さずに最後まで作って送る。返事は日本語。

## 1. 台本を JSON にする (`cosmic/<slug>_en.json`)
台本は `docs/chatgpt_animal_doc_prompt.md` の形式 (TITLE / ANIMAL / LOOK / SCENE n ...) が基本。
自由な書き方 (タイムスタンプ + Visual + Subtitle) でも、同じ項目に読み替える。

```json
{
 "title": "...", "lang": "en", "captions": "plain", "music": false,
 "style": "cosmic", "theme": "nature", "silent": true,
 "voice": {"engine": "auto", "kokoro_voice": "am_michael", "settings": {"speed": 1.0}},
 "animal": {"name": "wood frog", "look": "small brown frog with a dark mask stripe across its eyes, golden eyes"},
 "post": {"title": "...", "description": "...", "hashtags": ["#nature", "..."], "pinned_comment": "..."},
 "scenes": [
  {"scene": "nature", "duration": 6.0, "habitat": "snow_forest", "pose": "sitting under frozen leaves, eyes closed",
   "motion": "still", "frost": 0.8, "fx": ["snow", "frost"], "cam": "push",
   "subs": ["THIS FROG CAN FREEZE SOLID…", "AND STILL SURVIVE."],
   "sfx": [[0.0, "thud"], [0.4, "riser", {"dur": 1.2}]],
   "ax": 0.5, "ay": 0.6, "size": 0.8}
 ]
}
```
- `narration` は書かなくてよい (prep が subs から作る)。各シーンに `"narration": " ".join(subs)` を入れておくと安全。
- `habitat` が `inside` の場面は、カエル回の断面図 `"scene": "frog_inside"` (細胞・氷・光る粒) を使う。`pose` は付けない。
- 動物の位置: `ax` `ay` (0..1、既定 0.5 / 0.62)、大きさ `size` (画面の幅に対する割合、既定 0.7)。字幕 (H×0.76) と重ねない。
- 効果音 `sfx` は台本の SFX から選ぶ: wind は環境音に入っているので不要。使えるのは thud, riser, whoosh, pop, tick, ding, glitch, heartbeat(bpm,bpm2), lock, slide, powerdown, birds, siren。
- `season: "spring"` を付けた場面は環境音が小川になる。
- 合計 61〜75 秒。各シーンの `duration` の合計で決まる。
- BGM は入れない (ユーザーが投稿時に入れる)。台本に音楽の指定があっても、返事で一言そう伝える。

## 2. 事実を確認する
数字・研究は Web 検索で確認する。言い過ぎ ("most of its body", "illegal") は正確な言い方に直し、返事で何を直したか伝える。

## 3. 手元で確認 → 書き出し
1. `cd remotion && python3 ../tools/whatif_prep.py ../cosmic/<slug>_en.json --no-tts` (手元では AI の絵は描けないので背景だけになる。字幕の位置と背景を見る)
2. `npx remotion still src/index.ts Cosmic out/x.jpg --frame=N --props=props.json --browser-executable=$(ls -d /opt/pw-browsers/chromium_headless_shell-1243/*/chrome-headless-shell)`
3. コミット・push → `gh workflow run remotion.yml --ref claude/geo-short-generator -f script=cosmic/<slug>_en.json`、完了をバックグラウンドで待つ
   (CI では Cloudflare FLUX で動物のポーズ画像を描く。無料枠は約 30 枚 / 24 時間。1 本で 5〜8 枚使う)

## 4. 確認して送る
- renders ブランチから `<slug>_en_hq.mp4 / _grid.jpg / _post.txt` を取り出し、`tools/qa.py` とグリッドで見る
  (動物が描けているか、同じ動物に見えるか、字幕と動物が重なっていないか、1 分を超えているか)
- 動物の絵が欠けたら、無料枠切れの可能性が高い。時間をおいて書き出し直す
- SendUserFile で mp4 を送り、タイトル・説明・ハッシュタグ・固定コメントを日本語の一言説明つきで渡す。投稿はしない
