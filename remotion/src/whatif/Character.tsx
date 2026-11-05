import React, {useMemo} from 'react';
import * as THREE from 'three';

/** 顔の表情。目・まゆ・口の形を変える。 */
export type Face = 'normal' | 'happy' | 'shock' | 'scream' | 'worried' | 'smug';

export type CharSpec = {
  shirt?: string;
  pants?: string;
  hair?: string;
  skin?: string;
  shoes?: string;
  style?: FaceStyle;
};

const INK = '#1b1b1f';

/** アニメ塗り用の 3 段階の影 (暗・中・明)。 */
const gradient = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const shade = (c: string, k: number) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();

/**
 * 顔 (目・まゆ・口・ほっぺ・汗) を 512px のキャンバスに描く。頭の丸みに沿って貼る。
 * talk: 口の開き (0..1)、blink: まばたき中。
 */
const faceTexture = (face: Face, talk: number, blink: boolean, hair: string) => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 512);
  // 前髪 (おでこにかかるギザギザ)。3D の髪のキャップの下にのぞく
  g.fillStyle = hair;
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(-10, -10);
  g.lineTo(522, -10);
  g.lineTo(522, 40);
  const tips = [[470, 78], [420, 50], [372, 92], [318, 56], [262, 98], [206, 58], [150, 90], [96, 52], [40, 80], [-10, 50]];
  let px = 522;
  let py = 40;
  for (const [x, y] of tips) {
    g.quadraticCurveTo((px + x) / 2, Math.min(py, y) - 6, x, y);
    px = x;
    py = y;
  }
  g.closePath();
  g.fill();
  g.stroke();
  // 顔のパーツは大きめ・少し下に (頭の丸みに貼ったときに見やすいように)
  g.setTransform(1.3, 0, 0, 1.3, 256 - 256 * 1.3, 256 - 256 * 1.3 + 22);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  const big = face === 'shock' || face === 'scream';
  // ほっぺ
  g.fillStyle = 'rgba(255,120,130,0.38)';
  for (const x of [150, 362]) {
    g.beginPath();
    g.ellipse(x, 300, 38, 22, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 目
  const eye = (x: number, side: number) => {
    const rx = big ? 46 : 38;
    const ry = big ? 54 : 46;
    const y = 222;
    if (blink || (face === 'happy' && talk < 0.2)) {
      // 閉じた目 (にっこりなら上に反った弧)
      g.lineWidth = 11;
      g.beginPath();
      if (face === 'happy') g.arc(x, y + 14, 30, Math.PI * 1.1, Math.PI * 1.9);
      else {
        g.moveTo(x - 32, y + 6);
        g.quadraticCurveTo(x, y + 22, x + 32, y + 6);
      }
      g.stroke();
      return;
    }
    g.lineWidth = 10;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // 瞳 (smug は横目、worried は上目)
    const px = x + (face === 'smug' ? 14 * side + 8 : 4);
    const py = y + (face === 'worried' ? -6 : 6);
    const pr = big ? 15 : 22;
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(px, py, pr, pr * 1.15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(px - pr * 0.35, py - pr * 0.45, pr * 0.38, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(px + pr * 0.4, py + pr * 0.35, pr * 0.16, 0, Math.PI * 2);
    g.fill();
    // smug は上まぶたを半分下ろす
    if (face === 'smug') {
      g.fillStyle = '#f7f3ea';
      g.fillRect(x - rx - 6, y - ry - 6, rx * 2 + 12, ry * 0.85);
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(x - rx, y - ry * 0.12);
      g.lineTo(x + rx, y - ry * 0.12);
      g.stroke();
    }
  };
  eye(186, -1);
  eye(326, 1);
  // まゆ
  g.lineWidth = 14;
  const brow = (x: number, dir: number) => {
    g.beginPath();
    if (face === 'worried' || face === 'scream') {
      g.moveTo(x - 36, 140 + dir * 14);
      g.quadraticCurveTo(x, 128, x + 36, 140 - dir * 14);
    } else if (face === 'smug') {
      g.moveTo(x - 36, 152 - dir * 6);
      g.lineTo(x + 36, 146 + dir * 6);
    } else {
      const y = big ? 112 : 142;
      g.moveTo(x - 36, y + 8);
      g.quadraticCurveTo(x, y - 12, x + 36, y + 8);
    }
    g.stroke();
  };
  brow(186, 1);
  brow(326, -1);
  // 口
  const open = Math.max(talk, face === 'scream' ? 1 : face === 'shock' ? 0.55 : 0);
  g.lineWidth = 11;
  if (open > 0.15) {
    const w = 34 + open * 18 + (face === 'happy' ? 14 : 0);
    const h = 14 + open * 46;
    g.fillStyle = '#5a1e22';
    g.beginPath();
    if (face === 'happy' || face === 'smug') {
      // 笑った口 (D 型)
      g.moveTo(256 - w, 330);
      g.lineTo(256 + w, 330);
      g.quadraticCurveTo(256 + w, 330 + h * 1.6, 256, 330 + h * 1.6);
      g.quadraticCurveTo(256 - w, 330 + h * 1.6, 256 - w, 330);
    } else {
      g.ellipse(256, 352, w, h, 0, 0, Math.PI * 2);
    }
    g.fill();
    // 舌
    g.save();
    g.clip();
    g.fillStyle = '#e8606a';
    g.beginPath();
    g.ellipse(256, 352 + h * (face === 'happy' || face === 'smug' ? 1.2 : 0.8), w * 0.7, h * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    // 上の歯
    g.fillStyle = '#ffffff';
    g.fillRect(256 - w, face === 'happy' || face === 'smug' ? 324 : 352 - h - 4, w * 2, 12 + open * 6);
    g.restore();
    g.stroke();
  } else {
    g.beginPath();
    if (face === 'happy') {
      g.moveTo(206, 330);
      g.quadraticCurveTo(256, 380, 306, 330);
    } else if (face === 'smug') {
      g.moveTo(214, 344);
      g.quadraticCurveTo(268, 360, 304, 322);
    } else if (face === 'worried') {
      g.moveTo(214, 360);
      g.bezierCurveTo(236, 338, 256, 370, 276, 346);
      g.quadraticCurveTo(290, 336, 300, 352);
    } else {
      g.moveTo(226, 346);
      g.quadraticCurveTo(256, 356, 286, 346);
    }
    g.stroke();
  }
  // 汗
  if (face === 'worried' || face === 'shock' || face === 'scream') {
    g.fillStyle = '#8fd3ff';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(410, 120);
    g.quadraticCurveTo(440, 178, 410, 192);
    g.quadraticCurveTo(380, 178, 410, 120);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(402, 168, 6, 10, 0.3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};


export type FaceStyle = 'bean' | 'classic' | 'dot';

/** シンプルな顔 (余計な線を描かない)。style で目の描き方を変える。 */
const simpleFace = (face: Face, talk: number, blink: boolean, style: FaceStyle) => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 512);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.fillStyle = INK;
  const big = face === 'shock' || face === 'scream';
  const ey = 246;
  // パーツを少し大きく (頭の丸みに貼ると小さく見えるため)
  g.setTransform(1.5, 0, 0, 1.5, 256 - 384, 256 - 384 + 4);
  for (const x of [200, 312]) {
    if (blink) {
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(x - 16, ey + 4);
      g.lineTo(x + 16, ey + 4);
      g.stroke();
      continue;
    }
    // smug: 目の上半分を切って、まぶたの線を引く
    g.save();
    if (face === 'smug') {
      g.beginPath();
      g.rect(x - 60, ey - 4, 120, 90);
      g.clip();
    }
    if (style === 'classic') {
      const r = big ? 36 : 31;
      g.fillStyle = '#ffffff';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(x, ey, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x + (face === 'smug' ? 9 : 2), ey + 4, big ? 9 : 12, 0, Math.PI * 2);
      g.fill();
    } else if (style === 'dot') {
      g.beginPath();
      g.arc(x, ey, big ? 15 : 12, 0, Math.PI * 2);
      g.fill();
    } else {
      const rx = big ? 21 : 17;
      const ry = big ? 32 : 27;
      g.beginPath();
      g.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x - 6, ey - 10, 6.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
    }
    g.restore();
    g.fillStyle = INK;
    if (face === 'smug') {
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x - 22, ey - 4);
      g.lineTo(x + 22, ey - 4);
      g.stroke();
    }
  }
  // まゆは困ったとき・叫ぶときだけ (細く)
  if (face === 'worried' || face === 'scream') {
    g.lineWidth = 8;
    for (const [x, d] of [[200, 1], [312, -1]] as const) {
      g.beginPath();
      g.moveTo(x - 20, 196 + d * 9);
      g.lineTo(x + 20, 196 - d * 9);
      g.stroke();
    }
  }
  // 口
  const open = Math.max(talk, face === 'scream' ? 1 : face === 'shock' ? 0.5 : 0);
  g.lineWidth = 8;
  if (open > 0.15) {
    g.fillStyle = '#3a1518';
    g.beginPath();
    if (face === 'happy') {
      g.moveTo(226, 318);
      g.lineTo(286, 318);
      g.quadraticCurveTo(286, 318 + 30 + open * 18, 256, 318 + 30 + open * 18);
      g.quadraticCurveTo(226, 318 + 30 + open * 18, 226, 318);
    } else {
      g.ellipse(256, 334, 14 + open * 10, 8 + open * 24, 0, 0, Math.PI * 2);
    }
    g.fill();
  } else {
    g.beginPath();
    if (face === 'happy') {
      g.moveTo(228, 318);
      g.quadraticCurveTo(256, 346, 284, 318);
    } else if (face === 'smug') {
      g.moveTo(236, 330);
      g.quadraticCurveTo(262, 340, 284, 318);
    } else if (face === 'worried') {
      g.moveTo(234, 334);
      g.quadraticCurveTo(256, 322, 278, 334);
    } else {
      g.moveTo(238, 326);
      g.quadraticCurveTo(256, 336, 274, 326);
    }
    g.stroke();
  }
  // 汗 (困った・驚いたとき)
  if (face === 'worried' || face === 'shock') {
    g.fillStyle = '#8fd3ff';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(372, 176);
    g.quadraticCurveTo(394, 214, 372, 224);
    g.quadraticCurveTo(350, 214, 372, 176);
    g.fill();
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

const outlineMat = new THREE.MeshBasicMaterial({color: INK, side: THREE.BackSide});

/** 太い黒フチ付きのアニメ塗り (裏面を少し大きく描く)。 */
const Toon: React.FC<{geo: THREE.BufferGeometry; color: string; w?: number; glow?: number} & JSX.IntrinsicElements['group']> = ({geo, color, w = 1.07, glow = 0, ...rest}) => (
  <group {...rest}>
    <mesh geometry={geo} castShadow>
      <meshToonMaterial color={color} gradientMap={gradient} emissive={color} emissiveIntensity={glow} />
    </mesh>
    <mesh geometry={geo} material={outlineMat} scale={w} />
  </group>
);

/** パーカーの胴 (下が広い豆の形)。 */
const bodyGeometry = () => {
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [[0, 0], [0.62, 0.02], [0.74, 0.18], [0.76, 0.5], [0.7, 0.95], [0.6, 1.3], [0.42, 1.52], [0, 1.56]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const curve = new THREE.SplineCurve(pts);
  const g = new THREE.LatheGeometry(curve.getPoints(24), 32);
  g.computeVertexNormals();
  return g;
};

/** 顔を貼る、頭の前面の曲面 (頭より少しだけ大きい球の一部)。 */
const faceGeometry = () => new THREE.SphereGeometry(1.012, 48, 32, Math.PI / 2 - 1.05, 2.1, Math.PI / 2 - 1.0, 2.0);

/**
 * 丸顔のキャラクター (高さ約 4.4 単位)。
 * walk は歩きの位相 (秒)、wave は手を振る強さ、hop は跳ねる高さ、time は呼吸とまばたき用の時刻、seed は個体差。
 */
export const Character: React.FC<{
  spec?: CharSpec;
  face?: Face;
  talk?: number;
  walk?: number;
  wave?: number;
  hop?: number;
  time?: number;
  seed?: number;
  position?: [number, number, number];
  rotation?: number;
  scale?: number;
}> = ({spec = {}, face = 'normal', talk = 0, walk = 0, wave = 0, hop = 0, time = 0, seed = 0, position = [0, 0, 0], rotation = 0, scale = 1}) => {
  const g = useMemo(() => ({
    head: new THREE.SphereGeometry(1, 40, 28),
    face: faceGeometry(),
    body: bodyGeometry(),
    hood: new THREE.TorusGeometry(0.42, 0.13, 12, 28),
    arm: new THREE.CapsuleGeometry(0.19, 0.6, 6, 12),
    hand: new THREE.SphereGeometry(0.24, 16, 12),
    leg: new THREE.CapsuleGeometry(0.2, 0.42, 6, 12),
    shoe: new THREE.SphereGeometry(0.3, 16, 12),
    cap: new THREE.SphereGeometry(1.05, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.33),
    back: new THREE.SphereGeometry(1.05, 36, 18, Math.PI * 1.08, Math.PI * 0.84, 0, Math.PI * 0.6),
    tuft: new THREE.ConeGeometry(0.15, 0.6, 8),
  }), []);
  // まばたき: 個体ごとにずらして 3〜4 秒に 1 回、0.12 秒
  const period = 3.3 + (seed % 7) * 0.13;
  const blink = (time + seed * 0.71) % period < 0.12;
  const talkQ = Math.round(talk * 3) / 3;
  const hair = spec.hair ?? '#3a2a20';
  const style = spec.style ?? 'bean';
  const tex = useMemo(() => simpleFace(face, talkQ, blink, style), [face, talkQ, blink, style]);
  const skin = spec.skin ?? '#f7f3ea';
  const shirt = spec.shirt ?? '#e8483f';
  const pants = spec.pants ?? '#2f3440';
  const shoes = spec.shoes ?? '#f4f4f4';
  const moving = walk ? 1 : 0;
  const swing = Math.sin(walk * 9) * 0.65 * moving;
  const breath = 1 + Math.sin(time * 2.4 + seed) * 0.018;
  const tilt = Math.sin(time * 1.3 + seed) * 0.05 + talk * 0.04 + (face === 'worried' ? 0.08 : 0);
  const bounce = moving * Math.abs(Math.sin(walk * 9)) * 0.12;
  // 腕は肩を支点に回す (wave: 右手を上げて振る)
  // 叫ぶときは両手を上げてブルブル、驚いたときは手を広げる
  const panic = face === 'scream' ? 2.5 + Math.sin(time * 30) * 0.12 : face === 'shock' ? 0.9 : 0;
  const rArm = 0.32 + Math.max(wave * (2.3 + Math.sin(time * 12) * 0.3), panic);
  const lArm = -0.32 - panic;
  return (
    <group position={[position[0], position[1] + hop + bounce, position[2]]} rotation={[0, rotation, 0]} scale={scale}>
      {/* 脚と靴 */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 0.3, 0.95, 0]} rotation={[sd * swing, 0, 0]}>
          <Toon geo={g.leg} color={pants} position={[0, -0.42, 0]} w={1.1} />
          <Toon geo={g.shoe} color={shoes} position={[0, -0.78, 0.1]} scale={[1, 0.62, 1.35]} w={1.1} />
        </group>
      ))}
      {/* 胴 (呼吸で少しふくらむ) */}
      <group position={[0, 0.82, 0]} scale={[1, breath, 1]}>
        <Toon geo={g.body} color={shirt} w={1.05} />
        {/* パーカーのポケットのライン */}
        <mesh position={[0, 0.45, 0.735]} rotation={[0.04, 0, 0]}>
          <planeGeometry args={[0.8, 0.05]} />
          <meshBasicMaterial color={shade(shirt, 0.55)} />
        </mesh>
        {/* フード (首の後ろ) */}
        <Toon geo={g.hood} color={shade(shirt, 0.82)} position={[0, 1.48, -0.14]} rotation={[Math.PI / 2 + 0.45, 0, 0]} w={1.08} />
      </group>
      {/* 腕と手 */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 0.66, 2.12, 0]} rotation={[sd === 1 ? swing * (1 - wave) : -swing, 0, sd === 1 ? rArm : lArm]}>
          <Toon geo={g.arm} color={shirt} position={[0, -0.45, 0]} w={1.1} />
          <Toon geo={g.hand} color={skin} position={[0, -0.92, 0]} w={1.1} />
        </group>
      ))}
      {/* 頭 */}
      <group position={[0, 3.35, 0]} rotation={[0, 0, tilt]} scale={[1.04, 0.98, 1]}>
        <Toon geo={g.head} color={skin} w={1.045} glow={0.45} />
        <mesh geometry={g.face}>
          <meshBasicMaterial map={tex} transparent depthWrite={false} />
        </mesh>
        {/* 髪: 頭頂のキャップ + 後ろ髪 + 前髪 + アホ毛 */}
        <Toon geo={g.cap} color={hair} position={[0, 0.02, -0.02]} w={1.03} />
        <Toon geo={g.back} color={hair} position={[0, 0, -0.04]} w={1.03} />
        <Toon geo={g.tuft} color={hair} w={1.15} position={[0.08, 1.12, 0.05]} rotation={[0.25, 0, -0.35 + Math.sin(time * 3 + seed) * 0.08]} />
        <Toon geo={g.tuft} color={hair} w={1.15} position={[-0.12, 1.08, -0.05]} rotation={[-0.1, 0, 0.45]} scale={0.75} />
      </group>
    </group>
  );
};
