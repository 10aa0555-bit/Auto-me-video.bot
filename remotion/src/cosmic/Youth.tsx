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

const FACE = 'M -128 -60 C -130 40 -114 108 -68 164 Q -24 212 0 216 Q 24 212 68 164 C 114 108 130 40 128 -60 C 128 -190 66 -236 0 -236 C -66 -236 -128 -190 -128 -60 Z';

/** 毛束 (根元 x0,y0 → 毛先 x1,y1、幅 w、反り bend)。fill は塗り、line は根元を閉じない輪郭線。 */
type Blade = [number, number, number, number, number, number];
const bladeFill = ([x0, y0, x1, y1, w, b]: Blade, dy = 0) => {
  const mx = (x0 + x1) / 2 + b;
  const my = (y0 + y1) / 2;
  return `M ${x0 - w / 2} ${y0 + dy} Q ${mx - w * 0.4} ${my + dy} ${x1} ${y1 + dy} Q ${mx + w * 0.4} ${my + dy} ${x0 + w / 2} ${y0 + dy} Z`;
};
const bladeLine = (bl: Blade) => bladeFill(bl).replace(' Z', '');
// 光は左上から。毛先は少し左へ流す (サイドに流した前髪)
const BANGS: Blade[] = [
  [-150, -200, -164, 6, 70, -8],
  [-104, -250, -130, -64, 84, -6],
  [-56, -268, -86, -40, 84, -4],
  [-4, -276, -40, -86, 80, -4],
  [44, -270, 16, -36, 84, 2],
  [96, -252, 76, -78, 80, 6],
  [146, -206, 142, -14, 72, 8],
];
const LOCKS: Blade[] = [
  [-150, -120, -162, 116, 54, -10],
  [150, -120, 160, 112, 54, 10],
];
const CAP = 'M -188 -30 C -204 -232 -100 -334 0 -334 C 100 -334 204 -232 188 -30 Q 130 -170 0 -186 Q -130 -170 -188 -30 Z';

/** 目 1 つ (右目の向きで描き、左目は左右反転)。 */
const Eye: React.FC<{x: number; side: number; blink: number; glint: number; look: number}> = ({x, side, blink, glint, look}) => {
  const open = 1 - blink;
  const id = `yEye${side}`;
  const ix = 2 + look * 7 * side;
  return (
    <g transform={`translate(${x} -2) scale(${side * 1.1} 1.1)`}>
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
      <path d="M -178 10 C -210 -220 -96 -334 0 -334 C 96 -334 210 -220 178 10 Q 170 70 154 104 L 138 64 L 122 108 L -122 108 L -138 64 L -154 104 Q -170 70 -178 10 Z" fill={HAIR_D} stroke={HLINE} strokeWidth={4.5} strokeLinejoin="round" />
      {/* 耳 */}
      <path d="M -126 -40 C -156 -54 -164 16 -122 34" fill={SKIN} stroke={LINE} strokeWidth={3.5} />
      <path d="M 126 -40 C 156 -54 164 16 122 34" fill={SKIN_S} stroke={LINE} strokeWidth={3.5} />
      {/* 顔 */}
      <path d={FACE} fill={SKIN} />
      <clipPath id="yFace"><path d={FACE} /></clipPath>
      <g clipPath="url(#yFace)">
        {/* セル影: 右の頬と、前髪が額に落とす影 */}
        <path d="M 58 -240 C 130 -200 150 -100 142 -40 C 140 50 118 120 70 172 Q 40 204 14 222 C 84 150 106 60 100 -30 C 96 -120 84 -180 58 -240 Z" fill={SKIN_S} opacity={0.75 * shade} />
        {BANGS.map((bl, i) => <path key={i} d={bladeFill(bl, 22)} fill={SKIN_S} />)}
      </g>
      <path d={FACE} fill="none" stroke={LINE} strokeWidth={4.2} />
      {/* 頬の赤み */}
      <ellipse cx={-74} cy={64} rx={28} ry={11} fill="#f4a3a0" opacity={0.25} />
      <ellipse cx={74} cy={64} rx={28} ry={11} fill="#f4a3a0" opacity={0.2} />
      <Eye x={-56} side={-1} blink={blink} glint={glint} look={look} />
      <Eye x={56} side={1} blink={blink} glint={glint} look={look} />
      {/* 鼻 (小さな影と線だけ) */}
      <path d="M 8 50 Q 16 66 6 74 Q 14 64 8 50 Z" fill={SKIN_S} />
      <Ln d="M 4 72 Q 10 75 14 70" w={2.6} c="#a57b66" />
      {/* 口 (やわらかく微笑む) */}
      <Ln d={`M ${-24 - s * 4} ${120 - s * 3} Q 0 ${126 + s * 9} ${24 + s * 4} ${120 - s * 3}`} w={3.4} c="#8a4f43" />
      {s > 0.4 && <Ln d={`M -10 ${134 + s * 6} Q 0 ${137 + s * 6} 10 ${134 + s * 6}`} w={2} c="#c58b7c" o={s} />}
      {/* 頭頂 (毛束の根元を隠す) */}
      <path d={CAP} fill="url(#yHair)" stroke={HLINE} strokeWidth={4.5} strokeLinejoin="round" />
      <path d="M 50 -326 C 150 -300 204 -210 188 -30 Q 160 -110 100 -150 C 120 -220 100 -290 50 -326 Z" fill={HAIR_D} opacity={0.55} />
      {/* 横の髪と前髪の毛束 (外側から順に重ねる) */}
      {[...LOCKS, BANGS[0], BANGS[6], BANGS[1], BANGS[5], BANGS[2], BANGS[4], BANGS[3]].map((bl, i) => (
        <g key={i}>
          <path d={bladeFill(bl)} fill={bl[0] > 60 ? HAIR_D : HAIR} />
          <path d={bladeFill([bl[0] + bl[4] * 0.12, bl[1] + 30, bl[2] + 4, bl[3] - 10, bl[4] * 0.4, bl[5]])} fill={HAIR_D} opacity={bl[0] > 60 ? 0.5 : 0.55} />
          <path d={bladeLine(bl)} fill="none" stroke={HLINE} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
      {/* 天使の輪 (髪のツヤ) */}
      <path d="M -150 -214 Q -60 -282 40 -268 Q 100 -256 140 -222" stroke={HAIR_L} strokeWidth={14} fill="none" strokeLinecap="round" strokeDasharray="58 16" />
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
    <g transform="translate(0 50)"><Head {...p} /></g>
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
        <path d={`M -100 -612 C -130 -470 -132 -300 -122 ${hem(-1)} L -30 ${hem(-1) - 12} L ${front ? 0 : -2} ${front ? -430 : -300} L 30 ${hem(1) - 12} L 122 ${hem(1)} C 132 -300 130 -470 100 -612 Q 0 -650 -100 -612 Z`}
          fill="url(#yCoat)" stroke={LINE} strokeWidth={5} strokeLinejoin="round" />
        <path d={`M -100 -600 C -124 -460 -126 -320 -116 ${hem(-1) - 6} L -90 ${hem(-1) - 10} C -100 -320 -100 -460 -84 -590 Z`} fill={COAT_L} opacity={0.6} />
        {!front && <Ln d={`M 0 -600 L 0 ${hem(0) - 8}`} w={3} c="#000" o={0.6} />}
        {front && (
          <g>
            <path d="M -36 -622 L 0 -540 L 36 -622 Z" fill={SHIRT} stroke={LINE} strokeWidth={3} />
            <path d="M -72 -628 L -8 -500 L -60 -420 L -98 -562 Z" fill={COAT_L} stroke={LINE} strokeWidth={4} />
            <path d="M 72 -628 L 8 -500 L 60 -420 L 98 -562 Z" fill={COAT_D} stroke={LINE} strokeWidth={4} />
          </g>
        )}
        {/* 腕 (手はコートのポケットの中) */}
        <path d="M -96 -600 C -114 -520 -116 -430 -104 -354" stroke={COAT} strokeWidth={34} fill="none" strokeLinecap="round" />
        <path d="M 96 -600 C 114 -520 116 -430 104 -354" stroke={COAT_D} strokeWidth={34} fill="none" strokeLinecap="round" />
        <Ln d="M -118 -354 Q -104 -344 -90 -354" w={4} c="#000" o={0.8} />
        <Ln d="M 90 -354 Q 104 -344 118 -354" w={4} c="#000" o={0.8} />
        {/* 首と頭 */}
        <path d="M -20 -676 L -22 -628 L 22 -628 L 20 -676 Z" fill={SKIN_S} />
        <g transform={`translate(0 -752) rotate(${-sn * 1.5}) scale(0.34)`}>
          <Head smile={smile} glint={glint} back={!front} blink={blinkAt(t)} />
        </g>
      </g>
    </g>
  );
};
