# モチベーション系 2D アニメ (GEMRIL 風)

フラットなベクター調のアニメに、読み上げ中の単語を 1 語ずつ極太で重ねる英語ショート。前向きな哲学・人生・心理の話。
見た目と構成は GEMRIL に寄せる。絵は `remotion/src/cosmic/Cosmic.tsx` の中で図形から描く (他人の映像・音声・台本は使わない。転載は著作権と収益化の両方で NG)。

## 台本の形 (`cosmic/<slug>_en.json`)
- `"style": "cosmic"`、声は Kokoro `am_michael` 速さ 1.0 (落ち着いた語り)
- 約 160〜190 語 (61〜75 秒)。1 シーン = 1〜2 文、10〜12 シーン
- 各シーン: `scene` (絵の種類)、`narration`、`hot` (オレンジにする単語、2〜4 個)、`sfx` (場面の効果音)
- 使える `scene`: hill / end (丘の人)、atoms、bigbang、nebula、supernova、disk、earth、ocean、city、blood、galaxy
  (新しい絵が要るときは Cosmic.tsx に部品を足す)

## 台本のコツ
- 1 文目でひっくり返す ("You are not 20 years old. You are 13.8 billion years old.")
- 数字・事実は Web で確認。あやしいものは "about" / "scientists think" でぼかす
- 最後は視聴者自身に返す問いかけか、ゾクッとする一言で締める
- 投稿文: タイトルは 1 行 + 絵文字 1 個、説明は「Send this to …」+ 事実 1〜2 行、固定コメントは問いかけ

## ネタ帳 (上から順に)
1. ✅ stardust_en — You are 13.8 billion years old (小さく感じたら、自分は宇宙のかけら)
2. weeks_en — You only get about 4,000 weeks (80 年 ≒ 4,160 週)
3. spotlight_en — Nobody is watching you as much as you think (スポットライト効果)
4. one_percent_en — 1% better every day = 37 times better in a year (1.01^365 ≒ 37.8)
5. free_en — If nothing matters, you are free to do anything
6. fear_en — Your brain is still afraid of lions that are not there
7. comparison_en — You are comparing your inside to everyone else's outside
8. pale_dot_en — Every problem you have happened on a tiny dot in space
9. boredom_en — Boredom is your brain asking for something new
10. regret_en — What people regret most at the end of their lives
