/** MP4書き出し: npm run render -- [--story input/story.json] [--out output/video.mp4] */
import "dotenv/config";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { loadStory } from "../src/lib/load-story";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const storyFile = arg("story", "input/story.json");
const out = path.resolve(arg("out", "output/video.mp4"));

const r = loadStory(storyFile);
if (!r.ok) {
  console.error(`✖ ${storyFile} は不正です`);
  r.errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
r.warnings.forEach((w) => console.warn(`⚠ ${w}`));

// ChromeをDLできない環境では REMOTION_BROWSER_EXECUTABLE でブラウザを指定
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const inputProps = { story: r.story };
const composition = await selectComposition({ serveUrl, id: "StoryVideo", inputProps, browserExecutable });

let lastPct = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  browserExecutable,
  outputLocation: out,
  inputProps,
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct !== lastPct && pct % 10 === 0) console.log(`書き出し中... ${pct}%`);
    lastPct = pct;
  },
});
console.log(`\n✔ 完成: ${out}`);
