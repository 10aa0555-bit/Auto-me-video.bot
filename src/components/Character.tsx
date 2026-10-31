import React from "react";
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { characterPath } from "../lib/assets";
import type { Scene } from "../lib/script-schema";

/** 静止PNG/SVGキャラを 上下ゆれ・スライドイン・ポップ で動かす。表情は expression で差し替え */
export const Character: React.FC<{
  character: string;
  expression: string;
  motion: Scene["character_motion"];
  ext: string;
}> = ({ character, expression, motion, ext }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let x = 0;
  let y = 0;
  let scale = 1;
  let rotate = 0;

  if (motion === "bob") {
    y = Math.sin(frame / 8) * 18;
    rotate = Math.sin(frame / 16) * 2;
  } else if (motion === "slide_in") {
    const p = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
    x = interpolate(p, [0, 1], [-900, 0]);
    y = Math.sin(frame / 8) * 10;
  } else if (motion === "pop") {
    scale = spring({ frame, fps, config: { damping: 9, stiffness: 160 } });
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: 520,
        width: 800,
        height: 800,
        transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "50% 90%",
      }}
    >
      <Img src={characterPath(character, expression, ext)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
};
