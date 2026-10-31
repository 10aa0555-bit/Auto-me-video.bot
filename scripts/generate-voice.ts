/**
 * 各シーンの narration からTTS音声を生成し、1本の narration.mp3 に結合。
 * 音声の長さに合わせて各シーンの start/end を再計算し、input/story.synced.json に保存する。
 *   npm run voice -- [input/story.json]
 * 要: ffmpeg / ffprobe。TTS は .env の TTS_PROVIDER (voicevox | elevenlabs)。
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadStory } from "../src/lib/load-story";

const PAD = 0.35; // 各シーン末尾の間(秒)
const file = process.argv[2] ?? "input/story.json";
const r = loadStory(file);
if (!r.ok) {
  r.errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
const story = r.story;
const provider = process.env.TTS_PROVIDER ?? "voicevox";

const synth = async (text: string): Promise<Buffer> => {
  if (provider === "voicevox") {
    const base = process.env.VOICEVOX_URL ?? "http://127.0.0.1:50021";
    const speaker = process.env.VOICEVOX_SPEAKER ?? "3";
    const q = await fetch(`${base}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, { method: "POST" });
    if (!q.ok) throw new Error(`VOICEVOX audio_query: ${q.status}`);
    const s = await fetch(`${base}/synthesis?speaker=${speaker}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await q.json()),
    });
    if (!s.ok) throw new Error(`VOICEVOX synthesis: ${s.status}`);
    return Buffer.from(await s.arrayBuffer());
  }
  if (provider === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY が未設定です");
    const voice = process.env.ELEVENLABS_VOICE_ID ?? "pNInz6obpgDQGcFmaJgB";
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2" }),
    });
    if (!res.ok) throw new Error(`ElevenLabs: ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`未対応の TTS_PROVIDER: ${provider}`);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "voice-"));
const parts: string[] = [];
let t = 0;
for (const [i, scene] of story.scenes.entries()) {
  const raw = path.join(tmp, `raw${i}.bin`);
  const wav = path.join(tmp, `s${i}.wav`);
  if (scene.narration.trim()) {
    fs.writeFileSync(raw, await synth(scene.narration));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-ar", "44100", "-ac", "1", "-af", `apad=pad_dur=${PAD}`, wav]);
  } else {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(scene.end - scene.start), wav]);
  }
  const dur = parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).toString(),
  );
  scene.start = Math.round(t * 1000) / 1000;
  t += dur;
  scene.end = Math.round(t * 1000) / 1000;
  parts.push(wav);
  console.log(`scene ${i + 1}: ${dur.toFixed(2)}s`);
}

const list = path.join(tmp, "list.txt");
fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
fs.mkdirSync("public/audio", { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-b:a", "128k", "public/audio/narration.mp3"]);

story.duration_seconds = Math.ceil(t);
story.audio.narration = "audio/narration.mp3";
const outFile = "input/story.synced.json";
fs.writeFileSync(outFile, JSON.stringify(story, null, 2));
console.log(`✔ public/audio/narration.mp3 と ${outFile} を生成しました。次: npm run render -- --story ${outFile}`);
