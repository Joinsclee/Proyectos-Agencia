import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "../fonts";
import { JC } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type WheelItem = { at: number; letter: string; word: string };

// Volante de inercia CLEE: 4 nodos (C·L·E·E) en cruz que se encienden en orden
// + un anillo dorado que gira (sensación de inercia). spinSpeed alto + glow para
// la reaparición en "los casos de éxito hacen girar el volante".
export const FlywheelCLEE: React.FC<{
  t: number;
  show: number;
  hide: number;
  items: WheelItem[]; // 4: se colocan arriba, derecha, abajo, izquierda
  spinSpeed?: number; // grados por segundo
  glow?: boolean;
  side?: "left" | "right" | "center";
}> = ({ t, show, hide, items, spinSpeed = 14, glow = false, side = "left" }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide + 0.4) return null;

  const enter = spring({ frame: (t - show) * fps, fps, config: { damping: 14, stiffness: 110, mass: 1 } });
  const out = interpolate(t, [hide - 0.4, hide + 0.2], [1, 0], clamp);
  const rot = (t - show) * spinSpeed;
  const anchor = side === "center" ? { left: 0, right: 0, marginInline: "auto" as const } : side === "left" ? { left: 150 } : { right: 150 };

  // posiciones en cruz (porcentaje del panel)
  const pos = [
    { x: 50, y: 13 },
    { x: 87, y: 50 },
    { x: 50, y: 87 },
    { x: 13, y: 50 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        ...anchor,
        top: 150,
        width: 600,
        height: 600,
        opacity: out * enter,
        transform: `scale(${0.9 + enter * 0.1})`,
        transformOrigin: "center center",
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(7, 10, 19, 0.82)",
          border: "1px solid rgba(242,194,75,0.30)",
          borderRadius: 28,
          boxShadow: glow ? "0 0 80px rgba(242,194,75,0.35), 0 40px 110px -30px rgba(0,0,0,0.85)" : "0 40px 110px -30px rgba(0,0,0,0.85)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />
      {/* anillo giratorio dorado (inercia) */}
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: "50px 50px" }}>
          <circle cx="50" cy="50" r="33" fill="none" stroke={JC.gold} strokeWidth="1.1" strokeDasharray="5 7" opacity={0.6} strokeLinecap="round" />
        </g>
        <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(96,165,250,0.25)" strokeWidth="0.6" />
      </svg>
      {/* centro */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          textAlign: "center",
          color: JC.cream,
          fontWeight: 800,
          fontSize: 26,
          letterSpacing: "0.04em",
          lineHeight: 1.1,
        }}
      >
        <div style={{ color: JC.gold, fontSize: 18, letterSpacing: "0.22em" }}>VOLANTE</div>
        CLEE
      </div>
      {/* nodos */}
      {items.slice(0, 4).map((it, i) => {
        if (t < it.at) return null;
        const pop = spring({ frame: (t - it.at) * fps, fps, config: { damping: 11, stiffness: 170, mass: 0.6 } });
        const lit = t >= it.at;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${pos[i].x}%`,
              top: `${pos[i].y}%`,
              transform: `translate(-50%,-50%) scale(${pop})`,
              textAlign: "center",
              width: 200,
            }}
          >
            <div
              style={{
                width: 78,
                height: 78,
                margin: "0 auto",
                borderRadius: "50%",
                background: lit ? JC.gold : "rgba(7,10,19,0.9)",
                border: `3px solid ${JC.gold}`,
                color: lit ? JC.ink : JC.gold,
                fontWeight: 800,
                fontSize: 42,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: lit ? "0 0 28px rgba(242,194,75,0.55)" : "none",
              }}
            >
              {it.letter}
            </div>
            <div style={{ marginTop: 8, color: JC.cream, fontWeight: 700, fontSize: 23, fontVariantLigatures: "none" }}>{it.word}</div>
          </div>
        );
      })}
    </div>
  );
};
