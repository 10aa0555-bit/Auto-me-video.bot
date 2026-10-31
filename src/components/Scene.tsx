import React from "react";
import { Audio, Easing, interpolate, useCurrentFrame } from "remotion";
import { Background } from "./Background";
import { CameraShake } from "./CameraShake";
import { Caption } from "./Caption";
import { Character } from "./Character";
import { Transition } from "./Transition";
import { assetPath } from "../lib/assets";
import type { Scene as SceneT, Story } from "../lib/script-schema";

export const SceneView: React.FC<{
  scene: SceneT;
  story: Story;
  durationInFrames: number;
}> = ({ scene, story, durationInFrames }) => {
  const frame = useCurrentFrame();
  const ext = story.asset_ext;

  // カメラ演出
  let scale = 1;
  let x = 0;
  if (scene.animation === "fast_zoom_in") {
    scale = interpolate(frame, [0, 12], [1, 1.12], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  } else if (scene.animation === "slow_zoom_in") {
    scale = interpolate(frame, [0, durationInFrames], [1, 1.1]);
  } else if (scene.animation === "swipe_left") {
    x = interpolate(frame, [0, durationInFrames], [40, -40]);
  } else if (scene.animation === "swipe_right") {
    x = interpolate(frame, [0, durationInFrames], [-40, 40]);
  }

  return (
    <Transition type={scene.transition}>
      <CameraShake active={scene.animation === "shake"}>
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${x}px) scale(${scale})` }}>
          <Background name={scene.background} foreground={scene.foreground} ext={ext} durationInFrames={durationInFrames} />
          {scene.character ? (
            <Character character={scene.character} expression={scene.expression} motion={scene.character_motion} ext={ext} />
          ) : null}
        </div>
      </CameraShake>
      <Caption
        text={scene.caption}
        emphasisWords={scene.emphasis_words}
        durationInFrames={durationInFrames}
        themeColor={story.style.theme_color}
        accentColor={story.style.accent_color}
      />
      {scene.sfx ? <Audio src={assetPath("sfx", scene.sfx, "wav")} /> : null}
    </Transition>
  );
};
