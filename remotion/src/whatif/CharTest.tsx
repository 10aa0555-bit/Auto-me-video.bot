import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {useThree} from '@react-three/fiber';
import {City} from './City';
import {Character} from './Character';

const Cam: React.FC = () => {
  const {camera} = useThree();
  camera.position.set(-6, 9, 22);
  camera.lookAt(-6, 3, 6);
  return null;
};

/** キャラクターの見た目を確かめるための試作 (本番では使わない)。 */
export const CharTest: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = f / fps;
  return (
    <AbsoluteFill style={{background: '#a9d6f2'}}>
      <ThreeCanvas width={1080} height={1920} camera={{fov: 40, near: 0.5, far: 900}} gl={{antialias: true, preserveDrawingBuffer: true}} shadows
        style={{filter: 'saturate(1.25) contrast(1.06)'}}>
        <Cam />
        <color attach="background" args={['#a9d6f2']} />
        <fog attach="fog" args={['#bfe0f5', 120, 500]} />
        <hemisphereLight args={['#eaf5ff', '#8a7d6a', 1.0]} />
        <directionalLight position={[30, 60, 40]} intensity={1.8} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} />
        <City s={{t, sea: -1.6, cars: 1, people: 0.6}} />
        <Character position={[-8.5, 0.3, 10]} face="happy" talk={Math.abs(Math.sin(t * 9))} wave={1} walk={t} spec={{shirt: '#e8483f'}} />
        <Character position={[-5, 0.3, 9]} face="shock" spec={{shirt: '#3d7fd8', hair: '#2b2b2b'}} rotation={-0.4} />
        <Character position={[-2, 0.3, 11]} face="worried" spec={{shirt: '#57b36a', hair: '#d9a441'}} rotation={-0.8} hop={Math.abs(Math.sin(t * 6)) * 0.6} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
