import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../styles/theme";

/** バンッと弾んで出るテキスト。delay(フレーム)後に表示 */
export const PopText: React.FC<{
  children: React.ReactNode;
  delay?: number;
  color?: string;
  size?: number;
}> = ({ children, delay = 0, color = theme.white, size = theme.captionSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 220, mass: 0.6 } });
  const visible = frame >= delay;
  return (
    <span
      style={{
        display: "inline-block",
        opacity: visible ? 1 : 0,
        transform: `scale(${visible ? p : 0})`,
        color,
        fontSize: size,
        fontWeight: 900,
        fontFamily: theme.fontFamily,
        lineHeight: 1.2,
        WebkitTextStroke: `${theme.captionStroke}px ${theme.black}`,
        paintOrder: "stroke fill",
        textShadow: "0 8px 0 rgba(0,0,0,.55)",
      }}
    >
      {children}
    </span>
  );
};
