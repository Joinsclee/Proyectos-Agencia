import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "../fonts";
import { JC } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Medidor que sube hasta "7 HORAS" y desemboca en "CONFIANZA".
// Visualiza el umbral tiempo→confianza (el dato más citable del video).
export const HoursMeter: React.FC<{
  t: number;
  show: number;
  hide: number;
  countDur?: number; // segundos que tarda en llegar a 7
  confianzaAt: number; // tiempo absoluto en que aparece CONFIANZA
  side?: "left" | "right";
}> = ({ t, show, hide, countDur = 3.2, confianzaAt, side = "left" }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide + 0.4) return null;

  const enter = spring({ frame: (t - show) * fps, fps, config: { damping: 14, stiffness: 120, mass: 0.9 } });
  const out = interpolate(t, [hide - 0.4, hide + 0.2], [1, 0], clamp);
  const prog = interpolate(t - show, [0.2, 0.2 + countDur], [0, 1], clamp);
  const hours = Math.round(prog * 7);
  const conf = spring({ frame: (t - confianzaAt) * fps, fps, config: { damping: 12, stiffness: 150, mass: 0.7 } });
  const anchor = side === "left" ? { left: 150 } : { right: 150 };

  return (
    <div
      style={{
        position: "absolute",
        ...anchor,
        top: 300,
        width: 600,
        opacity: out * enter,
        transform: `scale(${0.92 + enter * 0.08})`,
        transformOrigin: "left center",
        background: "rgba(7, 10, 19, 0.84)",
        border: "1px solid rgba(242,194,75,0.3)",
        borderRadius: 24,
        padding: "30px 36px 34px",
        boxShadow: "0 40px 110px -30px rgba(0,0,0,0.85)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <span style={{ color: JC.gold, fontWeight: 800, fontSize: 110, lineHeight: 0.9 }}>{hours}</span>
        <span style={{ color: JC.cream, fontWeight: 800, fontSize: 46, letterSpacing: "-0.01em" }}>HORAS</span>
      </div>
      <div style={{ color: "rgba(248,250,252,0.65)", fontWeight: 600, fontSize: 24, marginTop: 2 }}>
        de media contigo
      </div>
      {/* barra de progreso */}
      <div style={{ marginTop: 20, height: 14, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${prog * 100}%`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${JC.goldDeep}, ${JC.gold})`,
            boxShadow: "0 0 18px rgba(242,194,75,0.5)",
          }}
        />
      </div>
      {/* desemboca en confianza */}
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 16, opacity: Math.max(0, conf) }}>
        <span style={{ color: JC.gold, fontSize: 40, transform: `translateX(${(1 - Math.min(1, Math.max(0, conf))) * -10}px)` }}>→</span>
        <span
          style={{
            transform: `scale(${0.8 + Math.min(1, Math.max(0, conf)) * 0.2})`,
            transformOrigin: "left center",
            background: JC.gold,
            color: JC.ink,
            fontWeight: 800,
            fontSize: 34,
            padding: "10px 26px",
            borderRadius: 999,
            boxShadow: "0 14px 34px -10px rgba(242,194,75,0.5)",
          }}
        >
          CONFIANZA
        </span>
      </div>
    </div>
  );
};
