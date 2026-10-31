import React from "react";
import { Easing, interpolate, random, useCurrentFrame } from "remotion";
import type { Scene } from "../lib/script-schema";

const IN_FRAMES = 9;

/** シーン冒頭の入場トランジション (fade / zoom / blur / swipe / shake) */
export const Transition: React.FC<{
  type: Scene["transition"];
  children: React.ReactNode;
}> = ({ type, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, IN_FRAMES], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const style: React.CSSProperties = { position: "absolute", inset: 0 };

  switch (type) {
    case "fade":
      style.opacity = t;
      break;
    case "zoom":
      style.transform = `scale(${1.35 - 0.35 * t})`;
      style.opacity = interpolate(t, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
      break;
    case "blur":
      style.filter = `blur(${(1 - t) * 30}px)`;
      style.opacity = 0.4 + 0.6 * t;
      break;
    case "swipe":
      style.transform = `translateX(${(1 - t) * 1080}px)`;
      break;
    case "shake":
      if (frame < IN_FRAMES) {
        style.transform = `translate(${(random(`tx${frame}`) - 0.5) * 50}px, ${(random(`ty${frame}`) - 0.5) * 50}px)`;
      }
      break;
    default:
      break;
  }
  return <div style={style}>{children}</div>;
};
