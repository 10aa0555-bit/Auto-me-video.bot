/**
 * オリジナルのプレースホルダー素材(SVG/WAV)を生成する。
 * 著作物は一切使わない。本番では public/ 配下を自作キャラ・背景に差し替える。
 *   npm run assets
 */
import fs from "node:fs";
import path from "node:path";

const pub = path.resolve("public");
const write = (rel: string, data: string | Buffer) => {
  const p = path.join(pub, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};

// ---- 背景 (1200x1920) ----
const bg = (top: string, bottom: string, deco: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1920" viewBox="0 0 1200 1920">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<rect width="1200" height="1920" fill="url(#g)"/>${deco}</svg>`;

const buildings = (color: string) =>
  [0, 1, 2, 3, 4, 5, 6]
    .map((i) => `<rect x="${i * 175}" y="${1000 - ((i * 137) % 5) * 90}" width="150" height="1000" fill="${color}"/>`)
    .join("");
const stars = Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 197) % 1200}" cy="${(i * 311) % 1900}" r="${2 + (i % 4)}" fill="#fff"/>`).join("");

write("backgrounds/city_morning.svg", bg("#7CC8FF", "#FFE9B0", `<circle cx="900" cy="300" r="120" fill="#FFF3A0"/>${buildings("#4A6A8A")}`));
write("backgrounds/city_chaos.svg", bg("#FF9A6B", "#7A3B5A", `${buildings("#3A2A4A")}<rect x="200" y="400" width="140" height="70" rx="12" fill="#fff"/><rect x="800" y="600" width="120" height="120" fill="#fc6"/>`));
write("backgrounds/space.svg", bg("#05061A", "#2B1A5E", `${stars}<circle cx="600" cy="1500" r="500" fill="#2E7BD6"/>`));

// ---- キャラ (800x800, 棒人間風・表情差分) ----
const face = (kind: string) => {
  switch (kind) {
    case "surprised": return `<circle cx="340" cy="260" r="16"/><circle cx="460" cy="260" r="16"/><ellipse cx="400" cy="340" rx="26" ry="38" fill="#222"/>`;
    case "scared": return `<path d="M310 255 L370 235 M490 255 L430 235" stroke="#222" stroke-width="10"/><circle cx="340" cy="270" r="12"/><circle cx="460" cy="270" r="12"/><path d="M350 350 Q400 310 450 350" stroke="#222" stroke-width="10" fill="none"/>`;
    default: return `<circle cx="340" cy="265" r="12"/><circle cx="460" cy="265" r="12"/><path d="M350 330 Q400 375 450 330" stroke="#222" stroke-width="10" fill="none"/>`;
  }
};
for (const e of ["idle", "surprised", "scared"]) {
  write(`characters/hero/${e}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<g stroke="#222" stroke-width="14" stroke-linecap="round" fill="#222">
<line x1="400" y1="400" x2="400" y2="620"/><line x1="400" y1="450" x2="290" y2="${e === "idle" ? 560 : 400}"/><line x1="400" y1="450" x2="510" y2="${e === "idle" ? 560 : 400}"/>
<line x1="400" y1="620" x2="320" y2="760"/><line x1="400" y1="620" x2="480" y2="760"/>
<circle cx="400" cy="290" r="130" fill="#FFE0B8"/><rect x="270" y="150" width="260" height="60" rx="30" fill="#FF3B5C" stroke="none"/>
${face(e)}</g></svg>`);
}

// ---- 効果音 (WAV 簡易合成) ----
const wav = (samples: number[], rate = 22050) => {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, 44 + i * 2));
  return buf;
};
const rate = 22050;
const gen = (sec: number, fn: (t: number, p: number) => number) =>
  Array.from({ length: Math.floor(rate * sec) }, (_, i) => fn(i / rate, i / (rate * sec)));
write("sfx/whoosh.wav", wav(gen(0.5, (_t, p) => (Math.random() * 2 - 1) * Math.sin(Math.PI * p) * 0.4)));
write("sfx/impact.wav", wav(gen(0.5, (t, p) => Math.sin(2 * Math.PI * (120 - 80 * p) * t) * (1 - p) ** 2 * 0.8)));

console.log("プレースホルダー素材を public/ に生成しました");
