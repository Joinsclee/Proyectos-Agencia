import { useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../theme";

const PARTICLES = Array.from({ length: 40 }, (_, i) => {
  const seed = i * 9301 + 49297;
  const rand = (s: number) => ((s * 9301 + 49297) % 233280) / 233280;
  return {
    x: rand(seed),
    y: rand(seed + 1),
    speed: 0.2 + rand(seed + 2) * 0.8,
    size: 2 + rand(seed + 3) * 4,
    phase: rand(seed + 4) * Math.PI * 2,
    color: rand(seed + 5) > 0.7 ? COLORS.yellow : COLORS.purpleGlow,
  };
});

export const Particles = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {PARTICLES.map((p, i) => {
        const t = frame * 0.01 * p.speed + p.phase;
        const x = p.x * width + Math.sin(t) * 30;
        const y = ((p.y * height + frame * p.speed) % height);
        const opacity = 0.3 + Math.sin(t * 2) * 0.3;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={p.size}
            fill={p.color}
            opacity={opacity}
            filter="blur(1px)"
          />
        );
      })}
    </svg>
  );
};
