import React from "react";
import { PopText } from "./PopText";
import { theme } from "../styles/theme";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 行を強調語で分割し、強調語は色付きにする */
const splitEmphasis = (line: string, words: string[]) => {
  const valid = words.filter(Boolean);
  if (valid.length === 0) return [{ text: line, emphasized: false }];
  const re = new RegExp(`(${valid.map(escapeRe).join("|")})`, "g");
  return line
    .split(re)
    .filter((t) => t !== "")
    .map((t) => ({ text: t, emphasized: valid.includes(t) }));
};

/**
 * caption の "\n" 区切りの各行を、シーン前半で順番にポップアップ表示。
 * 強調語は yellow / 赤で表示。
 */
export const Caption: React.FC<{
  text: string;
  emphasisWords: string[];
  durationInFrames: number;
  themeColor: string;
  accentColor: string;
}> = ({ text, emphasisWords, durationInFrames, themeColor, accentColor }) => {
  const lines = text.split("\n");
  const span = Math.max(1, Math.floor(durationInFrames * 0.6));
  const step = lines.length > 1 ? Math.min(14, Math.floor(span / lines.length)) : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 1340,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        fontFamily: theme.fontFamily,
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>
          {splitEmphasis(line, emphasisWords).map((seg, j) => (
            <PopText
              key={j}
              delay={4 + i * step}
              color={seg.emphasized ? (j % 2 === 0 ? themeColor : accentColor) : theme.white}
              size={seg.emphasized ? theme.captionSize * 1.15 : theme.captionSize}
            >
              {seg.text}
            </PopText>
          ))}
        </div>
      ))}
    </div>
  );
};
