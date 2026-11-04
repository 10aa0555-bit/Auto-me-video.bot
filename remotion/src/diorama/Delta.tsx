import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {Caption} from '../types';
import {clamp01, easeInOut, easeOut, popIn, H, W} from '../util';
import {Base, Clouds, Hook, Label, SubLine, lerp3, rng, sceneAt} from './Diorama';

/**
 * 「What if」のジオラマ: ミシシッピ川が旧オールドリバー制御施設を破って、アチャファラヤ川へ流れを変える。
 * 木の台座の上の地形 (川・湿地・畑・街・工場・船) と、水の流れ・堤防の決壊・干上がる川底・上ってくる塩水を 3D で見せる。
 */

type V3 = [number, number, number];
type Cam = {pos: V3; look: V3};
export type DeltaScene = {
  start: number;
  dur: number;
  spec: {
    narration?: string;
    cam?: Cam;
    to?: Cam;
    cut?: boolean;
    hook?: string[];
    chip?: string; // 年のチップ ("1963")
    div?: number; // 0..1 ミシシッピの水がアチャファラヤへ流れる割合 (1 で本流が干上がる)
    fail?: number; // 0..1 水門が壊れる
    flood?: number; // 0..1 増水
    salt?: number; // 0..1 塩水がのぼる
    mood?: number; // 0..1 空が暗くなる
    oldmouths?: boolean; // 昔の河口の跡
    glow?: '' | 'low' | 'br' | 'both'; // 光る道すじ
    labels?: {text: string; key?: string; at?: V3; delay?: number}[];
    texts?: {text: string; y?: number; delay?: number; color?: string; size?: number}[];
  };
};
export type DeltaProps = {frames: number; fps: number; scenes: DeltaScene[]; captions: Caption[]; audio?: string; plaque?: string};

// ---------------------------------------------------------------- 地形のもと (川の曲線・ノイズ)

const TW = 64;
const TD = 44;
const FLOOR = -1.1; // 台座の上面
const LAND = 0.62;
const WATER = 0.5;
const BED = 0.3;
const SEA = 0.18;

const mkCurve = (pts: [number, number][]) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const UPc = mkCurve([[8, -22.5], [7.4, -17], [5, -12], [2, -6]]);
const LOWc = mkCurve([[2, -6], [4.2, -1.5], [8, 2.5], [11.5, 6.5], [14.5, 10.5], [17, 14.5], [19.5, 17.8]]);
const BRc = mkCurve([[2, -6], [-2.5, -3.6], [-6, 0.8], [-8.8, 5.8], [-10.8, 10.8], [-12.2, 15.8]]);
const GHOSTS = [
  mkCurve([[2, -6], [-8, -9], [-16, -4], [-22, 3], [-26, 10], [-27, 15.5]]),
  mkCurve([[2, -6], [-1, 0], [-4, 6.5], [-5.2, 12], [-5, 16.5]]),
  mkCurve([[4.2, -1.5], [10, 0], [18, 3], [24, 7], [27, 12], [26, 16.5]]),
];
const hwUp = (_u: number) => 1.15;
const hwLow = (u: number) => 1.05 + 0.55 * u;
const hwBr = (u: number) => 0.9 + 0.85 * u;
const BR_MAX = 1.75;

type RS = {x: number; z: number; hw: number}[];
const samp = (c: THREE.CatmullRomCurve3, hw: (u: number) => number, k: number, n = 120): RS =>
  Array.from({length: n + 1}).map((_, i) => {
    const p = c.getPointAt(i / n);
    return {x: p.x, z: p.z, hw: hw(i / n) * k};
  });
const RS_UP = samp(UPc, hwUp, 1.1);
const RS_LOW = samp(LOWc, hwLow, 1.1);
const RS_BR = samp(BRc, hwBr, BR_MAX);
const edgeDist = (x: number, z: number) => {
  let m = 1e9;
  for (const R of [RS_UP, RS_LOW, RS_BR]) for (const p of R) {
    const d = Math.hypot(x - p.x, z - p.z) - p.hw;
    if (d < m) m = d;
  }
  return m;
};
const dBranch = (x: number, z: number) => {
  let m = 1e9;
  for (const p of RS_BR) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < m) m = d;
  }
  return m;
};

const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, z: number) => {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const coastZ = (x: number) => 15.8 + 1.3 * Math.sin(0.42 * x + 1) + 2.4 * Math.exp(-(((x - 19.5) / 3.2) ** 2));

const bankPoint = (c: THREE.CatmullRomCurve3, u: number, side: number, off: number) => {
  const p = c.getPointAt(u);
  const t = c.getTangentAt(u);
  return new THREE.Vector3(p.x - t.z * side * off, 0, p.z + t.x * side * off);
};
const CITY_BR = bankPoint(LOWc, 0.17, -1, 3.1);
const CITY_NO = bankPoint(LOWc, 0.74, -1, 3.1);
const S_OR = BRc.getPointAt(0.085);
const PLANTS = [0.34, 0.44, 0.54, 0.64].flatMap((u, i) => [bankPoint(LOWc, u, i % 2 ? 1 : -1, 2.9)]);
const KEEP_OUT: [number, number, number][] = [
  [CITY_BR.x, CITY_BR.z, 3.4], [CITY_NO.x, CITY_NO.z, 3.8], [S_OR.x, S_OR.z, 3.2], ...PLANTS.map((p) => [p.x, p.z, 1.8] as [number, number, number]),
];
const ANCHORS: Record<string, V3> = {
  NO: [CITY_NO.x, 3.8, CITY_NO.z],
  BR: [CITY_BR.x, 3.4, CITY_BR.z],
  OR: [S_OR.x, 3.4, S_OR.z],
  ATCH: [BRc.getPointAt(0.6).x - 1.5, 2.6, BRc.getPointAt(0.6).z],
  MISS: [UPc.getPointAt(0.35).x + 4.5, 2.6, UPc.getPointAt(0.35).z],
  PLANTS: [PLANTS[1].x + 2.5, 3.2, PLANTS[1].z],
  GULF: [4, 2.2, 20.2],
  SALT: [LOWc.getPointAt(0.93).x + 3, 2.4, LOWc.getPointAt(0.93).z],
};

// ---------------------------------------------------------------- 地形 (高さ + 色 + 台座の側面)

const buildTerrain = () => {
  const SX = 200;
  const SZ = 138;
  const g = new THREE.PlaneGeometry(TW, TD, SX, SZ);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const hs = new Float32Array(pos.count);
  const c = new THREE.Color();
  const cm = new THREE.Color();
  const mix = (a: string, b: string, k: number) => c.set(a).lerp(cm.set(b), k);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const e = edgeDist(x, z);
    const sea = z - coastZ(x);
    let h = LAND + 0.05 * (vnoise(x * 0.6, z * 0.6) - 0.5) * 2;
    h = THREE.MathUtils.lerp(h, -0.55, smooth(-0.6, 1.0, sea));
    const carve = smooth(0.55, -0.05, e) * (1 - smooth(-0.6, 0.3, sea));
    h = THREE.MathUtils.lerp(h, BED, carve);
    pos.setY(i, h);
    hs[i] = h;
    // 色
    const n1 = vnoise(x * 1.7, z * 1.7);
    const cell = hash(Math.floor(x / 3.2), Math.floor(z / 3.2));
    const dB = dBranch(x, z);
    if (sea > 0.1) {
      mix('#3f95a0', '#1e5a74', smooth(0, 1.6, sea));
    } else if (sea > -0.55) {
      mix('#e3d6a6', '#cdbb8a', n1);
    } else if (e < 0.04 && h < 0.46) {
      mix('#8e7a5b', '#6e5b42', n1);
    } else if (e < 0.75) {
      mix('#d4c492', '#b9a874', n1);
    } else if (dB < 5.4 && dB > 0) {
      const k = smooth(5.4, 1.2, dB);
      mix('#4d9a5f', '#2b6a58', n1 * 0.6 + k * 0.5);
      if (vnoise(x * 2.4 + 9, z * 2.4) > 0.78) c.lerp(cm.set('#5aa6a2'), 0.7);
    } else if (cell > 0.55) {
      const tones = ['#9bc061', '#c4cd6c', '#7fb257', '#d9cf86'];
      mix(tones[Math.floor(cell * 40) % 4], '#6ea34f', n1 * 0.35);
    } else {
      mix('#79ad52', '#5f9a48', n1);
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();

  // 台座の側面 (断面): 土の色。海の部分は青い水の壁
  const wp: number[] = [];
  const wc: number[] = [];
  const sp: number[] = [];
  const idx = (i: number, j: number) => j * (SX + 1) + i;
  const edge: number[][] = [];
  for (let i = 0; i <= SX; i++) edge.push([idx(i, SZ), idx(i, 0)]);
  const sides: number[][] = [];
  const side = (list: number[]) => {
    for (let k = 0; k + 1 < list.length; k++) sides.push([list[k], list[k + 1]]);
  };
  side(Array.from({length: SX + 1}).map((_, i) => idx(i, SZ))); // 手前
  side(Array.from({length: SX + 1}).map((_, i) => idx(i, 0))); // 奥
  side(Array.from({length: SZ + 1}).map((_, j) => idx(0, j))); // 左
  side(Array.from({length: SZ + 1}).map((_, j) => idx(SX, j))); // 右
  const top = new THREE.Color('#6b8b46');
  const bot = new THREE.Color('#563621');
  for (const [a, b] of sides) {
    const A = [pos.getX(a), hs[a], pos.getZ(a)];
    const B = [pos.getX(b), hs[b], pos.getZ(b)];
    const land = (h: number) => Math.max(h, SEA);
    // 土の壁
    wp.push(A[0], A[1], A[2], B[0], B[1], B[2], A[0], FLOOR, A[2], B[0], B[1], B[2], B[0], FLOOR, B[2], A[0], FLOOR, A[2]);
    for (const [hy, k] of [[A[1], 0], [B[1], 0], [FLOOR, 1], [B[1], 0], [FLOOR, 1], [FLOOR, 1]] as [number, number][]) {
      const t = k ? 1 : 0;
      void hy;
      wc.push(top.r + (bot.r - top.r) * t, top.g + (bot.g - top.g) * t, top.b + (bot.b - top.b) * t);
    }
    // 海の水の壁
    if (hs[a] < SEA - 0.02 || hs[b] < SEA - 0.02) {
      sp.push(A[0], SEA, A[2], B[0], SEA, B[2], A[0], land(A[1]), A[2], B[0], SEA, B[2], B[0], land(B[1]), B[2], A[0], land(A[1]), A[2]);
    }
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wall.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  wall.computeVertexNormals();
  const swall = new THREE.BufferGeometry();
  swall.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  swall.computeVertexNormals();
  void edge;
  return {g, wall, swall};
};

// ---------------------------------------------------------------- 水のリボン・テクスチャ

const flowTex = (base: string, streak: string, seed: number, repeat: [number, number] = [1, 1]) => {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const r = rng(seed);
  g.fillStyle = streak;
  for (let i = 0; i < 70; i++) {
    const x = r() * 128;
    const y = r() * 256;
    const rw = 1.5 + r() * 5;
    const rl = 10 + r() * 40;
    g.globalAlpha = 0.12 + r() * 0.3;
    for (const dy of [-256, 0, 256]) for (const dx of [-128, 0, 128]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, rw, rl, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(repeat[0], repeat[1]);
  return tex;
};
const dashTex = () => {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, 32, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.15, 'rgba(255,255,255,1)');
  grad.addColorStop(0.62, 'rgba(255,255,255,1)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const ribbonGeo = (c: THREE.CatmullRomCurve3, hw: (u: number) => number, scale: number, y: number, u0: number, u1: number, n: number) => {
  const len = c.getLength();
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const ind: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    const p = c.getPointAt(u);
    const t = c.getTangentAt(u);
    const w = hw(u) * scale;
    const px = -t.z;
    const pz = t.x;
    pos.push(p.x + px * w, y, p.z + pz * w, p.x - px * w, y, p.z - pz * w);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, (u * len) / 4, 1, (u * len) / 4);
    if (i < n) ind.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  return g;
};

const Ribbon: React.FC<{c: THREE.CatmullRomCurve3; hw: (u: number) => number; scale: number; y: number; mat: THREE.Material; u0?: number; u1?: number; n?: number; order?: number}> = ({
  c, hw, scale, y, mat, u0 = 0, u1 = 1, n = 100, order,
}) => {
  const key = `${Math.round(scale * 250)}:${Math.round(u0 * 500)}:${Math.round(u1 * 500)}`;
  const geo = useMemo(() => ribbonGeo(c, hw, scale, y, u0, u1, n), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geo.dispose(), [geo]);
  if (scale <= 0.03 || u1 - u0 < 0.01) return null;
  return <mesh geometry={geo} material={mat} receiveShadow renderOrder={order} />;
};

// ---------------------------------------------------------------- 木・街・工場・船・橋

const Trees: React.FC = () => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 900;
  useLayoutEffect(() => {
    const r = rng(31);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < 20000 && k < N; i++) {
      const x = (r() - 0.5) * (TW - 2);
      const z = (r() - 0.5) * (TD - 2);
      if (z > coastZ(x) - 0.9) continue;
      if (edgeDist(x, z) < 0.95) continue;
      if (KEEP_OUT.some(([a, b, rad]) => Math.hypot(x - a, z - b) < rad)) continue;
      const dB = dBranch(x, z);
      const swamp = dB < 5.4;
      // 湿地は密に、ほかはまばらに
      if (!swamp && r() > 0.3) continue;
      if (swamp && r() > 0.95 - 0.5 * smooth(5.4, 1.6, dB)) continue;
      const s = (swamp ? 0.5 : 0.45) + r() * 0.4;
      m.compose(new THREE.Vector3(x, LAND + 0.42 * s, z), q.setFromEuler(new THREE.Euler(0, r() * 6, 0)), new THREE.Vector3(s, s * (1.1 + r() * 0.3), s));
      ref.current!.setMatrixAt(k, m);
      ref.current!.setColorAt(k, swamp ? col.setHSL(0.38 + r() * 0.05, 0.4, 0.14 + r() * 0.07) : col.setHSL(0.26 + r() * 0.05, 0.5, 0.2 + r() * 0.08));
      k++;
    }
    ref.current!.count = k;
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} castShadow receiveShadow>
      <icosahedronGeometry args={[0.5, 1]} />
      <meshStandardMaterial roughness={0.9} flatShading />
    </instancedMesh>
  );
};

const CityBlocks: React.FC<{at: THREE.Vector3; n: number; r: number; seed: number; tall?: number}> = ({at, n, r: rad, seed, tall = 1}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const r = rng(seed);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const pal = ['#efe3cf', '#e8d0b0', '#d9a679', '#f4efe6', '#c98b6a', '#b7c4cf', '#e9c46a'];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad;
      const x = at.x + Math.cos(a) * d * 1.2;
      const z = at.z + Math.sin(a) * d;
      const core = 1 - d / rad;
      const h = 0.25 + r() * 0.35 + core * core * 1.5 * tall * r();
      const w = 0.32 + r() * 0.3;
      m.compose(new THREE.Vector3(x, LAND + h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.round(r() * 3) * 0.35, 0)), new THREE.Vector3(w, h, 0.3 + r() * 0.3));
      ref.current!.setMatrixAt(i, m);
      ref.current!.setColorAt(i, col.set(pal[Math.floor(r() * pal.length)]));
    }
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [at, n, rad, seed, tall]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
};

const Plant: React.FC<{at: THREE.Vector3; t: number; seed: number; doom: number}> = ({at, t, seed, doom}) => (
  <group position={[at.x, LAND, at.z]} rotation={[0, seed * 1.7, 0]}>
    {[-0.7, 0.05].map((x, i) => (
      <mesh key={i} position={[x, 0.32, i ? 0.35 : -0.2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.38, 0.64, 18]} />
        <meshStandardMaterial color="#f1f2f4" roughness={0.45} metalness={0.2} />
      </mesh>
    ))}
    <mesh position={[0.75, 0.22, -0.15]} castShadow receiveShadow>
      <boxGeometry args={[0.9, 0.44, 0.7]} />
      <meshStandardMaterial color="#8d9aa6" roughness={0.6} />
    </mesh>
    <mesh position={[0.25, 0.95, -0.55]} castShadow>
      <cylinderGeometry args={[0.1, 0.16, 1.9, 12]} />
      <meshStandardMaterial color="#d8d8d8" roughness={0.5} />
    </mesh>
    <mesh position={[0.25, 1.55, -0.55]} castShadow>
      <cylinderGeometry args={[0.115, 0.13, 0.3, 12]} />
      <meshStandardMaterial color="#c0392b" roughness={0.5} />
    </mesh>
    {[0, 1, 2, 3].map((k) => {
      const ph = (t * 0.45 + k / 4 + seed * 0.13) % 1;
      return (
        <mesh key={k} position={[0.25 + ph * 0.4, 1.95 + ph * 2.4, -0.55]} scale={0.14 + ph * 0.42}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={doom > 0.5 ? '#6d6560' : '#f3f3f3'} roughness={1} transparent opacity={(1 - ph) * 0.7} />
        </mesh>
      );
    })}
    <mesh position={[0.05, 0.12, 0.9]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} />
      <meshStandardMaterial color="#aeb4bb" metalness={0.5} roughness={0.4} />
    </mesh>
  </group>
);

const Ship: React.FC<{color: string; stacks: [string, string][]; len?: number}> = ({color, stacks, len = 2.2}) => (
  <group>
    <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
      <boxGeometry args={[len, 0.36, 0.78]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
    <mesh position={[len / 2 + 0.2, 0.2, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
      <coneGeometry args={[0.39, 0.5, 4]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
    <mesh position={[0, 0.0, 0]}>
      <boxGeometry args={[len, 0.04, 0.8]} />
      <meshStandardMaterial color="#b3342b" roughness={0.6} />
    </mesh>
    {stacks.map(([a, b], i) => (
      <group key={i} position={[len / 2 - 0.35 - i * 0.42, 0.38, 0]}>
        <mesh position={[0, 0.13, 0]} castShadow>
          <boxGeometry args={[0.36, 0.26, 0.6]} />
          <meshStandardMaterial color={a} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.39, 0]} castShadow>
          <boxGeometry args={[0.36, 0.26, 0.6]} />
          <meshStandardMaterial color={b} roughness={0.55} />
        </mesh>
      </group>
    ))}
    <mesh position={[-len / 2 + 0.3, 0.6, 0]} castShadow>
      <boxGeometry args={[0.5, 0.5, 0.62]} />
      <meshStandardMaterial color="#f3f0ea" roughness={0.5} />
    </mesh>
    <mesh position={[-len / 2 + 0.3, 0.72, 0]}>
      <boxGeometry args={[0.52, 0.1, 0.64]} />
      <meshStandardMaterial color="#27374d" roughness={0.3} />
    </mesh>
  </group>
);

const Bridge: React.FC<{u: number; thick?: number}> = ({u, thick = 1}) => {
  const p = LOWc.getPointAt(u);
  const t = LOWc.getTangentAt(u);
  const h = Math.atan2(-t.z, t.x);
  const L = (hwLow(u) * 1.1 + 1.6) * 2;
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, h + Math.PI / 2, 0]}>
      <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[L, 0.2 * thick, 0.55]} />
        <meshStandardMaterial color="#d8d4ca" roughness={0.6} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[k * (L / 2 - 0.4), 1.0, 0]} castShadow>
          <boxGeometry args={[0.22, 1.1, 0.4]} />
          <meshStandardMaterial color="#cfcac0" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- 制御施設 (水門)

const GATE_N = 3;
const Structure: React.FC<{fail: number; flood: number; t: number}> = ({fail, flood, t}) => {
  const u = 0.085;
  const S = BRc.getPointAt(u);
  const T = BRc.getTangentAt(u);
  const h = Math.atan2(-T.z, T.x);
  const Wc = 2.5;
  const pw = 0.24;
  const gw = (Wc - (GATE_N + 1) * pw) / GATE_N;
  const concrete = <meshStandardMaterial color="#d6d2c8" roughness={0.78} />;
  const steel = <meshStandardMaterial color="#51657d" metalness={0.35} roughness={0.42} />;
  const blink = Math.sin(t * 6) > 0 ? 1 : 0.15;
  const alarm = clamp01(flood * 0.9 + fail);
  const shake = 0.014 * flood * Math.sin(t * 43) * (1 - fail);
  const zAt = (i: number) => -Wc / 2 + pw / 2 + i * (gw + pw);
  return (
    <group position={[S.x + shake, 0, S.z]} rotation={[0, h, 0]}>
      {/* 土台と橋脚 */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.2, Wc + 0.3]} />
        {concrete}
      </mesh>
      {Array.from({length: GATE_N + 1}).map((_, i) => (
        <mesh key={i} position={[0, 0.88, zAt(i)]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 1.0, pw]} />
          {concrete}
        </mesh>
      ))}
      {/* 橋 (上の道) */}
      <mesh position={[0.45, 1.44, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.16, Wc + 0.6]} />
        {concrete}
      </mesh>
      {/* ゲートを持ち上げるやぐら */}
      {Array.from({length: GATE_N + 1}).map((_, i) => (
        <mesh key={i} position={[-0.3, 2.15, zAt(i)]} castShadow>
          <boxGeometry args={[0.2, 1.3, pw * 0.9]} />
          <meshStandardMaterial color="#b9b4a8" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[-0.3, 2.86, 0]} castShadow>
        <boxGeometry args={[0.3, 0.18, Wc + 0.35]} />
        <meshStandardMaterial color="#c0392b" roughness={0.5} />
      </mesh>
      {/* 鉄のゲート */}
      {Array.from({length: GATE_N}).map((_, i) => {
        const z = -Wc / 2 + pw + gw / 2 + i * (gw + pw);
        const open = 0.22 + 0.1 * Math.sin(t * 0.9 + i * 1.3);
        const f = clamp01(fail * 1.3 - i * 0.08);
        return (
          <group key={i} position={[-0.3 + f * (2.2 + 0.5 * i), 1.62 + open - f * 1.05, z + f * (i % 2 ? 0.55 : -0.45)]}
            rotation={[f * (i % 2 ? 0.9 : -0.7), f * 0.5, -f * 1.2]}>
            <mesh castShadow>
              <boxGeometry args={[0.1, 0.92, gw * 0.94]} />
              {steel}
            </mesh>
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.12, 0.08, gw * 0.96]} />
              <meshStandardMaterial color="#f08a24" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {/* 袖壁 */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[0, 0.95, sd * (Wc / 2 + 0.78)]} castShadow receiveShadow>
          <boxGeometry args={[2.6, 1.2, 1.3]} />
          {concrete}
        </mesh>
      ))}
      {/* 管理棟 + 警告灯 */}
      <mesh position={[0.5, 1.82, Wc / 2 + 0.55]} castShadow>
        <boxGeometry args={[0.8, 0.56, 0.7]} />
        <meshStandardMaterial color="#f2efe8" roughness={0.5} />
      </mesh>
      <mesh position={[0.5, 1.88, Wc / 2 + 0.55 - 0.36]}>
        <boxGeometry args={[0.62, 0.2, 0.02]} />
        <meshStandardMaterial color="#27374d" roughness={0.3} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[-0.3, 3.02, sd * (Wc / 2 + 0.1)]}>
          <sphereGeometry args={[0.1, 10, 8]} />
          <meshStandardMaterial color={alarm > 0.2 ? '#ff3b30' : '#ffb43a'} emissive={alarm > 0.2 ? '#ff3b30' : '#ffb43a'} emissiveIntensity={1.6 * blink} />
        </mesh>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- 本体のシーン

const Env: React.FC = () => {
  const {gl, scene} = useThree();
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    (scene as unknown as {environmentIntensity: number}).environmentIntensity = 0.3;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.95;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    return () => {
      rt.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
};

const CameraRig: React.FC<{cam: Cam; t: number}> = ({cam, t}) => {
  const {camera} = useThree();
  const drift = Math.sin(t * 0.3) * 0.25;
  camera.position.set(cam.pos[0] + drift, cam.pos[1], cam.pos[2]);
  camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
  return null;
};

/** 太陽: 画面に映っている範囲だけに影を作る (寄るほどくっきり)。 */
const Sun: React.FC<{cam: Cam; doom: number}> = ({cam, doom}) => {
  const ref = useRef<THREE.DirectionalLight>(null);
  const {scene} = useThree();
  const dist = Math.hypot(cam.pos[0] - cam.look[0], cam.pos[1] - cam.look[1], cam.pos[2] - cam.look[2]);
  const ext = Math.min(46, Math.max(8, dist * 0.4));
  useLayoutEffect(() => {
    const l = ref.current!;
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  useLayoutEffect(() => {
    const l = ref.current!;
    const c = l.shadow.camera as THREE.OrthographicCamera;
    c.left = -ext;
    c.right = ext;
    c.top = ext;
    c.bottom = -ext;
    c.near = 1;
    c.far = 200;
    c.updateProjectionMatrix();
    l.target.position.set(cam.look[0], 0.5, cam.look[2]);
    l.target.updateMatrixWorld();
    l.position.set(cam.look[0] + 30, 50, cam.look[2] + 26);
    l.updateMatrixWorld();
  });
  const color = useMemo(() => new THREE.Color('#fff0dc').lerp(new THREE.Color('#ff9660'), doom), [doom]);
  return <directionalLight ref={ref} intensity={2.3 - 0.9 * doom} color={color} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004} shadow-normalBias={0.03} shadow-radius={3} />;
};

const camAt = (sc: DeltaScene[], t: number): Cam => {
  const i = sceneAt(sc, t);
  const own = (j: number) => {
    for (let n = j; n >= 0; n--) if (sc[n].spec.cam) return sc[n];
    return sc[0];
  };
  const endOf = (s: DeltaScene, lt: number): Cam => {
    const a = s.spec.cam ?? {pos: [0, 40, 70] as V3, look: [0, 0, 0] as V3};
    if (!s.spec.to) return a;
    const k = easeInOut(lt / s.dur);
    return {pos: lerp3(a.pos, s.spec.to.pos, k), look: lerp3(a.look, s.spec.to.look, k)};
  };
  const s = sc[i];
  const o = own(i);
  const cur = endOf(o, t - o.start);
  if (i === 0 || s.spec.cut || !s.spec.cam) return cur;
  const po = own(i - 1);
  const prev = endOf(po, s.start - po.start);
  const k = easeInOut((t - s.start) / Math.min(1.8, s.dur * 0.6));
  return {pos: lerp3(prev.pos, cur.pos, k), look: lerp3(prev.look, cur.look, k)};
};

type Key = 'div' | 'fail' | 'flood' | 'salt' | 'mood';
const track = (sc: DeltaScene[], t: number, key: Key, move = 2.4) => {
  let prev = 0;
  for (const s of sc) {
    const v = s.spec[key] ?? prev;
    if (t < s.start + s.dur) return prev + (v - prev) * easeInOut((t - s.start) / Math.min(move, s.dur * 0.85));
    prev = v;
  }
  return prev;
};
const fade = (s: DeltaScene, lt: number, on: boolean | undefined, delay = 0.3) => (on ? clamp01((lt - delay) / 0.5) * clamp01((s.dur - lt) / 0.4) : 0);

const World: React.FC<{t: number; sc: DeltaScene[]; ready: boolean}> = ({t, sc, ready}) => {
  const i = sceneAt(sc, t);
  const s = sc[i];
  const lt = t - s.start;
  const div = track(sc, t, 'div', 3.2);
  const fail = track(sc, t, 'fail', 1.6);
  const flood = track(sc, t, 'flood', 1.8);
  const salt = track(sc, t, 'salt', 4);
  const doom = track(sc, t, 'mood', 3);
  const cam = camAt(sc, t);
  const terrain = useMemo(buildTerrain, []);
  useEffect(() => () => {
    terrain.g.dispose();
    terrain.wall.dispose();
    terrain.swall.dispose();
  }, [terrain]);

  const mats = useMemo(() => {
    const up = flowTex('#5f93a6', '#cfe8ee', 3);
    const low = flowTex('#5f93a6', '#cfe8ee', 4);
    const br = flowTex('#62957f', '#d3efe0', 5);
    const foam = flowTex('#ffffff', '#bfe3ee', 6);
    const sea = flowTex('#3f95a0', '#a8e0e4', 7, [5, 3.4]);
    const dash = dashTex();
    const water = (map: THREE.Texture) => new THREE.MeshStandardMaterial({map, roughness: 0.16, metalness: 0.05, transparent: true, opacity: 0.96, envMapIntensity: 1.4});
    return {
      up, low, br, foam, sea, dash,
      mUp: water(up), mLow: water(low), mBr: water(br),
      mFoam: new THREE.MeshStandardMaterial({map: foam, roughness: 0.5, transparent: true, opacity: 0.6}),
      mSea: new THREE.MeshStandardMaterial({map: sea, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.93, envMapIntensity: 1.3, side: THREE.DoubleSide}),
      mSalt: new THREE.MeshStandardMaterial({color: '#22d3c0', roughness: 0.25, transparent: true, opacity: 0.66, emissive: '#0c8f86', emissiveIntensity: 0.5}),
      mGlowLow: new THREE.MeshBasicMaterial({map: dash, color: '#ffd23f', transparent: true, depthWrite: false}),
      mGlowBr: new THREE.MeshBasicMaterial({map: dash.clone(), color: '#5fd3ff', transparent: true, depthWrite: false}),
      mGhost: new THREE.MeshBasicMaterial({map: dash.clone(), color: '#f6e3b0', transparent: true, depthWrite: false}),
      mBank: new THREE.MeshStandardMaterial({color: '#8e7a5b', roughness: 1}),
    };
  }, []);

  // 流れ (v が下流へ増える。offset を減らすと模様が下流へ進む)
  mats.up.offset.y = -t * 0.34;
  mats.low.offset.y = -t * 0.34 * (1 - 0.8 * div);
  mats.br.offset.y = -t * (0.3 + 0.35 * div);
  mats.foam.offset.y = -t * 0.9;
  mats.sea.offset.y = -t * 0.03;
  mats.sea.offset.x = t * 0.012;
  mats.mGlowLow.map!.offset.y = -t * 0.6;
  mats.mGlowBr.map!.offset.y = -t * 0.6;
  mats.mGhost.map!.offset.y = -t * 0.25;
  mats.mLow.color.set('#ffffff').lerp(new THREE.Color('#b9a98a'), 0.45 * div);
  mats.mBr.color.set('#ffffff').lerp(new THREE.Color('#d8b98a'), 0.6 * div);
  mats.mFoam.opacity = 0.42 + 0.3 * flood + 0.4 * fail;
  mats.mGlowLow.opacity = 0.85 * fade(s, lt, s.spec.glow === 'low' || s.spec.glow === 'both');
  mats.mGlowBr.opacity = 0.85 * fade(s, lt, s.spec.glow === 'br' || s.spec.glow === 'both');
  mats.mGhost.opacity = 0.8 * fade(s, lt, s.spec.oldmouths);

  const fl = 1 + 0.32 * flood;
  const sUp = fl;
  const sLow = (1 - 0.86 * div) * fl;
  const sBr = (1 + 0.85 * div) * fl;
  const stallAt = (() => {
    const j = sc.findIndex((x) => (x.spec.div ?? 0) >= 0.5);
    return j < 0 ? 1e9 : sc[j].start + 1;
  })();
  const stuck = clamp01((div - 0.5) / 0.4);
  const ships: {u: number; color: string; stacks: [string, string][]}[] = [
    {u: 0.2, color: '#2c4a63', stacks: [['#d9534f', '#f0ad4e'], ['#5bc0de', '#d9534f'], ['#f0ad4e', '#5cb85c']]},
    {u: 0.42, color: '#7a2f2f', stacks: [['#5cb85c', '#5bc0de'], ['#d9534f', '#f0ad4e'], ['#5bc0de', '#d9534f'], ['#f0ad4e', '#5cb85c']]},
    {u: 0.62, color: '#33564a', stacks: [['#f0ad4e', '#d9534f'], ['#5bc0de', '#5cb85c']]},
  ];
  const saltLen = 0.58 * salt;
  const camDist = Math.hypot(cam.pos[0] - cam.look[0], cam.pos[1] - cam.look[1], cam.pos[2] - cam.look[2]);
  const labelScale = Math.min(2.8, Math.max(0.5, camDist * 0.021));

  const sunBg = doom;
  void sunBg;
  return (
    <>
      <Env />
      <CameraRig cam={cam} t={t} />
      <hemisphereLight args={[doom > 0.3 ? '#ffd0b0' : '#eaf2ff', '#7a6a55', 0.85 - 0.25 * doom]} />
      <Sun cam={cam} doom={doom} />
      <Clouds t={t} />
      {/* 台座 */}
      <group position={[0, FLOOR, 0]}>
        <Base w={TW} d={TD} plaque="OLD RIVER · LOUISIANA" />
      </group>
      {/* 地面と海 */}
      <mesh geometry={terrain.g} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <mesh geometry={terrain.wall} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={terrain.swall} material={mats.mSea} />
      <mesh position={[0, SEA, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.mSea}>
        <planeGeometry args={[TW, TD]} />
      </mesh>
      {/* 川 */}
      <Ribbon c={UPc} hw={hwUp} scale={sUp} y={WATER} mat={mats.mUp} order={2} />
      <Ribbon c={LOWc} hw={hwLow} scale={sLow} y={WATER - 0.02 * div} mat={mats.mLow} order={2} />
      <Ribbon c={BRc} hw={hwBr} scale={sBr} y={WATER} mat={mats.mBr} order={2} />
      <Ribbon c={BRc} hw={(u) => hwBr(u) * 0.8} scale={sBr} y={WATER + 0.03} mat={mats.mFoam} u0={0.1} u1={0.22} order={3} />
      <Ribbon c={LOWc} hw={hwLow} scale={sLow * 1.03} y={WATER + 0.04} mat={mats.mSalt} u0={1 - saltLen} u1={1} order={4} />
      {/* 光る道すじ・昔の河口 */}
      <Ribbon c={LOWc} hw={() => 0.2} scale={1} y={WATER + 0.12} mat={mats.mGlowLow} n={160} order={6} />
      <Ribbon c={BRc} hw={() => 0.2} scale={1} y={WATER + 0.12} mat={mats.mGlowBr} n={160} order={6} />
      {GHOSTS.map((g, k) => (
        <Ribbon key={k} c={g} hw={() => 0.26} scale={1} y={LAND + 0.05} mat={mats.mGhost} n={160} order={5} />
      ))}
      {/* 景色 */}
      <Trees />
      <CityBlocks at={CITY_BR} n={150} r={2.6} seed={9} tall={0.9} />
      <CityBlocks at={CITY_NO} n={230} r={3.0} seed={13} tall={1.35} />
      {PLANTS.map((p, k) => (
        <Plant key={k} at={p} t={t} seed={k + 1} doom={doom} />
      ))}
      <Bridge u={0.2} />
      <Bridge u={0.7} thick={1.2} />
      <Structure fail={fail} flood={flood} t={t} />
      {ships.map((sh, k) => {
        const uu = Math.min(0.9, sh.u + 0.0045 * Math.min(t, stallAt));
        const p = LOWc.getPointAt(uu);
        const tg = LOWc.getTangentAt(uu);
        return (
          <group key={k} position={[p.x, WATER + 0.02 - 0.2 * stuck, p.z]} rotation={[0.1 * stuck * (k % 2 ? 1 : -1), Math.atan2(-tg.z, tg.x), 0.16 * stuck * (k % 2 ? -1 : 1)]}>
            <Ship color={sh.color} stacks={sh.stacks} />
          </group>
        );
      })}
      {ready && (s.spec.labels ?? []).map((l, j) => {
        const a = l.key ? ANCHORS[l.key] : l.at;
        if (!a) return null;
        return <Label key={`${i}-${j}`} text={l.text} at={a} k={clamp01((lt - (l.delay ?? 0.6)) / 0.35) * clamp01((s.dur - lt) / 0.3)} scale={labelScale} />;
      })}
    </>
  );
};

// ---------------------------------------------------------------- 画面の文字

const Chip: React.FC<{text: string; lt: number; dur: number}> = ({text, lt, dur}) => (
  <div style={{position: 'absolute', top: H * 0.085, width: W, textAlign: 'center', opacity: clamp01((dur - lt) / 0.3), transform: `scale(${popIn(lt - 0.2, 0.45)})`}}>
    <span style={{display: 'inline-block', padding: '8px 40px', borderRadius: 20, background: '#fff', border: '4px solid #1c2430', color: '#1c2430',
      fontFamily: 'Poppins', fontWeight: 800, fontSize: 84, boxShadow: '0 8px 24px rgba(0,0,0,0.35)'}}>{text}</span>
  </div>
);

export const Delta: React.FC<DeltaProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const sc = props.scenes;
  const i = sceneAt(sc, t);
  const s = sc[i];
  const lt = t - s.start;
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const f = new FontFace('Poppins', `url(${staticFile('job/Poppins-ExtraBold.ttf')})`, {weight: '800'});
    f.load()
      .then((ff) => document.fonts.add(ff))
      .catch(() => undefined)
      .finally(() => {
        setReady(true);
        continueRender(handle);
      });
  }, [handle]);
  const doom = track(sc, t, 'mood', 3);
  const cutK = s.spec.cut ? clamp01(lt / 0.3) : 1;
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg, #6f8296 0%, #9fadb9 38%, #d9cfae 62%, #e8dcb4 100%)'}}>
      <AbsoluteFill style={{background: 'linear-gradient(180deg, #3b2230 0%, #8a4a3a 45%, #d89a62 100%)', opacity: doom}} />
      <ThreeCanvas width={W} height={H} camera={{fov: 32, near: 0.5, far: 1200, position: [0, 30, 60]}}
        gl={{antialias: true, preserveDrawingBuffer: true, alpha: true}} shadows
        style={{filter: 'saturate(1.1) contrast(1.05)'}}>
        <World t={t} sc={sc} ready={ready} />
      </ThreeCanvas>
      <AbsoluteFill style={{backdropFilter: 'blur(6px)', WebkitMaskImage: 'linear-gradient(#000 0%, #000 5%, transparent 28%, transparent 74%, #000 97%)'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 46%, transparent 55%, rgba(0,0,0,0.34) 100%)'}} />
      <AbsoluteFill style={{background: '#000', opacity: 1 - cutK}} />
      {s.spec.hook && <Hook lines={s.spec.hook} lt={lt} dur={s.dur} />}
      {s.spec.chip && <Chip text={s.spec.chip} lt={lt} dur={s.dur} />}
      {(s.spec.texts ?? []).map((x, j) => (
        <div key={j} style={{position: 'absolute', top: H * (x.y ?? 0.14), width: W, textAlign: 'center', opacity: clamp01((s.dur - lt) / 0.3),
          transform: `scale(${popIn(lt - (x.delay ?? 0.5), 0.5)})`}}>
          <span style={{fontFamily: 'Poppins', fontWeight: 800, fontSize: x.size ?? 100, color: x.color ?? '#ffd23f',
            textShadow: '0 4px 14px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.85)'}}>{x.text}</span>
        </div>
      ))}
      <SubLine caps={props.captions ?? []} t={t} />
      {props.audio && <Audio src={staticFile(`job/${props.audio}`)} />}
    </AbsoluteFill>
  );
};

export {easeOut};
