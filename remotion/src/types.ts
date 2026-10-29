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

export type SceneSpec = {
  narration?: string;
  icons?: Icon[];
  markers?: Marker[];
  texts?: TextSpec[];
  banner?: {lines: string[]; y?: number; delay?: number; size?: number};
  year?: string;
  base?: 'satellite' | 'relief';
  blueprint?: boolean;
  flash?: boolean;
};

export type Scene = {spec: SceneSpec; start: number; dur: number};

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
  credits?: string[];
  audio: string;
  captionStyle: string;
};
