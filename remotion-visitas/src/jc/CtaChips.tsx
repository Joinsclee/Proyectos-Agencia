import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "./fonts";
import { JC } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const SHOW = 22.56;
const HIDE = 26.28;

const CHIPS: { at: number; icon: string; label: string }[] = [
  { at: 22.9, icon: "💬", label: "Déjame un comentario" },
  { at: 24.5, icon: "📞", label: "Agenda tu consultoría" },
];

// Chips del CTA temprano de la intro ("comentario o llamada")
export const CtaChips: React.FC<{ t: number }> = ({ t }) => {
  const { fps } = useVideoConfig();
  if (t < SHOW || t > HIDE + 0.3) return null;

  const out = interpolate(t, [HIDE - 0.2, HIDE + 0.2], [1, 0], clamp);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 140,
        display: "flex",
        justifyContent: "center",
        gap: 28,
        opacity: out,
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      {CHIPS.map((c, i) => {
        if (t < c.at) return null;
        const pop = spring({
          frame: (t - c.at) * fps,
          fps,
          config: { damping: 11, stiffness: 170, mass: 0.6 },
        });
        const rotate = (i === 0 ? -2 : 2) + Math.sin((t - c.at) * 2.4) * 0.8;
        return (
          <div
            key={i}
            style={{
              transform: `scale(${pop}) rotate(${rotate}deg)`,
              background: i === 0 ? "rgba(7, 10, 19, 0.88)" : JC.gold,
              color: i === 0 ? JC.cream : JC.ink,
              border: i === 0 ? `2px solid ${JC.gold}` : "none",
              fontWeight: 800,
              fontSize: 32,
              padding: "16px 34px",
              borderRadius: 999,
              boxShadow: "0 18px 44px -14px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span style={{ fontSize: 36 }}>{c.icon}</span>
            {c.label}
          </div>
        );
      })}
    </div>
  );
};
