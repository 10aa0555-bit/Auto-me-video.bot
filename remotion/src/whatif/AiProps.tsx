import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';

/** 決まった順番の乱数 (毎フレーム同じ配置になるように)。 */
const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const outlineMat = new THREE.MeshBasicMaterial({color: '#1b1b1f', side: THREE.BackSide});

/**
 * 巨大な監視 AI の目。白い殻に赤く光る瞳。
 * open: まぶたの開き (0..1)、glow: 赤の強さ、glitch: 0..1 で瞳が乱れる、look: 瞳の向き (x, y)。
 */
export const Eye: React.FC<{t: number; open?: number; glow?: number; glitch?: number; look?: [number, number]; color?: string}> = ({
  t, open = 1, glow = 1, glitch = 0, look = [0, 0], color = '#ff2a3d',
}) => {
  const jitter = glitch > 0 ? (Math.sin(t * 91) * 0.5 + Math.sin(t * 57) * 0.5) * glitch : 0;
  const pulse = 1 + Math.sin(t * 2.2) * 0.06;
  const lid = Math.max(0.02, open);
  return (
    <group>
      {/* 殻 */}
      <mesh castShadow><sphereGeometry args={[5, 48, 32]} /><meshToonMaterial color="#f4f1ea" /></mesh>
      <mesh material={outlineMat} scale={1.04}><sphereGeometry args={[5, 32, 24]} /></mesh>
      {/* 横の溝 (機械っぽく) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[5.02, 0.12, 8, 64]} /><meshBasicMaterial color="#2a2f3a" /></mesh>
      {/* 目の穴 (黒) とまぶた */}
      <group position={[0, 0, 5.06]} scale={[1, lid, 1]}>
        <mesh><circleGeometry args={[2.9, 48]} /><meshBasicMaterial color="#14161c" /></mesh>
        {/* 虹彩 */}
        <group position={[look[0] * 0.9 + jitter, look[1] * 0.9 - jitter * 0.4, 0.05]} scale={pulse}>
          <mesh><ringGeometry args={[0.9, 2.1, 48]} /><meshBasicMaterial color={color} transparent opacity={0.6 + 0.4 * glow} /></mesh>
          <mesh position={[0, 0, 0.01]}><ringGeometry args={[1.5, 1.62, 48]} /><meshBasicMaterial color="#ffd1d6" /></mesh>
          <mesh position={[0, 0, 0.02]}><circleGeometry args={[0.85, 32]} /><meshBasicMaterial color="#000000" /></mesh>
          <mesh position={[0.45, 0.45, 0.03]}><circleGeometry args={[0.22, 16]} /><meshBasicMaterial color="#ffffff" /></mesh>
        </group>
      </group>
      {/* 赤い光が街を照らす */}
      <pointLight position={[0, 0, 8]} color={color} intensity={glow * 60} distance={90} decay={1.4} />
      {/* ふちのネオン */}
      <mesh position={[0, 0, 5.1]} scale={[1, lid, 1]}><ringGeometry args={[2.9, 3.3, 48]} /><meshBasicMaterial color={color} transparent opacity={0.5 + 0.5 * glow} /></mesh>
    </group>
  );
};

/** 監視ドローン (4 つのプロペラ + 赤いライト)。 */
export const Drone: React.FC<{t: number; seed?: number}> = ({t, seed = 0}) => (
  <group rotation={[0, 0, Math.sin(t * 2 + seed) * 0.08]}>
    <mesh castShadow><boxGeometry args={[1.4, 0.45, 1.4]} /><meshToonMaterial color="#e9edf2" /></mesh>
    <mesh material={outlineMat} scale={1.12}><boxGeometry args={[1.4, 0.45, 1.4]} /></mesh>
    {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
      <group key={i} position={[x * 1.05, 0.25, z * 1.05]}>
        <mesh><cylinderGeometry args={[0.08, 0.08, 0.3, 6]} /><meshToonMaterial color="#2a2f3a" /></mesh>
        <mesh position={[0, 0.17, 0]} rotation={[0, t * 40 + i, 0]}><boxGeometry args={[1.2, 0.03, 0.14]} /><meshBasicMaterial color="#2a2f3a" /></mesh>
      </group>
    ))}
    <mesh position={[0, -0.25, 0.55]}><sphereGeometry args={[0.2, 12, 8]} /><meshBasicMaterial color={Math.sin(t * 9 + seed) > 0 ? '#ff2a3d' : '#7a0b14'} /></mesh>
    {/* 下向きのスキャン光 */}
    <mesh position={[0, -3.2, 0]}>
      <coneGeometry args={[1.8, 6, 24, 1, true]} />
      <meshBasicMaterial color="#ff2a3d" transparent opacity={0.14 + 0.06 * Math.sin(t * 6 + seed)} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  </group>
);

/** 地球。red (0..1) で表面に赤い点 (嘘の吹き出し) が一斉に出る。 */
export const Globe: React.FC<{t: number; red?: number}> = ({t, red = 0}) => {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2f8fd8';
    g.fillRect(0, 0, 1024, 512);
    const r = rng(3);
    // ざっくりした大陸 (丸を重ねる)
    const blobs: [number, number, number][] = [
      [250, 170, 70], [290, 230, 55], [330, 330, 45], [300, 380, 40], [520, 160, 60], [560, 250, 70], [540, 330, 55],
      [700, 150, 90], [760, 220, 70], [820, 330, 40], [880, 380, 45], [600, 120, 50], [180, 120, 40],
    ];
    g.fillStyle = '#6cc46a';
    for (const [x, y, s] of blobs) {
      for (let k = 0; k < 9; k++) {
        g.beginPath();
        g.arc(x + (r() - 0.5) * s, y + (r() - 0.5) * s * 0.8, s * (0.35 + r() * 0.4), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#f2f6fa';
    g.fillRect(0, 0, 1024, 26);
    g.fillRect(0, 486, 1024, 26);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }, []);
  const dots = useMemo(() => {
    const r = rng(11);
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({color: '#ff2a3d'}), 500);
    const pts: {p: THREE.Vector3; d: number}[] = [];
    for (let i = 0; i < 500; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pts.push({p: new THREE.Vector3(Math.cos(th) * s, u, Math.sin(th) * s).multiplyScalar(10.05), d: r()});
    }
    return {m, pts};
  }, []);
  const mt = new THREE.Matrix4();
  dots.pts.forEach(({p, d}, i) => {
    const k = Math.max(0, Math.min(1, (red - d * 0.4) / 0.25));
    const s = k * (1 + 0.4 * Math.sin(t * 8 + i));
    mt.compose(p, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    dots.m.setMatrixAt(i, mt);
  });
  dots.m.instanceMatrix.needsUpdate = true;
  return (
    <group rotation={[0.35, t * 0.25, 0]}>
      <mesh><sphereGeometry args={[10, 64, 48]} /><meshToonMaterial map={tex} /></mesh>
      <mesh material={outlineMat} scale={1.025}><sphereGeometry args={[10, 48, 32]} /></mesh>
      <primitive object={dots.m} />
      {/* 大気のふち */}
      <mesh scale={1.08}><sphereGeometry args={[10, 48, 32]} /><meshBasicMaterial color={red > 0.3 ? '#ff5a6a' : '#9fd8ff'} transparent opacity={0.18} side={THREE.BackSide} /></mesh>
    </group>
  );
};

/** AI の頭の中: 暗い空間に白いデータの箱が浮かび、赤いログの線が流れる。 */
export const Core: React.FC<{t: number}> = ({t}) => {
  const boxes = useMemo(() => {
    const r = rng(21);
    return Array.from({length: 90}).map(() => ({
      p: [(r() - 0.5) * 70, (r() - 0.5) * 50, -r() * 80] as [number, number, number],
      s: 0.6 + r() * 2.2,
      sp: 0.2 + r() * 0.6,
      red: r() < 0.12,
    }));
  }, []);
  return (
    <group>
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.p[0], b.p[1] + Math.sin(t * b.sp + i) * 1.2, b.p[2]]} rotation={[t * b.sp * 0.3, t * b.sp * 0.4 + i, 0]}>
          <boxGeometry args={[b.s, b.s, b.s]} />
          {b.red ? <meshBasicMaterial color="#ff2a3d" /> : <meshToonMaterial color="#e9edf2" />}
        </mesh>
      ))}
      {Array.from({length: 14}).map((_, i) => (
        <mesh key={'l' + i} position={[((t * (6 + i)) % 90) - 45, -20 + i * 3, -30 - i * 3]}>
          <boxGeometry args={[12 + (i % 4) * 4, 0.18, 0.18]} />
          <meshBasicMaterial color={i % 3 ? '#4a5368' : '#ff2a3d'} />
        </mesh>
      ))}
    </group>
  );
};

/** 吹き出し (いつもカメラの方を向く)。red なら赤地に白字。 */
export const Bubble: React.FC<{text: string; red?: boolean; k: number}> = ({text, red = false, k}) => {
  const {camera} = useThree();
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const g = c.getContext('2d')!;
    const fill = red ? '#ff2a3d' : '#ffffff';
    g.fillStyle = fill;
    g.strokeStyle = '#1b1b1f';
    g.lineWidth = 22;
    g.beginPath();
    g.roundRect(30, 30, 964, 340, 120);
    g.moveTo(420, 368);
    g.lineTo(470, 480);
    g.lineTo(560, 368);
    g.fill();
    g.stroke();
    g.fillStyle = fill;
    g.fillRect(430, 350, 120, 30);
    g.fillStyle = red ? '#ffffff' : '#1b1b1f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 170;
    g.font = `900 ${size}px Poppins, sans-serif`;
    while (g.measureText(text).width > 880 && size > 60) {
      size -= 8;
      g.font = `900 ${size}px Poppins, sans-serif`;
    }
    g.fillText(text, 512, 205);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }, [text, red]);
  if (k <= 0) return null;
  return (
    <group quaternion={camera.quaternion} scale={k}>
      <mesh position={[0, 1, 0]}>
        <planeGeometry args={[4, 2]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
};
