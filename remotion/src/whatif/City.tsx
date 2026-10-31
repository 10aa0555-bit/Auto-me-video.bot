import React, {useMemo} from 'react';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 毎回同じ街になるよう、決まった種から乱数を作る。 */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 街の大きさ (1 単位 = 約 3m)。手前が南、奥 (z がマイナス) に浜辺と海
export const BLOCK = 12;
export const ROAD = 5;
export const COLS = 7;
export const ROWS = 9;
export const CELL = BLOCK + ROAD;
export const X0 = -(COLS * CELL) / 2;
export const Z0 = -(ROWS * CELL) / 2;
export const BEACH = 14; // 街の奥の浜辺の奥行き
export const SHORE_Z = Z0 - BEACH;

const PALETTE = ['#e9dcc4', '#d9c3a5', '#c9d6df', '#f1e3d3', '#b7c9b5', '#e4c9b6', '#d4d4d4', '#c2b6a3', '#f3efe6', '#a9bccd'];

/** 窓の柄 (壁は白、窓は暗い青)。頂点色を掛けて建物ごとの色にする。 */
const windowTexture = () => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#5d7184';
  g.fillRect(14, 16, 36, 30);
  g.fillStyle = '#8fa6bb';
  g.fillRect(14, 16, 36, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

type Building = {x: number; z: number; w: number; d: number; h: number; color: string};
type Tree = {x: number; z: number; s: number};
export type Lane = {x0: number; z0: number; x1: number; z1: number};

/** 区画を道路で区切り、ビル・公園・木を並べる。 */
export const layout = () => {
  const r = rng(7);
  const buildings: Building[] = [];
  const trees: Tree[] = [];
  const parks: {x: number; z: number}[] = [];
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const bx = X0 + i * CELL + ROAD / 2;
      const bz = Z0 + j * CELL + ROAD / 2;
      // 真ん中ほど高いビル。たまに公園
      const center = 1 - Math.min(1, Math.hypot(i - COLS / 2 + 0.5, (j - ROWS / 2 + 0.5) * 0.8) / 5);
      if (r() < 0.1 && j > 0) {
        parks.push({x: bx, z: bz});
        for (let k = 0; k < 9; k++) trees.push({x: bx + 1.5 + r() * (BLOCK - 3), z: bz + 1.5 + r() * (BLOCK - 3), s: 0.8 + r() * 0.6});
        continue;
      }
      const n = r() < 0.4 ? 1 : 2;
      const lot = (BLOCK - 1) / n;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const w = lot - 0.8 - r() * 1.2;
          const d = lot - 0.8 - r() * 1.2;
          const h = 3 + r() * 6 + center * center * (10 + r() * 26) * (j === 0 ? 0.4 : 1);
          buildings.push({
            x: bx + 0.5 + a * lot + lot / 2,
            z: bz + 0.5 + b * lot + lot / 2,
            w, d, h, color: PALETTE[Math.floor(r() * PALETTE.length)],
          });
        }
      }
    }
  }
  // 歩道沿いの並木
  for (let i = 0; i <= COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      if (r() < 0.55) trees.push({x: X0 + i * CELL + (r() < 0.5 ? 0.6 : ROAD - 0.6), z: Z0 + j * CELL + ROAD + 2 + r() * (BLOCK - 4), s: 0.6 + r() * 0.3});
    }
  }
  // 浜辺のヤシの木
  for (let k = 0; k < 14; k++) trees.push({x: X0 + 4 + r() * (COLS * CELL - 8), z: Z0 - 2 - r() * 4, s: 0.9});
  // 車線 (縦と横の道路の真ん中)
  const lanes: Lane[] = [];
  for (let i = 0; i <= COLS; i++) {
    const x = X0 + i * CELL + ROAD / 2;
    lanes.push({x0: x - 1, z0: Z0, x1: x - 1, z1: Z0 + ROWS * CELL});
    lanes.push({x0: x + 1, z0: Z0 + ROWS * CELL, x1: x + 1, z1: Z0});
  }
  for (let j = 0; j <= ROWS; j++) {
    const z = Z0 + j * CELL + ROAD / 2;
    lanes.push({x0: X0, z0: z - 1, x1: X0 + COLS * CELL, z1: z - 1});
    lanes.push({x0: X0 + COLS * CELL, z0: z + 1, x1: X0, z1: z + 1});
  }
  return {buildings, trees, parks, lanes};
};

/** ビルをまとめて 1 つの形にする (描く回数を減らして速くする)。 */
const buildingGeometry = (bs: Building[]) => {
  const geos = bs.map((b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    // 側面は窓が階ごとに並ぶよう UV を伸ばし、上下の面は窓の無い所を使う
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const k = f * 4 + v;
        if (f === 2 || f === 3) {
          uv.setXY(k, 0.05, 0.05);
        } else {
          const span = f < 2 ? b.d : b.w;
          uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(span / 1.6)), uv.getY(k) * Math.max(1, Math.round(b.h / 1.3)));
        }
      }
    }
    const col = new THREE.Color(b.color);
    const roof = col.clone().multiplyScalar(0.82);
    const colors = new Float32Array(24 * 3);
    for (let k = 0; k < 24; k++) {
      const c = Math.floor(k / 4) === 2 ? roof : col;
      colors.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.translate(b.x, b.h / 2, b.z);
    return g;
  });
  return mergeGeometries(geos);
};

const Instanced: React.FC<{
  geo: THREE.BufferGeometry;
  color: string;
  mats: THREE.Matrix4[];
  colors?: THREE.Color[];
  shadow?: boolean;
}> = ({geo, color, mats, colors, shadow}) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({color, roughness: 0.85}), Math.max(1, mats.length));
    mats.forEach((mt, i) => m.setMatrixAt(i, mt));
    if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
    m.count = mats.length;
    m.castShadow = !!shadow;
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [geo, color, mats, colors, shadow]);
  return <primitive object={mesh} />;
};

const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

export type CityState = {
  t: number; // 秒
  sea: number; // 海面の高さ (単位。0 = 地面)
  cars: number; // 0..1 走っている車の割合
  people: number; // 0..1
};

/** ミニチュアの街 (ビル・道路・横断歩道・並木・車・人・浜辺)。 */
export const City: React.FC<{s: CityState}> = ({s}) => {
  const L = useMemo(layout, []);
  const tex = useMemo(windowTexture, []);
  const bGeo = useMemo(() => buildingGeometry(L.buildings), [L]);
  const bMat = useMemo(() => new THREE.MeshStandardMaterial({map: tex, vertexColors: true, roughness: 0.9}), [tex]);

  const W = COLS * CELL;
  const D = ROWS * CELL;
  // 歩道の区画 (少し高い)、横断歩道、白線
  const blockMats = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
      out.push(M(X0 + i * CELL + ROAD / 2 + BLOCK / 2, 0.15, Z0 + j * CELL + ROAD / 2 + BLOCK / 2, BLOCK, 0.3, BLOCK));
    }
    return out;
  }, []);
  const parkMats = useMemo(() => L.parks.map((p) => M(p.x + BLOCK / 2, 0.32, p.z + BLOCK / 2, BLOCK - 1, 0.05, BLOCK - 1)), [L]);
  const stripeMats = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (let i = 0; i <= COLS; i++) for (let j = 0; j <= ROWS; j++) {
      const cx = X0 + i * CELL + ROAD / 2;
      const cz = Z0 + j * CELL + ROAD / 2;
      for (let k = -3; k <= 3; k++) {
        out.push(M(cx + k * 0.6, 0.02, cz + ROAD / 2 + 0.9, 0.32, 0.02, 1.4));
        out.push(M(cx + ROAD / 2 + 0.9, 0.02, cz + k * 0.6, 1.4, 0.02, 0.32));
      }
    }
    return out;
  }, []);
  const treeMats = useMemo(() => L.trees.map((tr) => M(tr.x, 0.3 + 1.6 * tr.s, tr.z, 1.3 * tr.s, 1.6 * tr.s, 1.3 * tr.s)), [L]);
  const trunkMats = useMemo(() => L.trees.map((tr) => M(tr.x, 0.3 + 0.5 * tr.s, tr.z, 0.25, 1.0 * tr.s, 0.25)), [L]);
  const geos = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 2, 7),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    car: new THREE.BoxGeometry(1.1, 0.6, 2.0),
    cab: new THREE.BoxGeometry(0.95, 0.45, 1.0),
    person: new THREE.CapsuleGeometry(0.16, 0.42, 2, 6),
  }), []);

  // 車: 車線に沿って一定の速さで走る (時刻から位置が決まるので毎回同じ)
  const carPal = ['#e8483f', '#f4b63a', '#ffffff', '#3d7fd8', '#2b2f36', '#57b36a', '#f08a3c'];
  const cars = useMemo(() => {
    const r = rng(11);
    const out: {lane: Lane; off: number; speed: number; color: THREE.Color}[] = [];
    L.lanes.forEach((lane) => {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) out.push({lane, off: r(), speed: 5 + r() * 4, color: new THREE.Color(carPal[Math.floor(r() * carPal.length)])});
    });
    return out;
  }, [L]);
  const nCars = Math.floor(cars.length * s.cars);
  const carMats: THREE.Matrix4[] = [];
  const cabMats: THREE.Matrix4[] = [];
  const carCols: THREE.Color[] = [];
  for (let i = 0; i < nCars; i++) {
    const c = cars[i];
    const len = Math.hypot(c.lane.x1 - c.lane.x0, c.lane.z1 - c.lane.z0);
    const u = (c.off + ((s.sea > 0.1 ? 0.3 : 1) * s.t * c.speed) / len) % 1;
    const x = c.lane.x0 + (c.lane.x1 - c.lane.x0) * u;
    const z = c.lane.z0 + (c.lane.z1 - c.lane.z0) * u;
    const ry = Math.atan2(c.lane.x1 - c.lane.x0, c.lane.z1 - c.lane.z0);
    // 水が来たら車は浮いて、ゆらゆら流される
    const fl = s.sea > 0.1 ? s.sea + 0.15 + Math.sin(s.t * 2 + i) * 0.08 : 0;
    const y = Math.max(0.4, fl);
    const tilt = fl ? Math.sin(s.t * 1.3 + i) * 0.25 : 0;
    carMats.push(M(x, y, z, 1, 1, 1, ry + tilt));
    cabMats.push(M(x, y + 0.5, z - Math.cos(ry) * 0.1, 1, 1, 1, ry + tilt));
    carCols.push(c.color);
  }
  // 人: 歩道をゆっくり行き来する
  const people = useMemo(() => {
    const r = rng(23);
    const out: {x: number; z: number; dx: number; dz: number; ph: number; color: THREE.Color}[] = [];
    const pc = ['#2b2f36', '#e8483f', '#3d7fd8', '#f4b63a', '#ffffff', '#7a5c44'];
    for (let k = 0; k < 420; k++) {
      const i = Math.floor(r() * COLS);
      const j = Math.floor(r() * ROWS);
      const alongX = r() < 0.5;
      const bx = X0 + i * CELL + ROAD / 2;
      const bz = Z0 + j * CELL + ROAD / 2;
      out.push({
        x: alongX ? bx + r() * BLOCK : bx + (r() < 0.5 ? 0.4 : BLOCK - 0.4),
        z: alongX ? bz + (r() < 0.5 ? 0.4 : BLOCK - 0.4) : bz + r() * BLOCK,
        dx: alongX ? 1 : 0, dz: alongX ? 0 : 1, ph: r() * 10, color: new THREE.Color(pc[Math.floor(r() * pc.length)]),
      });
    }
    // 浜辺の人
    for (let k = 0; k < 90; k++) out.push({x: X0 + r() * W, z: Z0 - 1 - r() * (BEACH - 4), dx: 0, dz: 0, ph: r() * 10, color: new THREE.Color(pc[Math.floor(r() * pc.length)])});
    return out;
  }, [L, W]);
  const nPeople = Math.floor(people.length * s.people);
  const pMats: THREE.Matrix4[] = [];
  const pCols: THREE.Color[] = [];
  for (let i = 0; i < nPeople; i++) {
    const p = people[i];
    const sw = Math.sin(s.t * 0.4 + p.ph) * 3;
    pMats.push(M(p.x + p.dx * sw, 0.62, p.z + p.dz * sw));
    pCols.push(p.color);
  }

  // 浜辺: 街の端 (高さ 0) から海へゆるく下がる
  const beach = useMemo(() => {
    const g = new THREE.PlaneGeometry(W + 80, BEACH + 30, 1, 8);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k); // -(BEACH+30)/2 .. +
      const zz = z + (BEACH + 30) / 2; // 0 = 海側, BEACH+30 = 街側
      pos.setY(k, Math.min(0, -2.4 + (zz / (BEACH + 4)) * 2.4));
    }
    g.translate(0, 0, Z0 - (BEACH + 30) / 2 + 4);
    g.computeVertexNormals();
    return g;
  }, [W]);

  return (
    <group>
      {/* 地面 (道路) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, Z0 + D / 2 + 20]} receiveShadow>
        <planeGeometry args={[W + 80, D + 40]} />
        <meshStandardMaterial color="#5b6068" roughness={1} />
      </mesh>
      <mesh geometry={beach} receiveShadow>
        <meshStandardMaterial color="#e8d3a2" roughness={1} />
      </mesh>
      <Instanced geo={geos.box} color="#cfcac0" mats={blockMats} />
      <Instanced geo={geos.box} color="#8cbf6a" mats={parkMats} />
      <Instanced geo={geos.box} color="#f4f4f0" mats={stripeMats} />
      <mesh geometry={bGeo} material={bMat} castShadow receiveShadow />
      <Instanced geo={geos.cyl} color="#7a5c44" mats={trunkMats} />
      <Instanced geo={geos.cone} color="#4f9a4a" mats={treeMats} shadow />
      {nCars > 0 && <Instanced geo={geos.car} color="#ffffff" mats={carMats} colors={carCols} shadow />}
      {nCars > 0 && <Instanced geo={geos.cab} color="#cfe3f5" mats={cabMats} />}
      {nPeople > 0 && <Instanced geo={geos.person} color="#ffffff" mats={pMats} colors={pCols} />}
      {/* 海 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, s.sea, Z0 - 60]}>
        <planeGeometry args={[W + 400, 400]} />
        <meshStandardMaterial color="#3f9bd6" roughness={0.25} metalness={0.1} transparent opacity={0.88} />
      </mesh>
      {/* 街の上にあふれた水 (海面が地面より上のとき) */}
      {s.sea > 0.02 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, s.sea, Z0 + D / 2 + 20]}>
          <planeGeometry args={[W + 80, D + 40]} />
          <meshStandardMaterial color="#3f9bd6" roughness={0.25} metalness={0.1} transparent opacity={0.82} />
        </mesh>
      )}
    </group>
  );
};
