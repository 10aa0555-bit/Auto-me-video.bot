import React, {useMemo, useState} from 'react';
import {AbsoluteFill, Audio, Img, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {H, W, clamp01, easeInOut, easeOut} from '../util';

/**
 * アニメの名言集 (日本語・縦書き・声なし)。
 * 背景はオリジナルのアニメ調の景色 (AI)。名言は 1 文字ずつ浮かび、桜・雨・雪・光の粒・火の粉が舞う。
 */

export type QuoteScene = {
  start: number;
  dur: number;
  kind: 'intro' | 'quote' | 'outro';
  text?: string; // 名言 (改行は \n)
  who?: string; // 言った人
  work?: string; // 作品名
  bg?: string; // job/ の背景画像
  particles?: 'sakura' | 'rain' | 'snow' | 'light' | 'embers' | 'fireflies';
  tint?: string; // 画像が無いときの空の色
};
export type QuotesProps = {frames: number; fps: number; title: string[]; scenes: QuoteScene[]; audio?: string};

const FONT = 'Shippori Mincho';

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/** 舞うもの。 */
const Particles: React.FC<{kind?: string; t: number}> = ({kind, t}) => {
  const p = useMemo(() => {
    const r = rng(kind ? kind.length * 7 + 3 : 3);
    return Array.from({length: 70}).map(() => ({x: r() * W, y: r() * H, s: 0.5 + r() * 1.2, sp: 0.5 + r(), ph: r() * 6.28}));
  }, [kind]);
  if (!kind) return null;
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
      {p.map((q, i) => {
        if (kind === 'rain') {
          const y = ((q.y + t * 1500 * q.sp) % (H + 120)) - 60;
          const x = q.x - ((t * 1500 * q.sp) % (H + 120)) * 0.12;
          return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 70} stroke="#dbe9ff" strokeWidth={2} opacity={0.35} />;
        }
        if (kind === 'snow') {
          const y = ((q.y + t * 70 * q.sp) % (H + 40)) - 20;
          return <circle key={i} cx={q.x + Math.sin(t + q.ph) * 30} cy={y} r={3 + q.s * 4} fill="#ffffff" opacity={0.75} />;
        }
        if (kind === 'sakura') {
          const y = ((q.y + t * 90 * q.sp) % (H + 60)) - 30;
          const x = q.x + Math.sin(t * 0.8 + q.ph) * 70 - t * 20 * q.sp;
          return (
            <g key={i} transform={`translate(${((x % W) + W) % W} ${y}) rotate(${t * 60 * q.sp + q.ph * 57}) scale(${q.s})`}>
              <path d="M 0 -10 C 8 -10 10 0 0 10 C -10 0 -8 -10 0 -10 Z" fill="#ffc6d9" opacity={0.85} />
            </g>
          );
        }
        if (kind === 'embers') {
          const y = H - ((q.y + t * 120 * q.sp) % (H + 60));
          return <circle key={i} cx={q.x + Math.sin(t * 2 + q.ph) * 40} cy={y} r={2 + q.s * 3} fill={i % 2 ? '#ffb347' : '#ff6a2a'} opacity={0.4 + 0.5 * Math.abs(Math.sin(t * 3 + q.ph))} />;
        }
        // light / fireflies: ゆっくり漂う光の粒
        return <circle key={i} cx={q.x + Math.sin(t * 0.3 + q.ph) * 50} cy={q.y + Math.cos(t * 0.25 + q.ph) * 40} r={2 + q.s * 3}
          fill={kind === 'fireflies' ? '#fff3a0' : '#ffffff'} opacity={0.25 + 0.4 * Math.abs(Math.sin(t * 1.5 + q.ph))} />;
      })}
    </svg>
  );
};

/** 背景 (画像をゆっくりズーム。無いときはグラデーションの空)。 */
const Background: React.FC<{s: QuoteScene; lt: number}> = ({s, lt}) => {
  const z = 1.06 + 0.08 * easeInOut(clamp01(lt / s.dur));
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {s.bg ? (
        <Img src={staticFile(`job/${s.bg}`)} style={{width: W, height: H, objectFit: 'cover', transform: `scale(${z}) translateY(${-lt * 4}px)`}} />
      ) : (
        <AbsoluteFill style={{background: `linear-gradient(${s.tint ?? '#1b2a4a'}, #0b0f1c)`}} />
      )}
      {/* 文字が読めるように、上下と真ん中を少し暗く */}
      <AbsoluteFill style={{background: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.6))'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.45) 100%)'}} />
    </AbsoluteFill>
  );
};

const glow = '0 0 18px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.9), 0 2px 2px rgba(0,0,0,0.9)';

/** 縦書きの名言 (1 文字ずつ浮かぶ) と出典。 */
const Quote: React.FC<{s: QuoteScene; lt: number}> = ({s, lt}) => {
  const text = s.text ?? '';
  const chars = Array.from(text);
  const per = Math.min(0.11, (s.dur * 0.45) / Math.max(1, chars.length));
  const out = clamp01((s.dur - lt) / 0.5);
  const done = 0.5 + chars.length * per;
  const lines = text.split('\n');
  const longest = Math.max(...lines.map((l) => Array.from(l).length));
  // 列の長さを画面の約半分 (上 0.13H〜下 0.63H) に収め、出典 (下 0.2H) と重ならないようにする
  const size = Math.min(92, Math.floor((H * 0.5) / (Math.max(6, longest) * 1.12)));
  let idx = 0;
  return (
    <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: H * 0.13, opacity: out}}>
      <div style={{writingMode: 'vertical-rl', fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.7, letterSpacing: size * 0.12,
        color: '#ffffff', textShadow: glow}}>
        {lines.map((line, li) => (
          <div key={li}>
            {Array.from(line).map((ch) => {
              const k = clamp01((lt - 0.5 - idx++ * per) / 0.35);
              return <span key={idx} style={{opacity: k, filter: `blur(${(1 - k) * 6}px)`, display: 'inline-block', transform: `translateY(${(1 - k) * -10}px)`}}>{ch}</span>;
            })}
          </div>
        ))}
      </div>
      {s.who && (
        <div style={{position: 'absolute', bottom: H * 0.2, width: W, textAlign: 'center', opacity: easeOut(clamp01((lt - done) / 0.6)) * out,
          fontFamily: FONT, fontWeight: 800, color: '#f3e3b0', textShadow: glow}}>
          <div style={{width: 120, height: 2, background: '#f3e3b0', margin: '0 auto 18px', opacity: 0.8}} />
          <div style={{fontSize: 46}}>― {s.who}</div>
          {s.work && <div style={{fontSize: 36, marginTop: 8, opacity: 0.9}}>『{s.work}』</div>}
        </div>
      )}
    </div>
  );
};

const Center: React.FC<{lines: string[]; lt: number; dur: number; small?: string}> = ({lines, lt, dur, small}) => {
  const out = clamp01((dur - lt) / 0.4);
  return (
    <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: out}}>
      {lines.map((l, i) => {
        const k = easeOut(clamp01((lt - 0.2 - i * 0.35) / 0.5));
        return (
          <div key={i} style={{fontFamily: FONT, fontWeight: 800, fontSize: i === 1 ? 120 : 76, color: i === 1 ? '#f3e3b0' : '#ffffff', textShadow: glow,
            opacity: k, transform: `translateY(${(1 - k) * 20}px)`, letterSpacing: 6, lineHeight: 1.35}}>{l}</div>
        );
      })}
      {small && <div style={{marginTop: 40, fontFamily: FONT, fontWeight: 800, fontSize: 44, color: '#ffffff', opacity: easeOut(clamp01((lt - 1.2) / 0.5)), textShadow: glow}}>{small}</div>}
    </div>
  );
};

export const Quotes: React.FC<QuotesProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const [handle] = useState(() => delayRender('mincho'));
  useMemo(() => {
    const all = props.title.join('') + props.scenes.map((s) => (s.text ?? '') + (s.who ?? '') + (s.work ?? '')).join('') + '―『』あなたの好きな名言はコメントで教えて！';
    // 明朝体の CSS (文字の範囲ごとに分かれたフォント) を読み込み、使う文字の分だけ待つ
    const done = () => continueRender(handle);
    const href = staticFile('fonts/shippori/shippori-800.css');
    let link = document.querySelector(`link[href="${href}"]`) as HTMLLinkElement | null;
    const wait = () => document.fonts.load(`800 80px "${FONT}"`, all).then(() => document.fonts.ready).finally(done);
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = wait;
      link.onerror = done;
      document.head.appendChild(link);
    } else {
      wait();
    }
  }, [handle, props]);
  let i = props.scenes.findIndex((s) => t < s.start + s.dur);
  if (i < 0) i = props.scenes.length - 1;
  const s = props.scenes[i];
  const lt = t - s.start;
  const fin = clamp01(lt / 0.6);
  const prev = i > 0 ? props.scenes[i - 1] : null;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {prev && fin < 1 && <Background s={prev} lt={t - prev.start} />}
      <AbsoluteFill style={{opacity: fin}}>
        <Background s={s} lt={lt} />
        <Particles kind={s.particles} t={t} />
      </AbsoluteFill>
      {s.kind === 'intro' && <Center lines={props.title} lt={lt} dur={s.dur} />}
      {s.kind === 'quote' && <Quote s={s} lt={lt} />}
      {s.kind === 'outro' && <Center lines={['あなたの好きな', '名言は？']} lt={lt} dur={s.dur + 1} small="コメントで教えて！" />}
      {/* 名言の番号 (左上) */}
      {s.kind === 'quote' && (
        <div style={{position: 'absolute', top: H * 0.07, left: 70, fontFamily: FONT, fontWeight: 800, fontSize: 40, color: '#f3e3b0', textShadow: glow, opacity: fin}}>
          {props.scenes.filter((x, j) => x.kind === 'quote' && j <= i).length} / {props.scenes.filter((x) => x.kind === 'quote').length}
        </div>
      )}
      {props.audio && <Audio src={staticFile(`job/${props.audio}`)} />}
    </AbsoluteFill>
  );
};
