import {Easing, interpolate} from 'remotion';
import type {LonLat} from './types';

export const W = 1080;
export const H = 1920;

export const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
export const easeInOut = (u: number) => Easing.inOut(Easing.cubic)(clamp01(u));
export const easeOut = (u: number) => Easing.out(Easing.cubic)(clamp01(u));
export const easeIn = (u: number) => Easing.in(Easing.cubic)(clamp01(u));

/** 経緯度 -> 0..1 の正規化メルカトル (geo_short.geo.merc と同じ)。 */
export const merc = ([lon, lat]: LonLat): [number, number] => {
  const la = Math.max(-85, Math.min(85, lat));
  const x = (lon + 180) / 360;
  const y = 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / (2 * Math.PI);
  return [x, y];
};

/** カメラ [中心 x, 中心 y, 画面幅 (正規化単位)] で経緯度を画面座標にする。 */
export const toScreen = (p: LonLat, cam: [number, number, number]): [number, number] => {
  const [x, y] = merc(p);
  const ppu = W / cam[2];
  return [W / 2 + (x - cam[0]) * ppu, H / 2 + (y - cam[1]) * ppu];
};

/** 弾むように出てくる 0 -> 1 (少し行き過ぎて戻る)。 */
export const popIn = (t: number, dur = 0.45) => {
  if (t <= 0) return 0;
  const u = clamp01(t / dur);
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
};

/** シーン末尾で縮んで消える倍率。 */
export const outScale = (lt: number, dur: number, len = 0.28) =>
  interpolate(lt, [dur - len, dur], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.back(1.6))});

/** 白いフチ + 落ち影でステッカー風に見せる CSS filter。 */
export const stickerFilter = (size: number) => {
  const b = Math.max(2.5, size * 0.022);
  const dirs = [
    [b, 0], [-b, 0], [0, b], [0, -b],
    [b * 0.7, b * 0.7], [-b * 0.7, b * 0.7], [b * 0.7, -b * 0.7], [-b * 0.7, -b * 0.7],
  ];
  return (
    dirs.map(([x, y]) => `drop-shadow(${x.toFixed(1)}px ${y.toFixed(1)}px 0 #fff)`).join(' ') +
    ` drop-shadow(0 ${(size * 0.05).toFixed(1)}px ${(size * 0.05).toFixed(1)}px rgba(20,25,35,0.38))`
  );
};

export const FONT = 'Poppins';
