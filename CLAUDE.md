# Auto-me-video.bot — 作業メモ

- 英語の縦型ショート (TikTok / YouTube Shorts 共通、61〜75 秒) を自動で作るリポジトリ。投稿はユーザーが手動でする (Claude は投稿しない)
- 作業ブランチは `claude/geo-short-generator`。main には push しない。PR はユーザーに頼まれたときだけ
- **今の主力は地理系「土地のミステリー」(TikTok: Odd Atlas)**。台本は `maps/*.json`、**規約・固定スタイル・ネタ帳は `maps/README.md`**。
  基準はダイオミード諸島 (`maps/diomede_islands_en.json`): 冒頭の地球ズーム (自動)、国旗スタート、くっきりした衛星写真、
  本物の写真カード 3〜5 枚、距離はものさし線 (ruler)、黄色に光る字幕、2D のちびキャラのステッカー、二択の問いで締める。青い方眼は使わない。
  伸びているのは「ありえない場所・国境・距離」系
- **モチベーション系・What if 系・3D の物語は作らない** (ユーザーが終了を指示。`cosmic/` のヨハン風・GEMRIL 風は作成済みのまま止める)
- 自然の不思議系 (新しいアカウント用): 2D・ナレーションなし・白い英語字幕 (`cosmic/frozen_frog_en.json`、`"silent": true`, `"theme": "nature"`)。頼まれたら作る
- 書き出しは `.github/workflows/remotion.yml` (`script=maps/<名前>.json`、自然系は `script=cosmic/<名前>.json`)、出来上がりは `renders` ブランチ
- BGM・絵文字は動画に入れない (BGM はユーザーが投稿時に入れる)
- Cloudflare の AI イラストは無料枠が約 30 枚 / 24 時間。トークンは GitHub Secrets (CF_API_TOKEN) だけに置き、チャットに出さない
- 返事はユーザーに合わせて日本語で
