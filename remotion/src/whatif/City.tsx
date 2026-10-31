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

// おもちゃの模型のような明るいパステル (ミニチュアに見せるため彩度を少し高めに)
const PALETTE = ['#f6d6a8', '#f2b8a2', '#a8d5e2', '#cfe8c4', '#f7e3b5', '#e7c3d9', '#bcd4f0', '#ffe9c7', '#d8f0e8', '#f4c7a1', '#fafafa', '#c9e3f6'];

/** 窓の柄 (壁は白、窓は暗い青)。頂点色を掛けて建物ごとの色にする。 */
const windowTexture = () => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#6f9cc4';
  g.fillRect(14, 16, 36, 30);
  g.fillStyle = '#a9d0ee';
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

// 遠くの山 (いちばん奥の高い山が「エベレスト」役)
export const MOUNTAINS = [
  {x: -165, z: -150, h: 70, r: 60, color: '#7f9a72'},
  {x: 170, z: -170, h: 80, r: 65, color: '#86a07a'},
  {x: -90, z: -250, h: 85, r: 70, color: '#8aa184'},
  {x: 80, z: -270, h: 95, r: 72, color: '#7c9478'},
  {x: 0, z: -330, h: 125, r: 90, color: '#8f9c8c'},
];

export type CityState = {
  t: number; // 秒
  sea: number; // 海面の高さ (単位。0 = 地面)
  cars: number; // 0..1 走っている車の割合
  people: number; // 0..1
  night?: number; // 0..1 夜 (窓が光る)
};

/** ミニチュアの街 (ビル・道路・横断歩道・並木・車・人・浜辺)。 */
export const City: React.FC<{s: CityState}> = ({s}) => {
  const L = useMemo(layout, []);
  const tex = useMemo(windowTexture, []);
  const bGeo = useMemo(() => buildingGeometry(L.buildings), [L]);
  const glowTex = useMemo(() => {
    // 夜の窓明かり (ところどころ消えている)
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffd98a';
    g.fillRect(14, 16, 36, 30);
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  }, []);
  const bMat = useMemo(() => new THREE.MeshStandardMaterial({map: tex, vertexColors: true, roughness: 0.9, emissiveMap: glowTex, emissive: new THREE.Color('#ffffff')}), [tex, glowTex]);
  bMat.emissiveIntensity = (s.night ?? 0) * 0.9;

  const W = COLS * CELL;
  const D = ROWS * CELL;
  const waves = useMemo(() => {
    // 細かいさざ波の模様 (時間でゆっくり流す)
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    const r = rng(5);
    for (let k = 0; k < 260; k++) {
      g.strokeStyle = `rgba(${200 + r() * 55},${230 + r() * 25},255,${0.25 + r() * 0.35})`;
      g.lineWidth = 1 + r() * 2;
      const x = r() * 256;
      const y = r() * 256;
      const w = 10 + r() * 26;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w / 2, y - 3, x + w, y);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 26);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  waves.offset.set(s.t * 0.004, s.t * 0.012);
  const roofMats = useMemo(() => {
    const r = rng(31);
    const out: THREE.Matrix4[] = [];
    L.buildings.forEach((b) => {
      const n = Math.floor(r() * 3);
      for (let k = 0; k < n; k++) out.push(M(b.x + (r() - 0.5) * b.w * 0.6, b.h + 0.35, b.z + (r() - 0.5) * b.d * 0.6, 0.9 + r(), 0.7, 0.9 + r()));
    });
    return out;
  }, [L]);
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
    hull: new THREE.BoxGeometry(1.6, 0.7, 4.0),
    boatCab: new THREE.BoxGeometry(1.2, 0.9, 1.4),
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

  const boatMats: THREE.Matrix4[] = [];
  const boatCabMats: THREE.Matrix4[] = [];
  if (s.sea > 0.6) {
    const r = rng(41);
    for (let k = 0; k < 14; k++) {
      const bx = X0 + 10 + r() * (COLS * CELL - 20) + Math.sin(s.t * 0.2 + k) * 6;
      const bz = Z0 + r() * (ROWS * CELL) + s.t * (0.6 + r());
      const ry = r() * 6.28;
      const y = s.sea + 0.3 + Math.sin(s.t * 1.7 + k) * 0.12;
      boatMats.push(M(bx, y, bz, 1, 1, 1, ry));
      boatCabMats.push(M(bx - Math.sin(ry) * 0.4, y + 0.75, bz - Math.cos(ry) * 0.4, 1, 1, 1, ry));
    }
  }
  // 浜辺: 街の端 (高さ 0) から海へゆるく下がる
  const beach = useMemo(() => {
    const g = new THREE.PlaneGeometry(W + 80, BEACH + 30, 1, 8);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k); // -(BEACH+30)/2 .. +
      const zz = z + (BEACH + 30) / 2; // 0 = 海側, BEACH+30 = 街側
      pos.setY(k, Math.min(-0.04, -2.4 + (zz / (BEACH + 4)) * 2.4));
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
      {/* 海は 1 枚だけ (2 枚重ねると同じ高さで奪い合ってチカチカする) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, s.sea, Z0 - 100]} renderOrder={2}>
        <planeGeometry args={[W + 600, 700]} />
        <meshStandardMaterial map={waves} color="#4aa8e0" roughness={0.18} metalness={0.05} transparent opacity={0.9} />
      </mesh>
      {/* 遠くの山 (雪の帽子つき)。海が上がると山も沈んでいく */}
      {MOUNTAINS.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]}>
          <mesh position={[0, m.h / 2 - 4, 0]} castShadow receiveShadow>
            <coneGeometry args={[m.r, m.h + 8, 9]} />
            <meshStandardMaterial color={m.color} roughness={1} flatShading />
          </mesh>
          <mesh position={[0, m.h - m.h * 0.14, 0]}>
            <coneGeometry args={[m.r * 0.3, m.h * 0.3, 9]} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
      {/* 水があふれたら出てくるボートと救助ヘリ */}
      {s.sea > 0.6 && boatMats.length > 0 && <Instanced geo={geos.hull} color="#ffffff" mats={boatMats} shadow />}
      {s.sea > 0.6 && boatMats.length > 0 && <Instanced geo={geos.boatCab} color="#e8483f" mats={boatCabMats} />}
      {s.sea > 0.3 && s.sea < 45 && (
        <group position={[Math.cos(s.t * 0.35) * 45, Math.max(s.sea + 22, 30), -20 + Math.sin(s.t * 0.35) * 30]}
          rotation={[0, -s.t * 0.35, 0]}>
          <mesh castShadow><boxGeometry args={[2.2, 1.6, 4.2]} /><meshStandardMaterial color="#f2c230" /></mesh>
          <mesh position={[0, 0.2, -3.2]}><boxGeometry args={[0.5, 0.5, 3]} /><meshStandardMaterial color="#f2c230" /></mesh>
          <mesh position={[0, 1.05, 0]} rotation={[0, s.t * 25, 0]}><boxGeometry args={[9, 0.08, 0.35]} /><meshStandardMaterial color="#333" /></mesh>
          <mesh position={[0, 0.25, 1.4]}><boxGeometry args={[2.0, 1.0, 1.4]} /><meshStandardMaterial color="#9fd3f5" /></mesh>
        </group>
      )}
      {/* 屋上の室外機・給水塔 */}
      <Instanced geo={geos.box} color="#9aa3ad" mats={roofMats} />
    </group>
  );
};
