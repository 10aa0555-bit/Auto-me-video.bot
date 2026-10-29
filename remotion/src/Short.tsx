import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Caption, Icon, MapTex, Marker, Props, Scene, TextSpec} from './types';
import {FONT, H, W, clamp01, easeIn, easeInOut, easeOut, outScale, popIn, stickerFilter, toScreen} from './util';

const job = (f: string) => staticFile(`job/${f}`);
type Cam = [number, number, number];

const FontFaces: React.FC = () => (
  <style>{`
    @font-face { font-family: '${FONT}'; font-weight: 800; src: url('${job('Poppins-ExtraBold.ttf')}'); }
    @font-face { font-family: '${FONT}'; font-weight: 900; src: url('${job('Poppins-Black.ttf')}'); }
  `}</style>
);

/** 黒いフチ + 柔らかい影の白文字。 */
const outline = (px: number, color = 'rgba(15,20,30,0.95)') => {
  const s: string[] = [];
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    s.push(`${(Math.cos(th) * px).toFixed(1)}px ${(Math.sin(th) * px).toFixed(1)}px 0 ${color}`);
  }
  s.push(`0 ${px * 1.6}px ${px * 2.5}px rgba(0,0,0,0.45)`);
  return s.join(', ');
};

// ---------------------------------------------------------------- 地図

const baseOf = (s: Scene) => (s.spec.base ?? 'satellite');

const MapLayer: React.FC<{maps: MapTex[]; cam: Cam; scenes: Scene[]; t: number}> = ({maps, cam, scenes, t}) => {
  const screenPpu = W / cam[2];
  // シーンごとの見た目 (衛星 / 地形図) を 0.6 秒で重ねて切り替える
  let i = scenes.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = scenes.length - 1;
  const look = (j: number): string => {
    for (let n = j; n >= 0; n--) if (!scenes[n].spec.blueprint) return baseOf(scenes[n]);
    return 'satellite';
  };
  const cur = look(i);
  const prev = i > 0 ? look(i - 1) : cur;
  const mix = prev === cur ? 1 : easeInOut((t - scenes[i].start) / 0.6);
  const drawLook = (name: string, op: number) =>
    maps.map((tex, li) => {
      const k = screenPpu / tex.ppu;
      const x = W / 2 - (cam[0] - tex.x0) * screenPpu;
      const y = H / 2 - (cam[1] - tex.y0) * screenPpu;
      // 画面より十分大きく見えている粗い段だけ描く (細かい段は縁をぼかして重ねる)
      const sw = tex.w * k;
      if (li > 0 && (x > W || y > H || x + sw < 0 || y + tex.h * k < 0)) return null;
      const feather = li > 0 ? 'linear-gradient(to right, transparent 0, #000 6%, #000 94%, transparent 100%)' : undefined;
      const featherV = li > 0 ? 'linear-gradient(to bottom, transparent 0, #000 4%, #000 96%, transparent 100%)' : undefined;
      return (
        <Img
          key={`${name}${li}`}
          src={job(tex.files[name])}
          style={{
            position: 'absolute', left: 0, top: 0, width: tex.w, height: tex.h,
            transformOrigin: '0 0', transform: `translate(${x}px, ${y}px) scale(${k})`, opacity: op,
            WebkitMaskImage: feather && `${feather}, ${featherV}`, WebkitMaskComposite: 'source-in',
          }}
        />
      );
    });
  return (
    <AbsoluteFill style={{backgroundColor: cur === 'relief' ? '#a8b4bf' : '#0d2238'}}>
      {drawLook(cur, 1)}
      {prev !== cur && mix < 1 && <AbsoluteFill style={{opacity: 1 - mix}}>{drawLook(prev, 1)}</AbsoluteFill>}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 青い方眼の場面

const Blueprint: React.FC<{scenes: Scene[]; t: number}> = ({scenes, t}) => {
  let i = scenes.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = scenes.length - 1;
  const s = scenes[i];
  if (!s.spec.blueprint) return null;
  const lt = t - s.start;
  const prevBp = i > 0 && scenes[i - 1].spec.blueprint;
  const nextBp = i < scenes.length - 1 && scenes[i + 1].spec.blueprint;
  let dx = 0;
  if (!prevBp) dx = (1 - easeOut(lt / 0.5)) * W;
  if (!nextBp) dx -= easeIn((lt - (s.dur - 0.4)) / 0.4) * W;
  const drift = (t * 14) % 180;
  return (
    <AbsoluteFill style={{transform: `translateX(${dx}px)`}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 42%, #2f6fb3 0%, #1d4f8c 55%, #12366a 100%)'}} />
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.16) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.16) 2px, transparent 2px),' +
            'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '180px 180px, 180px 180px, 36px 36px, 36px 36px',
          backgroundPosition: `${drift}px ${drift}px`,
        }}
      />
      <AbsoluteFill style={{boxShadow: 'inset 0 0 220px rgba(5,15,40,0.55)'}} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- キャラクター (ステッカー)

const Sticker: React.FC<{ic: Icon; lt: number; dur: number; cam: Cam}> = ({ic, lt, dur, cam}) => {
  if (!ic.src) return null;
  const size = (ic.size ?? 170) * 1.15;
  const delay = ic.delay ?? 0.4;
  const n = Math.min(ic.count ?? 1, 12);
  const spread = ic.spread ?? size * 0.65;
  const screenFrac = !!ic.pos;
  const at = (p: [number, number]): [number, number] => (screenFrac ? [W * p[0], H * p[1]] : toScreen(p, cam));
  let [bx, by] = at((ic.pos ?? ic.at) as [number, number]);
  let hop = 0;
  let moving = false;
  if (ic.to) {
    const [tx, ty] = at(ic.to);
    const travel = ic.travel_time ?? 2.0;
    const u = (lt - delay - 0.3) / travel;
    const m = easeInOut(u);
    bx += (tx - bx) * m;
    by += (ty - by) * m;
    moving = u > 0 && u < 1;
    // 歩くように小さく跳ねる
    if (moving) hop = Math.abs(Math.sin(u * Math.PI * Math.max(3, travel * 3.5)));
  }
  const out = outScale(lt, dur);
  const anim = ic.anim ?? 'bob';
  const items = [];
  for (let j = 0; j < n; j++) {
    const d = delay + j * 0.08;
    const k = popIn(lt - d) * out;
    if (k < 0.01) continue;
    const r = spread * Math.sqrt(j) * 0.9;
    const th = j * 2.39996;
    let x = bx + r * Math.cos(th);
    let y = by + r * Math.sin(th) * 0.8;
    const ph = lt + j * 0.7;
    let sx = 1;
    let sy = 1;
    let rot = (1 - clamp01((lt - d) / 0.35)) * -14;
    if (anim === 'shake') {
      x += Math.sin(lt * 40 + j) * size * 0.025;
      rot += Math.sin(lt * 26 + j) * 7;
    } else if (moving) {
      y -= hop * size * 0.13;
      sy = 1 + (hop - 0.5) * 0.08;
      sx = 2 - sy;
      rot += Math.sin(lt * 9) * 4;
    } else {
      // 呼吸するように少し伸び縮みし、ゆらゆら揺れる
      sy = 1 + Math.sin(ph * 3.4) * 0.03;
      sx = 1 - Math.sin(ph * 3.4) * 0.02;
      rot += Math.sin(ph * 1.7) * 2.5;
    }
    items.push(
      <div key={j} style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size}}>
        <div style={{
          position: 'absolute', left: size * 0.18, right: size * 0.18, bottom: -size * 0.02, height: size * 0.12,
          borderRadius: '50%', background: 'rgba(0,0,0,0.28)', filter: `blur(${size * 0.03}px)`,
          transform: `scale(${k * (1 - hop * 0.25)})`,
        }} />
        <Img
          src={job(ic.src)}
          style={{
            width: size, height: size, objectFit: 'contain', transformOrigin: '50% 92%',
            transform: `rotate(${rot}deg) scale(${k * sx}, ${k * sy})`,
            filter: stickerFilter(size),
          }}
        />
      </div>,
    );
  }
  const labelK = ic.label ? popIn(lt - delay - 0.35) * out : 0;
  return (
    <>
      {items}
      {labelK > 0.01 && (
        <div style={{
          position: 'absolute', left: bx, top: by + size * 0.55, transform: `translate(-50%, 0) scale(${labelK})`,
          background: '#fff', color: '#1d2433', fontFamily: FONT, fontWeight: 800, fontSize: 40,
          padding: '8px 22px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 6px 14px rgba(0,0,0,0.3)',
        }}>{ic.label}</div>
      )}
    </>
  );
};

// ---------------------------------------------------------------- ピン

const Pin: React.FC<{m: Marker; lt: number; dur: number; cam: Cam}> = ({m, lt, dur, cam}) => {
  const delay = m.delay ?? 0.4;
  const t = lt - delay;
  if (t <= 0) return null;
  const [x, y] = toScreen(m.at, cam);
  const out = outScale(lt, dur);
  const fall = 1 - easeIn(t / 0.32);
  const bounce = t > 0.32 ? Math.exp(-(t - 0.32) * 9) * Math.sin((t - 0.32) * 26) * 0.12 : 0;
  const ring = clamp01((t - 0.3) / 0.7);
  const labelK = popIn(t - 0.45) * out;
  return (
    <>
      {ring > 0 && ring < 1 && (
        <div style={{
          position: 'absolute', left: x - 90 * ring, top: y - 34 * ring, width: 180 * ring, height: 68 * ring,
          borderRadius: '50%', border: `${5 * (1 - ring)}px solid rgba(255,255,255,${0.9 * (1 - ring)})`,
        }} />
      )}
      <svg width={84} height={112} viewBox="0 0 84 112" style={{
        position: 'absolute', left: x - 42, top: y - 108 - fall * 260,
        transformOrigin: '50% 100%', transform: `scale(${out * (1 + bounce)}, ${out * (1 - bounce)})`,
        filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.35))', overflow: 'visible',
      }}>
        <path d="M42 108 C 30 80, 6 64, 6 40 A 36 36 0 1 1 78 40 C 78 64, 54 80, 42 108 Z" fill="#e8483f" stroke="#fff" strokeWidth={5} />
        <circle cx={42} cy={40} r={14} fill="#fff" />
      </svg>
      {labelK > 0.01 && m.label && (
        <div style={{
          position: 'absolute', left: x + 50, top: y - 92, transformOrigin: '0% 50%', transform: `scale(${labelK})`,
          background: '#fff', color: '#1d2433', fontFamily: FONT, fontWeight: 800, fontSize: 46,
          padding: '6px 24px', borderRadius: 14, boxShadow: '0 6px 14px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
        }}>{m.label}</div>
      )}
    </>
  );
};

// ---------------------------------------------------------------- 文字

const Banner: React.FC<{b: NonNullable<Scene['spec']['banner']>; lt: number; dur: number}> = ({b, lt, dur}) => {
  const delay = b.delay ?? 0.3;
  const size = b.size ?? 80;
  const fade = 1 - easeIn((lt - (dur - 0.35)) / 0.35);
  const [title, ...rest] = b.lines;
  const words = title.split(' ');
  return (
    <div style={{position: 'absolute', top: H * (b.y ?? 0.18), width: W, textAlign: 'center', opacity: fade}}>
      <div style={{fontFamily: FONT, fontWeight: 900, fontSize: size, color: '#fff', lineHeight: 1.05, letterSpacing: 1}}>
        {words.map((w, i) => {
          const k = popIn(lt - delay - i * 0.09, 0.4);
          return (
            <span key={i} style={{
              display: 'inline-block', margin: '0 12px', textShadow: outline(5),
              transform: `translateY(${(1 - Math.min(k, 1)) * 40}px) scale(${k})`,
            }}>{w}</span>
          );
        })}
      </div>
      {rest.map((line, i) => {
        const k = popIn(lt - delay - words.length * 0.09 - 0.15 - i * 0.1);
        return (
          <div key={i} style={{
            display: 'inline-block', marginTop: 22, padding: '8px 26px', borderRadius: 12,
            background: '#ffd23f', color: '#1d2433', fontFamily: FONT, fontWeight: 900, fontSize: size * 0.48,
            transform: `scale(${k}) rotate(-2deg)`, boxShadow: '0 8px 18px rgba(0,0,0,0.35)', letterSpacing: 2,
          }}>{line}</div>
        );
      })}
    </div>
  );
};

const Year: React.FC<{year: string; lt: number; dur: number; first: boolean}> = ({year, lt, dur, first}) => {
  const k = first ? 1 + (1 - easeOut(lt / 0.3)) * 1.2 : 1;
  const op = first ? clamp01(lt / 0.15) : 1;
  return (
    <div style={{
      position: 'absolute', top: H * 0.115, width: W, textAlign: 'center', opacity: op * outScale(lt, dur, 0.2),
    }}>
      <span style={{
        display: 'inline-block', fontFamily: FONT, fontWeight: 900, fontSize: 96, color: '#fff',
        padding: '0 34px', borderRadius: 18, border: '6px solid #fff', background: 'rgba(20,28,40,0.55)',
        transform: `scale(${k}) rotate(-3deg)`, textShadow: '0 4px 10px rgba(0,0,0,0.4)',
      }}>{year}</span>
    </div>
  );
};

const BigText: React.FC<{tx: TextSpec; lt: number; dur: number}> = ({tx, lt, dur}) => {
  const delay = tx.delay ?? 0.5;
  const k = popIn(lt - delay) * outScale(lt, dur);
  if (k < 0.01) return null;
  let text = tx.text;
  if (tx.count !== undefined) {
    const n = Math.round(tx.count * easeOut((lt - delay) / 1.2));
    text = text.replace('{n}', n.toLocaleString('en-US'));
  }
  const size = tx.size ?? 90;
  return (
    <div style={{position: 'absolute', top: H * (tx.y ?? 0.3) - size * 0.6, width: W, textAlign: 'center'}}>
      <span style={{
        display: 'inline-block', fontFamily: FONT, fontWeight: 900, fontSize: size, color: '#fff',
        transform: `scale(${k})`, textShadow: outline(6), whiteSpace: 'nowrap',
      }}>
        {text.split(' ').map((w, i) => (
          <span key={i} style={{color: tx.accent?.includes(w) ? '#ffd23f' : '#fff'}}>{(i ? ' ' : '') + w}</span>
        ))}
      </span>
    </div>
  );
};

const Captions: React.FC<{caps: Caption[]; t: number}> = ({caps, t}) => {
  const c = caps.find((c) => t >= c.start && t < c.end);
  if (!c) return null;
  const k = 0.9 + 0.1 * easeOut((t - c.start) / 0.12);
  const words = c.words.length ? c.words : c.text.split(' ').map((w) => [w, c.start] as [string, number]);
  return (
    <div style={{position: 'absolute', top: H * 0.635 - 40, width: W, textAlign: 'center', padding: '0 70px', boxSizing: 'border-box'}}>
      <span style={{
        display: 'inline-block', fontFamily: FONT, fontWeight: 800, fontSize: 54, lineHeight: 1.2, color: '#fff',
        textShadow: '0 3px 6px rgba(0,0,0,0.7), 0 0 18px rgba(0,0,0,0.35)', transform: `scale(${k})`,
      }}>
        {words.map(([w, wt], i) => (
          <span key={i} style={{opacity: t >= wt - 0.02 ? 1 : 0.55}}>{(i ? ' ' : '') + w}</span>
        ))}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------- 1 シーン

const SceneLayer: React.FC<{s: Scene; prevYear?: string; props: Props}> = ({s, prevYear, props}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lt = frame / fps;
  const globalFrame = Math.min(Math.round((s.start + lt) * fps), props.camera.length - 1);
  const cam = props.camera[Math.max(0, globalFrame)];
  const sp = s.spec;
  return (
    <AbsoluteFill>
      {(sp.markers ?? []).map((m, i) => <Pin key={`m${i}`} m={m} lt={lt} dur={s.dur} cam={cam} />)}
      {(sp.icons ?? []).map((ic, i) => <Sticker key={`i${i}`} ic={{delay: 0.4 + i * 0.3, ...ic}} lt={lt} dur={s.dur} cam={cam} />)}
      {(sp.texts ?? []).map((tx, i) => <BigText key={`t${i}`} tx={{delay: 0.5 + i * 0.3, ...tx}} lt={lt} dur={s.dur} />)}
      {sp.year && <Year year={sp.year} lt={lt} dur={s.dur} first={sp.year !== prevYear} />}
      {sp.banner && <Banner b={sp.banner} lt={lt} dur={s.dur} />}
      {sp.flash && <AbsoluteFill style={{background: '#fff', opacity: interpolate(lt, [0, 0.45], [0.85, 0], {extrapolateRight: 'clamp'})}} />}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 全体

export const Short: React.FC<Props> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const cam = props.camera[Math.min(frame, props.camera.length - 1)];
  return (
    <AbsoluteFill style={{backgroundColor: '#0d2238', overflow: 'hidden'}}>
      <FontFaces />
      {props.maps.length > 0 && <MapLayer maps={props.maps} cam={cam} scenes={props.scenes} t={t} />}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.32) 100%)'}} />
      <Blueprint scenes={props.scenes} t={t} />
      {props.scenes.map((s, i) => (
        <Sequence key={i} from={Math.round(s.start * fps)} durationInFrames={Math.max(1, Math.round(s.dur * fps))} layout="none">
          <SceneLayer s={s} prevYear={i > 0 ? props.scenes[i - 1].spec.year : undefined} props={props} />
        </Sequence>
      ))}
      <Captions caps={props.captions} t={t} />
      {props.audio && <Audio src={job(props.audio)} />}
    </AbsoluteFill>
  );
};
