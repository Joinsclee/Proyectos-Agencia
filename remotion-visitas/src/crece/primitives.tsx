import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  C,
  FONTS,
  EXPO,
  IN_HARD,
  CARD_SHADOW,
  BANNER_SHADOW,
  drawLine,
  useSceneDur,
} from "./theme";

// ───────────────────────────────────────────────────────────
// Eyebrow / Tag — small-caps con guion dorado (idéntico a .tag)
// ───────────────────────────────────────────────────────────
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  color?: string;
  dashColor?: string;
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, color = C.sageDeep, dashColor = C.gold, size = 21, style }) => (
  <div
    style={{
      fontFamily: FONTS.sc,
      fontWeight: 600,
      fontSize: size,
      letterSpacing: "0.32em",
      textTransform: "uppercase",
      color,
      display: "flex",
      alignItems: "center",
      gap: 14,
      ...style,
    }}
  >
    <span style={{ width: 30, height: 1.5, background: dashColor, display: "inline-block" }} />
    {children}
  </div>
);

export const Ornament: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      fontFamily: FONTS.display,
      fontSize: 22,
      letterSpacing: "0.45em",
      color: C.sageDeep,
      textAlign: "center",
      ...style,
    }}
  >
    ·&nbsp;&nbsp;✦&nbsp;&nbsp;·
  </div>
);

// ───────────────────────────────────────────────────────────
// Card — tarjeta editorial de la zona izquierda.
// Entra desde la izquierda (slide + scale + fade), con hairlines
// que se dibujan (sage arriba, gold abajo). Sale con fade si exit=true.
// ───────────────────────────────────────────────────────────
export const Card: React.FC<{
  children: React.ReactNode;
  width?: number;
  left?: number;
  top?: string | number;
  exit?: boolean;
  style?: React.CSSProperties;
}> = ({ children, width = 600, left = 80, top = "50%", exit = true, style }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const dur = useSceneDur() ?? durationInFrames;
  const t = frame / fps;

  const enter = interpolate(t, [0.1, 0.95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  const exitT = dur / fps - 0.6;
  const out = exit
    ? interpolate(t, [exitT, exitT + 0.6], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: IN_HARD,
      })
    : 1;

  const opacity = enter * out;
  const tx = (1 - enter) * -46; // entra desde la izquierda
  const scale = 0.98 + enter * 0.02;

  const topLine = drawLine(t, 0.55);
  const botLine = drawLine(t, 0.7);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: `translateY(-50%) translateX(${tx}px) scale(${scale})`,
        width,
        padding: "50px 56px 52px",
        background: C.banda,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        boxShadow: CARD_SHADOW,
        opacity,
        ...style,
      }}
    >
      {/* hairline superior (sage) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 2,
          background: C.sageDeep,
          transform: `scaleX(${topLine})`,
          transformOrigin: "left center",
        }}
      />
      {/* hairline inferior (gold) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: 2,
          background: C.gold,
          transform: `scaleX(${botLine})`,
          transformOrigin: "right center",
        }}
      />
      {children}
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Banner — banda inferior full-width para CTAs.
// Sube desde abajo; gold hairline arriba. Sale (down) si exit=true.
// ───────────────────────────────────────────────────────────
export const Banner: React.FC<{
  children: React.ReactNode;
  height?: number;
  exit?: boolean;
  style?: React.CSSProperties;
}> = ({ children, height = 300, exit = true, style }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const dur = useSceneDur() ?? durationInFrames;
  const t = frame / fps;

  const enter = interpolate(t, [0.1, 1.0], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  const exitT = dur / fps - 0.6;
  const out = exit
    ? interpolate(t, [exitT, exitT + 0.6], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: IN_HARD,
      })
    : 0;

  const ty = (1 - enter) * 105 + out * 105; // % de su propia altura
  const opacity = exit ? Math.min(enter, 1 - out) : enter;
  const gold = drawLine(t, 0.6, 1.0);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height,
        background: C.bandaSolid,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        boxShadow: BANNER_SHADOW,
        display: "flex",
        alignItems: "center",
        gap: 64,
        padding: "0 110px",
        transform: `translateY(${ty}%)`,
        opacity,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 3,
          background: C.gold,
          transform: `scaleX(${gold})`,
          transformOrigin: "left center",
        }}
      />
      {children}
    </div>
  );
};

// Badge / chip pequeño en small-caps (sage-deep sólido)
export const Chip: React.FC<{
  children: React.ReactNode;
  bg?: string;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, bg = C.sageDeep, color = C.paper, style }) => (
  <span
    style={{
      fontFamily: FONTS.sc,
      fontWeight: 600,
      fontSize: 18,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      color,
      background: bg,
      padding: "9px 20px",
      borderRadius: 2,
      boxShadow: "0 6px 16px rgba(31,31,27,0.18)",
      ...style,
    }}
  >
    {children}
  </span>
);
