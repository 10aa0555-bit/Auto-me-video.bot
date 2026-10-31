import React, {useMemo} from 'react';
import * as THREE from 'three';

/** 顔の表情。目・まゆ・口の形を変える。 */
export type Face = 'normal' | 'happy' | 'shock' | 'scream' | 'worried' | 'smug';

export type CharSpec = {
  shirt?: string;
  pants?: string;
  hair?: string;
  skin?: string;
};

/** 顔の模様 (目・まゆ・口・汗) を描いたテクスチャ。頭の正面に貼る。 */
const faceTexture = (face: Face, talk: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.lineCap = 'round';
  g.strokeStyle = '#1b1b1f';
  g.fillStyle = '#1b1b1f';
  // 目 (白目に黒い点)。驚いたら大きく
  const big = face === 'shock' || face === 'scream';
  const eye = (x: number) => {
    g.lineWidth = 6;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(x, 112, big ? 30 : 24, big ? 34 : 26, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#1b1b1f';
    g.beginPath();
    g.arc(x + (face === 'smug' ? 6 : 0), 116, big ? 7 : 9, 0, Math.PI * 2);
    g.fill();
  };
  eye(92);
  eye(164);
  // まゆ
  g.lineWidth = 8;
  const brow = (x: number, dir: number) => {
    g.beginPath();
    if (face === 'worried') {
      g.moveTo(x - 22, 70 + dir * 6);
      g.lineTo(x + 22, 70 - dir * 6);
    } else if (face === 'smug') {
      g.moveTo(x - 22, 74);
      g.lineTo(x + 22, 70 + dir * 4);
    } else {
      g.moveTo(x - 22, big ? 62 : 74);
      g.quadraticCurveTo(x, big ? 52 : 66, x + 22, big ? 62 : 74);
    }
    g.stroke();
  };
  brow(92, 1);
  brow(164, -1);
  // 口。しゃべっている間は talk (0..1) で開く
  g.lineWidth = 7;
  const open = Math.max(talk, face === 'scream' ? 1 : face === 'shock' ? 0.6 : 0);
  if (open > 0.15) {
    g.fillStyle = '#5a1e22';
    g.beginPath();
    g.ellipse(128, 182, 26 + open * 10, 8 + open * 26, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(110, 176 - open * 20, 36, 8);
  } else {
    g.beginPath();
    if (face === 'happy' || face === 'smug') {
      g.moveTo(98, 176);
      g.quadraticCurveTo(128, 204, 158, 176);
    } else if (face === 'worried') {
      g.moveTo(104, 190);
      g.quadraticCurveTo(128, 176, 152, 190);
    } else {
      g.moveTo(108, 184);
      g.lineTo(148, 184);
    }
    g.stroke();
  }
  // 汗
  if (face === 'worried' || face === 'shock') {
    g.fillStyle = '#7cc7f2';
    g.strokeStyle = '#1b1b1f';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(206, 60);
    g.quadraticCurveTo(222, 92, 206, 100);
    g.quadraticCurveTo(190, 92, 206, 60);
    g.fill();
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const outlineMat = new THREE.MeshBasicMaterial({color: '#1b1b1f', side: THREE.BackSide});

/** 太い黒フチ (裏面を少し大きく描く、アニメ風の定番のやり方)。 */
const Outlined: React.FC<{geo: THREE.BufferGeometry; color: string; w?: number} & JSX.IntrinsicElements['group']> = ({geo, color, w = 1.08, ...rest}) => (
  <group {...rest}>
    <mesh geometry={geo} castShadow>
      <meshToonMaterial color={color} />
    </mesh>
    <mesh geometry={geo} material={outlineMat} scale={w} />
  </group>
);

/**
 * 丸顔のキャラクター (高さ約 4 単位)。walk は歩きの位相 (秒)、wave は手を振る強さ、hop は跳ねる高さ。
 * 顔はいつもカメラ側を向く板に描く (2D のキャラを 3D の街に置いたような見た目)。
 */
export const Character: React.FC<{
  spec?: CharSpec;
  face?: Face;
  talk?: number;
  walk?: number;
  wave?: number;
  hop?: number;
  position?: [number, number, number];
  rotation?: number;
  scale?: number;
}> = ({spec = {}, face = 'normal', talk = 0, walk = 0, wave = 0, hop = 0, position = [0, 0, 0], rotation = 0, scale = 1}) => {
  const g = useMemo(() => ({
    head: new THREE.SphereGeometry(1, 32, 24),
    body: new THREE.CapsuleGeometry(0.62, 0.9, 6, 16),
    limb: new THREE.CapsuleGeometry(0.17, 0.85, 4, 10),
    hair: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2),
    tuft: new THREE.ConeGeometry(0.22, 0.6, 8),
  }), []);
  // 口の開き具合は 4 段階にまとめて、テクスチャを作り直しすぎないようにする
  const talkQ = Math.round(talk * 3) / 3;
  const tex = useMemo(() => faceTexture(face, talkQ), [face, talkQ]);
  const skin = spec.skin ?? '#f7f3ea';
  const swing = Math.sin(walk * 9) * 0.7 * (walk ? 1 : 0);
  return (
    <group position={[position[0], position[1] + hop, position[2]]} rotation={[0, rotation, 0]} scale={scale}>
      {/* 脚 */}
      <Outlined geo={g.limb} color={spec.pants ?? '#2f3440'} position={[-0.28, 0.5, 0]} rotation={[swing, 0, 0]} />
      <Outlined geo={g.limb} color={spec.pants ?? '#2f3440'} position={[0.28, 0.5, 0]} rotation={[-swing, 0, 0]} />
      {/* 体 */}
      <Outlined geo={g.body} color={spec.shirt ?? '#e8483f'} position={[0, 1.55, 0]} w={1.06} />
      {/* 腕 (右手は振れる) */}
      <Outlined geo={g.limb} color={spec.shirt ?? '#e8483f'} position={[-0.78, 1.7, 0]} rotation={[-swing, 0, 0.35]} />
      <Outlined geo={g.limb} color={spec.shirt ?? '#e8483f'} position={[0.78, 1.7 + wave * 0.5, 0]}
        rotation={[swing * (1 - wave), 0, -0.35 - wave * (2.2 + Math.sin(walk * 12) * 0.35)]} />
      {/* 頭 */}
      <group position={[0, 3.35, 0]}>
        <Outlined geo={g.head} color={skin} w={1.05} />
        <Outlined geo={g.hair} color={spec.hair ?? '#7a4a2b'} scale={1.03} position={[0, 0.06, -0.05]} w={1.04} />
        <Outlined geo={g.tuft} color={spec.hair ?? '#7a4a2b'} position={[0.05, 1.12, 0.1]} rotation={[0.3, 0, -0.3]} w={1.1} />
        <mesh position={[0, -0.05, 1.01]}>
          <planeGeometry args={[1.7, 1.7]} />
          <meshBasicMaterial map={tex} transparent />
        </mesh>
      </group>
    </group>
  );
};
