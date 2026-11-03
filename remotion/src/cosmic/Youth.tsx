import React from 'react';

/**
 * 金髪の静かな青年 (オリジナル)。2D アニメのセル塗り (はっきりした影 + 茶色の柔らかい線)。
 * Head は頭だけ (中心が原点、顔の高さ約 460)。Portrait は胸から上、Figure は全身。
 * まばたき・歩き (脚の上げ下げ・体の上下・コートの揺れ) は t / walk から計算する。
 */

const LINE = '#3b2a22'; // 肌と服の線 (真っ黒より柔らかい)
const HLINE = '#7a5626'; // 髪の線
const SKIN = '#f8e9dc';
const SKIN_S = '#e8c6b0'; // セル影
const HAIR = '#f3d68f';
const HAIR_D = '#d1a656';
const HAIR_L = '#fff6d8';
const IRIS_T = '#2f5878';
const IRIS = '#5f97bf';
const IRIS_B = '#bfe0f2';
const COAT = '#1a1e24';
const COAT_L = '#2e353e';
const COAT_D = '#0e1115';
const SHIRT = '#f1ece2';

export const YouthDefs: React.FC = () => (
  <defs>
    <linearGradient id="yIris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={IRIS_T} /><stop offset="0.45" stopColor={IRIS} /><stop offset="1" stopColor={IRIS_B} /></linearGradient>
    <linearGradient id="yHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={HAIR_L} /><stop offset="0.35" stopColor={HAIR} /><stop offset="1" stopColor={HAIR} /></linearGradient>
    <linearGradient id="yCoat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={COAT_L} /><stop offset="0.4" stopColor={COAT} /><stop offset="1" stopColor={COAT_D} /></linearGradient>
  </defs>
);

const Ln: React.FC<{d: string; w?: number; c?: string; o?: number}> = ({d, w = 3.2, c = LINE, o = 1}) => (
  <path d={d} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={o} />
);

/** まばたき (約 3.4 秒ごとに 0.13 秒閉じる)。 */
export const blinkAt = (t: number) => {
  const c = (t + 0.7) % 3.4;
  return c < 0.13 ? Math.sin((c / 0.13) * Math.PI) : 0;
};

const FACE = 'M -140 -60 C -142 40 -122 112 -72 170 Q -24 222 0 226 Q 24 222 72 170 C 122 112 142 40 140 -60 C 140 -192 72 -238 0 -238 C -72 -238 -140 -192 -140 -60 Z';

/** 前髪の下の縁 (毛先が尖ったギザギザ)。dy だけ下にずらすと額の影になる。 */
const TIPS: [number, number][] = [
  [174, -20], [150, 34], [132, -80], [110, -6], [92, -110], [66, -30], [40, -122], [16, -40], [-8, -126], [-34, -36], [-60, -118], [-86, -28], [-108, -104], [-126, -10], [-144, -80], [-152, 34], [-174, -20],
];
const bangs = (dy = 0) => {
  let d = `M -174 ${-20 + dy} C -196 -200 -100 -300 0 -300 C 100 -300 196 -200 174 ${-20 + dy}`;
  for (let i = 1; i < TIPS.length; i++) {
    const [px, py] = TIPS[i - 1];
    const [x, y] = TIPS[i];
    const tip = i % 2 === 1; // 奇数番目が毛先
    const cx = (px + x) / 2 + (tip ? -6 : 6);
    const cy = (py + y) / 2 + (tip ? -10 : 0);
    d += ` Q ${cx} ${cy + dy} ${x} ${y + dy}`;
  }
  return d + ' Z';
};

/** 目 1 つ (右目の向きで描き、左目は左右反転)。 */
const Eye: React.FC<{x: number; side: number; blink: number; glint: number; look: number}> = ({x, side, blink, glint, look}) => {
  const open = 1 - blink;
  const id = `yEye${side}`;
  const ix = 2 + look * 7 * side;
  return (
    <g transform={`translate(${x} -8) scale(${side} 1)`}>
      {open > 0.25 ? (
        <g transform={`translate(0 ${(1 - open) * -8}) scale(1 ${open})`}>
          <clipPath id={id}><path d="M -40 6 C -30 -30 20 -36 44 2 C 30 22 -20 26 -40 6 Z" /></clipPath>
          <path d="M -40 6 C -30 -30 20 -36 44 2 C 30 22 -20 26 -40 6 Z" fill="#fffdf9" />
          <g clipPath={`url(#${id})`}>
            <ellipse cx={ix} cy={-1} rx={21} ry={26} fill="url(#yIris)" />
            <ellipse cx={ix} cy={-1} rx={21} ry={26} fill="none" stroke={IRIS_T} strokeWidth={2.4} />
            <ellipse cx={ix} cy={-3} rx={8} ry={11} fill="#16242f" />
            {/* まぶたの影 */}
            <path d="M -44 0 C -30 -34 20 -40 48 -2 L 48 -14 L -44 -14 Z" fill="#6f5b56" opacity={0.28} />
            <ellipse cx={ix - 8} cy={-12} rx={6.5} ry={7.5} fill="#fff" />
            <circle cx={ix + 9} cy={9} r={3.2} fill="#fff" opacity={0.9} />
            {glint > 0 && <path d={`M ${ix - 8} -26 L ${ix - 5} -15 L ${ix + 6} -12 L ${ix - 5} -9 L ${ix - 8} 2 L ${ix - 11} -9 L ${ix - 22} -12 L ${ix - 11} -15 Z`} fill="#fff" opacity={glint} />}
          </g>
          {/* 上のまつげの線 (太く、目尻を少しはね上げる) */}
          <path d="M -43 8 C -32 -35 22 -43 51 -5 L 46 3 C 20 -30 -28 -27 -37 8 Z" fill={LINE} />
          <Ln d="M 31 15 Q 8 24 -16 21" w={2.2} c="#9a7462" />
          <Ln d="M -28 -36 Q 6 -50 38 -31" w={2} c="#b8917c" o={0.7} />
        </g>
      ) : (
        <g>
          <Ln d="M -40 6 Q 2 18 46 2" w={5.5} />
          <Ln d="M 40 4 L 50 0" w={4} />
        </g>
      )}
    </g>
  );
};

/** 頭 (正面 / 後ろ)。smile: 口角 (0..1)、glint: 瞳のきらめき、blink: まばたき、look: 目線 (-1..1)。 */
export const Head: React.FC<{smile?: number; glint?: number; shade?: number; look?: number; back?: boolean; blink?: number}> = ({
  smile = 0, glint = 0, shade = 1, look = 0, back = false, blink = 0,
}) => {
  if (back) {
    return (
      <g>
        <path d="M -180 0 C -200 -200 -94 -300 0 -300 C 94 -300 200 -200 180 0 L 168 96 L 140 50 L 118 130 L 80 90 L 40 150 L 0 100 L -40 150 L -80 90 L -118 130 L -140 50 L -168 96 Z"
          fill="url(#yHair)" stroke={HLINE} strokeWidth={4.5} strokeLinejoin="round" />
        <path d="M 40 -280 C 140 -250 190 -140 176 0 L 168 96 L 140 50 L 118 130 L 80 90 L 40 150 C 90 40 100 -120 40 -280 Z" fill={HAIR_D} opacity={0.55} />
        <path d="M -130 -200 L -100 -222 L -70 -206 L -40 -226 L -10 -210 L 20 -228 L 50 -210" stroke={HAIR_L} strokeWidth={12} fill="none" strokeLinejoin="round" opacity={0.9} />
        {[-110, -50, 10, 70].map((x, i) => <Ln key={i} d={`M ${x} -170 Q ${x + 16} -40 ${x + 4} 90`} w={2.6} c={HLINE} o={0.6} />)}
      </g>
    );
  }
  const s = smile;
  return (
    <g>
      {/* 後ろ髪 */}
      <path d="M -182 0 C -202 -200 -92 -302 0 -302 C 92 -302 202 -200 182 0 L 172 92 L 146 44 L 128 108 L -128 108 L -146 44 L -172 92 Z" fill={HAIR_D} stroke={HLINE} strokeWidth={4.5} strokeLinejoin="round" />
      {/* 耳 */}
      <path d="M -138 -40 C -168 -54 -176 16 -134 34" fill={SKIN} stroke={LINE} strokeWidth={3.5} />
      <path d="M 138 -40 C 168 -54 176 16 134 34" fill={SKIN_S} stroke={LINE} strokeWidth={3.5} />
      {/* 顔 */}
      <path d={FACE} fill={SKIN} />
      <clipPath id="yFace"><path d={FACE} /></clipPath>
      <g clipPath="url(#yFace)">
        {/* セル影: 右の頬と、前髪が額に落とす影 */}
        <path d="M 58 -240 C 130 -200 150 -100 142 -40 C 140 50 118 120 70 172 Q 40 204 14 222 C 84 150 106 60 100 -30 C 96 -120 84 -180 58 -240 Z" fill={SKIN_S} opacity={0.75 * shade} />
        <path d={bangs(20)} fill={SKIN_S} />
      </g>
      <path d={FACE} fill="none" stroke={LINE} strokeWidth={4.2} />
      {/* 頬の赤み */}
      <ellipse cx={-82} cy={62} rx={28} ry={11} fill="#f4a3a0" opacity={0.25} />
      <ellipse cx={82} cy={62} rx={28} ry={11} fill="#f4a3a0" opacity={0.2} />
      <Eye x={-62} side={-1} blink={blink} glint={glint} look={look} />
      <Eye x={62} side={1} blink={blink} glint={glint} look={look} />
      {/* 鼻 (小さな影と線だけ) */}
      <path d="M 8 44 Q 16 60 6 68 Q 14 58 8 44 Z" fill={SKIN_S} />
      <Ln d="M 4 66 Q 10 69 14 64" w={2.6} c="#a57b66" />
      {/* 口 (やわらかく微笑む) */}
      <Ln d={`M ${-24 - s * 4} ${120 - s * 3} Q 0 ${126 + s * 9} ${24 + s * 4} ${120 - s * 3}`} w={3.4} c="#8a4f43" />
      {s > 0.4 && <Ln d={`M -10 ${134 + s * 6} Q 0 ${137 + s * 6} 10 ${134 + s * 6}`} w={2} c="#c58b7c" o={s} />}
      {/* 横の髪 (耳の前に垂れる) */}
      <path d="M -170 -120 Q -176 10 -150 118 L -136 72 L -122 126 Q -120 10 -112 -110 Z" fill={HAIR} stroke={HLINE} strokeWidth={4} strokeLinejoin="round" />
      <path d="M 170 -120 Q 176 10 150 118 L 136 72 L 122 126 Q 120 10 112 -110 Z" fill={HAIR_D} stroke={HLINE} strokeWidth={4} strokeLinejoin="round" />
      {/* 前髪 */}
      <path d={bangs()} fill="url(#yHair)" stroke={HLINE} strokeWidth={4.5} strokeLinejoin="round" />
      {/* 右側の髪の影 (光は左上から) */}
      <clipPath id="yBangs"><path d={bangs()} /></clipPath>
      <g clipPath="url(#yBangs)">
        <path d="M 60 -300 C 150 -270 200 -150 180 0 L 60 0 C 100 -100 100 -200 60 -300 Z" fill={HAIR_D} opacity={0.7} />
        {[[-100, -96], [-50, -110], [0, -116], [52, -108], [104, -96]].map(([x, y], i) => (
          <path key={i} d={`M ${x - 10} ${y} Q ${x + 4} ${y - 60} ${x + 16} ${y - 110} Q ${x + 6} ${y - 50} ${x + 10} ${y}`} fill={HAIR_D} opacity={0.85} />
        ))}
      </g>
      {/* 天使の輪 (髪のツヤ) */}
      <path d="M -132 -196 L -110 -214 L -88 -198 L -62 -220 L -36 -204 L -8 -224 L 18 -206 L 44 -222 L 68 -200" stroke={HAIR_L} strokeWidth={13} fill="none" strokeLinejoin="round" />
      {/* 眉 (前髪の上に透けて見える、穏やかな形) */}
      <Ln d="M -104 -62 Q -64 -78 -26 -66" w={5} c="#a87a3a" o={0.85} />
      <Ln d="M 26 -66 Q 64 -78 104 -62" w={5} c="#a87a3a" o={0.85} />
    </g>
  );
};

/** 胸から上 (シャツの襟と黒いコート)。中心 (0,0) が顔の中心。 */
export const Portrait: React.FC<{smile?: number; glint?: number; shade?: number; look?: number; back?: boolean; blink?: number; breath?: number}> = ({breath = 0, ...p}) => (
  <g>
    <g transform={`translate(0 ${breath * 6})`}>
      {/* 首 (あごの下に影) */}
      <path d="M -56 140 L -62 330 L 62 330 L 56 140 Z" fill={SKIN} stroke={LINE} strokeWidth={4} />
      <path d="M -56 150 Q 0 230 56 150 L 58 200 Q 0 260 -58 200 Z" fill={SKIN_S} />
      {/* コート */}
      <path d="M -330 760 C -320 520 -280 380 -150 330 L -60 300 L 0 420 L 60 300 L 150 330 C 280 380 320 520 330 760 Z" fill="url(#yCoat)" stroke={LINE} strokeWidth={5} />
      <path d="M -70 300 L -100 340 L -20 430 L 0 360 L 20 430 L 100 340 L 70 300 L 0 330 Z" fill={SHIRT} stroke={LINE} strokeWidth={4} />
      <path d="M 0 360 L 20 430 L 100 340 L 70 300 Z" fill="#d9d1c3" />
      <path d="M -150 330 L -60 300 L -10 470 L -120 560 Z" fill={COAT_L} stroke={LINE} strokeWidth={4} />
      <path d="M 150 330 L 60 300 L 10 470 L 120 560 Z" fill={COAT_D} stroke={LINE} strokeWidth={4} />
      <path d="M -300 600 C -290 480 -250 400 -170 350 L -200 460 Z" fill={COAT_L} opacity={0.7} />
    </g>
    <Head {...p} />
  </g>
);

/** 脚 1 本 (腰からくるぶし + 靴)。lift: 足の上がり具合 (0..1)、front: 正面向き。 */
const Leg: React.FC<{x: number; lift: number; front: boolean; dark: boolean}> = ({x, lift, front, dark}) => {
  const ankle = -16 - lift * 46;
  const knee = -210 - lift * 26;
  const kx = x + (x < 0 ? -1 : 1) * lift * 4;
  const fill = dark ? '#101317' : '#171b20';
  const sc = front ? 1 + lift * 0.14 : 1 - lift * 0.08; // こちらへ踏み出す足は少し大きく
  return (
    <g>
      <path d={`M ${x - 23} -430 L ${kx - 21} ${knee} L ${x - 17} ${ankle} L ${x + 17} ${ankle} L ${kx + 21} ${knee} L ${x + 23} -430 Z`} fill={fill} stroke={LINE} strokeWidth={4} strokeLinejoin="round" />
      <g transform={`translate(${x} ${ankle}) scale(${sc})`}>
        {front ? (
          <path d="M -24 -4 Q 0 -16 24 -4 L 28 12 Q 0 22 -28 12 Z" fill="#07080a" stroke={LINE} strokeWidth={3} />
        ) : (
          <g>
            <path d="M -22 -4 Q 0 -10 22 -4 L 24 14 Q 0 18 -24 14 Z" fill="#07080a" stroke={LINE} strokeWidth={3} />
            {lift > 0.2 && <path d="M -20 8 Q 0 12 20 8 L 20 14 Q 0 18 -20 14 Z" fill="#3a3f45" opacity={lift} />}
          </g>
        )}
      </g>
    </g>
  );
};

/**
 * 全身 (細身で背が高い)。原点は足元。頭の中心は y = -748 あたり。
 * walk: 歩いた時間 (秒、0 なら立ち止まる)。t: まばたき・呼吸用の時刻。
 */
export const Figure: React.FC<{view?: 'front' | 'back'; walk?: number; smile?: number; glint?: number; t?: number}> = ({view = 'front', walk = 0, smile = 0, glint = 0, t = 0}) => {
  const moving = walk !== 0;
  const ph = walk * Math.PI * 1.7; // 1 秒に約 1.7 歩
  const sn = moving ? Math.sin(ph) : 0;
  const liftL = Math.max(0, sn);
  const liftR = Math.max(0, -sn);
  const bob = moving ? -10 * Math.abs(sn) : Math.sin(t * 1.6) * 3; // 歩くと上下、止まると呼吸
  const sway = 6 * sn; // 立っている脚の側へ体重が乗る
  const front = view === 'front';
  const hem = (side: number) => -176 + side * sn * 9; // コートの裾の揺れ
  return (
    <g>
      <ellipse cy={8} rx={124 - Math.abs(sn) * 10} ry={17} fill="#000" opacity={0.35} />
      <g transform={`translate(${sway * 0.5} ${bob * 0.4})`}>
        <Leg x={-26} lift={liftL} front={front} dark={false} />
        <Leg x={26} lift={liftR} front={front} dark />
      </g>
      <g transform={`translate(${sway} ${bob}) rotate(${sn * 1.2} 0 -420)`}>
        {/* ロングコート (前は開いていて、脚が見える) */}
        <path d={`M -112 -610 C -150 -460 -152 -300 -140 ${hem(-1)} L -34 ${hem(-1) - 14} L ${front ? 0 : -2} ${front ? -440 : -300} L 34 ${hem(1) - 14} L 140 ${hem(1)} C 152 -300 150 -460 112 -610 Q 0 -652 -112 -610 Z`}
          fill="url(#yCoat)" stroke={LINE} strokeWidth={5} strokeLinejoin="round" />
        <path d={`M -112 -600 C -140 -460 -142 -320 -132 ${hem(-1) - 6} L -100 ${hem(-1) - 10} C -112 -320 -112 -460 -92 -590 Z`} fill={COAT_L} opacity={0.6} />
        {!front && <Ln d={`M 0 -600 L 0 ${hem(0) - 8}`} w={3} c="#000" o={0.6} />}
        {front && (
          <g>
            <path d="M -36 -622 L 0 -540 L 36 -622 Z" fill={SHIRT} stroke={LINE} strokeWidth={3} />
            <path d="M -72 -628 L -8 -500 L -60 -420 L -98 -562 Z" fill={COAT_L} stroke={LINE} strokeWidth={4} />
            <path d="M 72 -628 L 8 -500 L 60 -420 L 98 -562 Z" fill={COAT_D} stroke={LINE} strokeWidth={4} />
          </g>
        )}
        {/* 腕 (手はコートのポケットの中) */}
        <path d="M -106 -598 C -128 -520 -130 -430 -114 -350" stroke={COAT} strokeWidth={42} fill="none" strokeLinecap="round" />
        <path d="M 106 -598 C 128 -520 130 -430 114 -350" stroke={COAT_D} strokeWidth={42} fill="none" strokeLinecap="round" />
        <Ln d="M -126 -350 Q -110 -340 -94 -350" w={4} c="#000" o={0.8} />
        <Ln d="M 94 -350 Q 110 -340 126 -350" w={4} c="#000" o={0.8} />
        {/* 首と頭 */}
        <path d="M -20 -676 L -22 -628 L 22 -628 L 20 -676 Z" fill={SKIN_S} />
        <g transform={`translate(0 -748) rotate(${-sn * 1.5}) scale(0.32)`}>
          <Head smile={smile} glint={glint} back={!front} blink={blinkAt(t)} />
        </g>
      </g>
    </g>
  );
};
