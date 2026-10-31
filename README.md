# Auto-me-video.bot — Shorts Animation Studio

JSON台本から、TikTok / Reels / YouTube Shorts 向けの縦型ショートアニメ
(**1080×1920 / 30fps / MP4**)を自動で書き出す **Remotion + React + TypeScript** プロジェクトです。

```
input/story.json → (音声生成) → Remotionで合成 → output/video.mp4
```

> 既存の Python 版 (`make_video.py` / `generate_audio.py` / `script.json`) はそのまま残してあります。

## セットアップ

必要なもの: Node.js 20+、FFmpeg(音声生成時のみ)、Chrome/Chromium(初回レンダリング時に自動DL)

```bash
npm install
cp .env.example .env      # 音声生成を使う場合のみ編集
npm run assets            # プレースホルダー素材(オリジナルSVG/WAV)を public/ に生成
```

Chrome を自動ダウンロードできない環境では、`REMOTION_BROWSER_EXECUTABLE=/path/to/chromium npm run render` で指定できます。

## 使い方

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Remotion Studio でプレビュー (台本を編集すると即反映) |
| `npm run validate [-- file]` | 台本JSONの検証 + 参照素材の存在チェック |
| `npm run voice [-- file]` | シーンごとのナレーションをTTS生成→結合し、音声の長さに合わせて時間を再計算 (`input/story.synced.json`) |
| `npm run render [-- --story file --out file]` | MP4書き出し (既定: `output/video.mp4`) |
| `npm run typecheck` | 型チェック |

### 音声つきで作る流れ

```bash
npm run voice                                    # .env の TTS_PROVIDER (voicevox / elevenlabs)
npm run render -- --story input/story.synced.json
```

VOICEVOX を使う場合は、VOICEVOX Engine を起動した状態で実行してください。

## 台本JSON (`input/story.json`)

ChatGPT に下記の形式で出力させ、そのまま貼り付けます。

```jsonc
{
  "title": "…", "duration_seconds": 35, "asset_ext": "svg",   // 実素材がPNGなら "png"
  "style": { "theme_color": "#FFD84D", "accent_color": "#FF3B5C" },
  "audio": { "narration": "audio/narration.mp3", "music": "music/bgm.mp3", "music_volume": 0.15 },
  "scenes": [{
    "start": 0, "end": 4,
    "narration": "ナレーション本文",
    "caption": "もし明日…\n「重力」が\n消えたら？",     // \n ごとに順番にポップ表示
    "emphasis_words": ["重力"],                          // 黄/赤で強調
    "background": "city_morning", "foreground": "optional_layer",
    "character": "hero", "expression": "surprised",
    "character_motion": "bob | slide_in | pop | none",
    "animation": "none | fast_zoom_in | slow_zoom_in | shake | swipe_left | swipe_right",
    "transition": "none | fade | zoom | blur | swipe | shake",
    "sfx": "whoosh"
  }]
}
```

シーンは時間順・重複なしで並べます (`validate` が検証します)。

## 素材の置き場所 (`public/`)

```
public/
  backgrounds/<name>.<ext>              背景 (1200×1920 推奨。左右にパララックス用の余白)
  characters/<character>/<expression>.<ext>   キャラ表情差分 (800×800 透過PNG/SVG)
  sfx/<name>.wav                        効果音
  music/                                BGM
  audio/                                ナレーション (voice が生成)
  fonts/
```

`npm run assets` が生成するのは動作確認用のオリジナル・プレースホルダーです。本番では同名で自作キャラ・背景に差し替えてください。
他人のキャラ・動画・声の流用はせず、構成やテンポだけを参考に、自分のキャラ・色・ストーリーでオリジナル化してください。

## 新しいシーンを追加する

1. 必要なら素材を追加: 背景 `public/backgrounds/office.png`、表情 `public/characters/hero/angry.png`
2. `input/story.json` の `scenes` に前のシーンの `end` から始まるオブジェクトを追加
3. `npm run validate` → `npm run dev` で確認 → `npm run render`

新しい演出を足す場合は `src/components/` (Scene / Transition / Character など) を編集します。

## 構成

```
src/
  Root.tsx, index.ts, StoryVideo.tsx     コンポジション登録・シーン配置・音声
  components/  Scene Caption PopText Character Background CameraShake Transition
  lib/         script-schema.ts (Zod) load-story.ts assets.ts
scripts/       validate-script / render-video / generate-voice / generate-placeholder-assets
input/story.json   サンプル台本
```

## 今後の拡張

`scripts/generate-voice.ts` と同じ要領で、テーマ→台本JSON生成(OpenAI API)→音声→書き出しを1コマンドにつなげられます (`.env.example` の `OPENAI_API_KEY`)。
最初は書き出した動画を自分で確認(冒頭2秒のフック・字幕の読みやすさ・音声と字幕のずれ)してから投稿するのがおすすめです。
