import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import type {Caption} from '../types';
import {clamp01, easeInOut, easeOut, popIn, H, W} from '../util';

/**
 * 「しくみ解説」のジオラマ (机の上の模型を撮っているような 3D)。
 * 舞台は 2 つ: table (木の台座の上の線路と汽車) と lab (車輪の仕組みを大きく見せる実験台、x=LX)。
 */

type V3 = [number, number, number];
type Cam = {pos: V3; look: V3};
export type DScene = {
  start: number;
  dur: number;
  spec: {
    narration?: string;
    cam?: Cam;
    to?: Cam; // シーンの中でゆっくり動く先
    cut?: boolean; // 前のシーンから飛んで切り替える (暗転)
    hook?: string[];
    shift?: number; // lab: 車輪の横ずれ (+ が外側)
    yaw?: number; // lab: 車軸の向き
    lift?: number; // lab: 車輪を持ち上げる高さ
    turn?: boolean; // lab: 持ち上げて回して見せる
    rings?: boolean; // lab: 接している所の輪 (転がる大きさ)
    arrows?: boolean; // lab: 1 回転で進む距離の矢印
    sparks?: boolean;
    flange?: boolean; // フランジを光らせる
    axle?: boolean; // 車軸を光らせる
    push?: boolean; // 外側へ押される矢印
    labels?: {text: string; at: V3; delay?: number}[]; // lab の原点からの位置
    texts?: {text: string; y?: number; delay?: number}[];
  };
};
export type DProps = {frames: number; fps: number; scenes: DScene[]; captions: Caption[]; audio?: string; plaque?: string};

const LX = 300; // lab の位置
const G = 6; // lab の軌間
const C0 = 0.9; // 車輪の踏面で、まっすぐのときに接する位置 (フランジ側から)
const RAIL_TOP = 1.6;
const rAt = (u: number) => 3.4 - (0.45 / 1.65) * (Math.min(1.8, Math.max(0.15, u)) - 0.15); // 円すいの半径 (誇張)

// ---------------------------------------------------------------- 文字の板 (Canvas のテクスチャ)

export const textTexture = (text: string, opts: {w?: number; h?: number; size?: number; color?: string; bg?: string; stroke?: string} = {}) => {
  const c = document.createElement('canvas');
  c.width = opts.w ?? 1024;
  c.height = opts.h ?? 256;
  const g = c.getContext('2d')!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    const r = 60;
    g.beginPath();
    g.roundRect(8, 8, c.width - 16, c.height - 16, r);
    g.fill();
  }
  let size = opts.size ?? 110;
  g.font = `800 ${size}px Poppins`;
  // はみ出す長さなら文字を小さくする
  const maxW = c.width - 120;
  const w0 = g.measureText(text).width;
  if (w0 > maxW) {
    size = Math.floor(size * maxW / w0);
    g.font = `800 ${size}px Poppins`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opts.stroke) {
    g.lineWidth = 18;
    g.strokeStyle = opts.stroke;
    g.lineJoin = 'round';
    g.strokeText(text, c.width / 2, c.height / 2 + 6);
  }
  g.fillStyle = opts.color ?? '#ffffff';
  g.fillText(text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

export const Label: React.FC<{text: string; at: V3; k: number; scale?: number}> = ({text, at, k, scale = 1}) => {
  const tex = useMemo(() => textTexture(text, {bg: 'rgba(20,22,28,0.82)', color: '#ffd23f', size: 96}), [text]);
  if (k <= 0) return null;
  const s = scale * (0.7 + 0.3 * k);
  return (
    <sprite position={at} scale={[8 * s, 2 * s, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent opacity={k} depthTest={false} />
    </sprite>
  );
};

// ---------------------------------------------------------------- 線路 (楕円の競技場の形)

const LST = 24;
const RC = 9;
const LT = 2 * LST + 2 * Math.PI * RC;
const pathAt = (s0: number) => {
  let s = ((s0 % LT) + LT) % LT;
  if (s < LST) return {x: -LST / 2 + s, z: RC, dx: 1, dz: 0};
  s -= LST;
  if (s < Math.PI * RC) {
    const a = s / RC;
    return {x: LST / 2 + RC * Math.sin(a), z: RC * Math.cos(a), dx: Math.cos(a), dz: -Math.sin(a)};
  }
  s -= Math.PI * RC;
  if (s < LST) return {x: LST / 2 - s, z: -RC, dx: -1, dz: 0};
  s -= LST;
  const a = s / RC;
  return {x: -LST / 2 - RC * Math.sin(a), z: -RC * Math.cos(a), dx: -Math.cos(a), dz: Math.sin(a)};
};
const headingOf = (p: {dx: number; dz: number}) => Math.atan2(-p.dz, p.dx);

const Track: React.FC = () => {
  const {rails, ballast, sleepers} = useMemo(() => {
    const N = 360;
    const pts = (off: number, y: number) =>
      Array.from({length: N}).map((_, i) => {
        const p = pathAt((i / N) * LT);
        return new THREE.Vector3(p.x + p.dz * off, y, p.z - p.dx * off);
      });
    const rails = [-0.7, 0.7].map((o) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts(o, 0.98), true), 480, 0.12, 6, true));
    // 砂利の帯
    const L = pts(1.7, 0.63);
    const R = pts(-1.7, 0.63);
    const pos: number[] = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      pos.push(L[i].x, L[i].y, L[i].z, R[i].x, R[i].y, R[i].z, L[j].x, L[j].y, L[j].z);
      pos.push(R[i].x, R[i].y, R[i].z, R[j].x, R[j].y, R[j].z, L[j].x, L[j].y, L[j].z);
    }
    const ballast = new THREE.BufferGeometry();
    ballast.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ballast.computeVertexNormals();
    const sleepers = Array.from({length: Math.floor(LT / 0.9)}).map((_, i) => {
      const p = pathAt(i * 0.9);
      return {x: p.x, z: p.z, h: headingOf(p)};
    });
    return {rails, ballast, sleepers};
  }, []);
  return (
    <group>
      <mesh geometry={ballast} receiveShadow>
        <meshStandardMaterial color="#8d8478" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {sleepers.map((s, i) => (
        <mesh key={i} position={[s.x, 0.76, s.z]} rotation={[0, s.h, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 0.24, 2.6]} />
          <meshStandardMaterial color="#6b4a33" roughness={0.9} />
        </mesh>
      ))}
      {rails.map((g, i) => (
        <mesh key={i} geometry={g} castShadow>
          <meshStandardMaterial color="#b9bec6" metalness={0.75} roughness={0.32} />
        </mesh>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- 汽車

const Wheels: React.FC<{spin: number}> = ({spin}) => (
  <group>
    {[-1.4, 1.4].map((x) =>
      [-0.72, 0.72].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.45, z]} rotation={[Math.PI / 2, 0, -spin]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.2, 18]} />
          <meshStandardMaterial color="#26282c" metalness={0.5} roughness={0.5} />
        </mesh>
      )),
    )}
  </group>
);

const Car: React.FC<{kind: 'loco' | 'coach'; color: string; spin: number}> = ({kind, color, spin}) => (
  <group position={[0, 1.1, 0]}>
    <Wheels spin={spin} />
    <mesh position={[0, 0.95, 0]} castShadow>
      <boxGeometry args={[4.4, 0.3, 1.9]} />
      <meshStandardMaterial color="#2b2b2e" roughness={0.6} />
    </mesh>
    {kind === 'coach' ? (
      <group>
        <mesh position={[0, 1.95, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.2, 1.7, 2.0]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
        <mesh position={[0, 2.9, 0]} castShadow>
          <boxGeometry args={[4.5, 0.22, 2.25]} />
          <meshStandardMaterial color="#3a3030" roughness={0.6} />
        </mesh>
        {[-1.3, 0, 1.3].map((x) =>
          [-1.01, 1.01].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 2.15, z]}>
              <boxGeometry args={[0.8, 0.6, 0.03]} />
              <meshStandardMaterial color="#f6dfa2" emissive="#f2c46a" emissiveIntensity={0.35} roughness={0.3} />
            </mesh>
          )),
        )}
      </group>
    ) : (
      <group>
        <mesh position={[0.55, 1.75, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.78, 0.78, 2.9, 22]} />
          <meshStandardMaterial color={color} roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[2.05, 1.75, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.8, 0.8, 0.12, 22]} />
          <meshStandardMaterial color="#222" roughness={0.5} />
        </mesh>
        <mesh position={[1.4, 2.85, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.18, 0.9, 12]} />
          <meshStandardMaterial color="#1d1d1f" roughness={0.6} />
        </mesh>
        <mesh position={[-1.35, 2.05, 0]} castShadow>
          <boxGeometry args={[1.6, 2.1, 2.0]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[-1.35, 3.2, 0]} castShadow>
          <boxGeometry args={[1.9, 0.2, 2.3]} />
          <meshStandardMaterial color="#1d1d1f" roughness={0.6} />
        </mesh>
        <mesh position={[2.25, 1.0, 0]}>
          <boxGeometry args={[0.3, 0.3, 1.9]} />
          <meshStandardMaterial color="#b0342c" roughness={0.6} />
        </mesh>
      </group>
    )}
  </group>
);

const Train: React.FC<{t: number}> = ({t}) => {
  const s0 = 6 + t * 3.0;
  const cars: {kind: 'loco' | 'coach'; color: string}[] = [
    {kind: 'loco', color: '#2f5d46'},
    {kind: 'coach', color: '#8b2f2f'},
    {kind: 'coach', color: '#e5d6b4'},
  ];
  return (
    <group>
      {cars.map((c, i) => {
        const p = pathAt(s0 - i * 4.9);
        return (
          <group key={i} position={[p.x, 0, p.z]} rotation={[0, headingOf(p), 0]}>
            <Car kind={c.kind} color={c.color} spin={s0 / 0.45} />
          </group>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------- 台座・草・木・柵・納屋

export const Base: React.FC<{w: number; d: number; x?: number; plaque?: string}> = ({w, d, x = 0, plaque}) => {
  const tex = useMemo(() => (plaque ? textTexture(plaque, {w: 1024, h: 160, size: 84, color: '#3a2a12'}) : null), [plaque]);
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, -2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 5, d]} />
        <meshStandardMaterial color="#6e3f22" roughness={0.55} />
      </mesh>
      <mesh position={[0, -5.6, 0]} receiveShadow>
        <boxGeometry args={[w + 2.4, 1.4, d + 2.4]} />
        <meshStandardMaterial color="#4b2915" roughness={0.6} />
      </mesh>
      {/* 金の線 */}
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[w + 0.12, 0.25, d + 0.12]} />
        <meshStandardMaterial color="#c9a24a" metalness={0.7} roughness={0.3} />
      </mesh>
      {tex && (
        <group position={[0, -2.6, d / 2 + 0.16]}>
          <mesh>
            <boxGeometry args={[16, 2.4, 0.25]} />
            <meshStandardMaterial color="#c9a24a" metalness={0.65} roughness={0.32} />
          </mesh>
          <mesh position={[0, 0, 0.14]}>
            <planeGeometry args={[15.4, 2.4]} />
            <meshBasicMaterial map={tex} transparent />
          </mesh>
        </group>
      )}
    </group>
  );
};

export const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const Grass: React.FC = () => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 2600;
  useLayoutEffect(() => {
    const r = rng(11);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < N * 3 && k < N; i++) {
      const x = (r() - 0.5) * 60;
      const z = (r() - 0.5) * 40;
      // 線路の上には生やさない
      const near = Math.abs(z) < RC + 2.3 && Math.abs(z) > RC - 2.3 && Math.abs(x) <= LST / 2;
      const dx = Math.max(0, Math.abs(x) - LST / 2);
      const rr = Math.hypot(dx, z);
      if (near || (Math.abs(x) > LST / 2 && Math.abs(rr - RC) < 2.3)) continue;
      const s = 0.45 + r() * 0.5;
      m.compose(new THREE.Vector3(x, 0.6 + 0.26 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4)),
        new THREE.Vector3(s, s, s));
      ref.current!.setMatrixAt(k, m);
      ref.current!.setColorAt(k, col.setHSL(0.25 + r() * 0.06, 0.5, 0.2 + r() * 0.1));
      k++;
    }
    ref.current!.count = k;
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} castShadow>
      <coneGeometry args={[0.13, 0.55, 4]} />
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
};

const Tree: React.FC<{x: number; z: number; s?: number}> = ({x, z, s = 1}) => (
  <group position={[x, 0.6, z]} scale={s}>
    <mesh position={[0, 0.8, 0]} castShadow>
      <cylinderGeometry args={[0.25, 0.32, 1.6, 8]} />
      <meshStandardMaterial color="#5b3b24" roughness={0.9} />
    </mesh>
    <mesh position={[0, 2.8, 0]} castShadow>
      <coneGeometry args={[1.7, 3.2, 9]} />
      <meshStandardMaterial color="#3f7a3a" roughness={0.85} />
    </mesh>
    <mesh position={[0, 4.1, 0]} castShadow>
      <coneGeometry args={[1.2, 2.4, 9]} />
      <meshStandardMaterial color="#4c8a41" roughness={0.85} />
    </mesh>
  </group>
);

const Barn: React.FC<{x: number; z: number}> = ({x, z}) => (
  <group position={[x, 0.6, z]} rotation={[0, 0.5, 0]}>
    <mesh position={[0, 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[5, 4, 6]} />
      <meshStandardMaterial color="#b3322b" roughness={0.6} />
    </mesh>
    <mesh position={[0, 4.9, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[3.0, 3.0, 6.4, 3]} />
      <meshStandardMaterial color="#e8e0d0" roughness={0.6} />
    </mesh>
    <mesh position={[2.52, 1.5, 0]}>
      <boxGeometry args={[0.05, 2.6, 2.2]} />
      <meshStandardMaterial color="#f2ece0" roughness={0.6} />
    </mesh>
  </group>
);

const Fence: React.FC<{z: number}> = ({z}) => (
  <group position={[0, 0.6, z]}>
    {Array.from({length: 21}).map((_, i) => (
      <mesh key={i} position={[-30 + i * 3, 0.7, 0]} castShadow>
        <boxGeometry args={[0.25, 1.4, 0.25]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.7} />
      </mesh>
    ))}
    {[0.55, 1.15].map((y) => (
      <mesh key={y} position={[0, y, 0]} castShadow>
        <boxGeometry args={[60, 0.16, 0.12]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.7} />
      </mesh>
    ))}
  </group>
);

export const Clouds: React.FC<{t: number}> = ({t}) => {
  const puffs = useMemo(() => {
    const r = rng(5);
    return Array.from({length: 9}).map(() => ({x: (r() - 0.5) * 420, y: 40 + r() * 70, z: -170 - r() * 60, s: 7 + r() * 9, n: 4 + Math.floor(r() * 3)}));
  }, []);
  return (
    <group>
      {puffs.map((p, i) => (
        <group key={i} position={[((p.x + t * 2.2 + 210) % 420) - 210 + LX * (i % 2), p.y, p.z]}>
          {Array.from({length: p.n}).map((_, j) => (
            <mesh key={j} position={[(j - p.n / 2) * p.s * 0.8, Math.sin(j * 2.1) * p.s * 0.25, 0]}>
              <sphereGeometry args={[p.s * (0.75 + 0.3 * Math.cos(j * 1.7)), 14, 10]} />
              <meshStandardMaterial color="#f4f1ea" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- 実験台 (車輪の仕組み)

const wheelGeom = () =>
  new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.4, -0.35),
      new THREE.Vector2(3.95, -0.35),
      new THREE.Vector2(3.95, -0.05),
      new THREE.Vector2(3.4, 0.15),
      new THREE.Vector2(2.95, 1.8),
      new THREE.Vector2(2.9, 1.95),
      new THREE.Vector2(0.4, 1.95),
    ].map((v) => new THREE.Vector2(v.x, v.y)),
    72,
  );

type LabState = {d: number; yaw: number; lift: number; turn: number; spin: number; rings: number; arrows: number; sparks: number; flange: number; axle: number; push: number; t: number};

const Lab: React.FC<{s: LabState}> = ({s}) => {
  const geo = useMemo(wheelGeom, []);
  const rR = rAt(C0 - s.d);
  const rL = rAt(C0 + s.d);
  const roll = Math.atan2(rR - rL, G) * (1 - clamp01(s.lift));
  const y = RAIL_TOP + (rR + rL) / 2 + s.lift * 4.5;
  const half = G / 2 - C0;
  const pulse = 0.6 + 0.4 * Math.sin(s.t * 6);
  const sleeperOff = (s.t * 5.1) % 2.4;
  const growR = (rR - 2.4) * 12 * easeOut(s.arrows);
  const growL = (rL - 2.4) * 12 * easeOut(s.arrows);
  return (
    <group position={[LX, 0, 0]}>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <boxGeometry args={[32, 0.4, 24]} />
        <meshStandardMaterial color="#9aa28f" roughness={0.95} />
      </mesh>
      {Array.from({length: 11}).map((_, i) => {
        const z = 12 - i * 2.4 - sleeperOff;
        if (z > 11.5 || z < -11.5) return null;
        return (
          <mesh key={i} position={[0, 0.6, z]} castShadow receiveShadow>
            <boxGeometry args={[9, 0.4, 1.0]} />
            <meshStandardMaterial color="#6b4a33" roughness={0.9} />
          </mesh>
        );
      })}
      {[-G / 2, G / 2].map((x) => (
        <mesh key={x} position={[x, 1.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.6, 0.8, 23.5]} />
          <meshStandardMaterial color="#a3a9b2" metalness={0.75} roughness={0.3} />
        </mesh>
      ))}
      {/* 車輪と車軸: 向き (yaw) → 傾き (roll) → 回転 (spin) */}
      <group position={[s.d, y, 0]} rotation={[0, s.yaw + s.turn, 0]}>
        <group rotation={[0, 0, roll]}>
          <group rotation={[s.spin, 0, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.35, 0.35, 2 * half + 0.6, 20]} />
              <meshStandardMaterial color="#5d6168" metalness={0.6} roughness={0.35}
                emissive="#ffb43a" emissiveIntensity={s.axle * pulse * 0.9} />
            </mesh>
            <mesh geometry={geo} position={[half, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
              <meshStandardMaterial color="#8d939c" metalness={0.45} roughness={0.35} />
            </mesh>
            <mesh geometry={geo} position={[-half, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <meshStandardMaterial color="#8d939c" metalness={0.45} roughness={0.35} />
            </mesh>
            {/* 回っているのが分かる目印 */}
            {[1, -1].map((side) =>
              [0, 1].map((k) => (
                <mesh key={`${side}${k}`} position={[side * (half + 1.97), 0, 0]} rotation={[k * Math.PI / 2, 0, 0]}>
                  <boxGeometry args={[0.04, 4.9, 0.35]} />
                  <meshStandardMaterial color="#c9a24a" metalness={0.5} roughness={0.4} />
                </mesh>
              )),
            )}
          </group>
          {/* フランジの光 */}
          {s.flange > 0 && [1, -1].map((side) => (
            <mesh key={side} position={[side * (half - 0.2), 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[3.95, 0.14, 10, 72]} />
              <meshBasicMaterial color="#ff8a2a" transparent opacity={s.flange * pulse} />
            </mesh>
          ))}
          {/* 接している所の輪 = その車輪が実際に転がる大きさ */}
          {s.rings > 0 && (
            <group>
              <mesh position={[G / 2 - s.d, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[rR, 0.11, 10, 80]} />
                <meshBasicMaterial color="#ffd23f" transparent opacity={s.rings} />
              </mesh>
              <mesh position={[-G / 2 - s.d, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[rL, 0.11, 10, 80]} />
                <meshBasicMaterial color="#5fd3ff" transparent opacity={s.rings} />
              </mesh>
            </group>
          )}
        </group>
        {/* 1 回転で進む距離 (地面の矢印) */}
        {s.arrows > 0 && (
          <group position={[0, -y + RAIL_TOP + 0.08, 0]}>
            {[{x: G / 2 - s.d, L: growR, c: '#ffd23f'}, {x: -G / 2 - s.d, L: growL, c: '#5fd3ff'}].map((a) => (
              <group key={a.x} position={[a.x, 0, 0]}>
                <mesh position={[0, 0, a.L / 2]}>
                  <boxGeometry args={[0.45, 0.12, Math.max(0.01, a.L)]} />
                  <meshBasicMaterial color={a.c} />
                </mesh>
                <mesh position={[0, 0, a.L + 0.6]} rotation={[Math.PI / 2, 0, 0]}>
                  <coneGeometry args={[0.7, 1.4, 16]} />
                  <meshBasicMaterial color={a.c} />
                </mesh>
              </group>
            ))}
          </group>
        )}
      </group>
      {/* 火花 (フランジがこすれる) */}
      {s.sparks > 0 && <Sparks t={s.t} at={[G / 2 - 0.35, RAIL_TOP + 0.1, 0]} k={s.sparks} />}
      {/* 外側へ押される矢印 */}
      {s.push > 0 && (
        <group position={[0, 12.5, 0]} scale={s.push}>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.8 + Math.sin(s.t * 3) * 0.3, 0, 0]}>
            <cylinderGeometry args={[0.35, 0.35, 5, 16]} />
            <meshBasicMaterial color="#ffd23f" />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 2]} position={[2.6 + Math.sin(s.t * 3) * 0.3, 0, 0]}>
            <coneGeometry args={[0.9, 1.8, 18]} />
            <meshBasicMaterial color="#ffd23f" />
          </mesh>
        </group>
      )}
    </group>
  );
};

const Sparks: React.FC<{t: number; at: V3; k: number}> = ({t, at, k}) => {
  const ps = useMemo(() => {
    const r = rng(77);
    return Array.from({length: 36}).map(() => ({vx: 1 + r() * 4, vy: 1.5 + r() * 4, vz: 2 + r() * 6, ph: r()}));
  }, []);
  return (
    <group position={at}>
      {ps.map((p, i) => {
        const u = ((t * 1.6 + p.ph) % 1) * 0.7;
        return (
          <mesh key={i} position={[p.vx * u, p.vy * u - 6 * u * u, p.vz * u]}>
            <sphereGeometry args={[0.09 * (1 - u), 6, 4]} />
            <meshBasicMaterial color={i % 3 ? '#ffb03a' : '#fff1b0'} transparent opacity={k} />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------- カメラ・数値の補間

export const sceneAt = (sc: {start: number; dur: number}[], t: number) => {
  let i = sc.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = sc.length - 1;
  return i;
};

export const lerp3 = (p: V3, q: V3, k: number): V3 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];

const camAt = (sc: DScene[], t: number): Cam => {
  const i = sceneAt(sc, t);
  const camOf = (j: number) => {
    for (let n = j; n >= 0; n--) if (sc[n].spec.cam) return sc[n];
    return sc[0];
  };
  const endOf = (s: DScene, lt: number): Cam => {
    const a = s.spec.cam ?? {pos: [0, 24, 50], look: [0, 0, 0]};
    if (!s.spec.to) return a;
    const k = easeInOut(lt / s.dur);
    return {pos: lerp3(a.pos, s.spec.to.pos, k), look: lerp3(a.look, s.spec.to.look, k)};
  };
  const s = sc[i];
  const own = s.spec.cam ? s : camOf(i);
  const lt = t - s.start;
  const cur = endOf(own, own === s ? lt : t - own.start);
  if (i === 0 || s.spec.cut || !s.spec.cam) return cur;
  const prevOwner = camOf(i - 1);
  const prev = endOf(prevOwner, s.start - prevOwner.start);
  const k = easeInOut(lt / Math.min(1.6, s.dur * 0.6));
  return {pos: lerp3(prev.pos, cur.pos, k), look: lerp3(prev.look, cur.look, k)};
};

const CameraRig: React.FC<{cam: Cam; t: number}> = ({cam, t}) => {
  const {camera} = useThree();
  const drift = Math.sin(t * 0.25) * 0.4;
  camera.position.set(cam.pos[0] + drift, cam.pos[1], cam.pos[2]);
  camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
  return null;
};

/** 数値の指定 (shift など) を、シーンの頭で前の値からなめらかに変える。 */
const track = (sc: DScene[], t: number, key: 'shift' | 'yaw' | 'lift', init = 0, move = 1.8) => {
  let prev = init;
  for (const s of sc) {
    const v = s.spec[key] ?? prev;
    if (t < s.start + s.dur) return prev + (v - prev) * easeInOut((t - s.start) / Math.min(move, s.dur * 0.8));
    prev = v;
  }
  return prev;
};

// 旗 (true/false) を、シーンの頭でフェードイン・終わりでフェードアウト
const flag = (s: DScene, lt: number, key: keyof DScene['spec'], delay = 0.4) =>
  s.spec[key] ? clamp01((lt - delay) / 0.4) * clamp01((s.dur - lt) / 0.3) : 0;

// ---------------------------------------------------------------- 文字 (字幕・つかみ・問い)

export const SubLine: React.FC<{caps: Caption[]; t: number}> = ({caps, t}) => {
  const c = caps.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  const k = easeOut((t - c.start) / 0.12);
  return (
    <div style={{position: 'absolute', top: H * 0.76, width: W, padding: '0 120px', boxSizing: 'border-box', textAlign: 'center',
      opacity: 0.4 + 0.6 * k}}>
      <span style={{fontFamily: 'Poppins', fontWeight: 800, fontSize: 56, lineHeight: 1.15, color: '#ffffff',
        textShadow: '0 2px 3px rgba(0,0,0,0.7), 0 0 18px rgba(0,0,0,0.55)'}}>{c.text}</span>
    </div>
  );
};

export const Hook: React.FC<{lines: string[]; lt: number; dur: number}> = ({lines, lt, dur}) => {
  const out = clamp01((dur - lt) / 0.4);
  return (
    <div style={{position: 'absolute', top: H * 0.1, width: W, textAlign: 'center', opacity: out}}>
      {lines.map((l, j) => (
        <div key={j} style={{fontFamily: 'Poppins', fontWeight: 800, fontSize: 96, lineHeight: 1.1, color: j ? '#ffd23f' : '#ffffff',
          transform: `scale(${popIn(lt - 0.1 - j * 0.35, 0.5)})`, textShadow: '0 4px 14px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.8)'}}>{l}</div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------- 本体

export const Diorama: React.FC<DProps> = (props) => {
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
  const lab: LabState = {
    d: track(sc, t, 'shift'),
    yaw: track(sc, t, 'yaw'),
    lift: track(sc, t, 'lift', 0, 1.4),
    turn: s.spec.turn ? easeInOut(lt / s.dur) * Math.PI * 1.2 : 0,
    spin: t * 1.6, // 手前 (+z) へ転がる
    rings: flag(s, lt, 'rings'),
    arrows: s.spec.arrows ? clamp01((lt - 0.8) / 2.5) * clamp01((s.dur - lt) / 0.3) : 0,
    sparks: flag(s, lt, 'sparks', 0.8),
    flange: flag(s, lt, 'flange', 0.8),
    axle: flag(s, lt, 'axle', 0.6),
    push: flag(s, lt, 'push', 0.3),
    t,
  };
  const cam = camAt(sc, t);
  const cutK = s.spec.cut ? clamp01(lt / 0.3) : 1;
  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg, #6f8296 0%, #9fadb9 38%, #d9cfae 62%, #e8dcb4 100%)'}}>
      <ThreeCanvas width={W} height={H} camera={{fov: 34, near: 0.5, far: 1200, position: [0, 24, 50]}}
        gl={{antialias: true, preserveDrawingBuffer: true, alpha: true}} shadows
        style={{filter: 'saturate(1.12) contrast(1.05)'}}>
        <CameraRig cam={cam} t={t} />
        <hemisphereLight args={['#eef4ff', '#7a6a55', 1.05]} />
        <directionalLight position={[40, 70, 35]} intensity={1.7} color="#fff1dc" castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-50} shadow-camera-right={50}
          shadow-camera-top={50} shadow-camera-bottom={-50} shadow-camera-far={220} shadow-bias={-0.0005} />
        <directionalLight position={[LX + 30, 60, 40]} intensity={1.5} color="#fff1dc" castShadow
          shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-25} shadow-camera-right={25}
          shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-far={200} shadow-bias={-0.0005}
          target-position={[LX, 0, 0]} />
        <Clouds t={t} />
        {/* table */}
        <Base w={64} d={44} plaque={props.plaque} />
        <mesh position={[0, 0.3, 0]} receiveShadow>
          <boxGeometry args={[62, 0.6, 42]} />
          <meshStandardMaterial color="#6da347" roughness={1} />
        </mesh>
        <Grass />
        <Track />
        <Train t={t} />
        {[[26, -15, 1.1], [28, 14, 0.9], [-27, 15, 1], [8, -17, 0.8], [-8, 17, 0.7], [16, -18, 1.2]].map(([x, z, k], j) => (
          <Tree key={j} x={x} z={z} s={k} />
        ))}
        <Barn x={-24} z={-14} />
        <Fence z={-20.3} />
        {/* lab */}
        <Base w={34} d={26} x={LX} />
        <Lab s={lab} />
        {ready &&
          (s.spec.labels ?? []).map((l, j) => (
            <Label key={`${i}-${j}`} text={l.text} at={[LX + l.at[0], l.at[1], l.at[2]]} k={clamp01((lt - (l.delay ?? 0.6)) / 0.35) * clamp01((s.dur - lt) / 0.3)} />
          ))}
      </ThreeCanvas>
      {/* 模型を撮った写真らしく: 上下をぼかす + 周辺を暗く */}
      <AbsoluteFill style={{backdropFilter: 'blur(6px)', WebkitMaskImage: 'linear-gradient(#000 0%, #000 6%, transparent 30%, transparent 72%, #000 96%)'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 58%, rgba(0,0,0,0.3) 100%)'}} />
      <AbsoluteFill style={{background: '#000', opacity: 1 - cutK}} />
      {s.spec.hook && <Hook lines={s.spec.hook} lt={lt} dur={s.dur} />}
      {(s.spec.texts ?? []).map((x, j) => (
        <div key={j} style={{position: 'absolute', top: H * (x.y ?? 0.14), width: W, textAlign: 'center',
          transform: `scale(${popIn(lt - (x.delay ?? 0.5), 0.5)})`}}>
          <span style={{fontFamily: 'Poppins', fontWeight: 800, fontSize: 100, color: '#ffd23f',
            textShadow: '0 4px 14px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.8)'}}>{x.text}</span>
        </div>
      ))}
      <SubLine caps={props.captions ?? []} t={t} />
      {props.audio && <Audio src={staticFile(`job/${props.audio}`)} />}
    </AbsoluteFill>
  );
};
