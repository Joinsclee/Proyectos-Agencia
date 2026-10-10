import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "../fonts";
import { JC } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const BLOCKS = [
  { key: "PAIN", es: "Dolor", bg: "#EF4444", glow: "rgba(239,68,68,0.5)" },
  { key: "GAIN", es: "Solución", bg: JC.blue, glow: "rgba(0,112,243,0.5)" },
  { key: "CLAIM", es: "Llamado a la acción", bg: JC.gold, glow: "rgba(242,194,75,0.5)" },
];

// Framework "una idea por reel": PAIN → GAIN → CLAIM en cascada horizontal.
// Banda superior (Cristhian habla centrado abajo): no tapa su cara.
export const PainGainClaim: React.FC<{ t: number; show: number; hide: number }> = ({ t, show, hide }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide + 0.4) return null;

  const enter = interpolate(t - show, [0, 0.4], [0, 1], clamp);
  const out = interpolate(t, [hide - 0.4, hide + 0.2], [1, 0], clamp);
  const titlePop = spring({ frame: (t - show) * fps, fps, config: { damping: 13, stiffness: 130, mass: 0.8 } });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 92,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: Math.min(enter, out),
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${titlePop}) rotate(-1.5deg)`,
          background: JC.gold,
          color: JC.ink,
          fontWeight: 800,
          fontSize: 28,
          padding: "10px 26px",
          borderRadius: 12,
          marginBottom: 22,
          boxShadow: "0 14px 36px -12px rgba(7,10,19,0.4)",
        }}
      >
        Comparte UNA idea por reel
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {BLOCKS.map((b, i) => {
          const at = show + 0.5 + i * 0.7;
          const pop = spring({ frame: (t - at) * fps, fps, config: { damping: 12, stiffness: 160, mass: 0.7 } });
          const vis = t >= at ? pop : 0;
          return (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  transform: `translateY(${(1 - vis) * 24}px) scale(${0.85 + vis * 0.15})`,
                  opacity: vis,
                  background: b.bg,
                  color: b.key === "CLAIM" ? JC.ink : "#fff",
                  borderRadius: 18,
                  padding: "20px 30px",
                  minWidth: 300,
                  textAlign: "center",
                  boxShadow: `0 18px 48px -14px ${b.glow}`,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 44, letterSpacing: "-0.01em", lineHeight: 1 }}>{b.key}</div>
                <div style={{ fontWeight: 600, fontSize: 26, marginTop: 6, opacity: 0.92 }}>{b.es}</div>
              </div>
              {i < BLOCKS.length - 1 ? (
                <span style={{ color: JC.cream, fontSize: 44, opacity: t >= at + 0.5 ? 1 : 0, transition: "none" }}>→</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
