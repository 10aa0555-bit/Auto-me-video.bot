import React from "react";
import { Img, interpolate, useCurrentFrame } from "remotion";
import { assetPath } from "../lib/assets";

/** 背景 + パララックス(ゆっくり横移動)。foreground は手前レイヤー(より速く動く) */
export const Background: React.FC<{
  name: string;
  foreground?: string;
  ext: string;
  durationInFrames: number;
}> = ({ name, foreground, ext, durationInFrames }) => {
  const frame = useCurrentFrame();
  const bgX = interpolate(frame, [0, durationInFrames], [-30, 30]);
  const fgX = interpolate(frame, [0, durationInFrames], [-80, 80]);
  return (
    <>
      <Img
        src={assetPath("backgrounds", name, ext)}
        style={{ position: "absolute", left: -60, top: 0, width: 1200, height: 1920, objectFit: "cover", transform: `translateX(${bgX}px)` }}
      />
      {foreground ? (
        <Img
          src={assetPath("backgrounds", foreground, ext)}
          style={{ position: "absolute", left: -120, top: 0, width: 1320, height: 1920, objectFit: "cover", transform: `translateX(${fgX}px)` }}
        />
      ) : null}
    </>
  );
};
