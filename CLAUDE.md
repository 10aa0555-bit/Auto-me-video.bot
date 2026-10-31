# Auto-me-video.bot — 作業メモ

- 英語の縦型ショート (TikTok / YouTube Shorts 共通、61〜75 秒) を自動で作るリポジトリ。投稿はユーザーが手動でする (Claude は投稿しない)
- 作業ブランチは `claude/geo-short-generator`。main には push しない。PR はユーザーに頼まれたときだけ
- 今の主力は「土地のミステリー」シリーズ: 台本は `maps/*.json`、書き出しは Remotion (`.github/workflows/remotion.yml`)、
  出来上がりは `renders` ブランチ。**規約・固定スタイル・ネタ帳は `maps/README.md` に従う**
- **固定スタイルの基準はダイオミード諸島 (`maps/diomede_islands_en.json`)**: 国旗スタート、くっきりした衛星写真、
  本物の写真カード 3〜5 枚、黄色に光る字幕、2D のちびキャラのステッカー、二択の問いで締める。青い方眼・絵文字・BGM は使わない
- Cloudflare の AI イラストは無料枠が約 30 枚 / 24 時間。トークンは GitHub Secrets (CF_API_TOKEN) だけに置き、チャットに出さない
- 返事はユーザーに合わせて日本語で
