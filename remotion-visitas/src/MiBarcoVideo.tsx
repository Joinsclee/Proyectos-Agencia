import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { loadFont as loadAsap } from "@remotion/google-fonts/Asap";

const { fontFamily: asap } = loadAsap("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
loadAsap("italic", { weights: ["500", "700", "800"], subsets: ["latin"] });

export const MI_BARCO_DURATION = 300; // 10s @ 30fps

const LOGO =
  "https://assets.cdn.filesafe.space/3BzYvWc86annqh6ryPC9/media/6a1dfb221f28836ddfcc93b0.png";

const COLORS = {
  navy: "#08315C",
  navySoft: "#0d4178",
  navyDeep: "#061f3a",
  gold: "#F4C94A",
  goldSoft: "#f7d56e",
  white: "#ffffff",
  cream: "#f7f9fc",
};

// ───────── utilities ─────────
const ease = (n: number) =>
  Easing.bezier(0.22, 1, 0.36, 1)(Math.min(Math.max(n, 0), 1));

const fadeInOut = (
  frame: number,
  start: number,
  end: number,
  fadeIn = 15,
  fadeOut = 15
) => {
  if (frame < start || frame > end) return 0;
  const inAlpha = interpolate(frame, [start, start + fadeIn], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outAlpha = interpolate(frame, [end - fadeOut, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return Math.min(inAlpha, outAlpha);
};

// ───────── Ambient background (navy que respira) ─────────
const AmbientBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const breath = Math.sin((frame / durationInFrames) * Math.PI * 2) * 0.5 + 0.5;
  const angle = 135 + breath * 12;

  return (
    <>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${COLORS.navyDeep} 0%, ${COLORS.navy} 48%, ${COLORS.navySoft} 100%)`,
        }}
      />
      {/* Halo dorado arriba-derecha */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 78% 18%, rgba(244,201,74,${
            0.16 + breath * 0.08
          }), transparent 55%)`,
        }}
      />
      {/* Luz fría abajo-izquierda */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 16% 86%, rgba(13,65,120,${
            0.5 + breath * 0.1
          }), transparent 55%)`,
        }}
      />
      {/* Textura sutil de puntos */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.035) 1px, transparent 1.5px)`,
          backgroundSize: "4px 4px",
          opacity: 0.55,
        }}
      />
    </>
  );
};

// ───────── Orbes flotantes ─────────
const Orb: React.FC<{
  size: number;
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  hue: string;
  delay: number;
  opacity: number;
  blur: number;
}> = ({ size, x, y, driftX, driftY, hue, delay, opacity, blur }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = ((frame + delay) % durationInFrames) / durationInFrames;
  const cx = x + Math.sin(t * Math.PI * 2) * driftX;
  const cy = y + Math.cos(t * Math.PI * 2) * driftY;

  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        left: `${cx}%`,
        top: `${cy}%`,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${hue} 0%, transparent 70%)`,
        opacity,
        filter: `blur(${blur}px)`,
      }}
    />
  );
};

const FloatingOrbs: React.FC = () => (
  <>
    <Orb size={420} x={22} y={26} driftX={4} driftY={3} hue="rgba(244,201,74,0.30)" delay={0} opacity={0.65} blur={30} />
    <Orb size={520} x={80} y={74} driftX={5} driftY={4} hue="rgba(13,65,120,0.55)" delay={80} opacity={0.7} blur={45} />
    <Orb size={300} x={55} y={44} driftX={3} driftY={5} hue="rgba(247,213,110,0.22)" delay={150} opacity={0.5} blur={32} />
    <Orb size={220} x={16} y={80} driftX={4} driftY={3} hue="rgba(255,255,255,0.18)" delay={220} opacity={0.5} blur={22} />
    <Orb size={180} x={86} y={16} driftX={3} driftY={4} hue="rgba(244,201,74,0.34)" delay={40} opacity={0.6} blur={18} />
  </>
);

// ───────── Partículas a la deriva ─────────
const ParticleField: React.FC = () => {
  const frame = useCurrentFrame();
  const particles = React.useMemo(
    () =>
      new Array(26).fill(0).map((_, i) => ({
        id: i,
        x: (i * 37) % 100,
        y: (i * 71) % 100,
        size: 2 + ((i * 13) % 4),
        speed: 0.012 + ((i * 7) % 10) / 900,
        phase: (i * 0.4) % (Math.PI * 2),
        gold: i % 3 === 0,
      })),
    []
  );

  return (
    <>
      {particles.map((p) => {
        const y = ((p.y + frame * p.speed * 100) % 110) - 5;
        const x = p.x + Math.sin(frame * 0.01 + p.phase) * 2;
        const color = p.gold ? "rgba(244,201,74,0.55)" : "rgba(255,255,255,0.4)";
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: color,
              left: `${x}%`,
              top: `${y}%`,
              filter: "blur(0.5px)",
              boxShadow: p.gold
                ? "0 0 8px rgba(244,201,74,0.5)"
                : "0 0 6px rgba(255,255,255,0.35)",
            }}
          />
        );
      })}
    </>
  );
};

// ───────── Logo badge ─────────
const LogoBadge: React.FC<{ size: number; radius: number; appear: number }> = ({
  size,
  radius,
  appear,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: radius,
      background: COLORS.white,
      display: "grid",
      placeItems: "center",
      boxShadow: "0 30px 80px -20px rgba(0,0,0,0.45)",
      overflow: "hidden",
      padding: size * 0.16,
      opacity: appear,
    }}
  >
    <img
      src={LOGO}
      alt="Paulina Valencia"
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  </div>
);

// ───────── Scene 1: Intro ─────────
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeInOut(frame, 0, 90, 18, 20);

  const logoSpring = spring({
    frame: frame - 8,
    fps,
    from: 0,
    to: 1,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });
  const logoY = interpolate(logoSpring, [0, 1], [30, 0]);

  const revealProgress = ease(
    interpolate(frame, [20, 55], [0, 1], { extrapolateRight: "clamp" })
  );
  const subOpacity = interpolate(frame, [48, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          marginBottom: 44,
          transform: `translateY(${logoY}px) scale(${0.85 + logoSpring * 0.15})`,
        }}
      >
        <LogoBadge size={168} radius={42} appear={logoSpring} />
      </div>

      {/* "Mi Barco" */}
      <div
        style={{
          fontFamily: asap,
          fontWeight: 800,
          fontSize: 128,
          color: COLORS.white,
          letterSpacing: -3,
          lineHeight: 1,
          overflow: "hidden",
          display: "inline-block",
          padding: "0 0.1em",
        }}
      >
        <span
          style={{
            display: "inline-block",
            clipPath: `inset(0 ${100 - revealProgress * 100}% 0 0)`,
            WebkitClipPath: `inset(0 ${100 - revealProgress * 100}% 0 0)`,
          }}
        >
          Mi <span style={{ color: COLORS.gold }}>Barco</span>
        </span>
      </div>

      <div
        style={{
          marginTop: 22,
          fontFamily: asap,
          fontWeight: 600,
          fontSize: 27,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: 5,
          textTransform: "uppercase",
          opacity: subOpacity,
        }}
      >
        Paulina Valencia · Mentora de hábitos
      </div>
    </div>
  );
};

// ───────── Scene 2: Mensaje de marca ─────────
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const localFrame = frame - 90;
  const opacity = fadeInOut(frame, 90, 180, 18, 20);

  const line1 = interpolate(localFrame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line2 = interpolate(localFrame, [16, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineProgress = ease(
    interpolate(localFrame, [44, 66], [0, 1], { extrapolateRight: "clamp" })
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        padding: "0 90px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: asap,
          fontWeight: 700,
          fontSize: 76,
          color: COLORS.white,
          lineHeight: 1.12,
          letterSpacing: -1.5,
          opacity: line1,
          transform: `translateY(${interpolate(line1, [0, 1], [20, 0])}px)`,
        }}
      >
        Construye tu identidad,
      </div>
      <div
        style={{
          fontFamily: asap,
          fontStyle: "italic",
          fontWeight: 800,
          fontSize: 92,
          color: COLORS.gold,
          lineHeight: 1.08,
          letterSpacing: -2,
          marginTop: 14,
          opacity: line2,
          transform: `translateY(${interpolate(line2, [0, 1], [20, 0])}px)`,
        }}
      >
        un pliegue a la vez.
      </div>

      <div
        style={{
          width: 200,
          height: 3,
          background: COLORS.gold,
          borderRadius: 2,
          marginTop: 44,
          transform: `scaleX(${lineProgress})`,
          transformOrigin: "center",
        }}
      />
    </div>
  );
};

// ───────── Scene 3: Las tres herramientas ─────────
const ToolLine: React.FC<{
  verb: string;
  tool: string;
  index: number;
  localFrame: number;
}> = ({ verb, tool, index, localFrame }) => {
  const start = index * 18;
  const opacity = interpolate(localFrame, [start, start + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(opacity, [0, 1], [26, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: 26,
      }}
    >
      <div
        style={{
          fontFamily: asap,
          fontWeight: 800,
          fontSize: 88,
          color: COLORS.white,
          lineHeight: 1.05,
          letterSpacing: -2,
        }}
      >
        {verb}
      </div>
      <div
        style={{
          fontFamily: asap,
          fontWeight: 600,
          fontSize: 26,
          color: COLORS.gold,
          letterSpacing: 4,
          textTransform: "uppercase",
          marginTop: 4,
        }}
      >
        {tool}
      </div>
    </div>
  );
};

const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const localFrame = frame - 180;
  const opacity = fadeInOut(frame, 180, 270, 18, 22);

  const labelOpacity = interpolate(localFrame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: asap,
          fontWeight: 600,
          fontSize: 24,
          color: "rgba(255,255,255,0.7)",
          letterSpacing: 6,
          textTransform: "uppercase",
          marginBottom: 38,
          opacity: labelOpacity,
        }}
      >
        Tus herramientas
      </div>
      <ToolLine verb="Diagnostica." tool="Rueda de la Vida" index={0} localFrame={localFrame} />
      <ToolLine verb="Comprende." tool="Neuropliegues" index={1} localFrame={localFrame} />
      <ToolLine verb="Sostén." tool="Tracker de hábitos" index={2} localFrame={localFrame} />
    </div>
  );
};

// ───────── Scene 4: Outro (vuelve el logo para el loop) ─────────
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const localFrame = frame - 270;
  const opacity = interpolate(localFrame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(localFrame, [0, 30], [0.9, 1]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <LogoBadge size={132} radius={34} appear={1} />
      </div>
      <div
        style={{
          fontFamily: asap,
          fontWeight: 800,
          fontSize: 84,
          color: COLORS.white,
          letterSpacing: -2,
          lineHeight: 1,
        }}
      >
        Mi <span style={{ color: COLORS.gold }}>Barco</span>
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: asap,
          fontWeight: 600,
          fontSize: 22,
          color: "rgba(255,255,255,0.78)",
          letterSpacing: 5,
          textTransform: "uppercase",
        }}
      >
        Paulina Valencia
      </div>
    </div>
  );
};

// ───────── Main ─────────
export const MiBarcoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: asap, overflow: "hidden" }}>
      <AmbientBackground />
      <FloatingOrbs />
      <ParticleField />
      <Scene1 />
      <Scene2 />
      <Scene3 />
      <Scene4 />
      {/* Viñeta sutil */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.32) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
