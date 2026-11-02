# Auto-me-video.bot — 作業メモ

- 英語の縦型ショート (TikTok / YouTube Shorts 共通、61〜75 秒) を自動で作るリポジトリ。投稿はユーザーが手動でする (Claude は投稿しない)
- 作業ブランチは `claude/geo-short-generator`。main には push しない。PR はユーザーに頼まれたときだけ
- **今の主力は 2 本立て** (What if 系・3D の物語は作らない):
  1. **モチベーション系の 2D アニメ (GEMRIL 風)**: 台本は `cosmic/*.json`、絵は `remotion/src/cosmic/Cosmic.tsx` (2D の SVG)。
     **規約・固定スタイル・ネタ帳は `cosmic/README.md`**。フラットなベクター調 (深い紫・ネオン)、読み上げ中の単語を
     画面の真ん中に 1 語ずつ極太 (Anton) で出す、前向きな哲学・人生の話。見た目と構成は GEMRIL に寄せてよいが、
     他人の映像・音声・台本をそのまま使うのは NG (再利用コンテンツで収益化不可・著作権)
  2. **地理系「土地のミステリー」**: 台本は `maps/*.json`、**規約・固定スタイル・ネタ帳は `maps/README.md`**。
     基準はダイオミード諸島 (`maps/diomede_islands_en.json`): 国旗スタート、くっきりした衛星写真、本物の写真カード 3〜5 枚、
     黄色に光る字幕、2D のちびキャラのステッカー、二択の問いで締める。青い方眼は使わない
- 書き出しは `.github/workflows/remotion.yml` (`script=cosmic/<名前>.json` / `script=maps/<名前>.json`)、出来上がりは `renders` ブランチ
- BGM・絵文字は動画に入れない (BGM はユーザーが投稿時に入れる)
- Cloudflare の AI イラストは無料枠が約 30 枚 / 24 時間。トークンは GitHub Secrets (CF_API_TOKEN) だけに置き、チャットに出さない
- 返事はユーザーに合わせて日本語で
