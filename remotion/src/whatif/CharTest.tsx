import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useThree} from '@react-three/fiber';
import {H, W} from '../util';
import {Character, Face} from './Character';

const Cam: React.FC = () => {
  const {camera} = useThree();
  camera.position.set(0, 3.0, 11);
  camera.lookAt(0, 2.3, 0);
  return null;
};

/** キャラの見た目確認用 (6 つの表情を並べる)。 */
export const CharTest: React.FC = () => {
  const t = useCurrentFrame() / 30;
  const faces: Face[] = ['normal', 'happy', 'shock', 'scream', 'worried', 'smug'];
  const colors = ['#e0a83a', '#7aa6d9', '#8fbf6a', '#e8483f', '#c9b07a', '#b58ad6'];
  return (
    <AbsoluteFill style={{background: '#9fd0f0'}}>
      <ThreeCanvas width={W} height={H} camera={{fov: 40, near: 0.5, far: 200}} gl={{antialias: true, preserveDrawingBuffer: true}} shadows>
        <Cam />
        <hemisphereLight args={['#eaf5ff', '#5d5a52', 0.95]} />
        <directionalLight position={[20, 40, 25]} intensity={1.9} color="#fff4e0" castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[80, 80]} /><meshToonMaterial color="#9cd27a" /></mesh>
        <Character position={[0, 0, 0]} face={faces[Math.floor(t * 3) % 6]} talk={0} wave={Math.floor(t * 3) % 6 === 1 ? 1 : 0}
          time={t} seed={2} spec={{shirt: colors[Math.floor(t * 3) % 6], hair: '#2a1f1a'}} rotation={0.25} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
