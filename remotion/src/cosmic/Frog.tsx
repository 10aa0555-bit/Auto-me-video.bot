import React, {useMemo} from 'react';
import {H, W, clamp01, easeInOut, easeOut} from '../util';

/**
 * 「凍っても生き返るカエル」の自然ドキュメンタリー用の 2D の絵 (オリジナル)。
 * アメリカアカガエル (wood frog): 茶色い体、目を通る黒い仮面の帯、金色の目。
 */

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const mixc = (a: string, b: string, k: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, '0')).join('');
};

export const FrogDefs: React.FC = () => (
  <defs>
    <radialGradient id="frogBody" cx="0.45" cy="0.35" r="0.75"><stop offset="0" stopColor="#d49a63" /><stop offset="0.6" stopColor="#a8703f" /><stop offset="1" stopColor="#6e4424" /></radialGradient>
    <radialGradient id="frogIce" cx="0.45" cy="0.35" r="0.75"><stop offset="0" stopColor="#eef8ff" /><stop offset="0.6" stopColor="#b9d6ea" /><stop offset="1" stopColor="#7d9fbb" /></radialGradient>
    <radialGradient id="frogEye" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stopColor="#ffe9a0" /><stop offset="0.6" stopColor="#d9a23a" /><stop offset="1" stopColor="#8a5a14" /></radialGradient>
    <linearGradient id="winterSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3048" /><stop offset="0.6" stopColor="#5d7a96" /><stop offset="1" stopColor="#a9c2d6" /></linearGradient>
    <linearGradient id="springSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fc3e8" /><stop offset="0.6" stopColor="#cfe9f2" /><stop offset="1" stopColor="#f5f1d8" /></linearGradient>
    <radialGradient id="sunGlow"><stop offset="0" stopColor="#fff6d0" /><stop offset="0.4" stopColor="#ffe08a" stopOpacity="0.7" /><stop offset="1" stopColor="#ffd060" stopOpacity="0" /></radialGradient>
    <radialGradient id="glucose"><stop offset="0" stopColor="#fff3b0" /><stop offset="0.5" stopColor="#ffc93c" stopOpacity="0.85" /><stop offset="1" stopColor="#ff9f1a" stopOpacity="0" /></radialGradient>
    <linearGradient id="pond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fb3c9" /><stop offset="1" stopColor="#1f5f73" /></linearGradient>
  </defs>
);

/**
 * カエル (横向きにすわった姿)。frost: 凍り具合 0..1、eye: 目の開き 0..1、kick: 後ろ足を伸ばす 0..1。
 */
export const WoodFrog: React.FC<{x: number; y: number; s?: number; frost?: number; eye?: number; kick?: number; flip?: boolean; t?: number}> = ({
  x, y, s = 1, frost = 0, eye = 1, kick = 0, flip = false, t = 0,
}) => {
  const ink = '#2a1a10';
  const crystals = useMemo(() => {
    const r = rng(5);
    return Array.from({length: 26}).map(() => ({x: -150 + r() * 300, y: -110 + r() * 150, s: 6 + r() * 14, a: r() * 60}));
  }, []);
  const leg = kick;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cy={18} rx={190} ry={22} fill="#000" opacity={0.25} />
      {/* 後ろ足 (たたんだ形 → 伸ばす) */}
      <g transform={`rotate(${-leg * 35} -110 -10)`}>
        <path d={`M -120 -30 Q -190 -10 ${-170 - leg * 120} ${10 + leg * 10} L ${-110 - leg * 140} ${14 + leg * 12} Q -90 0 -70 -10 Z`} fill="url(#frogBody)" stroke={ink} strokeWidth={4} />
        <path d={`M ${-170 - leg * 120} ${10 + leg * 10} l -30 6 l 8 6 l 26 -2 l -6 10 l 20 -8 Z`} fill="#8a5a32" stroke={ink} strokeWidth={3} />
      </g>
      {/* 体 */}
      <path d="M -150 0 Q -168 -70 -100 -108 Q -20 -152 70 -138 Q 128 -128 162 -86 Q 188 -60 178 -40 Q 160 -26 124 -22 Q 70 -6 24 6 Q -80 22 -150 0 Z" fill="url(#frogBody)" stroke={ink} strokeWidth={5} />
      {/* 背中のまだら */}
      {[[-80, -95, 14], [-30, -118, 10], [20, -120, 12], [-115, -55, 9], [30, -80, 8]].map(([sx, sy, r], i) => (
        <ellipse key={i} cx={sx} cy={sy} rx={r} ry={r * 0.6} fill="#5e3a1e" opacity={0.55} />
      ))}
      {/* 背中の線 (背側線) */}
      <path d="M -130 -62 Q -40 -128 96 -128" stroke="#e1b27c" strokeWidth={5} fill="none" opacity={0.7} />
      {/* おなか */}
      <path d="M -120 -8 Q -20 16 120 -6 Q 60 14 -40 14 Z" fill="#efe1c4" opacity={0.9} />
      {/* 前足 */}
      <path d="M 92 -24 Q 104 20 84 40 L 128 40 Q 134 26 118 -22 Z" fill="url(#frogBody)" stroke={ink} strokeWidth={4} />
      {/* 目の黒い仮面の帯 */}
      <path d="M 180 -46 Q 140 -84 88 -86 Q 56 -84 48 -62 Q 70 -50 96 -56 Q 140 -58 176 -36 Z" fill="#2b1a10" opacity={0.85} />
      {/* 目 */}
      <g transform="translate(108 -122)">
        <circle r={26} fill="url(#frogBody)" stroke={ink} strokeWidth={4} />
        <clipPath id="frogEyeClip"><circle r={19} /></clipPath>
        <circle r={19} fill="url(#frogEye)" />
        <g clipPath="url(#frogEyeClip)">
          <ellipse rx={13} ry={5} fill="#120c06" />
          <circle cx={-7} cy={-7} r={4} fill="#fff" opacity={0.9} />
          {/* まぶた (閉じると上から下りてくる) */}
          <rect x={-22} y={-22} width={44} height={44 * (1 - eye)} fill="#8a5a32" />
        </g>
      </g>
      {/* 鼓膜 */}
      <circle cx={64} cy={-70} r={12} fill="#4a2c16" opacity={0.7} />
      {/* 口の線とあご */}
      <path d="M 176 -40 Q 140 -30 92 -34" stroke="#2a1a10" strokeWidth={3} fill="none" />
      <path d="M 170 -34 Q 130 -12 70 -8" fill="#efe1c4" opacity={0.85} />
      {/* 凍る: 体を青白く覆い、結晶がきらめく */}
      {frost > 0 && (
        <g opacity={frost}>
          <path d="M -150 0 Q -168 -70 -100 -108 Q -20 -152 70 -138 Q 128 -128 162 -86 Q 188 -60 178 -40 Q 160 -26 124 -22 Q 70 -6 24 6 Q -80 22 -150 0 Z" fill="url(#frogIce)" opacity={0.6} />
          <path d="M 180 -46 Q 140 -84 88 -86 Q 56 -84 48 -62 Q 70 -50 96 -56 Q 140 -58 176 -36 Z" fill="#2b1a10" opacity={0.45} />
          <circle cx={108} cy={-122} r={26} fill="none" stroke="#2a1a10" strokeWidth={4} opacity={0.7} />
          {crystals.map((c, i) => {
            const k = clamp01(frost * 1.6 - i / 40);
            if (k <= 0) return null;
            return (
              <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.a + t * 4}) scale(${k})`} opacity={0.6 + 0.4 * Math.sin(t * 3 + i)}>
                <path d={`M ${-c.s} 0 L ${c.s} 0 M ${-c.s / 2} ${-c.s * 0.87} L ${c.s / 2} ${c.s * 0.87} M ${-c.s / 2} ${c.s * 0.87} L ${c.s / 2} ${-c.s * 0.87}`} stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" />
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
};

/** 落ち葉の地面 (snow: 雪の量 0..1)。 */
export const Leaves: React.FC<{y: number; snow?: number; seed?: number; n?: number}> = ({y, snow = 0, seed = 3, n = 160}) => {
  const lv = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: n}).map(() => ({x: r() * W, y: y + r() * (H - y), a: r() * 360, s: 18 + r() * 30, c: ['#a4552a', '#c2793a', '#7d3f1e', '#d39a4a', '#8a6a3a'][Math.floor(r() * 5)]}));
  }, [y, seed, n]);
  return (
    <g>
      <rect y={y} width={W} height={H - y} fill="#3d2a1a" />
      {lv.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.a})`}>
          <path d={`M ${-l.s} 0 Q 0 ${-l.s * 0.6} ${l.s} 0 Q 0 ${l.s * 0.6} ${-l.s} 0 Z`} fill={l.c} />
          <line x1={-l.s} y1={0} x2={l.s} y2={0} stroke="#3a200e" strokeWidth={2} opacity={0.6} />
        </g>
      ))}
      {snow > 0 && <rect y={y} width={W} height={H - y} fill="#f2f7fb" opacity={snow * 0.85} />}
    </g>
  );
};

/** 降る雪。 */
export const Snow: React.FC<{t: number; n?: number; o?: number}> = ({t, n = 140, o = 0.9}) => {
  const f = useMemo(() => {
    const r = rng(17);
    return Array.from({length: n}).map(() => ({x: r() * W, y: r() * H, s: 2 + r() * 6, sp: 60 + r() * 120, w: r() * 6}));
  }, [n]);
  return (
    <g fill="#ffffff" opacity={o}>
      {f.map((p, i) => <circle key={i} cx={p.x + Math.sin(t + p.w) * 30} cy={(p.y + t * p.sp) % (H + 20) - 10} r={p.s} opacity={0.5 + p.s / 16} />)}
    </g>
  );
};

/** 北の森 (木のシルエットを重ねる)。 */
export const Forest: React.FC<{base: number; tone: string; seed?: number; snowy?: number}> = ({base, tone, seed = 2, snowy = 0}) => {
  const trees = useMemo(() => {
    const r = rng(seed);
    return Array.from({length: 18}).map(() => ({x: r() * W, h: 380 + r() * 520, w: 60 + r() * 70}));
  }, [seed]);
  return (
    <g>
      {trees.map((tr, i) => (
        <g key={i}>
          <path d={`M ${tr.x} ${base - tr.h} L ${tr.x + tr.w} ${base} L ${tr.x - tr.w} ${base} Z`} fill={tone} />
          {snowy > 0 && <path d={`M ${tr.x} ${base - tr.h} L ${tr.x + tr.w * 0.22} ${base - tr.h * 0.78} Q ${tr.x} ${base - tr.h * 0.74} ${tr.x - tr.w * 0.22} ${base - tr.h * 0.78} Z`} fill="#eef5fa" opacity={snowy * 0.9} />}
        </g>
      ))}
    </g>
  );
};

/** 1. フック: 凍った落ち葉の下のカエルのアップ。 */
export const FrogHook: React.FC<{t: number; lt: number}> = ({t, lt}) => (
  <g>
    <rect width={W} height={H} fill="#16232f" />
    <Leaves y={0} snow={0.25} seed={9} n={260} />
    <rect width={W} height={H} fill="#9cc4e0" opacity={0.25} />
    <WoodFrog x={W * 0.48} y={H * 0.58} s={2.4 + lt * 0.05} frost={0.9} eye={0} t={t} />
    {/* 手前の落ち葉と霜 */}
    <rect width={W} height={H} fill="url(#frogIce)" opacity={0.12} />
  </g>
);

/** 2. 冬が来る: 雪の森、落ち葉の下にもぐるカエルに霜が広がる。 */
export const FrogWinter: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const k = clamp01(lt / 8);
  return (
    <g>
      <rect width={W} height={H} fill="url(#winterSky)" />
      <Forest base={H * 0.54} tone="#1f3242" seed={4} snowy={k} />
      <Forest base={H * 0.57} tone="#152431" seed={7} snowy={k} />
      <Leaves y={H * 0.55} snow={k * 0.6} seed={5} />
      <WoodFrog x={W * 0.48} y={H * 0.6} s={1.5} frost={easeInOut(clamp01((lt - 3) / 6))} eye={1 - clamp01((lt - 6) / 2)} t={t} />
      <Snow t={t} o={0.85} />
    </g>
  );
};

/** 3. 体の中: 細胞の外に氷、血管を金色のブドウ糖が流れる。 */
export const FrogInside: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const cells = useMemo(() => {
    const r = rng(23);
    return Array.from({length: 26}).map(() => ({x: r() * W, y: H * 0.15 + r() * H * 0.7, r: 60 + r() * 50}));
  }, []);
  const vessels = [H * 0.33, H * 0.55, H * 0.75];
  return (
    <g>
      <rect width={W} height={H} fill="#0c1626" />
      {/* 細胞 (中は守られて凍らない) */}
      {cells.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r} fill="#3a1f3a" stroke="#d98ab0" strokeWidth={5} opacity={0.85} />
          <circle cx={c.x - c.r * 0.25} cy={c.y - c.r * 0.2} r={c.r * 0.28} fill="#7a3a64" />
        </g>
      ))}
      {/* 細胞のすきまに氷の結晶が育つ */}
      {cells.map((c, i) => {
        const k = clamp01(lt / 4 - i / 30);
        const cx = c.x + c.r + 20;
        return (
          <g key={'ice' + i} transform={`translate(${cx} ${c.y}) scale(${k})`} opacity={0.85}>
            <path d="M -30 0 L 30 0 M -15 -26 L 15 26 M -15 26 L 15 -26" stroke="#bfe6ff" strokeWidth={6} strokeLinecap="round" />
          </g>
        );
      })}
      {/* 血管と、流れる金色のブドウ糖 */}
      {vessels.map((vy, j) => (
        <g key={j}>
          <path d={`M -50 ${vy} Q ${W * 0.3} ${vy - 80} ${W * 0.55} ${vy} T ${W + 50} ${vy}`} stroke="#5a1e2c" strokeWidth={60} fill="none" opacity={0.9} />
          {Array.from({length: 14}).map((_, i) => {
            const u = ((t * 0.18 + i / 14 + j * 0.13) % 1);
            const x = -50 + u * (W + 100);
            const y = vy - 80 * Math.sin(Math.PI * clamp01(x / (W * 0.55))) * (x < W * 0.55 ? 1 : 0) + (x >= W * 0.55 ? 40 * Math.sin(Math.PI * ((x - W * 0.55) / (W * 0.45 + 50))) : 0);
            return <circle key={i} cx={x} cy={y} r={22} fill="url(#glucose)" />;
          })}
        </g>
      ))}
    </g>
  );
};

/** 4. 命が止まる: 凍ったカエルと、平らになっていく心電図。 */
export const FrogFrozen: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const stop = clamp01((lt - 2) / 3);
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 8) {
    const ph = (x / W) * 6 + t * 2;
    const beat = Math.exp(-Math.pow(((ph % 1) - 0.5) * 9, 2)) * 120 * (1 - stop);
    pts.push(`${x},${H * 0.2 - beat}`);
  }
  return (
    <g>
      <rect width={W} height={H} fill="#0f1b26" />
      <Leaves y={H * 0.4} snow={0.55} seed={11} />
      <WoodFrog x={W * 0.48} y={H * 0.58} s={2.0 + lt * 0.04} frost={1} eye={0} t={t} />
      <polyline points={pts.join(' ')} fill="none" stroke={stop > 0.95 ? '#9fb8c8' : '#ff5a6a'} strokeWidth={6} opacity={0.9} />
      <text x={W / 2} y={H * 0.12} textAnchor="middle" fontFamily="Anton" fontSize={64} fill="#cfe3f0" opacity={0.8}>0 BPM</text>
    </g>
  );
};

/** 5. 待つ: 雪が積もり、嵐が過ぎ、日が差して氷が溶けはじめる (早回し)。 */
export const FrogWait: React.FC<{t: number; lt: number; dur?: number}> = ({t, lt}) => {
  const day = (lt * 1.6) % 1;
  const sun = clamp01((lt - 7) / 4);
  const pile = clamp01(lt / 6) * (1 - sun);
  return (
    <g>
      <rect width={W} height={H} fill="url(#winterSky)" />
      <rect width={W} height={H} fill="#05080c" opacity={0.55 * (0.5 + 0.5 * Math.cos(day * Math.PI * 2)) * (1 - sun)} />
      <rect width={W} height={H} fill="url(#springSky)" opacity={sun} />
      <circle cx={W * 0.75} cy={H * 0.18} r={320} fill="url(#sunGlow)" opacity={sun} />
      <Forest base={H * 0.54} tone={mixc('#1f3242', '#2f5a35', sun)} seed={4} snowy={1 - sun} />
      <Leaves y={H * 0.55} snow={0.5 + pile * 0.5 - sun * 0.4} seed={5} />
      <WoodFrog x={W * 0.48} y={H * 0.6} s={1.5} frost={1 - sun * 0.4} eye={0} t={t} />
      {sun < 0.6 && <Snow t={t * 3} o={0.9 * (1 - sun)} n={200} />}
      {/* 日の光の筋 */}
      {sun > 0 && [0, 1, 2, 3].map((i) => (
        <polygon key={i} points={`${W * (0.55 + i * 0.1)},0 ${W * (0.62 + i * 0.1)},0 ${W * (0.3 + i * 0.12)},${H} ${W * (0.22 + i * 0.12)},${H}`} fill="#fff4c8" opacity={0.08 * sun} />
      ))}
    </g>
  );
};

/** 6. よみがえり: 溶けて色が戻り、足がぴくっと動き、目が開く。 */
export const FrogThaw: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const melt = easeInOut(clamp01(lt / 5));
  const twitch = lt > 3 && lt < 3.4 ? Math.sin((lt - 3) * 40) * 0.25 : 0;
  return (
    <g>
      <rect width={W} height={H} fill="url(#springSky)" />
      <circle cx={W * 0.8} cy={H * 0.1} r={360} fill="url(#sunGlow)" />
      <Leaves y={H * 0.42} snow={0.3 * (1 - melt)} seed={13} />
      {/* 溶けた水のきらめき */}
      {Array.from({length: 18}).map((_, i) => (
        <circle key={i} cx={W * 0.2 + ((i * 97) % (W * 0.6))} cy={H * 0.62 + ((i * 53) % 220)} r={6} fill="#ffffff" opacity={melt * (0.4 + 0.4 * Math.sin(t * 5 + i))} />
      ))}
      <WoodFrog x={W * 0.46} y={H * 0.6} s={2.4} frost={1 - melt} eye={easeOut(clamp01((lt - 5.5) / 1.2))} kick={Math.abs(twitch)} t={t} />
    </g>
  );
};

/** 7. ラスト: 春の池へジャンプ、水しぶきと波紋。 */
export const FrogLeap: React.FC<{t: number; lt: number}> = ({t, lt}) => {
  const j = clamp01((lt - 0.6) / 1.6);
  const x = W * 0.22 + j * W * 0.5;
  const y = H * 0.66 - Math.sin(Math.PI * j) * H * 0.22 + (j >= 1 ? 60 : 0);
  const splash = clamp01((lt - 2.2) / 1.5);
  return (
    <g>
      <rect width={W} height={H} fill="url(#springSky)" />
      <circle cx={W * 0.7} cy={H * 0.12} r={380} fill="url(#sunGlow)" />
      <Forest base={H * 0.58} tone="#3f7a45" seed={8} />
      <rect y={H * 0.58} width={W} height={H * 0.42} fill="url(#pond)" />
      {Array.from({length: 10}).map((_, i) => (
        <line key={i} x1={W * 0.1 + i * 90} y1={H * 0.62 + i * 30} x2={W * 0.1 + i * 90 + 140} y2={H * 0.62 + i * 30} stroke="#ffffff" strokeWidth={4} opacity={0.18 + 0.1 * Math.sin(t * 2 + i)} />
      ))}
      {/* 波紋 */}
      {splash > 0 && [0, 1, 2].map((i) => (
        <ellipse key={i} cx={W * 0.72} cy={H * 0.72} rx={(splash * 300 + i * 60)} ry={(splash * 300 + i * 60) * 0.25} fill="none" stroke="#ffffff" strokeWidth={5} opacity={(1 - splash) * 0.8} />
      ))}
      {j < 1 && <WoodFrog x={x} y={y} s={1.2} kick={Math.sin(Math.PI * j)} t={t} />}
      {splash > 0 && splash < 0.6 && Array.from({length: 12}).map((_, i) => (
        <circle key={i} cx={W * 0.72 + Math.cos(i * 0.52) * splash * 160} cy={H * 0.72 - Math.sin(i * 0.26) * splash * 220 + splash * splash * 200} r={10} fill="#e8fbff" />
      ))}
      {/* 手前の草 */}
      {Array.from({length: 14}).map((_, i) => (
        <path key={i} d={`M ${i * 80} ${H} q ${10 + Math.sin(t + i) * 10} -160 ${30} -${220 + (i % 3) * 40}`} stroke="#2f6b35" strokeWidth={14} fill="none" strokeLinecap="round" />
      ))}
    </g>
  );
};
