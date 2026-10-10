import { spring, useVideoConfig } from "remotion";

const CORAL = "#D9826B";

// Robot pixel-art estilo 8-bit como los del video de referencia (esquinas
// de la title card "gracias a las herramientas de IA").
export const PixelRobot: React.FC<{
  t: number;
  appear: number;
  size: number;
  flip?: boolean;
  style?: React.CSSProperties;
}> = ({ t, appear, size, flip = false, style }) => {
  const { fps } = useVideoConfig();
  if (t < appear) return null;

  const pop = spring({
    frame: (t - appear) * fps,
    fps,
    config: { damping: 10, stiffness: 180, mass: 0.6 },
  });
  const bob = Math.sin((t - appear) * 3.1) * 4;
  const u = size / 10; // unidad de "pixel"

  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        transform: `scale(${pop * (flip ? -1 : 1)}, ${pop}) translateY(${bob}px)`,
        transformOrigin: "center bottom",
        pointerEvents: "none",
        filter: `drop-shadow(${u * 1.6}px ${u * 2.2}px 0 rgba(217,130,107,0.28))`,
        ...style,
      }}
    >
      {/* antena */}
      <div style={{ position: "absolute", left: u * 4.4, top: 0, width: u * 1.2, height: u * 1.4, background: CORAL }} />
      {/* cabeza/cuerpo */}
      <div style={{ position: "absolute", left: u, top: u * 1.4, width: u * 8, height: u * 6, background: CORAL }} />
      {/* ojos */}
      <div style={{ position: "absolute", left: u * 2.6, top: u * 3.2, width: u * 1.3, height: u * 1.6, background: "#FFF6E9" }} />
      <div style={{ position: "absolute", left: u * 6.1, top: u * 3.2, width: u * 1.3, height: u * 1.6, background: "#FFF6E9" }} />
      {/* orejas */}
      <div style={{ position: "absolute", left: 0, top: u * 3, width: u, height: u * 2.4, background: CORAL }} />
      <div style={{ position: "absolute", left: u * 9, top: u * 3, width: u, height: u * 2.4, background: CORAL }} />
      {/* patas */}
      <div style={{ position: "absolute", left: u * 2.2, top: u * 7.4, width: u * 1.4, height: u * 1.8, background: CORAL }} />
      <div style={{ position: "absolute", left: u * 6.4, top: u * 7.4, width: u * 1.4, height: u * 1.8, background: CORAL }} />
    </div>
  );
};
