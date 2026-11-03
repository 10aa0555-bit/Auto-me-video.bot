import React, {useMemo} from 'react';
import {staticFile} from 'remotion';
import {H, W, clamp01, easeInOut} from '../util';
import {Rain} from './Noir';

/**
 * AI で描いた 1 枚絵の場面。人物は動かさず、カメラ (ゆっくりズーム・横移動) と
 * 雨・ちり・光のゆらぎで動きを出す (崩れない、プロの編集っぽい見せ方)。
 */
export type ArtSpec = {
  img?: string; // job/ の画像
  cam?: 'in' | 'out' | 'left' | 'right' | 'up' | 'down';
  fx?: string[]; // rain / dust / embers / glow
};

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const Dust: React.FC<{t: number; warm?: boolean}> = ({t, warm}) => {
  const p = useMemo(() => {
    const r = rng(23);
    return Array.from({length: 50}).map(() => ({x: r() * W, y: r() * H, s: 1.5 + r() * 3, ph: r() * 6.28, sp: 10 + r() * 30}));
  }, []);
  return (
    <g>
      {p.map((d, i) => {
        const y = warm ? ((d.y - t * d.sp * 4) % H + H) % H : d.y + Math.cos(t * 0.3 + d.ph) * 30;
        return <circle key={i} cx={d.x + Math.sin(t * 0.4 + d.ph) * 40} cy={y} r={d.s} fill={warm ? '#ffb45a' : '#fff6e0'}
          opacity={(warm ? 0.5 : 0.22) + 0.25 * Math.sin(t * 1.3 + d.ph)} />;
      })}
    </g>
  );
};

export const ArtScene: React.FC<{spec: ArtSpec; t: number; lt: number; dur: number}> = ({spec, t, lt, dur}) => {
  const k = easeInOut(clamp01(lt / Math.max(1, dur)));
  const cam = spec.cam ?? 'in';
  // 1.12 倍以上にしておき、横移動しても端が見えないようにする
  let z = 1.14;
  let dx = 0;
  let dy = 0;
  if (cam === 'in') z = 1.08 + 0.14 * k;
  if (cam === 'out') z = 1.22 - 0.14 * k;
  if (cam === 'left') dx = 50 - 100 * k;
  if (cam === 'right') dx = -50 + 100 * k;
  if (cam === 'up') dy = 70 - 140 * k;
  if (cam === 'down') dy = -70 + 140 * k;
  const fx = spec.fx ?? [];
  return (
    <g>
      <rect width={W} height={H} fill="#0a1216" />
      {spec.img && (
        <g transform={`translate(${W / 2 + dx} ${H / 2 + dy}) scale(${z}) translate(${-W / 2} ${-H / 2})`}>
          <image href={staticFile(`job/${spec.img}`)} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        </g>
      )}
      {fx.includes('glow') && <circle cx={W * 0.5} cy={H * 0.35} r={520} fill="#ffcf7a" opacity={0.07 + 0.03 * Math.sin(t * 2.1)} filter="url(#blur40)" />}
      {fx.includes('rain') && <Rain t={t} o={0.28} />}
      {fx.includes('dust') && <Dust t={t} />}
      {fx.includes('embers') && <Dust t={t} warm />}
      {/* 字幕が読めるよう、下を少し暗く */}
      <rect y={H * 0.55} width={W} height={H * 0.45} fill="url(#artShade)" />
      <defs>
        <linearGradient id="artShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.55" /></linearGradient>
      </defs>
    </g>
  );
};
