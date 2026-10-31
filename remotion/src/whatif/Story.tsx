import React, {useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {Captions, outline} from '../Short';
import type {Caption} from '../types';
import {H, W, clamp01, easeInOut, easeOut, popIn} from '../util';
import {Character, Face} from './Character';
import {City} from './City';
import {Blast, Bolt, Cabin, FishBoat, Forest, Iceberg, Island, Lifeboat, Liner, Mine, Pond, Tower, Truck, Warship} from './Props';

type V3 = [number, number, number];
export type Obj = {
  type: 'liner' | 'warship' | 'fishboat' | 'lifeboat' | 'island' | 'mine' | 'iceberg' | 'tower' | 'truck' | 'cabin' | 'pond' | 'char';
  fire?: boolean | number; // 髪が燃える (数字ならその秒から)
  face2?: Face; // at 秒から表情を変える (カミナリの後に驚く など)
  at?: number;
  hat?: boolean; // レンジャーの帽子
  hull?: string;
  band?: string;
  pos: V3;
  to?: V3; // シーンの間にここまで動く
  rot?: number; // 向き (度)
  scale?: number;
  float?: boolean; // 波に浮かぶ
  sink?: {delay?: number; dur?: number; tilt?: number; depth?: number}; // 沈む
  face?: Face;
  talk?: boolean;
  wave?: number;
  hop?: boolean;
  walk?: boolean;
  shirt?: string;
  hair?: string;
  pants?: string;
};
export type StoryScene = {
  start: number;
  dur: number;
  spec: {
    narration?: string;
    set?: 'ocean' | 'city' | 'forest';
    strike?: {pos: V3; delay?: number}; // カミナリが落ちる場所
    sky?: 'day' | 'sunset' | 'night' | 'storm';
    waves?: number;
    cam?: {pos: V3; look: V3};
    objects?: Obj[];
    counter?: string;
    sub?: string;
    shake?: number;
    flash?: boolean;
    lightning?: boolean;
    blast?: {pos: V3; delay?: number};
  };
};
export type StoryProps = {
  frames: number;
  fps: number;
  hook: string[];
  scenes: StoryScene[];
  captions: Caption[];
  audio?: string;
};

const SKY: Record<string, {bg: string; fog: string; sea: string; hemi: number; dir: number; dirColor: string}> = {
  day: {bg: '#9fd0f0', fog: '#bfe0f5', sea: '#3f9bd6', hemi: 0.95, dir: 1.9, dirColor: '#fff4e0'},
  sunset: {bg: '#f2a46e', fog: '#f3b98a', sea: '#3a6896', hemi: 0.8, dir: 1.5, dirColor: '#ffc68a'},
  night: {bg: '#162a5c', fog: '#1c3166', sea: '#22548a', hemi: 0.75, dir: 1.0, dirColor: '#b9ccff'},
  storm: {bg: '#46515c', fog: '#525d68', sea: '#2b4859', hemi: 0.85, dir: 0.85, dirColor: '#d9e2ea'},
};

/** 海の高さ (波)。船もこの式で上下・傾く。 */
export const waveY = (x: number, z: number, t: number, a: number) =>
  a * (Math.sin(x * 0.09 + t * 1.3) * 0.6 + Math.sin(z * 0.12 - t * 1.05) * 0.45 + Math.sin((x + z) * 0.05 + t * 0.7) * 0.35);

const sceneAt = (sc: StoryScene[], t: number) => {
  const i = sc.findIndex((s) => t < s.start + s.dur);
  return i < 0 ? sc.length - 1 : i;
};

/** 直前のシーンの値から、シーンの頭でなめらかに切り替わる数値。 */
const blendNum = (sc: StoryScene[], t: number, get: (s: StoryScene) => number | undefined, init: number, move = 1.2) => {
  let prev = init;
  for (const s of sc) {
    const v = get(s) ?? prev;
    if (t < s.start + s.dur) return prev + (v - prev) * easeInOut((t - s.start) / move);
    prev = v;
  }
  return prev;
};

const mix = (a: string, b: string, k: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

const Ocean: React.FC<{t: number; amp: number; color: string}> = ({t, amp, color}) => {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(700, 700, 110, 110);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) pos.setY(k, waveY(pos.getX(k), pos.getZ(k), t, amp));
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} flatShading />
    </mesh>
  );
};

const Rain: React.FC<{t: number; center: V3}> = ({t, center}) => {
  const drops = useMemo(() => Array.from({length: 600}).map((_, i) => [Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 43758.5453 % 1, Math.sin(i * 39.425) * 43758.5453 % 1]), []);
  const mesh = useMemo(() => new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1.6, 0.05), new THREE.MeshBasicMaterial({color: '#cfe0ee', transparent: true, opacity: 0.55}), 600), []);
  const m = new THREE.Matrix4();
  drops.forEach(([a, b, c], i) => {
    const x = center[0] + (Math.abs(a) - 0.5) * 80;
    const z = center[2] + (Math.abs(c) - 0.5) * 80;
    const y = 40 - ((Math.abs(b) * 40 + t * 38) % 40);
    m.makeTranslation(x, y, z);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return <primitive object={mesh} />;
};

const Stars: React.FC = () => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p: number[] = [];
    for (let i = 0; i < 900; i++) {
      const th = (i * 2.399) % (Math.PI * 2);
      const y = 0.15 + ((i * 0.618) % 1) * 0.85;
      const r = Math.sqrt(1 - y * y);
      p.push(Math.cos(th) * r * 600, y * 600, Math.sin(th) * r * 600);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);
  return <points geometry={geo}><pointsMaterial color="#ffffff" size={2.2} sizeAttenuation={false} /></points>;
};

const Thing: React.FC<{o: Obj; lt: number; dur: number; t: number; amp: number; talk: number}> = ({o, lt, dur, t, amp, talk}) => {
  const u = o.to ? easeInOut(lt / dur) : 0;
  let x = o.pos[0] + ((o.to?.[0] ?? o.pos[0]) - o.pos[0]) * u;
  let y = o.pos[1] + ((o.to?.[1] ?? o.pos[1]) - o.pos[1]) * u;
  const z = o.pos[2] + ((o.to?.[2] ?? o.pos[2]) - o.pos[2]) * u;
  let rx = 0;
  let rz = 0;
  if (o.float) {
    y += waveY(x, z, t, amp);
    rx = (waveY(x, z + 2, t, amp) - waveY(x, z - 2, t, amp)) * 0.18;
    rz = (waveY(x + 2, z, t, amp) - waveY(x - 2, z, t, amp)) * 0.18;
  }
  if (o.sink) {
    const k = easeInOut((lt - (o.sink.delay ?? 0.5)) / (o.sink.dur ?? 3));
    y -= k * (o.sink.depth ?? 14);
    rx += k * ((o.sink.tilt ?? 25) * Math.PI) / 180;
  }
  const s = o.scale ?? 1;
  const ry = ((o.rot ?? 0) * Math.PI) / 180;
  let body: React.ReactNode = null;
  if (o.type === 'char') {
    return (
      <group position={[x, y, z]} rotation={[rx, 0, rz]}>
        <Character spec={{shirt: o.shirt, hair: o.hair, pants: o.pants}} face={o.face2 && lt > (o.at ?? 1) ? o.face2 : o.face ?? 'normal'} talk={o.talk ? talk : 0}
          wave={o.wave ?? 0} walk={o.walk ? t : 0} hop={o.hop ? Math.abs(Math.sin(t * 6)) * 0.5 : 0} rotation={ry} scale={s} />
        {o.hat && (
          <group position={[0, 4.35 * s, 0]} scale={s}>
            <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[1.5, 1.5, 0.12, 20]} /><meshToonMaterial color="#8a6240" /></mesh>
            <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.75, 0.85, 0.8, 20]} /><meshToonMaterial color="#8a6240" /></mesh>
          </group>
        )}
        {o.fire && lt > (typeof o.fire === 'number' ? o.fire : 0) && (
          <group position={[0, 4.6 * s, 0]} scale={s}>
            {[0, 1, 2, 3, 4].map((j) => (
              <mesh key={j} position={[Math.cos(j * 1.26) * 0.5, 0.4 + Math.abs(Math.sin(t * 13 + j)) * 0.5, Math.sin(j * 1.26) * 0.5]}>
                <coneGeometry args={[0.35, 1.3 + Math.sin(t * 17 + j) * 0.3, 8]} />
                <meshBasicMaterial color={j % 2 ? '#ffb03a' : '#ff5a2a'} />
              </mesh>
            ))}
          </group>
        )}
      </group>
    );
  }
  if (o.type === 'liner') body = <Liner hull={o.hull} band={o.band} />;
  if (o.type === 'iceberg') body = <Iceberg />;
  if (o.type === 'tower') body = <Tower />;
  if (o.type === 'truck') body = <Truck />;
  if (o.type === 'cabin') body = <Cabin />;
  if (o.type === 'pond') body = <Pond />;
  if (o.type === 'warship') body = <Warship />;
  if (o.type === 'fishboat') body = <FishBoat />;
  if (o.type === 'lifeboat') body = <Lifeboat />;
  if (o.type === 'island') body = <Island />;
  if (o.type === 'mine') body = <Mine />;
  return <group position={[x, y, z]} rotation={[rx, ry, rz]} scale={s}>{body}</group>;
};

const Cam: React.FC<{sc: StoryScene[]; t: number; shake: number}> = ({sc, t, shake}) => {
  const {camera} = useThree();
  const i = sceneAt(sc, t);
  const camOf = (j: number) => {
    for (let n = j; n >= 0; n--) if (sc[n].spec.cam) return sc[n].spec.cam!;
    return {pos: [0, 20, 40] as V3, look: [0, 0, 0] as V3};
  };
  const a = i > 0 ? camOf(i - 1) : camOf(i);
  const b = camOf(i);
  const u = easeInOut((t - sc[i].start) / Math.min(1.6, sc[i].dur * 0.6));
  const L = (p: V3, q: V3): V3 => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
  const p = L(a.pos, b.pos);
  const l = L(a.look, b.look);
  // いつも少しずつ寄っていく (止まって見えないように) + 揺れ
  const lt = t - sc[i].start;
  const push = 1 - 0.06 * clamp01(lt / sc[i].dur);
  const sx = shake * (Math.sin(t * 47) * 0.35 + Math.sin(t * 31) * 0.2);
  const sy = shake * Math.sin(t * 39) * 0.3;
  camera.position.set(l[0] + (p[0] - l[0]) * push + sx, l[1] + (p[1] - l[1]) * push + sy, l[2] + (p[2] - l[2]) * push);
  camera.lookAt(l[0], l[1], l[2]);
  return null;
};

const Counter: React.FC<{sc: StoryScene[]; t: number}> = ({sc, t}) => {
  const i = sceneAt(sc, t);
  const s = sc[i];
  if (!s.spec.counter) return null;
  const fresh = i === 0 || sc[i - 1].spec.counter !== s.spec.counter;
  const k = fresh ? popIn(t - s.start, 0.45) : 1;
  return (
    <div style={{position: 'absolute', top: H * 0.085, width: W, textAlign: 'center'}}>
      <div style={{display: 'inline-block', transform: `scale(${k}) rotate(-2deg)`, padding: '8px 34px', borderRadius: 16,
        background: '#ffffff', border: '6px solid #1b1b1f', boxShadow: '0 8px 0 #1b1b1f'}}>
        <div style={{fontFamily: 'Poppins', fontWeight: 900, fontSize: 84, lineHeight: 1.0, color: '#1b1b1f'}}>{s.spec.counter}</div>
        {s.spec.sub && <div style={{fontFamily: 'Poppins', fontWeight: 800, fontSize: 32, color: '#e8483f', marginTop: 2}}>{s.spec.sub}</div>}
      </div>
    </div>
  );
};

/** 最初の 2.5 秒だけ出る、太い白文字のつかみ。 */
const Hook: React.FC<{lines: string[]; t: number}> = ({lines, t}) => {
  const out = 1 - clamp01((t - 2.6) / 0.35);
  if (out <= 0) return null;
  return (
    <div style={{position: 'absolute', top: H * 0.12, width: W, textAlign: 'center', opacity: out, padding: '0 50px', boxSizing: 'border-box'}}>
      {lines.map((l, i) => {
        const k = popIn(t - 0.08 - i * 0.18, 0.4);
        return (
          <div key={i} style={{fontFamily: 'Poppins', fontWeight: 900, fontSize: i === 0 ? 86 : 70, lineHeight: 1.08, color: i === 0 ? '#ffd23f' : '#ffffff',
            textShadow: outline(6), transform: `scale(${k})`}}>{l}</div>
        );
      })}
    </div>
  );
};

export const Story: React.FC<StoryProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const sc = props.scenes;
  const i = sceneAt(sc, t);
  const s = sc[i];
  const lt = t - s.start;
  const skyNow = SKY[s.spec.sky ?? 'day'];
  const skyPrev = SKY[(i > 0 ? sc[i - 1].spec.sky : s.spec.sky) ?? 'day'];
  const k = easeInOut(lt / 1.2);
  const bg = mix(skyPrev.bg, skyNow.bg, k);
  const fog = mix(skyPrev.fog, skyNow.fog, k);
  const sea = mix(skyPrev.sea, skyNow.sea, k);
  const hemi = skyPrev.hemi + (skyNow.hemi - skyPrev.hemi) * k;
  const dir = skyPrev.dir + (skyNow.dir - skyPrev.dir) * k;
  const amp = blendNum(sc, t, (x) => x.spec.waves, 0.3);
  const night = (s.spec.sky === 'night' ? k : 0) + (i > 0 && sc[i - 1].spec.sky === 'night' && s.spec.sky !== 'night' ? 1 - k : 0);
  // 雷: シーンの 0.4 秒と 2.6 秒に光る
  const bolt = (s.spec.lightning ? Math.max(0, 1 - Math.abs(lt - 0.4) * 9) + Math.max(0, 1 - Math.abs(lt - 2.6) * 9) : 0) + (s.spec.strike ? Math.max(0, 1 - Math.abs(lt - (s.spec.strike.delay ?? 0.8) - 0.12) * 7) : 0);
  const strikeK = s.spec.strike ? Math.max(0, 1 - Math.abs(lt - (s.spec.strike.delay ?? 0.8) - 0.12) * 6) : 0;
  const shake = (s.spec.shake ?? 0) * (1 - clamp01(lt / s.dur)) + (s.spec.blast ? Math.max(0, 1 - Math.abs(lt - (s.spec.blast.delay ?? 0.8)) * 2) : 0) + strikeK;
  // 口パク: 字幕の単語が出た直後に口を開ける
  const cap = props.captions.find((c) => t >= c.start && t < c.end);
  const lastWord = cap?.words.filter(([, wt]) => wt <= t).pop();
  const talk = lastWord ? Math.max(0, 1 - (t - lastWord[1]) * 5) : 0;
  const look = (s.spec.cam ?? sc.find((x) => x.spec.cam)?.spec.cam)?.look ?? [0, 0, 0];
  const set = s.spec.set ?? 'ocean';
  return (
    <AbsoluteFill style={{background: bg}}>
      <style>{`@font-face { font-family: 'Poppins'; font-weight: 800; src: url('${staticFile('job/Poppins-ExtraBold.ttf')}'); }
        @font-face { font-family: 'Poppins'; font-weight: 900; src: url('${staticFile('job/Poppins-Black.ttf')}'); }`}</style>
      <ThreeCanvas width={W} height={H} camera={{fov: 40, near: 0.5, far: 1500}} gl={{antialias: true, preserveDrawingBuffer: true}} shadows
        style={{filter: 'saturate(1.22) contrast(1.06)'}}>
        <Cam sc={sc} t={t} shake={shake} />
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={[fog, 120, 600]} />
        <hemisphereLight args={['#eaf5ff', '#5d5a52', hemi + bolt * 1.5]} />
        <directionalLight position={[50, 90, 40]} intensity={dir + bolt * 2} color={skyNow.dirColor} castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-70} shadow-camera-right={70}
          shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-far={300} />
        {night > 0.05 && <Stars />}
        {set === 'ocean' && <Ocean t={t} amp={amp} color={sea} />}
        {set === 'city' && <City s={{t, sea: -1.6, cars: 1, people: 1}} />}
        {set === 'forest' && <Forest />}
        {s.spec.strike && <Bolt to={s.spec.strike.pos} k={(lt - (s.spec.strike.delay ?? 0.8)) / 0.5} seed={i + 1} />}
        {s.spec.sky === 'storm' && <Rain t={t} center={look} />}
        {(s.spec.objects ?? []).map((o, j) => <Thing key={j} o={o} lt={lt} dur={s.dur} t={t} amp={amp} talk={talk} />)}
        {s.spec.blast && (
          <group position={s.spec.blast.pos}><Blast k={(lt - (s.spec.blast.delay ?? 0.8)) / 1.4} /></group>
        )}
      </ThreeCanvas>
      {/* ミニチュアっぽく上下をぼかす */}
      <AbsoluteFill style={{backdropFilter: 'blur(5px)', WebkitMaskImage: 'linear-gradient(#000 0%, #000 6%, transparent 30%, transparent 70%, #000 94%)'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(0,0,0,0.3) 100%)'}} />
      {(bolt > 0 || (s.spec.flash && lt < 0.4)) && <AbsoluteFill style={{background: '#fff', opacity: Math.max(bolt * 0.55, s.spec.flash ? (1 - lt / 0.4) * 0.8 : 0)}} />}
      <Hook lines={props.hook} t={t} />
      {t > 2.9 && <Counter sc={sc} t={t} />}
      <Captions caps={props.captions ?? []} t={t} top={H * 0.74} />
      {props.audio && <Audio src={staticFile(`job/${props.audio}`)} />}
    </AbsoluteFill>
  );
};

export {easeOut};
