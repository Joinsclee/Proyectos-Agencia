import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "../fonts";
import { JC } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type Vertex = { at: number; letter: string; label: string; sub?: string };

// Diagrama limpio del "triángulo de los negocios" (P/V/A). El triángulo se
// dibuja y cada vértice aparece sincronizado. Reemplaza el dibujo manuscrito.
export const TriangleGraphic: React.FC<{
  t: number;
  show: number;
  hide: number;
  vertices: Vertex[]; // [top, bottom-left, bottom-right]
  highlightIdx?: number;
  side?: "left" | "right" | "center";
}> = ({ t, show, hide, vertices, highlightIdx = -1, side = "left" }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide + 0.4) return null;

  const enter = spring({ frame: (t - show) * fps, fps, config: { damping: 14, stiffness: 120, mass: 0.9 } });
  const out = interpolate(t, [hide - 0.4, hide + 0.2], [1, 0], clamp);
  const draw = interpolate(t - show, [0.2, 1.4], [0, 1], { ...clamp });

  const anchor =
    side === "center"
      ? { left: 0, right: 0, marginInline: "auto" as const }
      : side === "left"
        ? { left: 150 }
        : { right: 150 };

  // posiciones de los vértices dentro del panel (porcentaje)
  const pos = [
    { x: 50, y: 12 }, // top
    { x: 13, y: 86 }, // bottom-left
    { x: 87, y: 86 }, // bottom-right
  ];

  return (
    <div
      style={{
        position: "absolute",
        ...anchor,
        top: 150,
        width: 640,
        height: 560,
        opacity: out * interpolate(enter, [0, 1], [0, 1]),
        transform: `scale(${0.92 + enter * 0.08})`,
        transformOrigin: "center center",
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      {/* panel oscuro translúcido para legibilidad sobre la pizarra */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(7, 10, 19, 0.82)",
          border: `1px solid rgba(242,194,75,0.35)`,
          borderRadius: 28,
          boxShadow: "0 40px 110px -30px rgba(0,0,0,0.85)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />
      {/* triángulo que se dibuja */}
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="none">
        <polygon
          points={`${pos[0].x},${pos[0].y} ${pos[1].x},${pos[1].y} ${pos[2].x},${pos[2].y}`}
          fill="none"
          stroke={JC.gold}
          strokeWidth={0.7}
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
          opacity={0.85}
        />
      </svg>
      {/* vértices */}
      {vertices.slice(0, 3).map((v, i) => {
        if (t < v.at) return null;
        const pop = spring({ frame: (t - v.at) * fps, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
        const hot = i === highlightIdx;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${pos[i].x}%`,
              top: `${pos[i].y}%`,
              transform: `translate(-50%, -50%) scale(${pop})`,
              textAlign: "center",
              width: 240,
            }}
          >
            <div
              style={{
                width: 92,
                height: 92,
                margin: "0 auto",
                borderRadius: "50%",
                background: hot ? JC.gold : "rgba(7,10,19,0.9)",
                border: `3px solid ${JC.gold}`,
                color: hot ? JC.ink : JC.gold,
                fontWeight: 800,
                fontSize: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: hot ? "0 0 36px rgba(242,194,75,0.6)" : "0 12px 30px -10px rgba(0,0,0,0.6)",
              }}
            >
              {v.letter}
            </div>
            <div style={{ marginTop: 10, color: JC.cream, fontWeight: 800, fontSize: 30, letterSpacing: "-0.01em" }}>
              {v.label}
            </div>
            {v.sub ? (
              <div style={{ marginTop: 2, color: "rgba(248,250,252,0.6)", fontWeight: 600, fontSize: 21 }}>{v.sub}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
