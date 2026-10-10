import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "./fonts";
import { JC } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const LEVER_SHOW = 494.8;
export const LEVER_HIDE = 528.9;

// Chips sincronizados con la mención de cada palanca en el audio
const CHIPS: { at: number; label: string; icon: string }[] = [
  { at: 502.2, label: "CÓDIGO", icon: "⌨️" },
  { at: 511.5, label: "PERSONAS", icon: "🤝" },
  { at: 516.4, label: "DINERO", icon: "💰" },
  { at: 519.8, label: "CONOCIMIENTO", icon: "🧠" },
  { at: 522.3, label: "TIEMPO", icon: "⏳" },
];

// Columna izquierda con las palancas, aparece chip a chip mientras las nombra.
export const LeverChips: React.FC<{ t: number }> = ({ t }) => {
  const { fps } = useVideoConfig();
  if (t < LEVER_SHOW || t > LEVER_HIDE + 0.4) return null;

  const out = interpolate(t, [LEVER_HIDE - 0.3, LEVER_HIDE + 0.2], [1, 0], clamp);
  const titlePop = spring({
    frame: (t - LEVER_SHOW) * fps,
    fps,
    config: { damping: 12, stiffness: 150, mass: 0.7 },
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 110,
        top: 330,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        opacity: out,
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${titlePop * out}) rotate(-2deg)`,
          transformOrigin: "left center",
          background: JC.gold,
          color: JC.ink,
          fontWeight: 800,
          fontSize: 30,
          padding: "12px 26px",
          borderRadius: 12,
          boxShadow: "0 14px 36px -12px rgba(7,10,19,0.4)",
          alignSelf: "flex-start",
        }}
      >
        APALÁNCATE EN:
      </div>
      {CHIPS.map((c, i) => {
        if (t < c.at) return null;
        const pop = spring({
          frame: (t - c.at) * fps,
          fps,
          config: { damping: 11, stiffness: 170, mass: 0.6 },
        });
        return (
          <div
            key={i}
            style={{
              transform: `translateX(${(1 - pop) * -60}px) scale(${0.7 + pop * 0.3})`,
              transformOrigin: "left center",
              opacity: pop * out,
              background: "rgba(7, 10, 19, 0.88)",
              border: `2px solid ${JC.gold}`,
              color: JC.cream,
              fontWeight: 800,
              fontSize: 32,
              padding: "14px 30px",
              borderRadius: 999,
              boxShadow: "0 16px 40px -14px rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              gap: 16,
              alignSelf: "flex-start",
            }}
          >
            <span style={{ fontSize: 34 }}>{c.icon}</span>
            <span>
              <span style={{ color: JC.gold, marginRight: 12 }}>{i + 1}.</span>
              {c.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
