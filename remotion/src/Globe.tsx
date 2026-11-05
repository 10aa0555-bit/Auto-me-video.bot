import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, staticFile} from 'remotion';
import {H, W, clamp01, easeInOut} from './util';

/**
 * 冒頭の「宇宙に浮かぶ地球が回り、話の場所へ一気にズーム」(約 1.5 秒)。
 * 地球の画像 (正距円筒) を正射図法でキャンバスに描く。最後は下の地図にフェードしてつながる。
 */

export const GLOBE_DUR = 2.0;

/** 地球ズームの最後に、下の地図も少し引いた所から寄ってくる (地球→地図をつなげる)。 */
export const mapIntroScale = (t: number) => (t >= GLOBE_DUR ? 1 : 0.62 + 0.38 * easeInOut(clamp01((t - 1.25) / (GLOBE_DUR - 1.25))));

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
  // 回転とズームを同時に、ゆっくり始めてゆっくり終わる (ぬるっと)
  const spin = easeInOut(clamp01(t / 1.5));
  const lon0 = lon - 70 * (1 - spin);
  const lat0 = lat * (0.3 + 0.7 * spin);
  const zk = easeInOut(clamp01((t - 0.3) / (GLOBE_DUR - 0.3)));
  const R = 430 * Math.exp(Math.log(2600 / 430) * zk);
  const fade = 1 - easeInOut(clamp01((t - 1.35) / (GLOBE_DUR - 1.35)));
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || !tex) return;
    const g = cv.getContext('2d')!;
    const w = W;
    const h = H;
    const out = g.createImageData(w, h);
    const d = out.data;
    const cx = w / 2;
    const cy = h * 0.46;
    const r = R;
    const sl = Math.sin(lat0 * D2R);
    const cl = Math.cos(lat0 * D2R);
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h, Math.ceil(cy + r));
    const tw = tex.w;
    const th = tex.h;
    const px = tex.px;
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
        // バイリニア補間 (4 つの画素を混ぜて、拡大してもガビガビにしない)
        const fu = ((lo + 180) / 360) * tw - 0.5;
        const fv = Math.min(th - 1.001, Math.max(0, ((90 - la) / 180) * th - 0.5));
        const u0 = Math.floor(fu);
        const v0 = Math.floor(fv);
        const au = fu - u0;
        const av = fv - v0;
        const ua = ((u0 % tw) + tw) % tw;
        const ub = (ua + 1) % tw;
        const i00 = (v0 * tw + ua) * 4;
        const i01 = (v0 * tw + ub) * 4;
        const i10 = ((v0 + 1) * tw + ua) * 4;
        const i11 = ((v0 + 1) * tw + ub) * 4;
        // ふちほど暗く (丸みの陰影)、ふちは少し青く (大気)
        const shade = 0.55 + 0.45 * Math.pow(z, 0.55);
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const top = px[i00 + c] * (1 - au) + px[i01 + c] * au;
          const bot = px[i10 + c] * (1 - au) + px[i11 + c] * au;
          d[o + c] = (top * (1 - av) + bot * av) * shade + (c === 2 ? 18 : c === 1 ? 6 : 0) * (1 - z);
        }
        // 円のふちをなめらかに (アンチエイリアス)
        const edge = (1 - Math.sqrt(rho2)) * r;
        d[o + 3] = edge < 1.5 ? 255 * Math.max(0, edge / 1.5) : 255;
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
      <canvas ref={ref} width={W} height={H} style={{position: 'absolute', left: 0, top: 0, width: W, height: H}} />
      {/* 着地点のピンの光 */}
      <div style={{position: 'absolute', left: W / 2 - 18, top: H * 0.46 - 18, width: 36, height: 36, borderRadius: '50%',
        background: '#ffd23f', boxShadow: '0 0 30px 12px rgba(255,210,63,0.7)', opacity: clamp01((t - 1.0) / 0.3) * (1 - zk * 0.7)}} />
    </AbsoluteFill>
  );
};
