import React from 'react';
import {Composition} from 'remotion';
import {Short} from './Short';
import {WhatIf, WIProps} from './whatif/WhatIf';
import {CharTest} from './whatif/CharTest';
import {Story, StoryProps} from './whatif/Story';
import {Cosmic, CosmicProps} from './cosmic/Cosmic';
import type {Props} from './types';

export const Root: React.FC = () => (
  <>
  <Composition
    id="Short"
    component={Short}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={{} as Props}
    calculateMetadata={({props}) => ({durationInFrames: Math.max(1, props.frames ?? 30), fps: props.fps ?? 30})}
  />
  <Composition
    id="WhatIf"
    component={WhatIf}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={{} as WIProps}
    calculateMetadata={({props}) => ({durationInFrames: Math.max(1, props.frames ?? 30), fps: props.fps ?? 30})}
  />
  <Composition
    id="Story"
    component={Story}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={{} as StoryProps}
    calculateMetadata={({props}) => ({durationInFrames: Math.max(1, props.frames ?? 30), fps: props.fps ?? 30})}
  />
  <Composition
    id="Cosmic"
    component={Cosmic}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={{} as CosmicProps}
    calculateMetadata={({props}) => ({durationInFrames: Math.max(1, props.frames ?? 30), fps: props.fps ?? 30})}
  />
  <Composition id="CharTest" component={CharTest} width={1080} height={1920} fps={30} durationInFrames={90} />
  </>
);
