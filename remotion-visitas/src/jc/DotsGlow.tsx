import { AbsoluteFill } from "remotion";

// Patrón halftone de puntos + light-leaks dorados, como en la intro del
// video de referencia. Solo se usa sobre el talking head inicial.
export const DotsGlow: React.FC<{ t: number }> = ({ t }) => {
  const drift = Math.sin(t * 0.45) * 10;
  const breath = 0.75 + Math.sin(t * 0.8) * 0.25;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.5) 1.4px, transparent 1.5px)",
          backgroundSize: "26px 26px",
          backgroundPosition: `${drift}px ${drift * 0.6}px`,
          opacity: 0.16,
          WebkitMaskImage:
            "radial-gradient(ellipse 60% 75% at 78% 65%, black 0%, transparent 70%)",
          maskImage:
            "radial-gradient(ellipse 60% 75% at 78% 65%, black 0%, transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 700,
          left: -260 + drift * 2,
          bottom: -320,
          background:
            "radial-gradient(circle, rgba(242,194,75,0.34) 0%, transparent 62%)",
          opacity: breath,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 620,
          right: -220 - drift * 1.5,
          bottom: -260,
          background:
            "radial-gradient(circle, rgba(245,158,11,0.26) 0%, transparent 60%)",
          opacity: 1.05 - breath * 0.4,
        }}
      />
    </AbsoluteFill>
  );
};
