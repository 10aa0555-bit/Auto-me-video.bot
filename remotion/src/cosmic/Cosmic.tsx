import React, {useMemo, useState} from 'react';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Caption} from '../types';
import {H, W, clamp01, easeInOut, easeOut} from '../util';
import {Bridge, Chess, Crowd, Face, Fire, Mirror, Moon, Stairs, Street, Window} from './Noir';

/**
 * フラットなベクター調の宇宙アニメ (2D、SVG)。読み上げ中の単語を画面の真ん中に 1 語ずつ大きく出す。
 * 絵はすべてこのファイルの中で図形から描く (素材の借用なし)。
 */

export type CosmicScene = {
  start: number;
  dur: number;
  spec: {
    narration?: string;
    scene: string; // hill / atoms / bigbang / nebula / supernova / disk / earth / ocean / city / blood / galaxy / end
    hot?: string[]; // オレンジで強調する単語
  };
};
export type CosmicProps = {frames: number; fps: number; scenes: CosmicScene[]; captions: Caption[]; audio?: string; theme?: 'cosmic' | 'noir'};

const C = {
  ink: '#0b0826',
  navy: '#140f45',
  purple: '#2c1670',
  violet: '#5b2bb5',
  magenta: '#d23ca8',
  pink: '#ff6fa8',
  cyan: '#33d6ff',
  teal: '#2fe0b8',
  yellow: '#ffd84a',
  orange: '#ff7a2a',
  red: '#ff3d5a',
  white: '#fdf6ff',
};

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/** 共通のぼかし (光) フィルター。 */
const Defs: React.FC = () => (
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
    <filter id="glowS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
    <filter id="blur40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40" /></filter>
    <radialGradient id="sunG"><stop offset="0" stopColor="#fffbe6" /><stop offset="0.35" stopColor={C.yellow} /><stop offset="0.7" stopColor={C.orange} stopOpacity="0.6" /><stop offset="1" stopColor={C.orange} stopOpacity="0" /></radialGradient>
    <radialGradient id="flashG"><stop offset="0" stopColor="#ffffff" /><stop offset="0.25" stopColor="#fff2b0" /><stop offset="0.5" stopColor={C.orange} stopOpacity="0.85" /><stop offset="0.75" stopColor={C.magenta} stopOpacity="0.45" /><stop offset="1" stopColor={C.violet} stopOpacity="0" /></radialGradient>
    <radialGradient id="redG"><stop offset="0" stopColor="#fff0d8" /><stop offset="0.4" stopColor={C.orange} /><stop offset="0.8" stopColor={C.red} /><stop offset="1" stopColor={C.red} stopOpacity="0" /></radialGradient>
    <radialGradient id="vign"><stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.55" /></radialGradient>
    <linearGradient id="seaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1fb6d9" /><stop offset="0.5" stopColor="#1458a8" /><stop offset="1" stopColor="#0b1a52" /></linearGradient>
    <linearGradient id="earthG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38c6ff" /><stop offset="1" stopColor="#1a4fb8" /></linearGradient>
    <linearGradient id="bloodG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a0b2a" /><stop offset="0.5" stopColor="#a3123a" /><stop offset="1" stopColor="#4a0822" /></linearGradient>
    <linearGradient id="cityG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a0f4d" /><stop offset="0.55" stopColor="#6b2a9a" /><stop offset="0.8" stopColor="#ff7a5a" /><stop offset="1" stopColor="#ffb36a" /></linearGradient>
  </defs>
);

const Sky: React.FC<{t: number; top?: string; bottom?: string; n?: number; seed?: number}> = ({t, top = C.ink, bottom = C.purple, n = 220, seed = 3}) => {
  const stars = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: n}).map(() => ({x: r() * W, y: r() * H, s: 0.8 + r() * 2.6, p: r() * 6.28, c: r() < 0.15 ? C.cyan : r() < 0.25 ? C.pink : '#ffffff'}));
  }, [n, seed]);
  return (
    <g>
      <defs>
        <linearGradient id={`sky${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={top} /><stop offset="1" stopColor={bottom} /></linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#sky${seed})`} />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s * (0.75 + 0.25 * Math.sin(t * 2 + s.p))} fill={s.c} opacity={0.55 + 0.45 * Math.sin(t * 1.3 + s.p)} />
      ))}
    </g>
  );
};

/** シンプルな人のシルエット (フチが光る)。 */
const Person: React.FC<{x: number; y: number; s?: number; rim?: string; arm?: number}> = ({x, y, s = 1, rim = C.cyan, arm = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <g stroke={rim} strokeWidth={7} strokeLinejoin="round" fill={C.ink}>
      <path d="M -34 -150 Q -40 -60 -30 -10 L -14 -10 L -10 -70 L 10 -70 L 14 -10 L 30 -10 Q 40 -60 34 -150 Q 0 -172 -34 -150 Z" />
      <path d={`M 30 -140 Q ${60 + arm * 10} ${-110 - arm * 90} ${70 + arm * 20} ${-90 - arm * 150}`} fill="none" strokeWidth={22} stroke={C.ink} strokeLinecap="round" />
      <path d={`M 30 -140 Q ${60 + arm * 10} ${-110 - arm * 90} ${70 + arm * 20} ${-90 - arm * 150}`} fill="none" strokeWidth={30} stroke={rim} strokeLinecap="round" opacity={0.25} />
      <circle cx={0} cy={-205} r={40} />
    </g>
  </g>
);

const Hills: React.FC<{t: number; tint?: number}> = ({t}) => (
  <g>
    <path d={`M 0 ${H * 0.66} Q ${W * 0.3} ${H * 0.58} ${W * 0.62} ${H * 0.65} T ${W} ${H * 0.62} L ${W} ${H} L 0 ${H} Z`} fill="#3a1c86" />
    <path d={`M 0 ${H * 0.74} Q ${W * 0.4} ${H * 0.66} ${W * 0.75} ${H * 0.73} T ${W} ${H * 0.71} L ${W} ${H} L 0 ${H} Z`} fill="#28125f" />
    <path d={`M 0 ${H * 0.82} Q ${W * 0.45} ${H * 0.72} ${W} ${H * 0.8} L ${W} ${H} L 0 ${H} Z`} fill="#170a3d" />
    {/* 草のきらめき */}
    {Array.from({length: 26}).map((_, i) => (
      <circle key={i} cx={(i * 97) % W} cy={H * 0.86 + ((i * 53) % 200)} r={3} fill={C.teal} opacity={0.4 + 0.4 * Math.sin(t * 2 + i)} />
    ))}
  </g>
);

const Ringed: React.FC<{x: number; y: number; r: number; t: number}> = ({x, y, r, t}) => (
  <g transform={`translate(${x} ${y}) rotate(-18)`}>
    <ellipse rx={r * 2.1} ry={r * 0.5} fill="none" stroke={C.cyan} strokeWidth={r * 0.12} opacity={0.55} />
    <circle r={r} fill={C.violet} />
    <path d={`M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z`} fill="#3b1a8a" />
    <ellipse rx={r * 2.1} ry={r * 0.5} fill="none" stroke={C.cyan} strokeWidth={r * 0.12} strokeDasharray={`${r * 6.6} ${r * 6.6}`} strokeDashoffset={-r * 3.3} />
    <circle r={r * 1.3} fill={C.cyan} opacity={0.08 + 0.03 * Math.sin(t)} filter="url(#glow)" />
  </g>
);

const Hill: React.FC<{t: number; lt: number; end?: boolean}> = ({t, lt, end}) => (
  <g>
    <Sky t={t} top={C.ink} bottom={end ? '#4a1f8f' : '#3b1670'} />
    {end ? <Galaxy t={t} small /> : <Ringed x={W * 0.68} y={H * 0.2} r={170} t={t} />}
    {/* 流れ星 */}
    {(() => {
      const k = (lt % 4) / 0.8;
      if (k > 1) return null;
      return <line x1={W * 0.15 + k * 500} y1={H * 0.1 + k * 220} x2={W * 0.15 + k * 500 - 160} y2={H * 0.1 + k * 220 - 70} stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={1 - k} />;
    })()}
    <Hills t={t} />
    <Person x={W * 0.5} y={H * 0.86} s={2.6} arm={end ? easeInOut(lt / 2.5) : 0} />
  </g>
);

const Atoms: React.FC<{t: number}> = ({t}) => {
  const nuc = useMemo(() => {
    const r = rng(5);
    return Array.from({length: 14}).map((_, i) => ({x: (r() - 0.5) * 90, y: (r() - 0.5) * 90, c: i % 2 ? C.red : '#7b8bff'}));
  }, []);
  const small = useMemo(() => {
    const r = rng(8);
    return Array.from({length: 18}).map(() => ({x: r() * W, y: r() * H, s: 0.2 + r() * 0.35, sp: 0.5 + r()}));
  }, []);
  const Atom: React.FC<{x: number; y: number; s: number; sp: number}> = ({x, y, s, sp}) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 60, 120].map((a, j) => (
        <g key={a} transform={`rotate(${a})`}>
          <ellipse rx={300} ry={95} fill="none" stroke={C.cyan} strokeWidth={4} strokeDasharray="14 12" opacity={0.6} />
          <circle cx={300 * Math.cos(t * sp * 2 + j * 2)} cy={95 * Math.sin(t * sp * 2 + j * 2)} r={16} fill={C.cyan} />
          <circle cx={300 * Math.cos(t * sp * 2 + j * 2)} cy={95 * Math.sin(t * sp * 2 + j * 2)} r={34} fill={C.cyan} opacity={0.5} filter="url(#glowS)" />
        </g>
      ))}
      <circle r={110} fill={C.magenta} opacity={0.35} filter="url(#glow)" />
      {nuc.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={34} fill={n.c} stroke={C.ink} strokeWidth={5} />)}
    </g>
  );
  return (
    <g>
      <Sky t={t} top="#0b0a33" bottom="#2a0f63" n={80} seed={8} />
      {small.map((a, i) => <g key={i} opacity={0.45}><Atom x={a.x + Math.sin(t * 0.4 + i) * 30} y={a.y + Math.cos(t * 0.3 + i) * 30} s={a.s} sp={a.sp} /></g>)}
      <Atom x={W / 2} y={H / 2} s={1.75} sp={1} />
    </g>
  );
};

const BigBang: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const parts = useMemo(() => {
    const r = rng(13);
    return Array.from({length: 260}).map(() => ({a: r() * Math.PI * 2, v: 300 + r() * 1400, c: [C.yellow, C.orange, C.pink, C.cyan, '#fff'][Math.floor(r() * 5)], s: 2 + r() * 6}));
  }, []);
  const k = easeOut(clamp01(lt / 3));
  return (
    <g>
      <rect width={W} height={H} fill="#05030f" />
      <circle cx={W / 2} cy={H / 2} r={80 + k * 1200} fill="url(#flashG)" />
      {parts.map((p, i) => {
        const d = p.v * easeOut(clamp01(lt / 4));
        const x = W / 2 + Math.cos(p.a) * d;
        const y = H / 2 + Math.sin(p.a) * d;
        return <line key={i} x1={x} y1={y} x2={x - Math.cos(p.a) * p.s * 9} y2={y - Math.sin(p.a) * p.s * 9} stroke={p.c} strokeWidth={p.s} strokeLinecap="round" />;
      })}
      <circle cx={W / 2} cy={H / 2} r={60 + 30 * Math.sin(t * 9)} fill="#fff" opacity={1 - k * 0.7} filter="url(#glowS)" />
    </g>
  );
};

/** 星が生まれるガス雲。 */
const Nebula: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const blobs = [
    {x: 0.25, y: 0.35, r: 420, c: C.magenta}, {x: 0.8, y: 0.3, r: 380, c: C.violet}, {x: 0.55, y: 0.7, r: 460, c: '#2a6bff'},
    {x: 0.15, y: 0.8, r: 300, c: C.pink}, {x: 0.9, y: 0.75, r: 320, c: C.teal},
  ];
  const stars = [{x: 0.3, y: 0.42, at: 0.4}, {x: 0.68, y: 0.55, at: 1.4}, {x: 0.5, y: 0.28, at: 2.3}, {x: 0.42, y: 0.72, at: 3.1}];
  return (
    <g>
      <Sky t={t} top="#0a0726" bottom="#1d0d4f" n={160} seed={11} />
      {blobs.map((b, i) => (
        <circle key={i} cx={b.x * W + Math.sin(t * 0.2 + i) * 40} cy={b.y * H + Math.cos(t * 0.25 + i) * 40} r={b.r} fill={b.c} opacity={0.38} filter="url(#blur40)" />
      ))}
      {stars.map((s, i) => {
        const k = easeOut(clamp01((lt - s.at) / 0.6));
        if (k <= 0) return null;
        const r = 26 * k * (1 + 0.06 * Math.sin(t * 6 + i));
        return (
          <g key={i} transform={`translate(${s.x * W} ${s.y * H})`}>
            <circle r={r * 5} fill="url(#sunG)" opacity={0.8} />
            <path d={`M ${-r * 6} 0 L ${r * 6} 0 M 0 ${-r * 6} L 0 ${r * 6}`} stroke="#fff" strokeWidth={4} opacity={0.6 * k} />
            <circle r={r} fill="#fffbe6" />
          </g>
        );
      })}
    </g>
  );
};

const ELEMS = ['C', 'O', 'N', 'Fe', 'Ca', 'H', 'P', 'S'];

const Supernova: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const debris = useMemo(() => {
    const r = rng(17);
    return Array.from({length: 40}).map((_, i) => ({a: r() * Math.PI * 2, v: 350 + r() * 650, e: ELEMS[i % ELEMS.length], c: [C.cyan, C.pink, C.yellow, C.teal, C.orange][i % 5]}));
  }, []);
  const boom = 1.6;
  const grow = clamp01(lt / boom);
  const k = clamp01((lt - boom) / 2.5);
  return (
    <g>
      <Sky t={t} top="#120626" bottom="#3a0d3f" n={180} seed={17} />
      {lt < boom + 0.25 && (
        <g transform={`translate(${W / 2} ${H / 2})`}>
          <circle r={(170 + grow * 120) * (1 + 0.04 * Math.sin(t * 20 * grow))} fill="url(#redG)" />
          <circle r={(120 + grow * 90)} fill={C.orange} />
          <circle r={(120 + grow * 90) * 0.7} fill="#ffb15a" />
        </g>
      )}
      {lt >= boom && (
        <g transform={`translate(${W / 2} ${H / 2})`}>
          <circle r={200 + easeOut(k) * 900} fill="url(#flashG)" opacity={1 - k * 0.6} />
          <circle r={150 + easeOut(k) * 1100} fill="none" stroke={C.cyan} strokeWidth={16 * (1 - k) + 2} opacity={1 - k} />
          {debris.map((d, i) => {
            const dist = d.v * easeOut(k);
            return (
              <g key={i} transform={`translate(${Math.cos(d.a) * dist} ${Math.sin(d.a) * dist})`}>
                <circle r={30} fill={d.c} stroke={C.ink} strokeWidth={5} />
                <text y={11} textAnchor="middle" fontFamily="Anton" fontSize={30} fill={C.ink}>{d.e}</text>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
};

/** 若い太陽のまわりのちりの円盤から、惑星ができる。 */
const Disk: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const dust = useMemo(() => {
    const r = rng(23);
    return Array.from({length: 700}).map(() => ({r: 220 + r() * 780, a: r() * Math.PI * 2, s: 2 + r() * 5, c: [C.orange, C.pink, '#c9a2ff', C.yellow][Math.floor(r() * 4)]}));
  }, []);
  const cx = W / 2;
  const cy = H * 0.5;
  const pk = easeOut(clamp01((lt - 1) / 3));
  const pa = t * 0.35 + 1;
  return (
    <g>
      <Sky t={t} top="#0b0726" bottom="#26104f" n={140} seed={23} />
      {dust.map((d, i) => {
        const a = d.a + t * (300 / d.r) * 0.25;
        const y = cy + Math.sin(a) * d.r * 0.32;
        return <circle key={i} cx={cx + Math.cos(a) * d.r} cy={y} r={d.s} fill={d.c} opacity={Math.sin(a) > 0 ? 0.95 : 0.55} />;
      })}
      <circle cx={cx} cy={cy} r={420} fill="url(#sunG)" />
      <circle cx={cx} cy={cy} r={110} fill="#fffbe6" />
      {pk > 0 && (
        <g transform={`translate(${cx + Math.cos(pa) * 520} ${cy + Math.sin(pa) * 520 * 0.32})`}>
          <circle r={20 + pk * 70} fill="#3f8cff" stroke={C.ink} strokeWidth={5} />
          <path d={`M ${-(20 + pk * 70)} 0 A ${20 + pk * 70} ${20 + pk * 70} 0 0 0 ${20 + pk * 70} 0 Z`} fill="#1b3f9a" opacity={0.6} />
        </g>
      )}
    </g>
  );
};

const Earth: React.FC<{t: number; small?: boolean}> = ({t}) => {
  const R = 460;
  const land = useMemo(() => {
    const r = rng(29);
    return Array.from({length: 9}).map(() => ({x: (r() - 0.5) * 2.4 * R, y: (r() - 0.5) * 1.6 * R, rx: 80 + r() * 170, ry: 60 + r() * 120}));
  }, []);
  const off = ((t * 40) % (2.4 * R));
  return (
    <g>
      <Sky t={t} top="#05041a" bottom="#150b3d" n={240} seed={29} />
      <g transform={`translate(${W / 2} ${H / 2})`}>
        <circle r={R * 1.12} fill={C.cyan} opacity={0.18} filter="url(#glow)" />
        <clipPath id="earthClip"><circle r={R} /></clipPath>
        <circle r={R} fill="url(#earthG)" />
        <g clipPath="url(#earthClip)">
          {land.map((l, i) => {
            const x = ((((l.x + off) % (2.4 * R)) + 2.4 * R) % (2.4 * R)) - 1.2 * R;
            return [0, -2.4 * R, 2.4 * R].map((o) => <ellipse key={`${i}_${o}`} cx={x + o} cy={l.y} rx={l.rx} ry={l.ry} fill="#4fd17a" />);
          })}
          {[-0.4, 0.1, 0.5].map((y, i) => (
            <path key={i} d={`M ${-R + ((t * 60 + i * 300) % (2 * R))} ${y * R} q 60 -30 120 0 t 120 0`} stroke="#fff" strokeWidth={22} fill="none" strokeLinecap="round" opacity={0.8} />
          ))}
          {/* 夜の側 */}
          <circle cx={R * 0.55} cy={R * 0.35} r={R * 1.05} fill="#0a0830" opacity={0.45} />
        </g>
        <circle r={R} fill="none" stroke={C.ink} strokeWidth={8} />
        <g transform={`translate(${Math.cos(t * 0.5) * 620} ${-420 + Math.sin(t * 0.5) * 80})`}>
          <circle r={70} fill="#d8d2f0" stroke={C.ink} strokeWidth={6} />
          <circle cx={-18} cy={-10} r={14} fill="#b4abd9" />
          <circle cx={20} cy={22} r={10} fill="#b4abd9" />
        </g>
      </g>
    </g>
  );
};

const Ocean: React.FC<{t: number}> = ({t}) => {
  const fish = useMemo(() => {
    const r = rng(31);
    return Array.from({length: 26}).map(() => ({y: H * 0.35 + r() * H * 0.6, sp: 40 + r() * 90, ph: r() * W, s: 0.5 + r() * 1.1, c: [C.yellow, C.pink, C.teal, C.cyan][Math.floor(r() * 4)]}));
  }, []);
  return (
    <g>
      <rect width={W} height={H} fill="url(#seaG)" />
      {[0, 1, 2, 3].map((i) => (
        <polygon key={i} points={`${W * (0.2 + i * 0.2) + Math.sin(t * 0.5 + i) * 40},0 ${W * (0.2 + i * 0.2) + 90},0 ${W * (0.1 + i * 0.25)},${H} ${W * (0.05 + i * 0.25)},${H}`} fill="#bff4ff" opacity={0.07} />
      ))}
      {fish.map((f, i) => {
        const x = ((f.ph + t * f.sp) % (W + 200)) - 100;
        const y = f.y + Math.sin(t * 2 + i) * 14;
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${f.s})`}>
            <path d="M 0 0 q 30 -26 60 0 q -30 26 -60 0 Z M 0 0 l -22 -16 l 0 32 Z" fill={f.c} stroke={C.ink} strokeWidth={4} />
            <circle cx={42} cy={-4} r={4} fill={C.ink} />
          </g>
        );
      })}
      {/* 海藻 */}
      {Array.from({length: 9}).map((_, i) => (
        <path key={i} d={`M ${i * 130 + 30} ${H} q ${Math.sin(t + i) * 40} -120 0 -240 q ${-Math.sin(t + i) * 40} -120 0 -240`} stroke={i % 2 ? C.magenta : C.teal} strokeWidth={22} fill="none" strokeLinecap="round" />
      ))}
    </g>
  );
};

const City: React.FC<{t: number}> = ({t}) => {
  const b = useMemo(() => {
    const r = rng(37);
    const out: {x: number; w: number; h: number; c: string}[] = [];
    let x = -20;
    while (x < W + 20) {
      const w = 90 + r() * 120;
      out.push({x, w, h: 300 + r() * 700, c: ['#2a1563', '#341a78', '#1f1050'][Math.floor(r() * 3)]});
      x += w - 10;
    }
    return out;
  }, []);
  const base = H * 0.8;
  return (
    <g>
      <rect width={W} height={H} fill="url(#cityG)" />
      <circle cx={W * 0.5} cy={H * 0.62} r={240} fill="url(#sunG)" opacity={0.8} />
      <Sky t={t} top="#00000000" bottom="#00000000" n={60} seed={37} />
      {b.map((bd, i) => (
        <g key={i}>
          <rect x={bd.x} y={base - bd.h} width={bd.w} height={bd.h} fill={bd.c} stroke={C.ink} strokeWidth={4} />
          {Array.from({length: Math.floor(bd.h / 60)}).map((_, j) =>
            [0, 1, 2].map((k) => {
              const on = Math.sin(i * 7.1 + j * 3.3 + k * 1.7 + Math.floor(t * 0.7 + i) * 0.9) > 0.1;
              return on ? <rect key={`${j}${k}`} x={bd.x + 14 + k * (bd.w - 28) / 3} y={base - bd.h + 22 + j * 60} width={(bd.w - 28) / 3 - 12} height={26} fill={C.yellow} opacity={0.9} /> : null;
            }),
          )}
        </g>
      ))}
      <rect y={base} width={W} height={H - base} fill="#120a33" />
      {b.map((bd, i) => <rect key={i} x={bd.x + 10} y={base + 10} width={bd.w - 20} height={Math.min(220, bd.h * 0.3)} fill={C.yellow} opacity={0.05 + 0.04 * Math.sin(t * 3 + i)} />)}
    </g>
  );
};

/** 血管を流れる赤血球。 */
const Blood: React.FC<{t: number}> = ({t}) => {
  const cells = useMemo(() => {
    const r = rng(41);
    return Array.from({length: 34}).map(() => ({y: H * 0.15 + r() * H * 0.7, sp: 120 + r() * 160, ph: r() * (W + 400), rot: r() * 180, s: 0.7 + r() * 0.7}));
  }, []);
  return (
    <g>
      <rect width={W} height={H} fill="url(#bloodG)" />
      {cells.map((c, i) => {
        const x = ((c.ph + t * c.sp) % (W + 400)) - 200;
        return (
          <g key={i} transform={`translate(${x} ${c.y + Math.sin(t + i) * 20}) rotate(${c.rot + t * 30}) scale(${c.s})`}>
            <ellipse rx={90} ry={60} fill="#ff4d6d" stroke="#3a0618" strokeWidth={6} />
            <ellipse rx={46} ry={28} fill="#c9204a" />
          </g>
        );
      })}
      {/* 鉄の原子 (光る) */}
      {[0.3, 0.62].map((y, i) => (
        <g key={i} transform={`translate(${((t * 140 + i * 500) % (W + 300)) - 150} ${H * y})`}>
          <circle r={70} fill={C.yellow} opacity={0.5} filter="url(#glow)" />
          <circle r={44} fill={C.yellow} stroke={C.ink} strokeWidth={6} />
          <text y={16} textAnchor="middle" fontFamily="Anton" fontSize={44} fill={C.ink}>Fe</text>
        </g>
      ))}
    </g>
  );
};

const Galaxy: React.FC<{t: number; small?: boolean}> = ({t, small}) => {
  const pts = useMemo(() => {
    const r = rng(43);
    return Array.from({length: 1700}).map((_, i) => {
      const arm = i % 2;
      const d = Math.pow(r(), 0.7);
      return {d, a: arm * Math.PI + d * 5.2 + (r() - 0.5) * 0.7, s: 2.5 + r() * 5, c: d < 0.25 ? '#fff4c2' : r() < 0.5 ? C.cyan : r() < 0.5 ? C.pink : '#c9b8ff'};
    });
  }, []);
  const R = small ? 520 : 820;
  const cx = W / 2;
  const cy = small ? H * 0.22 : H / 2;
  return (
    <g>
      {!small && <Sky t={t} top="#070420" bottom="#1d0b49" n={200} seed={43} />}
      <g transform={`translate(${cx} ${cy}) scale(1 ${small ? 0.45 : 0.62}) rotate(${t * 6})`}>
        <circle r={R * 0.45} fill="#ffe7a8" opacity={0.45} filter="url(#blur40)" />
        {pts.map((p, i) => <circle key={i} cx={Math.cos(p.a) * p.d * R} cy={Math.sin(p.a) * p.d * R} r={p.s} fill={p.c} opacity={0.85} />)}
        <circle r={R * 0.09} fill="#fffbe6" />
      </g>
    </g>
  );
};


/** ブラックホール (降着円盤 + 光の輪 + 真っ黒な影)。z: 大きさの倍率。 */
const Hole: React.FC<{t: number; z?: number; cx?: number; cy?: number}> = ({t, z = 1, cx = W / 2, cy = H * 0.45}) => {
  const R = 150 * z;
  const band = (rx: number, ry: number, w: number, c: string, sp: number, back: boolean) => (
    <path d={back ? `M ${-rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0` : `M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0`}
      fill="none" stroke={c} strokeWidth={w} strokeDasharray={`${w * 3} ${w * 1.4}`} strokeDashoffset={-t * sp * 60} strokeLinecap="round" />
  );
  const rings: [number, string, number][] = [[2.0, C.yellow, 1.3], [2.5, C.orange, 1.0], [3.1, C.magenta, 0.8], [3.7, C.violet, 0.6]];
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={R * 4.2} fill={C.orange} opacity={0.12} filter="url(#blur40)" />
      {/* 奥側の円盤 */}
      {rings.map(([k, c, sp], i) => <g key={'b' + i}>{band(R * k, R * k * 0.28, R * 0.32, c, sp, true)}</g>)}
      {/* 重力で曲がって上に見える円盤 */}
      {rings.slice(0, 2).map(([k, c], i) => (
        <path key={'l' + i} d={`M ${-R * (1.15 + i * 0.25)} 0 A ${R * (1.15 + i * 0.25)} ${R * (1.15 + i * 0.25)} 0 0 1 ${R * (1.15 + i * 0.25)} 0`} fill="none" stroke={c} strokeWidth={R * 0.16} opacity={0.85} />
      ))}
      <circle r={R * 1.06} fill="none" stroke="#fff6d8" strokeWidth={R * 0.07} />
      <circle r={R * 1.06} fill="none" stroke={C.yellow} strokeWidth={R * 0.2} opacity={0.4} filter="url(#glowS)" />
      <circle r={R} fill="#000" />
      {/* 手前側の円盤 */}
      {rings.map(([k, c, sp], i) => <g key={'f' + i}>{band(R * k, R * k * 0.28, R * 0.32, c, sp, false)}</g>)}
    </g>
  );
};

/** 宇宙飛行士。stretch で縦に伸びる、tint で赤くなる、fade で消える。 */
const Astronaut: React.FC<{x: number; y: number; s?: number; rot?: number; stretch?: number; tint?: number; fade?: number}> = ({x, y, s = 1, rot = 0, stretch = 1, tint = 0, fade = 0}) => {
  const suit = tint ? `rgb(${255}, ${Math.round(250 - 170 * tint)}, ${Math.round(250 - 190 * tint)})` : '#f4f2fb';
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s / Math.sqrt(stretch)} ${s * stretch})`} opacity={1 - fade}>
      <g stroke={C.ink} strokeWidth={8} strokeLinejoin="round">
        <rect x={-62} y={-40} width={30} height={90} rx={12} fill="#b9b4d6" />
        <rect x={-48} y={-50} width={96} height={120} rx={40} fill={suit} />
        <rect x={-44} y={60} width={36} height={80} rx={16} fill={suit} />
        <rect x={8} y={60} width={36} height={80} rx={16} fill={suit} />
        <rect x={-80} y={-30} width={34} height={90} rx={16} fill={suit} transform="rotate(25 -63 -30)" />
        <rect x={46} y={-30} width={34} height={90} rx={16} fill={suit} transform="rotate(-35 63 -30)" />
        <circle cx={0} cy={-100} r={62} fill={suit} />
        <rect x={-42} y={-128} width={84} height={56} rx={26} fill={tint ? '#ff7a5a' : C.cyan} />
        <rect x={-30} y={-120} width={22} height={14} rx={7} fill="#fff" stroke="none" opacity={0.85} />
      </g>
    </g>
  );
};

const Clock: React.FC<{x: number; y: number; r: number; speed: number; t: number; label: string; color: string}> = ({x, y, r, speed, t, label, color}) => {
  const a = t * speed;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r * 1.08} fill={color} opacity={0.25} filter="url(#glow)" />
      <circle r={r} fill="#fdf6ff" stroke={C.ink} strokeWidth={12} />
      {Array.from({length: 12}).map((_, i) => (
        <line key={i} x1={Math.sin(i * Math.PI / 6) * r * 0.78} y1={-Math.cos(i * Math.PI / 6) * r * 0.78} x2={Math.sin(i * Math.PI / 6) * r * 0.9} y2={-Math.cos(i * Math.PI / 6) * r * 0.9} stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
      ))}
      <line x1={0} y1={0} x2={Math.sin(a / 12) * r * 0.5} y2={-Math.cos(a / 12) * r * 0.5} stroke={C.ink} strokeWidth={14} strokeLinecap="round" />
      <line x1={0} y1={0} x2={Math.sin(a) * r * 0.75} y2={-Math.cos(a) * r * 0.75} stroke={color} strokeWidth={10} strokeLinecap="round" />
      <circle r={14} fill={C.ink} />
      <text y={r + 90} textAnchor="middle" fontFamily="Anton" fontSize={64} fill="#fdf6ff">{label}</text>
    </g>
  );
};

const SCENES: Record<string, React.FC<{t: number; lt: number}>> = {
  hill: ({t, lt}) => <Hill t={t} lt={lt} />,
  end: ({t, lt}) => <Hill t={t} lt={lt} end />,
  atoms: ({t}) => <Atoms t={t} />,
  bigbang: ({t, lt}) => <BigBang t={t} lt={lt} />,
  nebula: ({t, lt}) => <Nebula t={t} lt={lt} />,
  supernova: ({t, lt}) => <Supernova t={t} lt={lt} />,
  disk: ({t, lt}) => <Disk t={t} lt={lt} />,
  earth: ({t}) => <Earth t={t} />,
  ocean: ({t}) => <Ocean t={t} />,
  city: ({t}) => <City t={t} />,
  blood: ({t}) => <Blood t={t} />,
  galaxy: ({t}) => <Galaxy t={t} />,
  street: ({t, lt}) => <Street t={t} lt={lt} />,
  bridge: ({t}) => <Bridge t={t} />,
  face: ({t, lt}) => <Face t={t} lt={lt} />,
  smile: ({t, lt}) => <Face t={t} lt={lt} smile />,
  chess: ({t, lt}) => <Chess t={t} lt={lt} />,
  mirror: ({t, lt}) => <Mirror t={t} lt={lt} />,
  window: ({t}) => <Window t={t} />,
  stairs: ({t, lt}) => <Stairs t={t} lt={lt} />,
  fire: ({t, lt}) => <Fire t={t} lt={lt} />,
  crowd: ({t}) => <Crowd t={t} />,
  moon: ({t}) => <Moon t={t} />,
  blackhole: ({t}) => <g><Sky t={t} top="#05031a" bottom="#1a0a3f" seed={51} /><Hole t={t} z={1.6} /></g>,
  fall: ({t, lt}) => (
    <g><Sky t={t} top="#05031a" bottom="#1a0a3f" seed={52} /><Hole t={t} z={0.9} cy={H * 0.3} />
      <Astronaut x={W * 0.55 - lt * 20} y={H * 0.72 - lt * 40} s={1.3} rot={-20 + lt * 8} /></g>
  ),
  clocks: ({t}) => (
    <g><Sky t={t} top="#0a0626" bottom="#24104d" seed={53} />
      <Clock x={W * 0.5} y={H * 0.3} r={190} speed={6} t={t} label="FRIENDS" color={C.cyan} />
      <Clock x={W * 0.5} y={H * 0.72} r={190} speed={0.6} t={t} label="YOU" color={C.orange} /></g>
  ),
  freeze: ({t, lt}) => (
    <g><Sky t={t} top="#05031a" bottom="#1a0a3f" seed={54} /><Hole t={t} z={2.2} cy={H * 0.42} />
      <Astronaut x={W * 0.5} y={H * 0.28} s={0.55 - Math.min(0.2, lt * 0.03)} rot={10} tint={clamp01(lt / 3)} fade={clamp01((lt - 3) / 3) * 0.8} /></g>
  ),
  stretch: ({t, lt}) => (
    <g><Sky t={t} top="#05031a" bottom="#1a0a3f" seed={55} /><Hole t={t} z={1.2} cy={H * 0.82} />
      <Astronaut x={W * 0.5} y={H * 0.4 + lt * 30} s={1.0} stretch={1 + clamp01(lt / 5) * 2.2} rot={0} /></g>
  ),
  bighole: ({t, lt}) => <g><Sky t={t} top="#05031a" bottom="#1a0a3f" seed={56} /><Hole t={t} z={3.2 + lt * 0.15} cy={H * 0.55} />
    <Astronaut x={W * 0.5} y={H * 0.25 + lt * 20} s={0.5} rot={15} /></g>,
  abyss: ({t, lt}) => (
    <g><rect width={W} height={H} fill="#000" />
      <circle cx={W / 2} cy={H * 0.15} r={260 - Math.min(200, lt * 30)} fill="none" stroke={C.yellow} strokeWidth={14} opacity={0.8} />
      <circle cx={W / 2} cy={H * 0.15} r={260 - Math.min(200, lt * 30)} fill={C.cyan} opacity={0.12} />
      <Astronaut x={W / 2} y={H * 0.62 + lt * 10} s={0.9} rot={180} /></g>
  ),
};

/** 読み上げ中の単語を 1 語だけ大きく出す (GEMRIL 風の縦長の極太文字)。 */
const BigWord: React.FC<{caps: Caption[]; t: number; hot: string[]; theme?: string}> = ({caps, t, hot, theme}) => {
  let word = '';
  let wt = 0;
  for (const c of caps) {
    if (t < c.start - 0.05 || t > c.end + 0.25) continue;
    const parts = c.text.split(/\s+/).filter(Boolean);
    const ws: [string, number][] = c.words.length ? c.words : parts.map((w, j) => [w, c.start + ((c.end - c.start) * j) / parts.length]);
    for (const [w, at] of ws) if (at <= t + 0.03) {
      word = w;
      wt = at;
    }
  }
  if (!word) return null;
  const clean = word.replace(/[^A-Za-z0-9.,'’%-]/g, '').replace(/[.,]+$/, '').toUpperCase();
  if (!clean) return null;
  const isHot = hot.some((h) => clean.replace(/[^A-Z0-9]/g, '') === h.toUpperCase());
  const k = easeOut(clamp01((t - wt) / 0.09));
  const size = Math.min(300, 1900 / Math.max(3, clean.length));
  const noir = theme === 'noir';
  const stops = isHot
    ? (noir ? ['#ff8a8a', '#e0283c', '#9c0f22'] : ['#fff1b0', '#ffb23f', '#ff6a2a'])
    : (noir ? ['#ffffff', '#efe6d2', '#bfb39a'] : ['#ffffff', '#f3ffb8', '#c8ec5a']);
  // Anton の 1 文字の幅はだいたい 0.47 em。はみ出しそうなら横幅を詰める
  const est = clean.length * size * 0.47;
  const fit = est > 980 ? {textLength: 980, lengthAdjust: 'spacingAndGlyphs' as const} : {};
  const sc = 1.18 - 0.18 * k;
  const cy = H * 0.5;
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
      <defs>
        <linearGradient id="wordG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stops[0]} /><stop offset="0.5" stopColor={stops[1]} /><stop offset="1" stopColor={stops[2]} />
        </linearGradient>
        <filter id="wordGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
      </defs>
      <g transform={`translate(${W / 2} ${cy}) scale(${sc}) translate(${-W / 2} ${-cy})`} opacity={0.4 + 0.6 * k}>
        <text x={W / 2} y={cy + size * 0.36} textAnchor="middle" fontFamily="Anton" fontSize={size} fill="rgba(10,6,40,0.6)" filter="url(#wordGlow)" {...fit}>{clean}</text>
        <text x={W / 2} y={cy + size * 0.36 + 9} textAnchor="middle" fontFamily="Anton" fontSize={size} fill="rgba(10,6,40,0.9)" {...fit}>{clean}</text>
        <text x={W / 2} y={cy + size * 0.36} textAnchor="middle" fontFamily="Anton" fontSize={size} fill="url(#wordG)" letterSpacing={2} {...fit}>{clean}</text>
      </g>
    </svg>
  );
};

export const Cosmic: React.FC<CosmicProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [handle] = useState(() => delayRender('anton'));
  useMemo(() => {
    const f = new FontFace('Anton', `url(${staticFile('fonts/anton-latin-400-normal.woff2')})`);
    f.load().then((ff) => document.fonts.add(ff)).finally(() => continueRender(handle));
  }, [handle]);
  const t = frame / fps;
  const sc = props.scenes;
  let i = sc.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = sc.length - 1;
  const s = sc[i];
  const lt = t - s.start;
  const Cur = SCENES[s.spec.scene] ?? SCENES.hill;
  const prev = i > 0 ? sc[i - 1] : null;
  const Prev = prev ? SCENES[prev.spec.scene] ?? SCENES.hill : null;
  // 場面転換: 新しい絵が少し大きい状態から寄ってくる + フェード
  const fin = easeInOut(clamp01(lt / 0.45));
  const push = 1 + 0.07 * clamp01(lt / s.dur);
  const zoomIn = 1.18 - 0.18 * fin;
  const cam = (z: number) => `translate(${W / 2} ${H / 2}) scale(${z}) translate(${-W / 2} ${-H / 2})`;
  return (
    <AbsoluteFill style={{background: C.ink}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs />
        {Prev && fin < 1 && (
          <g transform={cam((1 + 0.07) * (1 + 0.25 * fin))} opacity={1}>
            <Prev t={t} lt={t - prev!.start} />
          </g>
        )}
        <g transform={cam(push * zoomIn)} opacity={fin}>
          <Cur t={t} lt={lt} />
        </g>
        <rect width={W} height={H} fill="url(#vign)" />
      </svg>
      <BigWord caps={props.captions ?? []} t={t} hot={s.spec.hot ?? []} theme={props.theme} />
      {props.audio && <Audio src={staticFile(`job/${props.audio}`)} />}
    </AbsoluteFill>
  );
};
