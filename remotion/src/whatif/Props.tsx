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
export const Liner: React.FC<{funnels?: number; hull?: string}> = ({funnels = 4, hull = '#1f2229'}) => (
  <group>
    <Toon color={hull} position={[0, 1.6, 0]}><boxGeometry args={[4.2, 3.2, 30]} /></Toon>
    <Toon color="#b8362f" position={[0, 0.15, 0]}><boxGeometry args={[4.25, 0.5, 30.05]} /></Toon>
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
  const s = 1 + k * 7;
  return (
    <group>
      <mesh scale={s}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#ffb03a" transparent opacity={(1 - k) * 0.9} /></mesh>
      <mesh scale={s * 0.6}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color="#fff2c0" transparent opacity={(1 - k)} /></mesh>
    </group>
  );
};

export const SHARED = {THREE};
