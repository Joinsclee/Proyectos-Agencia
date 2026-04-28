import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, GRADIENTS } from "../theme";

export const Background = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const t = frame / durationInFrames;
  const glowX1 = width * (0.8 + Math.sin(t * Math.PI * 2) * 0.1);
  const glowY1 = height * (0.2 + Math.cos(t * Math.PI * 2) * 0.1);
  const glowX2 = width * (0.15 + Math.cos(t * Math.PI * 2) * 0.1);
  const glowY2 = height * (0.85 + Math.sin(t * Math.PI * 2) * 0.1);

  return (
    <AbsoluteFill style={{ background: GRADIENTS.bgRadial }}>
      {/* Animated grid */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", opacity: 0.06 }}
      >
        <defs>
          <pattern
            id="bg-grid"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke={COLORS.white}
              strokeWidth="1"
            />
          </pattern>
          <radialGradient id="grid-mask">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0.2" />
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill="url(#bg-grid)" />
      </svg>

      {/* Moving glows */}
      <div
        style={{
          position: "absolute",
          left: glowX1 - 400,
          top: glowY1 - 400,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.purpleGlow}55 0%, transparent 60%)`,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: glowX2 - 300,
          top: glowY2 - 300,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.yellow}35 0%, transparent 60%)`,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -200,
          bottom: -200,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.green}25 0%, transparent 60%)`,
          filter: "blur(50px)",
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 40%, ${COLORS.bgDeep}99 100%)`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
