import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "../fonts";
import { JC } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Chip de CTA de comentario (abajo-centro), donde Cristhian pide comentar.
export const CommentCta: React.FC<{
  t: number;
  show: number;
  hide: number;
  label: string;
}> = ({ t, show, hide, label }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide + 0.3) return null;

  const pop = spring({ frame: (t - show) * fps, fps, config: { damping: 12, stiffness: 160, mass: 0.7 } });
  const out = interpolate(t, [hide - 0.25, hide + 0.15], [1, 0], clamp);
  const rotate = -2 + Math.sin((t - show) * 2.2) * 0.7;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 150,
        display: "flex",
        justifyContent: "center",
        opacity: out,
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${pop}) rotate(${rotate}deg)`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(7, 10, 19, 0.9)",
          border: `2px solid ${JC.gold}`,
          color: JC.cream,
          fontWeight: 800,
          fontSize: 34,
          padding: "16px 36px",
          borderRadius: 999,
          boxShadow: "0 18px 44px -14px rgba(0,0,0,0.55)",
        }}
      >
        <span style={{ fontSize: 38 }}>💬</span>
        {label}
      </div>
    </div>
  );
};
