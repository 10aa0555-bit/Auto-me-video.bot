# Auto-me-video.bot
## Stickman Video Director skill

This repo vendors the [`directing-stickman-videos`](.claude/skills/directing-stickman-videos/SKILL.md) Claude Code skill from
[kaomei/stickman-video-director](https://github.com/kaomei/stickman-video-director) (MIT). Claude Code sessions opened in this repo
pick it up automatically. Ask e.g.:

> Use Director Mode / mode A to turn this topic into a stickman video: 1858 Great Stink of London. 9:16, Style 5, 60s.

Autopilot Mode (mode B) needs Node >= 20 and `npm ci` inside `.claude/skills/directing-stickman-videos`, plus image/TTS API keys — run `npm run doctor` there to check setup.
