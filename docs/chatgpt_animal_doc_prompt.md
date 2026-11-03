# ChatGPT に貼る指示文 (動物ドキュメンタリーの台本用)

下の枠の中を全部コピーして ChatGPT に貼り、最後の「テーマ:」の後ろに動物やネタを書くだけ。
出てきた台本を、そのまま Claude Code のチャット欄に貼れば動画になる。

```
You are a head writer for a viral 2D-animated wildlife documentary channel (YouTube Shorts / TikTok, 9:16).
Write ONE script of 60–75 seconds about the topic below. No narration: the story is told with on-screen English subtitles only.

Rules:
- Facts must be true and checkable. If a number is uncertain, use "about" / "up to". Never invent studies.
- Hook in the first 2 seconds: a short ALL-CAPS line that sounds impossible but is true.
- 6 to 8 scenes. Each scene 5–13 seconds. Total 60–75 seconds.
- Subtitles: 1–3 short lines per scene, max 9 words per line, simple English. Only the first scene's lines are ALL CAPS.
- End with an emotional or surprising last line, then a pinned-comment question.
- Visuals must be possible in clean 2D illustration: one main animal, a simple background, and simple effects.

Use ONLY these words for the fields:
- habitat: snow_forest, arctic, forest, jungle, spring, pond, ocean, deep_sea, desert, savanna, cave, night, inside
  ("inside" = a scientific cut-away view inside the body)
- motion: breathe, still, walk, jump, swim, fly, shiver, wake
- fx (0–3 per scene): snow, rain, frost, glow, heartbeat_stop, timelapse, sunrays, splash, bubbles, heat, fireflies
- camera: push, pull, pan, still

Output EXACTLY this format and nothing else:

TITLE: <short title>
ANIMAL: <common name>
LOOK: <one detailed sentence so every picture shows the SAME animal: species, size, main body color, markings and where they are, eye color, skin/fur/feather texture, body shape. Example: "small North American wood frog, warm reddish-brown skin, a black mask stripe from the nose through the eye, golden eyes, cream belly, smooth moist skin, stocky body">
POST_TITLE: <one line + 1 emoji>
POST_DESCRIPTION: <"Send this to ..." line, then 1–2 lines of the real facts>
HASHTAGS: <6 hashtags>
PINNED_COMMENT: <a question for viewers>

SCENE 1
DURATION: <seconds>
HABITAT: <word>
POSE: <body position only, short and concrete, e.g. "sitting, side view, eyes closed" / "leaping, legs stretched". Do not describe the background here> (or NONE for "inside" scenes)
MOTION: <word>
FROST: <0 to 1, how frozen the animal looks; 0 if not relevant>
FX: <words, comma separated, or none>
CAMERA: <word>
SUBTITLES:
- <line>
- <line>
SFX: <short description of sounds, e.g. "wind, ice cracking">

SCENE 2
...

Topic: 
```
