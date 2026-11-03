import React, {useMemo} from 'react';
import {staticFile} from 'remotion';
import {H, W, clamp01, easeInOut, easeOut} from '../util';
import {Forest, Leaves, Snow} from './Frog';

/**
 * どんな動物にも使える 2D の自然ドキュメンタリーの場面。
 * 背景 (habitat) は図形で描き、動物は AI で描いたポーズ画像 (切り抜き PNG) を重ねて動かす。
 */

export type NatureSpec = {
  habitat?: string; // snow_forest / forest / spring / pond / ocean / deep_sea / desert / savanna / arctic / jungle / cave / night / inside
  animal?: string; // job/ の中のポーズ画像
  ax?: number; // 動物の位置 (0..1)
  ay?: number;
  size?: number; // 動物の大きさ (画面の幅に対する割合)
  flip?: boolean;
  motion?: string; // breathe / still / walk / jump / swim / fly / shiver / wake
  frost?: number; // 0..1 凍り具合
  fx?: string[]; // snow / rain / frost / glow / heartbeat_stop / timelapse / sunrays / splash / bubbles / heat / fireflies
  cam?: string; // push / pull / pan / still
};

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const Grad: React.FC<{id: string; stops: string[]}> = ({id, stops}) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map((c, i) => <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />)}
    </linearGradient>
  </defs>
);

const Hills: React.FC<{y: number; c: string[]}> = ({y, c}) => (
  <g>
    {c.map((col, i) => (
      <path key={i} d={`M 0 ${y + i * 60} Q ${W * 0.3} ${y - 80 + i * 70} ${W * 0.6} ${y + i * 55} T ${W} ${y - 20 + i * 60} L ${W} ${H} L 0 ${H} Z`} fill={col} />
    ))}
  </g>
);

const Fish: React.FC<{t: number; n?: number}> = ({t, n = 14}) => {
  const f = useMemo(() => {
    const r = rng(41);
    return Array.from({length: n}).map(() => ({y: H * 0.15 + r() * H * 0.6, sp: 40 + r() * 80, ph: r() * W, s: 0.4 + r() * 0.7}));
  }, [n]);
  return (
    <g opacity={0.5}>
      {f.map((p, i) => (
        <path key={i} transform={`translate(${((p.ph + t * p.sp) % (W + 200)) - 100} ${p.y + Math.sin(t + i) * 10}) scale(${p.s})`} d="M 0 0 q 30 -20 60 0 q -30 20 -60 0 Z M 0 0 l -20 -14 l 0 28 Z" fill="#cfe9f2" />
      ))}
    </g>
  );
};

/** 背景 (生息地)。 */
export const Habitat: React.FC<{name: string; t: number; lt: number; frost: number}> = ({name, t, lt}) => {
  switch (name) {
    case 'snow_forest':
    case 'arctic':
      return (
        <g>
          <Grad id="hSnow" stops={['#1d3048', '#5d7a96', '#a9c2d6']} />
          <rect width={W} height={H} fill="url(#hSnow)" />
          {name === 'snow_forest' ? <><Forest base={H * 0.56} tone="#1f3242" seed={4} snowy={1} /><Forest base={H * 0.6} tone="#152431" seed={7} snowy={1} /></> : <Hills y={H * 0.5} c={['#cfe0ec', '#e6f0f6']} />}
          <rect y={H * 0.58} width={W} height={H * 0.42} fill="#e9f1f7" />
          <rect y={H * 0.58} width={W} height={10} fill="#ffffff" opacity={0.7} />
          {/* 雪の吹きだまりの陰影 */}
          {[0.64, 0.72, 0.8, 0.9].map((yy, i) => (
            <path key={i} d={`M 0 ${H * yy} Q ${W * (0.25 + i * 0.1)} ${H * yy - 40} ${W * 0.55} ${H * yy + 10} T ${W} ${H * yy - 10}`} stroke="#b9cfe0" strokeWidth={10} fill="none" opacity={0.5} />
          ))}
        </g>
      );
    case 'forest':
    case 'jungle':
      return (
        <g>
          <Grad id="hFor" stops={name === 'jungle' ? ['#0f3b2a', '#2f7a4a', '#7fbf6a'] : ['#6aa5c9', '#bcd9c9', '#e8eccf']} />
          <rect width={W} height={H} fill="url(#hFor)" />
          <Forest base={H * 0.56} tone={name === 'jungle' ? '#1d5a3a' : '#3f7a45'} seed={4} />
          <Forest base={H * 0.6} tone={name === 'jungle' ? '#123f28' : '#2c5e33'} seed={7} />
          <Leaves y={H * 0.58} seed={5} />
        </g>
      );
    case 'spring':
    case 'pond':
      return (
        <g>
          <Grad id="hSpr" stops={['#7fc3e8', '#cfe9f2', '#f5f1d8']} />
          <rect width={W} height={H} fill="url(#hSpr)" />
          <circle cx={W * 0.75} cy={H * 0.12} r={340} fill="url(#sunGlow)" />
          <Forest base={H * 0.55} tone="#3f7a45" seed={8} />
          {name === 'pond' ? <rect y={H * 0.55} width={W} height={H * 0.45} fill="url(#pond)" /> : <Hills y={H * 0.58} c={['#6faa4a', '#5a9440']} />}
        </g>
      );
    case 'ocean':
      return (
        <g>
          <Grad id="hOce" stops={['#8fd0ee', '#2f8fbf', '#0f3f66']} />
          <rect width={W} height={H} fill="url(#hOce)" />
          <rect y={H * 0.3} width={W} height={H * 0.7} fill="#0f4f7a" opacity={0.5} />
          {Array.from({length: 8}).map((_, i) => (
            <path key={i} d={`M ${-100 + ((t * 40 + i * 140) % (W + 200))} ${H * 0.3 + i * 8} q 40 -14 80 0 t 80 0`} stroke="#ffffff" strokeWidth={4} fill="none" opacity={0.35} />
          ))}
          <Fish t={t} />
        </g>
      );
    case 'deep_sea':
      return (
        <g>
          <Grad id="hDeep" stops={['#06243a', '#030f1c', '#01050c']} />
          <rect width={W} height={H} fill="url(#hDeep)" />
          {Array.from({length: 40}).map((_, i) => (
            <circle key={i} cx={(i * 137) % W} cy={((i * 271) % H) - ((t * 20) % H)} r={2 + (i % 3)} fill="#8fe0ff" opacity={0.3 + 0.3 * Math.sin(t * 2 + i)} />
          ))}
        </g>
      );
    case 'desert':
    case 'savanna':
      return (
        <g>
          <Grad id="hDes" stops={name === 'desert' ? ['#f2b36a', '#f6d39a', '#f7e3b8'] : ['#f6c27a', '#f2dca0', '#d8c784']} />
          <rect width={W} height={H} fill="url(#hDes)" />
          <circle cx={W * 0.7} cy={H * 0.18} r={300} fill="url(#sunGlow)" />
          <Hills y={H * 0.56} c={name === 'desert' ? ['#e09a52', '#d0843e', '#c27236'] : ['#b9a65a', '#a8944a']} />
          {name === 'savanna' && [0.15, 0.8].map((x, i) => (
            <g key={i} transform={`translate(${W * x} ${H * 0.56})`}>
              <rect x={-10} y={-160} width={20} height={160} fill="#5a3a22" />
              <ellipse cy={-170} rx={130} ry={40} fill="#4a6a2a" />
            </g>
          ))}
        </g>
      );
    case 'cave':
    case 'night':
      return (
        <g>
          <Grad id="hNight" stops={name === 'cave' ? ['#0c0a10', '#1a1620', '#2a2430'] : ['#070b1e', '#16224a', '#2a3a6a']} />
          <rect width={W} height={H} fill="url(#hNight)" />
          {name === 'night' && Array.from({length: 120}).map((_, i) => (
            <circle key={i} cx={(i * 97) % W} cy={(i * 53) % (H * 0.5)} r={1 + (i % 3) * 0.8} fill="#fff" opacity={0.4 + 0.4 * Math.sin(t + i)} />
          ))}
          {name === 'night' && <circle cx={W * 0.75} cy={H * 0.14} r={90} fill="#f4efd8" />}
          {name === 'cave' && Array.from({length: 12}).map((_, i) => (
            <path key={i} d={`M ${i * 95} 0 L ${i * 95 + 30} ${120 + (i % 4) * 70} L ${i * 95 + 60} 0 Z`} fill="#141018" />
          ))}
          <rect y={H * 0.6} width={W} height={H * 0.4} fill={name === 'cave' ? '#1c1822' : '#0f1830'} />
        </g>
      );
    default:
      return <rect width={W} height={H} fill="#1a2430" />;
  }
};

/** 効果 (雪・雨・光の粒・心電図・早回しなど)。 */
const Effects: React.FC<{fx: string[]; t: number; lt: number; dur: number}> = ({fx, t, lt, dur}) => {
  const has = (k: string) => fx.includes(k);
  const stop = clamp01((lt - 1.5) / 3);
  const ecg: string[] = [];
  if (has('heartbeat_stop')) {
    for (let x = 0; x <= W; x += 8) {
      const ph = (x / W) * 6 + t * 2;
      const beat = Math.exp(-Math.pow(((ph % 1) - 0.5) * 9, 2)) * 110 * (1 - stop);
      ecg.push(`${x},${H * 0.2 - beat}`);
    }
  }
  const day = clamp01(lt / dur);
  return (
    <g>
      {has('timelapse') && <rect width={W} height={H} fill="#05080c" opacity={0.45 * (0.5 + 0.5 * Math.cos(lt * 1.6 * Math.PI * 2)) * (1 - day)} />}
      {has('sunrays') && [0, 1, 2, 3].map((i) => (
        <polygon key={i} points={`${W * (0.55 + i * 0.1)},0 ${W * (0.62 + i * 0.1)},0 ${W * (0.3 + i * 0.12)},${H} ${W * (0.22 + i * 0.12)},${H}`} fill="#fff4c8" opacity={0.09} />
      ))}
      {has('snow') && <Snow t={has('timelapse') ? t * 3 : t} o={0.85} />}
      {has('rain') && Array.from({length: 120}).map((_, i) => {
        const y = ((i * 211 + t * 1600) % (H + 100)) - 50;
        const x = (i * 97) % W;
        return <line key={i} x1={x} y1={y} x2={x - 8} y2={y + 50} stroke="#d8ecf5" strokeWidth={2} opacity={0.4} />;
      })}
      {has('bubbles') && Array.from({length: 30}).map((_, i) => (
        <circle key={i} cx={(i * 131) % W + Math.sin(t * 2 + i) * 14} cy={H - ((t * 90 + i * 140) % (H + 100))} r={5 + (i % 4) * 3} fill="none" stroke="#e8f8ff" strokeWidth={2} opacity={0.6} />
      ))}
      {has('fireflies') && Array.from({length: 24}).map((_, i) => (
        <circle key={i} cx={(i * 173) % W + Math.sin(t * 0.7 + i) * 40} cy={H * 0.3 + ((i * 97) % (H * 0.5)) + Math.cos(t * 0.9 + i) * 30} r={6} fill="#fff3a0" opacity={0.4 + 0.5 * Math.sin(t * 3 + i)} />
      ))}
      {has('glow') && Array.from({length: 26}).map((_, i) => {
        const u = ((t * 0.15 + i / 26) % 1);
        return <circle key={i} cx={W * 0.1 + u * W * 0.8} cy={H * 0.3 + Math.sin(u * 6 + i) * H * 0.2} r={20} fill="url(#glucose)" />;
      })}
      {has('heat') && <rect width={W} height={H} fill="#ff9a3a" opacity={0.08 + 0.04 * Math.sin(t * 4)} />}
      {has('frost') && <rect width={W} height={H} fill="url(#frogIce)" opacity={0.18} />}
      {has('heartbeat_stop') && (
        <g>
          <polyline points={ecg.join(' ')} fill="none" stroke={stop > 0.95 ? '#9fb8c8' : '#ff5a6a'} strokeWidth={6} opacity={0.9} />
          <text x={W / 2} y={H * 0.12} textAnchor="middle" fontFamily="Anton" fontSize={64} fill="#cfe3f0" opacity={0.8}>{stop > 0.95 ? '0 BPM' : 'BPM'}</text>
        </g>
      )}
      {has('splash') && (() => {
        const k = clamp01((lt - 1.2) / 1.4);
        if (k <= 0) return null;
        return [0, 1, 2].map((i) => (
          <ellipse key={i} cx={W * 0.6} cy={H * 0.7} rx={k * 300 + i * 60} ry={(k * 300 + i * 60) * 0.25} fill="none" stroke="#fff" strokeWidth={5} opacity={(1 - k) * 0.8} />
        ));
      })()}
    </g>
  );
};

/** 動物 (AI のポーズ画像) を動かす。 */
const Animal: React.FC<{spec: NatureSpec; t: number; lt: number; dur: number}> = ({spec, t, lt, dur}) => {
  if (!spec.animal) return null;
  const size = (spec.size ?? 0.6) * W;
  let x = (spec.ax ?? 0.5) * W;
  let y = (spec.ay ?? 0.5) * H;
  let sx = 1;
  let sy = 1;
  let rot = 0;
  let op = 1;
  const m = spec.motion ?? 'breathe';
  const u = clamp01(lt / dur);
  if (m === 'breathe') sy = 1 + Math.sin(t * 2.2) * 0.012;
  if (m === 'walk') {
    x += (u - 0.5) * W * 0.35 * (spec.flip ? -1 : 1);
    y += Math.abs(Math.sin(t * 6)) * -10;
  }
  if (m === 'jump') {
    const j = clamp01((lt - 0.5) / 1.6);
    x += j * W * 0.45 * (spec.flip ? -1 : 1);
    y -= Math.sin(Math.PI * j) * H * 0.2;
    rot = (j - 0.5) * 20;
    op = j >= 1 ? 0 : 1;
  }
  if (m === 'swim') {
    x += Math.sin(t * 0.8) * 60;
    y += Math.sin(t * 1.6) * 20;
    rot = Math.cos(t * 0.8) * 5;
  }
  if (m === 'fly') {
    x += (u - 0.5) * W * 0.5;
    y += Math.sin(t * 3) * 30;
  }
  if (m === 'shiver') x += Math.sin(t * 50) * 3;
  if (m === 'wake') {
    const tw = lt > dur * 0.4 && lt < dur * 0.4 + 0.4 ? Math.sin((lt - dur * 0.4) * 40) * 8 : 0;
    x += tw;
    sy = 1 + Math.sin(t * 2.2) * 0.012 * clamp01((lt - dur * 0.5) / 1);
  }
  const frost = spec.frost ?? 0;
  const flip = spec.flip ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${sx * flip} ${sy})`} opacity={op}>
      <ellipse cy={size * 0.36} rx={size * 0.42} ry={size * 0.05} fill="#000" opacity={0.25} />
      <image href={staticFile(`job/${spec.animal}`)} x={-size / 2} y={-size / 2} width={size} height={size}
        filter={frost > 0 ? 'url(#iceTint)' : undefined} opacity={1} />
      {frost > 0 && (
        <g opacity={frost}>
          {Array.from({length: 22}).map((_, i) => {
            const a = (i * 2.4) % 6.28;
            const r = (0.1 + ((i * 37) % 30) / 100) * size;
            return (
              <g key={i} transform={`translate(${Math.cos(a) * r} ${Math.sin(a) * r * 0.6}) rotate(${i * 17 + t * 5})`} opacity={0.5 + 0.5 * Math.sin(t * 3 + i)}>
                <path d="M -10 0 L 10 0 M -5 -8.7 L 5 8.7 M -5 8.7 L 5 -8.7" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" />
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
};

/** 1 場面ぶん: 背景 → 動物 → 効果。カメラは寄る / 引く / 横に流す。 */
export const NatureScene: React.FC<{spec: NatureSpec; t: number; lt: number; dur: number}> = ({spec, t, lt, dur}) => {
  const fx = spec.fx ?? [];
  const u = easeInOut(clamp01(lt / dur));
  const cam = spec.cam ?? 'push';
  const z = cam === 'push' ? 1 + 0.12 * u : cam === 'pull' ? 1.14 - 0.12 * u : 1.05;
  const px = cam === 'pan' ? (0.5 - u) * 80 : 0;
  const frost = spec.frost ?? 0;
  return (
    <g>
      <defs>
        {/* 凍った体: 色を抜いて青白く */}
        <filter id="iceTint">
          <feColorMatrix type="matrix" values={`${1 - 0.5 * frost} ${0.2 * frost} ${0.3 * frost} 0 ${0.08 * frost}  ${0.1 * frost} ${1 - 0.3 * frost} ${0.3 * frost} 0 ${0.1 * frost}  ${0.1 * frost} ${0.2 * frost} ${1} 0 ${0.18 * frost}  0 0 0 1 0`} />
        </filter>
      </defs>
      <g transform={`translate(${W / 2 + px} ${H / 2}) scale(${z}) translate(${-W / 2} ${-H / 2})`}>
        <Habitat name={spec.habitat ?? 'forest'} t={t} lt={lt} frost={frost} />
        <Animal spec={spec} t={t} lt={lt} dur={dur} />
      </g>
      <Effects fx={fx} t={t} lt={lt} dur={dur} />
    </g>
  );
};

export {easeOut};
