import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { SceneView } from "./components/Scene";
import { FPS, type Story } from "./lib/script-schema";
import { staticFile } from "remotion";

export const StoryVideo: React.FC<{ story: Story }> = ({ story }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {story.scenes.map((scene, i) => {
        const from = Math.round(scene.start * FPS);
        const duration = Math.max(1, Math.round((scene.end - scene.start) * FPS));
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <SceneView scene={scene} story={story} durationInFrames={duration} />
          </Sequence>
        );
      })}
      {story.audio.narration ? <Audio src={staticFile(story.audio.narration)} /> : null}
      {story.audio.music ? <Audio src={staticFile(story.audio.music)} volume={story.audio.music_volume} loop /> : null}
    </AbsoluteFill>
  );
};
