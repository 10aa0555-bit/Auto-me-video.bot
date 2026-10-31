import React from "react";
import { random, useCurrentFrame } from "remotion";

export const CameraShake: React.FC<{
  intensity?: number;
  active?: boolean;
  children: React.ReactNode;
}> = ({ intensity = 14, active = true, children }) => {
  const frame = useCurrentFrame();
  const x = active ? (random(`x${frame}`) - 0.5) * 2 * intensity : 0;
  const y = active ? (random(`y${frame}`) - 0.5) * 2 * intensity : 0;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translate(${x}px, ${y}px) scale(${active ? 1.05 : 1})` }}>
      {children}
    </div>
  );
};
