import React, {useMemo} from 'react';
import {H, W, clamp01, easeInOut, easeOut} from '../util';
import {Figure, Portrait} from './Youth';

/**
 * ダークなモチベーション動画用の舞台 (雨のヨーロッパの夜、金髪で黒いコートの静かな青年)。
 * キャラも背景もすべてオリジナルの図形。色は暗い青緑と黒、差し色に赤。
 */

export const N = {
  night: '#0a1418',
  deep: '#0f2229',
  teal: '#1d3b44',
  fog: '#3d5f68',
  stone: '#26383d',
  lamp: '#ffcf7a',
  red: '#d8233a',
  cream: '#efe6d2',
  skin: '#f1e4d6',
  hair: '#e9cf8a',
  hairS: '#b99a52',
  coat: '#101418',
  ink: '#05080a',
};

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/** 雨 (斜めの細い線)。 */
export const Rain: React.FC<{t: number; n?: number; o?: number}> = ({t, n = 140, o = 0.35}) => {
  const d = useMemo(() => {
    const r = rng(7);
    return Array.from({length: n}).map(() => ({x: r() * (W + 300), y: r() * H, l: 40 + r() * 70, sp: 1400 + r() * 700}));
  }, [n]);
  return (
    <g stroke="#cfe3ea" strokeWidth={2.2} opacity={o}>
      {d.map((p, i) => {
        const y = (p.y + t * p.sp) % (H + 200) - 100;
        const x = p.x - ((t * p.sp) % (H + 200)) * 0.18;
        return <line key={i} x1={x} y1={y} x2={x - p.l * 0.18} y2={y + p.l} />;
      })}
    </g>
  );
};

/** 夜霧のグラデーション背景。 */
const NightSky: React.FC<{top?: string; bottom?: string; id: string}> = ({top = N.night, bottom = N.teal, id}) => (
  <g>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={top} /><stop offset="1" stopColor={bottom} /></linearGradient>
    </defs>
    <rect width={W} height={H} fill={`url(#${id})`} />
  </g>
);

/** ガス灯 (光のにじみ付き)。 */
const Lamp: React.FC<{x: number; y: number; s?: number; t: number}> = ({x, y, s = 1, t}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cy={-420} r={170} fill={N.lamp} opacity={0.16 + 0.02 * Math.sin(t * 7)} filter="url(#blur40)" />
    <rect x={-9} y={-400} width={18} height={400} fill={N.ink} />
    <path d="M -34 -470 L 34 -470 L 24 -405 L -24 -405 Z" fill={N.lamp} stroke={N.ink} strokeWidth={8} />
    <path d="M -44 -470 L 0 -505 L 44 -470 Z" fill={N.ink} />
  </g>
);

/** ヨーロッパの古い建物の並び (窓に明かり)。 */
const Facades: React.FC<{t: number; base: number; seed?: number; tone?: string}> = ({t, base, seed = 3, tone = '#16292f'}) => {
  const b = useMemo(() => {
    const r = rng(seed);
    const out: {x: number; w: number; h: number; roof: number}[] = [];
    let x = -40;
    while (x < W + 40) {
      const w = 170 + r() * 120;
      out.push({x, w, h: 600 + r() * 500, roof: r()});
      x += w;
    }
    return out;
  }, [seed]);
  return (
    <g>
      {b.map((bd, i) => (
        <g key={i}>
          <rect x={bd.x} y={base - bd.h} width={bd.w} height={bd.h} fill={tone} stroke={N.ink} strokeWidth={5} />
          {bd.roof > 0.5 ? (
            <path d={`M ${bd.x - 6} ${base - bd.h} L ${bd.x + bd.w / 2} ${base - bd.h - 120} L ${bd.x + bd.w + 6} ${base - bd.h} Z`} fill={N.ink} />
          ) : (
            <rect x={bd.x - 6} y={base - bd.h - 24} width={bd.w + 12} height={24} fill={N.ink} />
          )}
          {Array.from({length: Math.floor((bd.h - 80) / 130)}).map((_, j) =>
            [0, 1].map((k) => {
              const lit = Math.sin(i * 5.3 + j * 2.7 + k * 4.1) > 0.35;
              const wx = bd.x + 28 + k * (bd.w / 2);
              const wy = base - bd.h + 70 + j * 130;
              return (
                <g key={`${j}${k}`}>
                  <path d={`M ${wx} ${wy + 80} L ${wx} ${wy + 22} Q ${wx + (bd.w / 2 - 56) / 2} ${wy - 10} ${wx + bd.w / 2 - 56} ${wy + 22} L ${wx + bd.w / 2 - 56} ${wy + 80} Z`}
                    fill={lit ? N.lamp : '#0b171b'} opacity={lit ? 0.85 + 0.1 * Math.sin(t * 2 + i + j) : 1} />
                </g>
              );
            }),
          )}
        </g>
      ))}
    </g>
  );
};

/**
 * 金髪で黒いロングコートの青年 (オリジナル)。
 * view: 'front' (正面) / 'back' (後ろ姿)。walk で歩く、smile で口元が少し上がる。
 */
export const Man: React.FC<{x: number; y: number; s?: number; view?: 'front' | 'back'; walk?: number; smile?: number; glint?: number}> = ({
  x, y, s = 1, view = 'front', walk = 0, smile = 0, glint = 0,
}) => (
  <g transform={`translate(${x} ${y}) scale(${s * 0.95})`}>
    <Figure view={view} walk={walk} smile={smile} glint={glint} />
  </g>
);

/** 雨の石畳の通り。 */
export const Street: React.FC<{t: number; lt: number}> = ({t, lt}) => (
  <g>
    <NightSky id="ns1" />
    <circle cx={W * 0.75} cy={H * 0.12} r={90} fill={N.cream} opacity={0.9} />
    <circle cx={W * 0.75} cy={H * 0.12} r={160} fill={N.cream} opacity={0.12} filter="url(#blur40)" />
    <Facades t={t} base={H * 0.7} seed={5} />
    <rect y={H * 0.7} width={W} height={H * 0.3} fill={N.stone} />
    {/* 石畳と水たまりの反射 */}
    {Array.from({length: 9}).map((_, j) => (
      <line key={j} x1={0} y1={H * 0.7 + j * 64} x2={W} y2={H * 0.7 + j * 64} stroke={N.ink} strokeWidth={3} opacity={0.5} />
    ))}
    <ellipse cx={W * 0.22} cy={H * 0.86} rx={170} ry={26} fill={N.lamp} opacity={0.18} />
    <ellipse cx={W * 0.82} cy={H * 0.9} rx={140} ry={22} fill={N.lamp} opacity={0.15} />
    <Lamp x={W * 0.15} y={H * 0.74} t={t} />
    <Lamp x={W * 0.88} y={H * 0.76} t={t} s={1.05} />
    <Man x={W * 0.5} y={H * 0.83 - lt * 4} s={1.15 + lt * 0.01} walk={t} />
    <Rain t={t} />
  </g>
);

/** 夜の石の橋と尖塔の街並み (後ろ姿)。 */
export const Bridge: React.FC<{t: number}> = ({t}) => (
  <g>
    <NightSky id="ns2" top="#07121a" bottom="#24434c" />
    <circle cx={W * 0.3} cy={H * 0.16} r={120} fill={N.cream} />
    <circle cx={W * 0.3} cy={H * 0.16} r={220} fill={N.cream} opacity={0.12} filter="url(#blur40)" />
    {/* 尖塔のシルエット */}
    <path d={`M 0 ${H * 0.52} L 60 ${H * 0.48} L 90 ${H * 0.36} L 120 ${H * 0.48} L 260 ${H * 0.47} L 300 ${H * 0.3} L 340 ${H * 0.47} L 520 ${H * 0.46} L 560 ${H * 0.4} L 600 ${H * 0.46} L 760 ${H * 0.45} L 800 ${H * 0.26} L 840 ${H * 0.45} L ${W} ${H * 0.47} L ${W} ${H * 0.56} L 0 ${H * 0.56} Z`} fill="#0c1a20" />
    {/* 川と反射 */}
    <rect y={H * 0.56} width={W} height={H * 0.44} fill="#0d2128" />
    {Array.from({length: 14}).map((_, i) => (
      <line key={i} x1={W * 0.3 - 80 + Math.sin(t * 2 + i) * 30} y1={H * 0.6 + i * 34} x2={W * 0.3 + 80 + Math.sin(t * 2 + i) * 30} y2={H * 0.6 + i * 34} stroke={N.cream} strokeWidth={5} opacity={0.35 - i * 0.02} />
    ))}
    {/* 橋 */}
    <path d={`M 0 ${H * 0.66} L ${W} ${H * 0.66} L ${W} ${H * 0.74} L ${W * 0.85} ${H * 0.74} Q ${W * 0.7} ${H * 0.68} ${W * 0.55} ${H * 0.74} L ${W * 0.45} ${H * 0.74} Q ${W * 0.3} ${H * 0.68} ${W * 0.15} ${H * 0.74} L 0 ${H * 0.74} Z`} fill={N.stone} stroke={N.ink} strokeWidth={6} />
    {Array.from({length: 12}).map((_, i) => <rect key={i} x={i * 95 + 10} y={H * 0.63} width={18} height={H * 0.03} fill={N.ink} />)}
    <rect y={H * 0.625} width={W} height={14} fill={N.ink} />
    <Lamp x={W * 0.12} y={H * 0.66} t={t} s={0.8} />
    <Lamp x={W * 0.9} y={H * 0.66} t={t} s={0.8} />
    <Man x={W * 0.58} y={H * 0.665} s={0.75} view="back" />
    <Rain t={t} o={0.25} />
  </g>
);

/** 顔のアップ (半分が影)。glint で目が赤く光る。 */
export const Face: React.FC<{t: number; lt: number; smile?: boolean}> = ({t, lt, smile}) => (
  <g>
    <NightSky id="ns3" top="#060d11" bottom="#152a31" />
    <circle cx={W * 0.25} cy={H * 0.3} r={500} fill={N.lamp} opacity={0.1} filter="url(#blur40)" />
    <g transform={`translate(${W / 2} ${H * 0.71}) scale(${1.38 + lt * 0.012})`}>
      <Portrait smile={smile ? easeOut(clamp01((lt - 1) / 1.2)) : 0.15} glint={smile ? clamp01((lt - 2.2) / 0.8) : 0} look={Math.sin(lt * 0.6) * 0.5} />
    </g>
    <Rain t={t} o={0.22} />
  </g>
);

/** チェス盤 (王が倒れる)。 */
export const Chess: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const fall = easeInOut(clamp01((lt - 1.5) / 1.2));
  const sq = 165;
  const ox = W / 2;
  const oy = H * 0.5;
  const P = (i: number, j: number) => [ox + (i - j) * sq * 0.62, oy + (i + j) * sq * 0.36 - 4 * sq * 0.36] as const;
  const piece = (i: number, j: number, dark: boolean, king = false, rot = 0) => {
    const [px, py] = P(i + 0.5, j + 0.5);
    const c = dark ? '#151a1e' : N.cream;
    return (
      <g transform={`translate(${px} ${py}) rotate(${rot} 0 0) scale(1.5)`}>
        <ellipse rx={44} ry={16} fill={c} stroke={N.ink} strokeWidth={5} />
        <path d="M -30 0 Q -20 -90 -14 -120 L 14 -120 Q 20 -90 30 0 Z" fill={c} stroke={N.ink} strokeWidth={5} />
        <circle cy={-138} r={king ? 26 : 22} fill={c} stroke={N.ink} strokeWidth={5} />
        {king && <path d="M -6 -190 L 6 -190 L 6 -176 L 18 -176 L 18 -164 L 6 -164 L 6 -160 L -6 -160 L -6 -164 L -18 -164 L -18 -176 L -6 -176 Z" fill={c} stroke={N.ink} strokeWidth={4} />}
      </g>
    );
  };
  return (
    <g>
      <NightSky id="ns4" top="#05090c" bottom="#132228" />
      <circle cx={W / 2} cy={H * 0.45} r={520} fill={N.lamp} opacity={0.1} filter="url(#blur40)" />
      {Array.from({length: 8}).map((_, i) =>
        Array.from({length: 8}).map((__, j) => {
          const [ax, ay] = P(i, j);
          const [bx, by] = P(i + 1, j);
          const [cx, cy] = P(i + 1, j + 1);
          const [dx, dy] = P(i, j + 1);
          return <path key={`${i}${j}`} d={`M ${ax} ${ay} L ${bx} ${by} L ${cx} ${cy} L ${dx} ${dy} Z`} fill={(i + j) % 2 ? '#20363d' : '#b9ad95'} stroke={N.ink} strokeWidth={2} />;
        }),
      )}
      {piece(1, 6, true)}
      {piece(5, 2, false)}
      {piece(3, 3, false, true, fall * 80)}
      {piece(5, 5, true, true)}
      {piece(2, 1, true)}
    </g>
  );
};

/** 鏡: 本人と、少しだけ違う (笑っている) 鏡の中の自分。 */
export const Mirror: React.FC<{t: number; lt: number}> = ({t, lt}) => (
  <g>
    <NightSky id="ns5" top="#0b0f12" bottom="#1d2a2e" />
    <rect x={W * 0.12} y={H * 0.14} width={W * 0.76} height={H * 0.62} rx={30} fill="#2a4148" stroke="#b99a52" strokeWidth={22} />
    <clipPath id="mirClip"><rect x={W * 0.12} y={H * 0.14} width={W * 0.76} height={H * 0.62} rx={30} /></clipPath>
    <g clipPath="url(#mirClip)">
      <g transform={`translate(${W * 0.56} ${H * 0.36}) scale(1.05)`}><Portrait smile={easeOut(clamp01((lt - 1.5) / 1.5))} glint={clamp01((lt - 2) / 1)} shade={0.6} /></g>
      <rect x={W * 0.1} y={H * 0.1} width={60} height={H * 0.7} fill="#fff" opacity={0.08} transform={`skewX(-20)`} />
    </g>
    <g transform={`translate(${W * 0.3} ${H * 0.86}) scale(1.2)`}><Portrait back /></g>
  </g>
);

/** 雨の窓辺 (部屋の中から街を見る)。 */
export const Window: React.FC<{t: number}> = ({t}) => (
  <g>
    <rect width={W} height={H} fill="#070b0d" />
    <g>
      <clipPath id="winClip"><rect x={W * 0.14} y={H * 0.12} width={W * 0.72} height={H * 0.58} /></clipPath>
      <g clipPath="url(#winClip)">
        <NightSky id="ns6" top="#0a1820" bottom="#2b4a52" />
        <Facades t={t} base={H * 0.72} seed={9} tone="#132429" />
        <Rain t={t} n={90} o={0.4} />
        {/* 窓をつたう水滴 */}
        {Array.from({length: 18}).map((_, i) => (
          <circle key={i} cx={W * 0.16 + ((i * 137) % (W * 0.68))} cy={H * 0.12 + ((i * 211 + t * (40 + i * 6)) % (H * 0.58))} r={5 + (i % 3) * 2} fill="#d9eef3" opacity={0.5} />
        ))}
      </g>
      <rect x={W * 0.14} y={H * 0.12} width={W * 0.72} height={H * 0.58} fill="none" stroke="#1a1410" strokeWidth={34} />
      <line x1={W * 0.5} y1={H * 0.12} x2={W * 0.5} y2={H * 0.7} stroke="#1a1410" strokeWidth={26} />
      <line x1={W * 0.14} y1={H * 0.41} x2={W * 0.86} y2={H * 0.41} stroke="#1a1410" strokeWidth={26} />
    </g>
    <Man x={W * 0.32} y={H * 1.12} s={1.35} view="back" />
  </g>
);

/** 光へ続く長い階段を一人で上る。 */
export const Stairs: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const n = 16;
  return (
    <g>
      <NightSky id="ns7" top="#1a2a2c" bottom="#050a0c" />
      <circle cx={W / 2} cy={H * 0.08} r={300} fill={N.cream} opacity={0.5} filter="url(#blur40)" />
      <circle cx={W / 2} cy={H * 0.08} r={120} fill={N.cream} />
      {Array.from({length: n}).map((_, i) => {
        const k = i / n;
        const w = 900 - k * 700;
        const y = H * 0.95 - Math.pow(k, 0.85) * H * 0.82;
        return <rect key={i} x={W / 2 - w / 2} y={y} width={w} height={60 - k * 40} fill={i % 2 ? '#1f3338' : '#2a4247'} stroke={N.ink} strokeWidth={4} />;
      })}
      <Man x={W / 2} y={H * 0.66 - easeInOut(clamp01(lt / 6)) * H * 0.12} s={0.5 - easeInOut(clamp01(lt / 6)) * 0.12} view="back" walk={t} />
    </g>
  );
};

/** 手紙・過去が燃える。 */
export const Fire: React.FC<{t: number; lt: number}> = ({t, lt}) => (
  <g>
    <rect width={W} height={H} fill="#0a0706" />
    <circle cx={W / 2} cy={H * 0.55} r={420} fill="#ff7a2a" opacity={0.22} filter="url(#blur40)" />
    <g transform={`translate(${W / 2} ${H * 0.6}) rotate(-8)`}>
      <rect x={-260} y={-340} width={520} height={680} fill={N.cream} stroke={N.ink} strokeWidth={8} />
      {Array.from({length: 11}).map((_, i) => <line key={i} x1={-200} y1={-260 + i * 52} x2={180 - (i % 3) * 60} y2={-260 + i * 52} stroke="#6b6253" strokeWidth={10} strokeLinecap="round" />)}
      {/* 下から燃え上がる */}
      <rect x={-270} y={340 - clamp01(lt / 5) * 700} width={540} height={clamp01(lt / 5) * 700} fill="#0a0706" />
      {Array.from({length: 9}).map((_, i) => {
        const fy = 340 - clamp01(lt / 5) * 700;
        const h = 120 + 60 * Math.sin(t * 9 + i * 1.7);
        return (
          <g key={i} transform={`translate(${-240 + i * 60} ${fy})`}>
            <path d={`M -34 0 Q -30 ${-h * 0.6} 0 ${-h} Q 30 ${-h * 0.6} 34 0 Z`} fill="#ff7a2a" />
            <path d={`M -18 0 Q -14 ${-h * 0.4} 0 ${-h * 0.62} Q 14 ${-h * 0.4} 18 0 Z`} fill="#ffd27a" />
          </g>
        );
      })}
    </g>
    {Array.from({length: 24}).map((_, i) => (
      <circle key={i} cx={W / 2 + Math.sin(i * 3.1 + t) * 300} cy={H * 0.6 - ((t * 120 + i * 90) % 900)} r={4} fill="#ffb25a" opacity={0.8} />
    ))}
  </g>
);

/** 灰色の群衆の中で、一人だけ止まって前を見ている。 */
export const Crowd: React.FC<{t: number}> = ({t}) => {
  const people = useMemo(() => {
    const r = rng(19);
    return Array.from({length: 40}).map(() => ({x: r() * W, y: H * 0.55 + r() * H * 0.4, sp: (r() < 0.5 ? -1 : 1) * (60 + r() * 80), s: 0.35 + r() * 0.25}));
  }, []);
  const sorted = [...people].sort((a, b) => a.y - b.y);
  return (
    <g>
      <NightSky id="ns8" top="#1b2427" bottom="#3a4a4e" />
      <Facades t={t} base={H * 0.6} seed={13} tone="#2a3538" />
      <rect y={H * 0.6} width={W} height={H * 0.4} fill="#3a4649" />
      {sorted.map((p, i) => {
        const x = ((p.x + t * p.sp) % (W + 200) + W + 200) % (W + 200) - 100;
        const sc = p.s * (0.6 + (p.y - H * 0.55) / H);
        return (
          <g key={i} transform={`translate(${x} ${p.y}) scale(${sc})`} opacity={0.75}>
            <path d="M -80 0 L -70 -480 Q 0 -540 70 -480 L 80 0 Z" fill="#5d6a6d" />
            <ellipse cy={-560} rx={60} ry={72} fill="#7b878a" />
          </g>
        );
      })}
      <Man x={W / 2} y={H * 0.9} s={0.95} />
    </g>
  );
};

/** 屋根の上、大きな月の前に立つシルエット。 */
export const Moon: React.FC<{t: number}> = ({t}) => (
  <g>
    <NightSky id="ns9" top="#050b10" bottom="#1d3640" />
    <circle cx={W / 2} cy={H * 0.4} r={420} fill={N.cream} />
    <circle cx={W / 2} cy={H * 0.4} r={600} fill={N.cream} opacity={0.12} filter="url(#blur40)" />
    <circle cx={W / 2 - 120} cy={H * 0.36} r={60} fill="#ddd2b8" />
    <circle cx={W / 2 + 140} cy={H * 0.46} r={40} fill="#ddd2b8" />
    <path d={`M 0 ${H * 0.7} L ${W * 0.3} ${H * 0.62} L ${W * 0.7} ${H * 0.62} L ${W} ${H * 0.7} L ${W} ${H} L 0 ${H} Z`} fill="#05090c" />
    <g transform={`translate(${W / 2} ${H * 0.625}) scale(0.62)`}>
      <g fill="#05090c">
        <path d="M -92 -560 Q -120 -380 -118 -150 L -40 -170 L 0 -470 L 40 -170 L 118 -150 Q 120 -380 92 -560 Q 0 -610 -92 -560 Z" />
        <rect x={-46} y={-230} width={38} height={232} />
        <rect x={8} y={-230} width={38} height={232} />
        <ellipse cy={-680} rx={66} ry={82} />
        <path d="M -72 -690 Q -80 -780 -10 -772 Q 70 -778 74 -700 Z" />
        <path d={`M 92 -548 Q 160 -560 ${180 + Math.sin(t) * 6} -700`} stroke="#05090c" strokeWidth={0} />
      </g>
    </g>
    <Rain t={t} o={0.15} n={60} />
  </g>
);
