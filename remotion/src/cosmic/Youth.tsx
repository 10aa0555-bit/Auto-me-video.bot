import React from 'react';

/**
 * 金髪の静かな青年 (オリジナル)。漫画のペン画のような細い線と陰影で描く。
 * Head は頭だけ (中心が原点、顔の高さ約 460)。Portrait は胸から上、Figure は全身。
 */

const INK = '#141414';
const SKIN = '#f3e6d8';
const SKIN_S = '#d9c0a9';
const HAIR = '#ead39a';
const HAIR_D = '#b8964f';
const HAIR_L = '#fff4cf';
const IRIS = '#7fa9c4';
const IRIS_D = '#3f6683';
const COAT = '#16191d';
const COAT_L = '#2b3138';
const SHIRT = '#ece6da';

export const YouthDefs: React.FC = () => (
  <defs>
    <radialGradient id="ySkin" cx="0.42" cy="0.4" r="0.7"><stop offset="0" stopColor="#fbf2e8" /><stop offset="0.6" stopColor={SKIN} /><stop offset="1" stopColor={SKIN_S} /></radialGradient>
    <linearGradient id="yShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3a2a22" stopOpacity="0" /><stop offset="0.55" stopColor="#3a2a22" stopOpacity="0.05" /><stop offset="1" stopColor="#3a2a22" stopOpacity="0.42" /></linearGradient>
    <linearGradient id="yHair" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stopColor="#fff0c4" /><stop offset="0.45" stopColor={HAIR} /><stop offset="1" stopColor={HAIR_D} /></linearGradient>
    <radialGradient id="yIris" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stopColor="#cfe4f0" /><stop offset="0.5" stopColor={IRIS} /><stop offset="1" stopColor={IRIS_D} /></radialGradient>
    <linearGradient id="yCoat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={COAT_L} /><stop offset="0.35" stopColor={COAT} /><stop offset="1" stopColor="#0b0d10" /></linearGradient>
    <linearGradient id="yNeck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c7ab93" /><stop offset="0.5" stopColor={SKIN} /><stop offset="1" stopColor={SKIN_S} /></linearGradient>
  </defs>
);

/** 細い筆線 (太さを少し揺らして手描きっぽく)。 */
const Ln: React.FC<{d: string; w?: number; c?: string; o?: number}> = ({d, w = 3.2, c = INK, o = 1}) => (
  <path d={d} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={o} />
);

/** 目 1 つ。side: -1 (向かって左) / 1。lid: まぶたの下がり具合 (0..1)、glint: 赤く光る。 */
const Eye: React.FC<{x: number; side: number; lid: number; glint: number; look: number}> = ({x, side, lid, glint, look}) => {
  const y = -18;
  const ix = x + look * 6;
  return (
    <g>
      <path d={`M ${x - 46} ${y + 2} Q ${x - 6} ${y - 24} ${x + 44} ${y - 2} Q ${x + 4} ${y + 18} ${x - 46} ${y + 2} Z`} fill="#fbf8f2" />
      <clipPath id={`eyeClip${side}`}><path d={`M ${x - 46} ${y + 2} Q ${x - 6} ${y - 24} ${x + 44} ${y - 2} Q ${x + 4} ${y + 18} ${x - 46} ${y + 2} Z`} /></clipPath>
      <g clipPath={`url(#eyeClip${side})`}>
        <circle cx={ix} cy={y - 2} r={17} fill={glint > 0 ? '#c8283a' : 'url(#yIris)'} />
        <circle cx={ix} cy={y - 2} r={17} fill="none" stroke={IRIS_D} strokeWidth={2.5} />
        <circle cx={ix} cy={y - 2} r={7} fill="#0d1418" />
        <circle cx={ix - 6} cy={y - 9} r={4.2} fill="#fff" />
        {/* まぶたの影 (眠たげで静かな目) */}
        <rect x={x - 50} y={y - 30} width={100} height={14 + lid * 10} fill="#b89c86" opacity={0.55} />
      </g>
      {glint > 0 && <circle cx={ix} cy={y - 2} r={30} fill="#ff2a40" opacity={0.35 * glint} filter="url(#glowS)" />}
      {/* 上まぶたの線 + 目尻のまつげ */}
      <Ln d={`M ${x - 48} ${y + 3} Q ${x - 6} ${y - 25 + lid * 6} ${x + 46} ${y - 3}`} w={4.6} />
      <Ln d={side > 0 ? `M ${x + 44} ${y - 3} L ${x + 54} ${y - 9}` : `M ${x - 46} ${y + 2} L ${x - 56} ${y - 4}`} w={3} />
      <Ln d={`M ${x - 40} ${y + 8} Q ${x + 2} ${y + 20} ${x + 38} ${y + 4}`} w={1.8} o={0.55} />
      {/* 二重の線 */}
      <Ln d={`M ${x - 38} ${y - 18} Q ${x - 4} ${y - 36} ${x + 36} ${y - 16}`} w={1.8} o={0.5} />
    </g>
  );
};

/** 頭 (正面)。smile: 口角 (0..1)、glint: 目が赤く光る (0..1)、shade: 右側の影の濃さ。 */
export const Head: React.FC<{smile?: number; glint?: number; shade?: number; look?: number; back?: boolean}> = ({smile = 0, glint = 0, shade = 1, look = 0, back = false}) => {
  if (back) {
    return (
      <g>
        <path d="M -150 -40 C -152 80 -110 170 -50 205 Q 0 228 50 205 C 110 170 152 80 150 -40 C 150 -170 80 -230 0 -230 C -80 -230 -150 -170 -150 -40 Z" fill={SKIN_S} />
        <path d="M -176 -10 C -196 -190 -80 -290 10 -282 C 130 -280 200 -190 178 -10 C 172 60 150 120 120 150 Q 0 175 -120 150 C -150 120 -172 60 -176 -10 Z" fill="url(#yHair)" stroke={INK} strokeWidth={4} />
        {[-110, -60, -10, 40, 90].map((x, i) => <Ln key={i} d={`M ${x} -250 Q ${x + 20} -60 ${x + 6} 140`} w={2.4} c={HAIR_D} o={0.8} />)}
        {[-80, 10, 70].map((x, i) => <Ln key={i} d={`M ${x} -240 Q ${x + 14} -140 ${x + 8} -40`} w={3} c={HAIR_L} o={0.8} />)}
      </g>
    );
  }
  return (
    <g>
      {/* 後ろ髪 */}
      <path d="M -178 10 C -200 -190 -80 -292 10 -284 C 136 -282 204 -186 180 10 C 176 60 168 96 156 120 L 120 40 L -120 40 L -158 120 C -170 92 -176 56 -178 10 Z" fill="url(#yHair)" stroke={INK} strokeWidth={4} />
      {/* 耳 */}
      <path d="M -150 -30 C -176 -40 -182 20 -150 40" fill={SKIN} stroke={INK} strokeWidth={3.5} />
      <path d="M 150 -30 C 176 -40 182 20 150 40" fill={SKIN_S} stroke={INK} strokeWidth={3.5} />
      {/* 顔の形 */}
      <path d="M -150 -40 C -152 80 -110 170 -50 205 Q 0 228 50 205 C 110 170 152 80 150 -40 C 150 -170 80 -230 0 -230 C -80 -230 -150 -170 -150 -40 Z" fill="url(#ySkin)" stroke={INK} strokeWidth={4.5} />
      {/* 頬とあごの影 */}
      <path d="M 0 -230 C 80 -230 150 -170 150 -40 C 152 80 110 170 50 205 Q 0 228 -50 205 C 20 160 60 60 50 -80 Z" fill="url(#yShade)" opacity={shade} />
      <Ln d="M 96 120 Q 120 70 126 10" w={2} c="#a78a72" o={0.5} />
      {/* 眉 */}
      <Ln d="M -112 -66 Q -70 -86 -24 -70" w={5} c={HAIR_D} />
      <Ln d="M 22 -70 Q 68 -88 112 -66" w={5} c={HAIR_D} />
      <Eye x={-66} side={-1} lid={0.55} glint={0} look={look} />
      <Eye x={66} side={1} lid={0.55} glint={glint} look={look} />
      {/* 鼻 */}
      <Ln d="M 10 -20 Q 18 30 22 70" w={2.4} c="#9c7f68" o={0.8} />
      <Ln d="M -16 86 Q 0 96 20 84" w={3} c="#8a6c56" />
      <path d="M 22 70 Q 34 82 20 90 Q 30 80 22 70 Z" fill="#b8987f" opacity={0.6} />
      {/* 口 (うっすら笑う) */}
      <Ln d={`M -40 ${140 - smile * 4} Q 0 ${148 + smile * 4} 42 ${138 - smile * 10}`} w={3.6} c="#6b4a3e" />
      <Ln d={`M -26 ${154} Q 0 ${162} 26 ${154}`} w={2} c="#b08a78" o={0.6} />
      {smile > 0.3 && <Ln d={`M 42 ${138 - smile * 10} Q 50 ${130 - smile * 10} 50 ${124 - smile * 10}`} w={2.4} c="#6b4a3e" o={smile} />}
      {/* 前髪 (毛束をいくつも重ねる) */}
      <path d="M -168 -40 C -188 -200 -70 -288 20 -280 C 140 -276 196 -180 172 -40 C 160 -110 132 -150 100 -168 C 108 -120 96 -92 80 -78 C 70 -120 50 -150 26 -164 C 30 -116 14 -86 -6 -72 C -10 -120 -30 -146 -54 -158 C -50 -116 -66 -90 -92 -76 C -96 -120 -112 -146 -130 -152 C -136 -110 -150 -76 -168 -40 Z"
        fill="url(#yHair)" stroke={INK} strokeWidth={4.2} strokeLinejoin="round" />
      {/* 毛の流れの線と光 */}
      {[[-140, -170, -120, -90], [-96, -220, -70, -100], [-40, -240, -20, -90], [20, -246, 40, -100], [80, -226, 92, -96], [130, -180, 150, -70]].map(([x1, y1, x2, y2], i) => (
        <Ln key={i} d={`M ${x1} ${y1} Q ${(x1 + x2) / 2 + 14} ${(y1 + y2) / 2} ${x2} ${y2}`} w={2.2} c={HAIR_D} o={0.75} />
      ))}
      {[[-110, -236, -70], [-20, -262, 40], [70, -250, 120]].map(([x1, y, x2], i) => (
        <Ln key={i} d={`M ${x1} ${y + 20} Q ${(x1 + x2) / 2} ${y} ${x2} ${y + 16}`} w={4} c={HAIR_L} o={0.85} />
      ))}
    </g>
  );
};

/** 胸から上 (シャツの襟と黒いコート)。中心 (0,0) が顔の中心。 */
export const Portrait: React.FC<{smile?: number; glint?: number; shade?: number; look?: number; back?: boolean}> = (p) => (
  <g>
    {/* 首 */}
    <path d="M -58 150 L -64 330 L 64 330 L 58 150 Z" fill="url(#yNeck)" stroke={INK} strokeWidth={4} />
    {/* コート */}
    <path d="M -330 760 C -320 520 -280 380 -150 330 L -60 300 L 0 420 L 60 300 L 150 330 C 280 380 320 520 330 760 Z" fill="url(#yCoat)" stroke={INK} strokeWidth={5} />
    {/* シャツの襟 */}
    <path d="M -70 300 L -100 340 L -20 430 L 0 360 L 20 430 L 100 340 L 70 300 L 0 330 Z" fill={SHIRT} stroke={INK} strokeWidth={4} />
    {/* コートの襟とシワ */}
    <path d="M -150 330 L -60 300 L -10 470 L -120 560 Z" fill={COAT_L} stroke={INK} strokeWidth={4} />
    <path d="M 150 330 L 60 300 L 10 470 L 120 560 Z" fill="#0f1215" stroke={INK} strokeWidth={4} />
    <Ln d="M -240 500 Q -220 600 -230 740" w={2.5} c="#3c444c" />
    <Ln d="M 230 520 Q 210 620 222 740" w={2.5} c="#000" />
    <Head {...p} />
  </g>
);

/**
 * 全身 (細身で背が高い)。原点は足元。頭の中心は y = -740 あたり。
 * walk: 歩きの位相、view: 正面 / 後ろ。
 */
export const Figure: React.FC<{view?: 'front' | 'back'; walk?: number; smile?: number; glint?: number}> = ({view = 'front', walk = 0, smile = 0, glint = 0}) => {
  const step = Math.sin(walk * 5) * 12 * (walk ? 1 : 0);
  return (
    <g>
      <ellipse cy={8} rx={130} ry={18} fill="#000" opacity={0.35} />
      {/* 脚と靴 */}
      <path d={`M ${-40 + step} -330 L ${-46 + step} -10 L ${-12 + step} -10 L ${-6 + step * 0.5} -330 Z`} fill="#121417" stroke={INK} strokeWidth={4} />
      <path d={`M ${6 - step * 0.5} -330 L ${12 - step} -10 L ${46 - step} -10 L ${40 - step} -330 Z`} fill="#0d0f12" stroke={INK} strokeWidth={4} />
      <path d={`M ${-54 + step} -12 Q ${-30 + step} -24 ${-6 + step} -12 L ${-4 + step} 4 L ${-56 + step} 4 Z`} fill="#050505" />
      <path d={`M ${4 - step} -12 Q ${30 - step} -24 ${56 - step} -12 L ${58 - step} 4 L ${6 - step} 4 Z`} fill="#050505" />
      {/* ロングコート */}
      <path d="M -112 -610 C -150 -460 -150 -300 -138 -170 L -30 -190 L 0 -430 L 30 -190 L 138 -170 C 150 -300 150 -460 112 -610 Q 0 -650 -112 -610 Z" fill="url(#yCoat)" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <Ln d="M -96 -500 Q -110 -360 -100 -200" w={2.4} c="#3c444c" />
      <Ln d="M 92 -480 Q 104 -340 96 -196" w={2.4} c="#000" />
      {view === 'front' && (
        <g>
          <path d="M -36 -620 L 0 -540 L 36 -620 Z" fill={SHIRT} stroke={INK} strokeWidth={3} />
          <path d="M -70 -626 L -8 -500 L -60 -420 L -96 -560 Z" fill={COAT_L} stroke={INK} strokeWidth={4} />
          <path d="M 70 -626 L 8 -500 L 60 -420 L 96 -560 Z" fill="#0f1215" stroke={INK} strokeWidth={4} />
          {[-470, -400, -330].map((y, i) => <circle key={i} cx={-18} cy={y} r={6} fill="#2e353c" />)}
        </g>
      )}
      {/* 腕 (コートのポケットに手) */}
      <path d="M -104 -596 C -126 -520 -128 -420 -112 -320" stroke={COAT} strokeWidth={40} fill="none" strokeLinecap="round" />
      <path d="M 104 -596 C 126 -520 128 -420 112 -320" stroke="#0f1215" strokeWidth={40} fill="none" strokeLinecap="round" />
      <circle cx={-112} cy={-316} r={17} fill={SKIN} stroke={INK} strokeWidth={4} />
      <circle cx={112} cy={-316} r={17} fill={SKIN_S} stroke={INK} strokeWidth={4} />
      {/* 首と頭 */}
      <path d="M -20 -672 L -22 -628 L 22 -628 L 20 -672 Z" fill="url(#yNeck)" />
      <g transform="translate(0 -740) scale(0.3)">
        <Head smile={smile} glint={glint} back={view === 'back'} />
      </g>
    </g>
  );
};
