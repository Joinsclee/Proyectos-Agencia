import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "./fonts";
import { JC } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Etiqueta dorada rotada estilo "Semana 3" del video de referencia.
export const Sticker: React.FC<{
  t: number;
  show: number;
  hide: number;
  text: string;
  sub?: string;
  position: React.CSSProperties;
  rotate?: number;
}> = ({ t, show, hide, text, sub, position, rotate = -3 }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide + 0.4) return null;

  const pop = spring({
    frame: (t - show) * fps,
    fps,
    config: { damping: 11, stiffness: 160, mass: 0.7 },
  });
  const out = interpolate(t, [hide - 0.25, hide + 0.15], [1, 0], clamp);
  const wobble = Math.sin((t - show) * 2.2) * 0.8;

  return (
    <div
      style={{
        position: "absolute",
        ...position,
        transform: `rotate(${rotate + wobble}deg) scale(${pop * out})`,
        transformOrigin: "center center",
        opacity: out,
        background: JC.gold,
        color: JC.ink,
        fontFamily: JAKARTA,
        fontWeight: 800,
        fontSize: 34,
        lineHeight: 1.1,
        letterSpacing: "-0.01em",
        padding: sub ? "16px 32px 14px" : "16px 32px",
        borderRadius: 14,
        boxShadow:
          "0 16px 40px -12px rgba(7,10,19,0.45), inset 0 -3px 0 rgba(7,10,19,0.18)",
        textAlign: "center",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
      {sub ? (
        <div
          style={{
            fontSize: 21,
            fontWeight: 700,
            opacity: 0.75,
            marginTop: 3,
            letterSpacing: "0.02em",
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};
