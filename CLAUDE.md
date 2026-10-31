# Auto-me-video.bot — 作業メモ

- 英語の縦型ショート (TikTok / YouTube Shorts 共通、61〜75 秒) を自動で作るリポジトリ。投稿はユーザーが手動でする (Claude は投稿しない)
- 作業ブランチは `claude/geo-short-generator`。main には push しない。PR はユーザーに頼まれたときだけ
- **今の主力は「宇宙・存在系」シリーズ (GEMRIL 風)**: 台本は `cosmic/*.json`、絵は `remotion/src/cosmic/Cosmic.tsx` (2D の SVG)、
  書き出しは `.github/workflows/remotion.yml` (`script=cosmic/<名前>.json`)、出来上がりは `renders` ブランチ。
  **規約・固定スタイル・ネタ帳は `cosmic/README.md` に従う**
- 固定スタイル: フラットなベクター調の宇宙アニメ (深い紫・ネオン)、読み上げ中の単語を画面の真ん中に 1 語ずつ極太 (Anton) で出す、
  大事な単語はオレンジ、静かな語りの英語ナレーション、最後は問いかけ。絵も台本もオリジナル (Kurzgesagt などの映像・台本は使わない)
- 前のシリーズ (地図の `maps/`、3D の `stories/` `whatif/`) は止めている。頼まれたときだけ触る
- BGM・絵文字は動画に入れない (BGM はユーザーが投稿時に入れる)
- Cloudflare の AI イラストは無料枠が約 30 枚 / 24 時間。トークンは GitHub Secrets (CF_API_TOKEN) だけに置き、チャットに出さない
- 返事はユーザーに合わせて日本語で
