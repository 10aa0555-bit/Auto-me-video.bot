export type LonLat = [number, number];

export type Icon = {
  name?: string;
  ai?: string;
  src?: string;
  kind?: 'ai' | 'flat';
  at?: LonLat;
  pos?: [number, number];
  to?: [number, number];
  travel_time?: number;
  size?: number;
  delay?: number;
  count?: number;
  spread?: number;
  anim?: 'bob' | 'shake';
  label?: string;
};

export type Marker = {at: LonLat; type?: string; label?: string; delay?: number};

export type TextSpec = {
  text: string;
  count?: number;
  accent?: string[];
  y?: number;
  size?: number;
  delay?: number;
};

export type LineSpec = {
  path: LonLat[];
  style?: 'solid' | 'dashed' | 'glow' | 'arrow' | 'arrow_dashed';
  color?: string;
  width?: number;
  delay?: number;
  draw_time?: number;
  label?: string;
  count?: number;
};

export type Swarm = {pts?: [number, number, number][]; keep?: boolean; color?: string; delay?: number; duration?: number; size?: number};

export type GhostSpec = {
  of: string;
  frames?: [number, number][][][];
  end?: LonLat;
  delay?: number;
  move_time?: number;
  fill?: string;
  label?: string;
};

export type PhotoSpec = {
  q: string;
  src?: string;
  caption?: string;
  pos?: [number, number];
  size?: number;
  delay?: number;
  tilt?: number;
};

export type Bar = {label: string; value: number; color?: string};

export type SceneSpec = {
  dim?: boolean;
  photos?: PhotoSpec[];
  ghosts?: GhostSpec[];
  bars?: {title?: string; unit?: string; items: Bar[]; y?: number; delay?: number};
  outline?: string[];
  lines?: LineSpec[];
  swarms?: Swarm[];
  narration?: string;
  icons?: Icon[];
  markers?: Marker[];
  texts?: TextSpec[];
  banner?: {lines: string[]; y?: number; delay?: number; size?: number; badge?: boolean};
  year?: string;
  base?: 'satellite' | 'relief';
  blueprint?: boolean;
  flash?: boolean;
};

export type Scene = {
  spec: SceneSpec;
  start: number;
  dur: number;
  fillsBefore: Record<string, string | null>;
  fillsAfter: Record<string, string | null>;
};

export type Caption = {text: string; start: number; end: number; words: [string, number][]};

export type MapTex = {
  x0: number;
  y0: number;
  ppu: number;
  w: number;
  h: number;
  files: Record<string, string>;
};

export type Props = {
  name: string;
  fps: number;
  frames: number;
  scenes: Scene[];
  captions: Caption[];
  camera: [number, number, number][];
  maps: MapTex[];
  shapes: Record<string, [number, number][][]>;
  bboxes?: Record<string, [number, number, number, number]>;
  credits?: string[];
  audio: string;
  captionStyle: string;
};
