import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {GhostSpec, LineSpec, Scene, Swarm} from './types';
import {FONT, H, W, clamp01, easeInOut, easeOut, outScale, popIn, toScreen} from './util';

type Cam = [number, number, number];
type Shapes = Record<string, [number, number][][]>;

/** 正規化メルカトルの輪郭を、カメラから見た SVG パスにする。 */
const ringsPath = (rings: [number, number][][], cam: Cam) => {
  const ppu = W / cam[2];
  return rings
    .map((r) => 'M' + r.map(([x, y]) => `${((x - cam[0]) * ppu + W / 2).toFixed(1)},${((y - cam[1]) * ppu + H / 2).toFixed(1)}`).join('L') + 'Z')
    .join('');
};

const FILL_FADE = 0.6;

/** 国の塗り。シーンをまたいで残り、シーンの頭で前の状態から 0.6 秒で切り替わる。 */
export const Fills: React.FC<{scenes: Scene[]; shapes: Shapes; cam: Cam; t: number}> = ({scenes, shapes, cam, t}) => {
  let i = scenes.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = scenes.length - 1;
  const s = scenes[i];
  const u = easeInOut((t - s.start) / FILL_FADE);
  const keys = Array.from(new Set([...Object.keys(s.fillsBefore), ...Object.keys(s.fillsAfter)]));
  if (!keys.length) return null;
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
      {keys.map((k) => {
        if (!shapes[k]) return null;
        const a = s.fillsBefore[k];
        const b = s.fillsAfter[k];
        const d = ringsPath(shapes[k], cam);
        const col = (c: string | null | undefined) => (c && !c.startsWith('flag:') ? c : '#ffd23f');
        return (
          <g key={k}>
            {a && a !== b && <path d={d} fill={col(a)} fillOpacity={0.55 * (1 - u)} fillRule="evenodd" />}
            {b && <path d={d} fill={col(b)} fillOpacity={a === b ? 0.55 : 0.55 * u} fillRule="evenodd"
              stroke="#fff" strokeOpacity={0.6 * (a === b ? 1 : u)} strokeWidth={2.5} strokeLinejoin="round" />}
          </g>
        );
      })}
    </svg>
  );
};

/** 光る輪郭 (ゆっくり明滅)。 */
export const Outlines: React.FC<{keys: string[]; shapes: Shapes; cam: Cam; lt: number; dur: number}> = ({keys, shapes, cam, lt, dur}) => {
  const a = easeOut(lt / 0.5) * (0.75 + 0.25 * Math.sin(lt * 4)) * outScale(lt, dur, 0.3);
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
      {keys.map((k) => {
        if (!shapes[k]) return null;
        const d = ringsPath(shapes[k], cam);
        return (
          <g key={k} opacity={a} fill="none" strokeLinejoin="round">
            <path d={d} stroke="#000" strokeOpacity={0.35} strokeWidth={12} />
            <path d={d} stroke="#ff4f3a" strokeOpacity={0.35} strokeWidth={24} />
            <path d={d} stroke="#ff4f3a" strokeWidth={8} />
            <path d={d} stroke="#fff" strokeWidth={3} />
          </g>
        );
      })}
    </svg>
  );
};

const cut = (pts: [number, number][], prog: number) => {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let left = total * prog;
  const out: [number, number][] = [pts[0]];
  for (let i = 0; i < seg.length; i++) {
    if (left >= seg[i]) {
      out.push(pts[i + 1]);
      left -= seg[i];
    } else {
      const u = seg[i] ? left / seg[i] : 0;
      out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]);
      break;
    }
  }
  return out;
};

/** 引かれていく線 (川・フェンス・ルート)。glow は光る線、dashed は点線、arrow は矢印付き。 */
export const Line: React.FC<{ln: LineSpec; cam: Cam; lt: number; dur: number}> = ({ln, cam, lt, dur}) => {
  const delay = ln.delay ?? 0.3;
  const prog = easeInOut((lt - delay) / (ln.draw_time ?? 1.2));
  if (prog <= 0) return null;
  const pts = ln.path.map((p) => toScreen(p, cam));
  const out = cut(pts, prog);
  const d = 'M' + out.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L');
  const color = ln.color ?? '#ffffff';
  const w = ln.width ?? 7;
  const style = ln.style ?? 'solid';
  const fade = outScale(lt, dur, 0.3);
  const dash = style.includes('dashed') ? `${w * 2.4} ${w * 1.8}` : undefined;
  const end = out[out.length - 1];
  const prev = out[Math.max(0, out.length - 2)];
  const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  let label = ln.label;
  if (label && ln.count !== undefined) label = label.replace('{n}', Math.round(ln.count * prog).toLocaleString('en-US'));
  const labelK = label ? popIn(lt - delay - (ln.draw_time ?? 1.2) * 0.6) * fade : 0;
  const mid = pts[Math.floor(pts.length / 2)];
  return (
    <>
      <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity: fade}}>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {style === 'glow' ? (
            <>
              <path d={d} stroke={color} strokeOpacity={0.08} strokeWidth={w * 7} />
              <path d={d} stroke={color} strokeOpacity={0.14} strokeWidth={w * 4.5} />
              <path d={d} stroke={color} strokeOpacity={0.25} strokeWidth={w * 2.6} />
              <path d={d} stroke={color} strokeWidth={w} />
              <path d={d} stroke="#fff" strokeOpacity={0.85} strokeWidth={Math.max(1.5, w * 0.35)} />
            </>
          ) : (
            <>
              <path d={d} stroke="rgba(0,0,0,0.35)" strokeWidth={w + 4} strokeDasharray={dash} strokeDashoffset={-lt * 40} />
              <path d={d} stroke={color} strokeWidth={w} strokeDasharray={dash} strokeDashoffset={-lt * 40} />
            </>
          )}
          {style.startsWith('arrow') && out.length >= 2 && (
            <path
              d={`M${end[0] + Math.cos(ang) * w * 2},${end[1] + Math.sin(ang) * w * 2}` +
                `L${end[0] + Math.cos(ang + 2.5) * w * 4.5},${end[1] + Math.sin(ang + 2.5) * w * 4.5}` +
                `L${end[0] + Math.cos(ang - 2.5) * w * 4.5},${end[1] + Math.sin(ang - 2.5) * w * 4.5}Z`}
              fill={color} stroke="none"
            />
          )}
        </g>
      </svg>
      {labelK > 0.01 && (
        <div style={{
          position: 'absolute', left: mid[0] + 30, top: mid[1] - 30, transformOrigin: '0 50%', transform: `scale(${labelK})`,
          background: '#fff', color: '#1d2433', fontFamily: FONT, fontWeight: 900, fontSize: 44, padding: '4px 20px',
          borderRadius: 12, whiteSpace: 'nowrap', boxShadow: '0 6px 14px rgba(0,0,0,0.3)',
        }}>{label}</div>
      )}
    </>
  );
};

/** 人が住む場所などの点の群れ。線に沿って順に灯っていく。 */
export const SwarmDots: React.FC<{sw: Swarm; cam: Cam; lt: number; dur: number}> = ({sw, cam, lt, dur}) => {
  if (!sw.pts) return null;
  const delay = sw.delay ?? 0.4;
  const span = sw.duration ?? 1.6;
  const color = sw.color ?? '#ff7b2e';
  const r = sw.size ?? 2.6;
  const fade = sw.keep ? 1 : outScale(lt, dur, 0.3);
  return (
    <AbsoluteFill style={{opacity: fade}}>
      <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
        {sw.pts.map(([lon, lat, o], i) => {
          const k = popIn(lt - delay - o * span, 0.3);
          if (k <= 0.01) return null;
          const [x, y] = toScreen([lon, lat], cam);
          if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return null;
          const tw = 0.75 + 0.25 * Math.sin(lt * 3 + i);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={r * 3 * k} fill={color} fillOpacity={0.22 * tw} />
              <circle cx={x} cy={y} r={r * 1.25 * k} fill="#3a1405" fillOpacity={0.35} />
              <circle cx={x} cy={y} r={r * k} fill={color} fillOpacity={0.95} />
              <circle cx={x} cy={y} r={r * 0.45 * k} fill="#fff4d6" />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

export const sceneIndex = (scenes: Scene[], t: number) => {
  const i = scenes.findIndex((s) => t < s.start + s.dur);
  return i < 0 ? scenes.length - 1 : i;
};

export {clamp01};

/** 国の形を本当の大きさのまま持ち上げて運ぶ (メルカトル図法の歪みを見せる)。 */
export const Ghost: React.FC<{g: GhostSpec; cam: Cam; lt: number; dur: number}> = ({g, cam, lt, dur}) => {
  if (!g.frames || !g.frames.length) return null;
  const delay = g.delay ?? 0.4;
  const a = easeOut((lt - delay) / 0.3) * outScale(lt, dur, 0.3);
  if (a <= 0.01) return null;
  const u = easeInOut((lt - delay - 0.3) / (g.move_time ?? 2.2));
  const rings = g.frames[Math.round(u * (g.frames.length - 1))];
  const d = ringsPath(rings, cam);
  const lift = u > 0 && u < 1 ? Math.sin(Math.PI * u) * 18 : 0;
  const fill = g.fill && !g.fill.startsWith('flag:') ? g.fill : '#ffffff';
  const labelK = g.label && u >= 1 ? popIn(lt - delay - 0.3 - (g.move_time ?? 2.2)) * a : 0;
  // 札は形の上に出す (真ん中だと字幕と重なりやすい)
  const ppu = W / cam[2];
  let top = Infinity;
  let sx = 0;
  let n = 0;
  for (const r of rings) for (const [x, y] of r) {
    const py = (y - cam[1]) * ppu + H / 2;
    if (py < top) top = py;
    sx += (x - cam[0]) * ppu + W / 2;
    n++;
  }
  const lx = n ? sx / n : W / 2;
  const ly = Math.max(140, top - 50);
  return (
    <>
      <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
        <path d={d} transform={`translate(${8 + lift} ${12 + lift * 1.5})`} fill="#000" fillOpacity={0.4 * a} fillRule="evenodd" />
        <g transform={`translate(0 ${-lift})`}>
          <path d={d} fill={fill} fillOpacity={0.9 * a} fillRule="evenodd" />
          <path d={d} fill="none" stroke="#fff" strokeOpacity={a} strokeWidth={4} strokeLinejoin="round" />
        </g>
      </svg>
      {labelK > 0.01 && (
        <div style={{
          position: 'absolute', left: lx, top: ly, transform: `translate(-50%, -50%) scale(${labelK})`,
          fontFamily: FONT, fontWeight: 900, fontSize: 56, color: '#fff', whiteSpace: 'nowrap',
          textShadow: '0 0 6px #000, 0 3px 10px rgba(0,0,0,0.8)',
        }}>{g.label}</div>
      )}
    </>
  );
};
