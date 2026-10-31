# Auto-me-video.bot
## Stickman Video Director skill

This repo vendors the [`directing-stickman-videos`](.claude/skills/directing-stickman-videos/SKILL.md) Claude Code skill from
[kaomei/stickman-video-director](https://github.com/kaomei/stickman-video-director) (MIT). Claude Code sessions opened in this repo
pick it up automatically. Ask e.g.:

> Use Director Mode / mode A to turn this topic into a stickman video: 1858 Great Stink of London. 9:16, Style 5, 60s.

Autopilot Mode (mode B) needs Node >= 20 and `npm ci` inside `.claude/skills/directing-stickman-videos`, plus image/TTS API keys — run `npm run doctor` there to check setup.

## Cosmic word-by-word shorts (`cosmic_video.py`)

A Shorts/TikTok format: flat-vector space illustrations (galaxy, planet, sun, nebula, city, creature, void)
with slow parallax zoom, plus big 1–2 word captions synced to the narration.

```bash
pip install numpy pillow requests   # plus ffmpeg
export ELEVENLABS_API_KEY=...       # optional: voice + exact word timing (cached in build/)
python cosmic_video.py cosmic_script.json --preview   # first 3 scenes, half res
python cosmic_video.py cosmic_script.json             # full 1080x1920
```

Edit `cosmic_script.json`: each scene has `text` (narration), `bg` (galaxy/planet/sun/void/nebula/creature/city),
`palette` (violet/ocean/ember/mint/magenta) and optional `fade_out`. Drop a `bgm.mp3` next to it for music.
Set `"size": [1920, 1080]` for landscape. Or run the **Cosmic Word-by-Word Video** workflow in Actions.
Caption font: Anton (SIL OFL, `fonts/`). Without an API key the video renders silently with estimated timing.
