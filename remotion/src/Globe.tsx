import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, staticFile} from 'remotion';
import {H, W, clamp01, easeInOut} from './util';

/**
 * 冒頭の「宇宙に浮かぶ地球が回り、話の場所へ一気にズーム」(約 1.5 秒)。
 * 地球の画像 (正距円筒) を正射図法でキャンバスに描く。最後は下の地図にフェードしてつながる。
 */

export const GLOBE_DUR = 1.55;

let cache: {w: number; h: number; px: Uint8ClampedArray} | null = null;

const useTexture = (src: string) => {
  const [tex, setTex] = useState(cache);
  const [handle] = useState(() => (cache ? null : delayRender('globe texture')));
  useLayoutEffect(() => {
    if (cache || !handle) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      cache = {w: img.width, h: img.height, px: g.getImageData(0, 0, img.width, img.height).data};
      setTex(cache);
      continueRender(handle);
    };
    img.onerror = () => continueRender(handle);
    img.src = src;
  }, [src, handle]);
  return tex;
};

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

export const GlobeIntro: React.FC<{img: string; lon: number; lat: number; t: number}> = ({img, lon, lat, t}) => {
  const tex = useTexture(staticFile(`job/${img}`));
  const ref = useRef<HTMLCanvasElement>(null);
  // 回転: 西から 80 度ぶん回ってきて、少しずつ目的の緯度へ。ズームは 0.55 秒から一気に
  const spin = easeInOut(clamp01(t / 1.05));
  const lon0 = lon - 80 * (1 - spin);
  const lat0 = lat * (0.35 + 0.65 * spin);
  const zk = clamp01((t - 0.55) / (GLOBE_DUR - 0.55));
  const R = 430 * Math.pow(9, zk * zk);
  const fade = 1 - clamp01((t - (GLOBE_DUR - 0.4)) / 0.4);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || !tex) return;
    const g = cv.getContext('2d')!;
    // 半分の解像度で描いて拡大 (速さのため。動きが速いので見た目は変わらない)
    const S = 2;
    const w = W / S;
    const h = H / S;
    const out = g.createImageData(w, h);
    const d = out.data;
    const cx = w / 2;
    const cy = h * 0.46;
    const r = R / S;
    const sl = Math.sin(lat0 * D2R);
    const cl = Math.cos(lat0 * D2R);
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h, Math.ceil(cy + r));
    for (let y = y0; y < y1; y++) {
      const py = (cy - y) / r;
      for (let x = x0; x < x1; x++) {
        const qx = (x - cx) / r;
        const rho2 = qx * qx + py * py;
        if (rho2 > 1) continue;
        const z = Math.sqrt(1 - rho2);
        const la = Math.asin(z * sl + py * cl) * R2D;
        let lo = lon0 + Math.atan2(qx, z * cl - py * sl) * R2D;
        lo = ((lo + 540) % 360) - 180;
        const u = Math.min(tex.w - 1, Math.max(0, Math.floor(((lo + 180) / 360) * tex.w)));
        const v = Math.min(tex.h - 1, Math.max(0, Math.floor(((90 - la) / 180) * tex.h)));
        const si = (v * tex.w + u) * 4;
        // ふちほど暗く (丸みの陰影)、少しだけ青く
        const shade = 0.5 + 0.5 * Math.pow(z, 0.6);
        const o = (y * w + x) * 4;
        d[o] = tex.px[si] * shade;
        d[o + 1] = tex.px[si + 1] * shade;
        d[o + 2] = Math.min(255, tex.px[si + 2] * shade + 10 * (1 - z));
        d[o + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
  }, [tex, lon0, lat0, R]);
  if (fade <= 0) return null;
  const stars = Array.from({length: 120}).map((_, i) => {
    const a = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const b = Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1;
    return <circle key={i} cx={a * W} cy={b * H} r={0.8 + (i % 3) * 0.8} fill="#fff" opacity={0.4 + (i % 5) * 0.12} />;
  });
  return (
    <AbsoluteFill style={{opacity: fade}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 46%, #0b1d3a 0%, #050a16 60%, #02040a 100%)'}} />
      <svg width={W} height={H} style={{position: 'absolute', opacity: 1 - zk}}>{stars}</svg>
      {/* 大気の光 */}
      <div style={{position: 'absolute', left: W / 2 - R * 1.12, top: H * 0.46 - R * 1.12, width: R * 2.24, height: R * 2.24, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(120,190,255,0) 86%, rgba(120,190,255,0.55) 90%, rgba(120,190,255,0) 100%)'}} />
      <canvas ref={ref} width={W / 2} height={H / 2} style={{position: 'absolute', left: 0, top: 0, width: W, height: H}} />
      {/* 着地点のピンの光 */}
      <div style={{position: 'absolute', left: W / 2 - 18, top: H * 0.46 - 18, width: 36, height: 36, borderRadius: '50%',
        background: '#ffd23f', boxShadow: '0 0 30px 12px rgba(255,210,63,0.7)', opacity: clamp01((t - 0.9) / 0.25) * (1 - zk * 0.6)}} />
    </AbsoluteFill>
  );
};
