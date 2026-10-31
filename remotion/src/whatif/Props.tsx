import React, {useMemo} from 'react';
import * as THREE from 'three';
import {rng} from './City';

/** 物語の舞台に置く小道具 (船・島・機雷など)。すべて簡単な形を組み合わせたミニチュア。 */

const Toon: React.FC<{color: string} & JSX.IntrinsicElements['mesh']> = ({color, children, ...rest}) => (
  <mesh castShadow receiveShadow {...rest}>
    {children}
    <meshToonMaterial color={color} />
  </mesh>
);

/** 大型客船 (タイタニック型: 黒い船体・白い上部・黄色に黒の煙突 4 本)。長さ約 30。 */
export const Liner: React.FC<{funnels?: number; hull?: string; band?: string}> = ({funnels = 4, hull = '#1f2229', band}) => (
  <group>
    <Toon color={hull} position={[0, 1.6, 0]}><boxGeometry args={[4.2, 3.2, 30]} /></Toon>
    <Toon color="#b8362f" position={[0, 0.15, 0]}><boxGeometry args={[4.25, 0.5, 30.05]} /></Toon>
    {band && <Toon color={band} position={[0, 2.2, 0]}><boxGeometry args={[4.24, 0.45, 30.02]} /></Toon>}
    <Toon color="#f4f1ea" position={[0, 3.7, -0.5]}><boxGeometry args={[3.6, 1.2, 24]} /></Toon>
    <Toon color="#f4f1ea" position={[0, 4.7, -1]}><boxGeometry args={[3.0, 0.8, 18]} /></Toon>
    {/* 窓の列 */}
    {Array.from({length: 22}).map((_, i) => (
      <mesh key={i} position={[2.11, 2.4, -13 + i * 1.2]}><boxGeometry args={[0.02, 0.25, 0.45]} /><meshBasicMaterial color="#ffe9a8" /></mesh>
    ))}
    {Array.from({length: funnels}).map((_, i) => (
      <group key={i} position={[0, 6.4, -8 + i * 5]}>
        <Toon color="#e8a93a"><cylinderGeometry args={[0.85, 0.95, 3.2, 14]} /></Toon>
        <Toon color="#1f2229" position={[0, 1.4, 0]}><cylinderGeometry args={[0.87, 0.87, 0.6, 14]} /></Toon>
      </group>
    ))}
    {/* 船首を少し尖らせる */}
    <Toon color={hull} position={[0, 1.6, 15.8]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[2.96, 3.2, 2.96]} /></Toon>
  </group>
);

/** 軍艦 (灰色の細長い船体に砲塔)。 */
export const Warship: React.FC = () => (
  <group>
    <Toon color="#7d8791" position={[0, 1.2, 0]}><boxGeometry args={[3, 2.2, 24]} /></Toon>
    <Toon color="#7d8791" position={[0, 1.2, 12.6]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[2.1, 2.2, 2.1]} /></Toon>
    <Toon color="#6b747d" position={[0, 3, -1]}><boxGeometry args={[2, 1.6, 6]} /></Toon>
    <Toon color="#565d64" position={[0, 2.5, 6]}><cylinderGeometry args={[0.8, 0.8, 0.8, 12]} /></Toon>
    <Toon color="#565d64" position={[0, 2.6, 7.6]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 3, 8]} /></Toon>
    <Toon color="#4a5057" position={[0, 4.6, -2]}><cylinderGeometry args={[0.5, 0.5, 2, 10]} /></Toon>
  </group>
);

/** 小さな漁船 (白い船体と船外機)。長さ約 7.5。 */
export const FishBoat: React.FC<{color?: string}> = ({color = '#f4f1ea'}) => (
  <group>
    <Toon color={color} position={[0, 0.45, 0]}><boxGeometry args={[2.2, 0.9, 6.4]} /></Toon>
    <Toon color={color} position={[0, 0.45, 3.5]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[1.55, 0.9, 1.55]} /></Toon>
    <Toon color="#3d7fd8" position={[0, 0.06, 0]}><boxGeometry args={[2.25, 0.25, 6.45]} /></Toon>
    <Toon color="#2b2f36" position={[0, 0.9, -3.4]}><boxGeometry args={[0.5, 1.2, 0.5]} /></Toon>
    <Toon color="#c7c2b8" position={[0, 0.95, 0]}><boxGeometry args={[1.9, 0.08, 6]} /></Toon>
  </group>
);

/** 救命ボート (木の色)。 */
export const Lifeboat: React.FC = () => (
  <group>
    <Toon color="#f4f1ea" position={[0, 0.4, 0]}><boxGeometry args={[1.8, 0.8, 5]} /></Toon>
    <Toon color="#9a6b43" position={[0, 0.82, 0]}><boxGeometry args={[1.6, 0.06, 4.6]} /></Toon>
  </group>
);

/** ヤシの木の生えた小さな島 (環礁)。 */
export const Island: React.FC<{seed?: number}> = ({seed = 3}) => {
  const palms = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: 7}).map(() => ({x: (r() - 0.5) * 16, z: (r() - 0.5) * 9, h: 3 + r() * 2, lean: (r() - 0.5) * 0.5}));
  }, [seed]);
  return (
    <group>
      <Toon color="#ecd7a3" position={[0, -0.3, 0]} scale={[1, 0.25, 0.6]}><sphereGeometry args={[12, 24, 12]} /></Toon>
      <Toon color="#7fc06a" position={[0, 0.6, 0]} scale={[1, 0.18, 0.55]}><sphereGeometry args={[8, 20, 10]} /></Toon>
      {palms.map((p, i) => (
        <group key={i} position={[p.x, 0.8, p.z]} rotation={[0, 0, p.lean]}>
          <Toon color="#8a6240" position={[0, p.h / 2, 0]}><cylinderGeometry args={[0.18, 0.26, p.h, 8]} /></Toon>
          {[0, 1.25, 2.5, 3.75, 5].map((a) => (
            <Toon key={a} color="#4f9a4a" position={[Math.cos(a) * 0.9, p.h, Math.sin(a) * 0.9]} rotation={[0, -a, 0.5]}>
              <boxGeometry args={[2, 0.08, 0.6]} />
            </Toon>
          ))}
        </group>
      ))}
    </group>
  );
};

/** 機雷 (とげのついた黒い球)。 */
export const Mine: React.FC = () => (
  <group>
    <Toon color="#2b2f36"><sphereGeometry args={[0.9, 16, 12]} /></Toon>
    {[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d, i) => (
      <Toon key={i} color="#2b2f36" position={[d[0] * 0.95, d[1] * 0.95, d[2] * 0.95]}
        rotation={[d[2] * Math.PI / 2, 0, -d[0] * Math.PI / 2]}><cylinderGeometry args={[0.08, 0.12, 0.5, 6]} /></Toon>
    ))}
  </group>
);

/** 爆発 (膨らんで消える火の玉)。k は 0..1 の進み具合。 */
export const Blast: React.FC<{k: number}> = ({k}) => {
  if (k <= 0 || k >= 1) return null;
  const s = 0.6 + k * 3.6;
  return (
    <group>
      <mesh scale={s}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#ff7a2a" transparent opacity={(1 - k) * 0.95} /></mesh>
      <mesh scale={s * 0.6}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#fff2c0" transparent opacity={(1 - k)} /></mesh>
    </group>
  );
};

/** 氷山 (白いとがった塊)。 */
export const Iceberg: React.FC = () => (
  <group>
    <Toon color="#eef7fb" position={[0, 3, 0]} rotation={[0, 0.4, 0]}><coneGeometry args={[7, 12, 6]} /></Toon>
    <Toon color="#d7ecf5" position={[4, 1.5, 2]} rotation={[0, 1.1, 0]}><coneGeometry args={[4, 6, 5]} /></Toon>
    <Toon color="#e4f2f8" position={[-4, 1, -1]} rotation={[0, 2, 0]}><coneGeometry args={[4.5, 4, 6]} /></Toon>
  </group>
);

export const SHARED = {THREE};

/** 森と山 (国立公園) の舞台。ゆるい丘に木を並べる。 */
export const Forest: React.FC = () => {
  const ground = useMemo(() => {
    const g = new THREE.PlaneGeometry(800, 800, 80, 80);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const z = p.getZ(k);
      const d = Math.hypot(x, z);
      // 真ん中 (話の舞台) は平ら、遠くほど丘になる
      const hill = Math.max(0, d - 40) / 60;
      p.setY(k, (Math.sin(x * 0.03) + Math.cos(z * 0.025)) * 3 * Math.min(1, hill) + Math.max(0, d - 200) * 0.25);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const trees = useMemo(() => {
    const r = rng(9);
    const m = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 4.5, 7), new THREE.MeshToonMaterial({color: '#3f8a46'}), 700);
    const mt = new THREE.Matrix4();
    let n = 0;
    for (let k = 0; k < 2000 && n < 700; k++) {
      const x = (r() - 0.5) * 500;
      const z = (r() - 0.5) * 500;
      if (Math.hypot(x, z) < 22) continue;
      const s = 0.8 + r() * 0.9;
      const d = Math.hypot(x, z);
      const y = (Math.sin(x * 0.03) + Math.cos(z * 0.025)) * 3 * Math.min(1, Math.max(0, d - 40) / 60) + Math.max(0, d - 200) * 0.25;
      mt.compose(new THREE.Vector3(x, y + 2.2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      m.setMatrixAt(n++, mt);
    }
    m.count = n;
    m.castShadow = true;
    return m;
  }, []);
  return (
    <group>
      <mesh geometry={ground} receiveShadow><meshToonMaterial color="#7cb35c" /></mesh>
      <primitive object={trees} />
    </group>
  );
};

/** 見張り塔 (木の脚に小屋)。 */
export const Tower: React.FC = () => (
  <group>
    {[[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map(([x, z], i) => (
      <Toon key={i} color="#8a6240" position={[x, 5, z]}><boxGeometry args={[0.3, 10, 0.3]} /></Toon>
    ))}
    <Toon color="#c9a77a" position={[0, 11, 0]}><boxGeometry args={[3.4, 2.2, 3.4]} /></Toon>
    <Toon color="#8a3b2e" position={[0, 12.6, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[2.8, 1.4, 4]} /></Toon>
  </group>
);

/** 公園の小型トラック。 */
export const Truck: React.FC = () => (
  <group>
    <Toon color="#3f6b3a" position={[0, 0.9, 0]}><boxGeometry args={[2.2, 1.2, 5]} /></Toon>
    <Toon color="#3f6b3a" position={[0, 1.9, 1]}><boxGeometry args={[2.0, 1.0, 2.2]} /></Toon>
    <Toon color="#9fd3f5" position={[0, 1.95, 2.12]}><boxGeometry args={[1.8, 0.7, 0.05]} /></Toon>
    {[[-1.1, -1.6], [1.1, -1.6], [-1.1, 1.6], [1.1, 1.6]].map(([x, z], i) => (
      <Toon key={i} color="#1f2229" position={[x, 0.45, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.45, 0.45, 0.35, 12]} /></Toon>
    ))}
  </group>
);

/** 管理小屋 (レンジャーステーション)。 */
export const Cabin: React.FC = () => (
  <group>
    <Toon color="#b88a5a" position={[0, 1.6, 0]}><boxGeometry args={[6, 3.2, 5]} /></Toon>
    <Toon color="#7a3a2e" position={[0, 3.9, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[4.6, 1.8, 4]} /></Toon>
    <Toon color="#5a3a22" position={[0, 1.1, 2.52]}><boxGeometry args={[1.2, 2.2, 0.05]} /></Toon>
    <Toon color="#9fd3f5" position={[1.9, 1.9, 2.52]}><boxGeometry args={[1.2, 0.9, 0.05]} /></Toon>
  </group>
);

/** 池。 */
export const Pond: React.FC = () => (
  <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.7, 1]}>
    <circleGeometry args={[9, 32]} />
    <meshStandardMaterial color="#4aa8e0" roughness={0.2} />
  </mesh>
);

/** カミナリ (空から地面まで、ぎざぎざに光る線)。k は 0..1 で、真ん中で一番明るい。 */
export const Bolt: React.FC<{to: [number, number, number]; k: number; seed?: number}> = ({to, k, seed = 1}) => {
  const geo = useMemo(() => {
    const r = rng(seed);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      pts.push(new THREE.Vector3(to[0] + (u < 1 ? (r() - 0.5) * 4 * (1 - u) : 0), to[1] + (1 - u) * 60, to[2] + (u < 1 ? (r() - 0.5) * 4 * (1 - u) : 0)));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), 60, 0.22, 6, false);
  }, [to, seed]);
  if (k <= 0 || k >= 1) return null;
  const a = 1 - Math.abs(k - 0.3) / 0.7;
  return (
    <group>
      <mesh geometry={geo}><meshBasicMaterial color="#ffffff" transparent opacity={Math.max(0, a)} /></mesh>
      <mesh geometry={geo} scale={[3, 1, 3]} position={[to[0] * -2, 0, to[2] * -2]}><meshBasicMaterial color="#a9d8ff" transparent opacity={Math.max(0, a) * 0.25} /></mesh>
    </group>
  );
};
