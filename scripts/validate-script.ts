/** 台本JSONの検証: npm run validate -- [input/story.json] */
import { loadStory } from "../src/lib/load-story";

const file = process.argv[2] ?? "input/story.json";
const r = loadStory(file);
if (!r.ok) {
  console.error(`✖ ${file} は不正です`);
  r.errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
r.warnings.forEach((w) => console.warn(`⚠ ${w}`));
console.log(`✔ ${file} は有効です (${r.story.scenes.length} シーン)`);
if (r.warnings.length) process.exit(2);
