import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {Captions} from '../Short';
import type {Caption} from '../types';
import {clamp01, easeInOut, easeOut, popIn, H, W} from '../util';
import {City} from './City';

type V3 = [number, number, number];
export type WIScene = {
  start: number;
  dur: number;
  spec: {
    narration?: string;
    cam?: {pos: V3; look: V3};
    sea?: number; // シーン終わりの海面
    cars?: number;
    people?: number;
    counter?: string; // 上に出す "DAY 7" など
    sub?: string; // カウンターの下の小さな説明 ("+7 METERS")
  };
};
export type WIProps = {
  frames: number;
  fps: number;
  title: {top: string; big: string; bottom: string};
  scenes: WIScene[];
  captions: Caption[];
  audio?: string;
};

const SERIF = 'Playfair';

const Fonts: React.FC = () => (
  <style>{`
    @font-face { font-family: '${SERIF}'; font-weight: 900; src: url('${staticFile('fonts/playfair-display-latin-900-normal.woff2')}'); }
    @font-face { font-family: '${SERIF}'; font-weight: 700; font-style: italic; src: url('${staticFile('fonts/playfair-display-latin-700-italic.woff2')}'); }
    @font-face { font-family: 'Poppins'; font-weight: 800; src: url('${staticFile('job/Poppins-ExtraBold.ttf')}'); }
  `}</style>
);

/** シーンの頭で前の値からなめらかに変わる数値 (海面・車の数など)。 */
const track = (scenes: WIScene[], t: number, key: 'sea' | 'cars' | 'people', init: number, move = 1.6) => {
  let prev = init;
  for (const s of scenes) {
    const v = s.spec[key] ?? prev;
    if (t < s.start + s.dur) {
      return prev + (v - prev) * easeInOut((t - s.start) / Math.min(move, s.dur * 0.8));
    }
    prev = v;
  }
  return prev;
};

const CameraRig: React.FC<{scenes: WIScene[]; t: number}> = ({scenes, t}) => {
  const {camera} = useThree();
  let i = scenes.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = scenes.length - 1;
  const camOf = (j: number) => {
    for (let n = j; n >= 0; n--) if (scenes[n].spec.cam) return scenes[n].spec.cam!;
    return {pos: [0, 60, 70] as V3, look: [0, 0, -10] as V3};
  };
  const a = i > 0 ? camOf(i - 1) : camOf(i);
  const b = camOf(i);
  const s = scenes[i];
  const u = easeInOut((t - s.start) / Math.min(2.0, s.dur * 0.7));
  const lerp = (p: V3, q: V3, k: number): V3 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  const pos = lerp(a.pos, b.pos, u);
  const look = lerp(a.look, b.look, u);
  // ゆっくり回り込むドリー (止まって見えないように)
  const drift = Math.sin(t * 0.12) * 1.5;
  camera.position.set(pos[0] + drift, pos[1], pos[2]);
  camera.lookAt(look[0], look[1], look[2]);
  return null;
};

const Title: React.FC<{title: WIProps['title']; t: number}> = ({title, t}) => {
  const out = 1 - clamp01((t - 3.6) / 0.5);
  if (out <= 0) return null;
  const k1 = popIn(t - 0.1, 0.5);
  const k2 = popIn(t - 0.35, 0.55);
  const k3 = popIn(t - 0.7, 0.5);
  const shadow = '0 4px 14px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)';
  return (
    <div style={{position: 'absolute', top: H * 0.1, width: W, textAlign: 'center', opacity: out}}>
      <div style={{fontFamily: 'Poppins', fontWeight: 800, fontSize: 40, letterSpacing: 10, color: '#f6f1e6',
        textShadow: shadow, transform: `scale(${k1})`}}>{title.top}</div>
      <div style={{fontFamily: SERIF, fontWeight: 900, fontSize: 190, lineHeight: 1.05, marginTop: 6, transform: `scale(${k2})`,
        background: 'linear-gradient(180deg, #fff1c1 0%, #f2c45a 45%, #b9792a 100%)', WebkitBackgroundClip: 'text',
        color: 'transparent', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.55))'}}>{title.big}</div>
      <div style={{fontFamily: SERIF, fontWeight: 700, fontStyle: 'italic', fontSize: 64, color: '#fbf6ea', marginTop: 4,
        textShadow: shadow, transform: `scale(${k3})`}}>{title.bottom}</div>
    </div>
  );
};

const Counter: React.FC<{scenes: WIScene[]; t: number}> = ({scenes, t}) => {
  let i = scenes.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = scenes.length - 1;
  const s = scenes[i];
  if (!s.spec.counter) return null;
  const fresh = i === 0 || scenes[i - 1].spec.counter !== s.spec.counter;
  const k = fresh ? popIn(t - s.start, 0.45) : 1;
  return (
    <div style={{position: 'absolute', top: H * 0.085, width: W, textAlign: 'center'}}>
      <div style={{display: 'inline-block', transform: `scale(${k})`, padding: '10px 40px', borderRadius: 20,
        background: 'rgba(15,20,30,0.62)', border: '3px solid rgba(242,196,90,0.9)', boxShadow: '0 10px 24px rgba(0,0,0,0.35)'}}>
        <div style={{fontFamily: SERIF, fontWeight: 900, fontSize: 92, lineHeight: 1.0,
          background: 'linear-gradient(180deg, #fff1c1 0%, #f2c45a 55%, #c58631 100%)', WebkitBackgroundClip: 'text',
          color: 'transparent'}}>{s.spec.counter}</div>
        {s.spec.sub && <div style={{fontFamily: 'Poppins', fontWeight: 800, fontSize: 34, letterSpacing: 4, color: '#f6f1e6', marginTop: 4}}>{s.spec.sub}</div>}
      </div>
    </div>
  );
};

export const WhatIf: React.FC<WIProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const sc = props.scenes;
  const sea = track(sc, t, 'sea', -1.0, 2.4);
  const cars = track(sc, t, 'cars', 1);
  const people = track(sc, t, 'people', 1);
  return (
    <AbsoluteFill style={{background: 'linear-gradient(#9fd0f0, #dceefa)'}}>
      <Fonts />
      <ThreeCanvas width={W} height={H} camera={{fov: 38, near: 1, far: 1400, position: [0, 60, 70]}}
        gl={{antialias: true, preserveDrawingBuffer: true}} shadows
        style={{filter: 'saturate(1.28) contrast(1.07) brightness(1.03)'}}>
        <CameraRig scenes={sc} t={t} />
        <color attach="background" args={['#a9d6f2']} />
        <fog attach="fog" args={['#bfe0f5', 220, 700]} />
        <hemisphereLight args={['#eaf5ff', '#8a7d6a', 0.9]} />
        <directionalLight position={[60, 110, 40]} intensity={1.9} color="#fff4e0" castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-120} shadow-camera-right={120}
          shadow-camera-top={120} shadow-camera-bottom={-120} shadow-camera-far={400} shadow-bias={-0.0004} />
        <City s={{t, sea, cars, people}} />
      </ThreeCanvas>
      {/* ティルトシフト: 上と下をぼかして、真ん中だけピントが合った模型の写真に見せる */}
      <AbsoluteFill style={{backdropFilter: 'blur(7px)', WebkitMaskImage: 'linear-gradient(#000 0%, #000 8%, transparent 34%, transparent 66%, #000 92%)'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(0,0,0,0.28) 100%)'}} />
      <Title title={props.title} t={t} />
      {t > 3.8 && <Counter scenes={sc} t={t} />}
      <Captions caps={props.captions ?? []} t={t} />
      {props.audio && <Audio src={staticFile(`job/${props.audio}`)} />}
    </AbsoluteFill>
  );
};

export {THREE};
