import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadOutfit } from "@remotion/google-fonts/Outfit";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: playfair } = loadPlayfair("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const { fontFamily: outfit } = loadOutfit("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const { fontFamily: inter } = loadInter("normal", { weights: ["300", "400", "500"], subsets: ["latin"] });

export const SAVIAS_DURATION = 300; // 10s @ 30fps

const COLORS = {
  sage: "#9caf88",
  sageDark: "#7d9169",
  sageDarker: "#5f7352",
  sageSoft: "#e8ede1",
  cream: "#f4f6f2",
  ink: "#1a1a1a",
  white: "#ffffff",
};

// ───────── utilities ─────────
const ease = (n: number) => Easing.bezier(0.22, 1, 0.36, 1)(Math.min(Math.max(n, 0), 1));

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

// ───────── Ambient background ─────────
const AmbientBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Breathing gradient: subtle shift through duration
  const breath = Math.sin((frame / durationInFrames) * Math.PI * 2) * 0.5 + 0.5;
  const angle = 135 + breath * 10;
  const lightness = 35 + breath * 5;

  return (
    <>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${COLORS.sageDarker} 0%, ${COLORS.sageDark} 50%, ${COLORS.sage} 100%)`,
        }}
      />
      {/* Radial light gradient top-right */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 75% 20%, rgba(255,255,255,${0.18 + breath * 0.08}), transparent 55%)`,
        }}
      />
      {/* Radial warm light bottom-left */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 15% 85%, rgba(244,246,242,${0.12 + breath * 0.06}), transparent 50%)`,
        }}
      />
      {/* Noise-like texture via subtle radial dots */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 1px, transparent 1.5px)`,
          backgroundSize: "4px 4px",
          opacity: 0.6,
        }}
      />
      {/* Lightness overlay breathing */}
      <AbsoluteFill
        style={{
          background: `rgba(255,255,255, ${(lightness - 35) * 0.002})`,
        }}
      />
    </>
  );
};

// ───────── Floating organic orbs ─────────
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
    <Orb size={420} x={20} y={25} driftX={4} driftY={3} hue="rgba(232,237,225,0.55)" delay={0} opacity={0.7} blur={25} />
    <Orb size={500} x={78} y={72} driftX={5} driftY={4} hue="rgba(255,255,255,0.35)" delay={80} opacity={0.6} blur={40} />
    <Orb size={300} x={55} y={45} driftX={3} driftY={5} hue="rgba(156,175,136,0.5)" delay={150} opacity={0.5} blur={30} />
    <Orb size={220} x={15} y={80} driftX={4} driftY={3} hue="rgba(244,246,242,0.45)" delay={220} opacity={0.55} blur={20} />
    <Orb size={180} x={85} y={15} driftX={3} driftY={4} hue="rgba(232,237,225,0.6)" delay={40} opacity={0.65} blur={18} />
  </>
);

// ───────── Botanical dots (drifting particles) ─────────
const ParticleField: React.FC = () => {
  const frame = useCurrentFrame();
  const particles = React.useMemo(
    () =>
      new Array(28).fill(0).map((_, i) => ({
        id: i,
        x: (i * 37) % 100,
        y: (i * 71) % 100,
        size: 2 + ((i * 13) % 5),
        speed: 0.015 + ((i * 7) % 10) / 800,
        phase: (i * 0.4) % (Math.PI * 2),
      })),
    []
  );

  return (
    <>
      {particles.map((p) => {
        const y = (p.y + frame * p.speed * 100) % 110 - 5;
        const x = p.x + Math.sin(frame * 0.01 + p.phase) * 2;
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.35)",
              left: `${x}%`,
              top: `${y}%`,
              filter: "blur(0.5px)",
              boxShadow: "0 0 6px rgba(255,255,255,0.3)",
            }}
          />
        );
      })}
    </>
  );
};

// ───────── Scene 1: Intro ─────────
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeInOut(frame, 0, 90, 18, 20);

  // Logo scale + translate
  const logoSpring = spring({
    frame: frame - 8,
    fps,
    from: 0,
    to: 1,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });
  const logoY = interpolate(logoSpring, [0, 1], [30, 0]);

  // "Savias" reveal (mask from left)
  const revealProgress = ease(interpolate(frame, [20, 55], [0, 1], { extrapolateRight: "clamp" }));
  const subOpacity = interpolate(frame, [48, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

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
      {/* Logo badge */}
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: 40,
          background: "rgba(255,255,255,0.95)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.35)",
          opacity: logoSpring,
          transform: `translateY(${logoY}px) scale(${0.85 + logoSpring * 0.15})`,
          marginBottom: 40,
          overflow: "hidden",
          padding: 20,
        }}
      >
        <img
          src="https://assets.cdn.filesafe.space/T2XJxTIDXN0RQBRt6TNa/media/69aaa9657bdf385b6095e0b8.png"
          alt="Savias"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>

      {/* "Savias" word */}
      <div
        style={{
          position: "relative",
          fontFamily: playfair,
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: 140,
          color: COLORS.white,
          letterSpacing: -2,
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
          Savias
        </span>
      </div>

      {/* Subline */}
      <div
        style={{
          marginTop: 20,
          fontFamily: outfit,
          fontWeight: 500,
          fontSize: 30,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: 6,
          textTransform: "uppercase",
          opacity: subOpacity,
        }}
      >
        Lina Toro
      </div>
    </div>
  );
};

// ───────── Scene 2: Brand message ─────────
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const localFrame = frame - 90;
  const opacity = fadeInOut(frame, 90, 180, 18, 20);

  // Line by line reveal
  const line1Opacity = interpolate(localFrame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line1Y = interpolate(line1Opacity, [0, 1], [20, 0]);

  const line2Opacity = interpolate(localFrame, [15, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line2Y = interpolate(line2Opacity, [0, 1], [20, 0]);

  const line3Opacity = interpolate(localFrame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line3Y = interpolate(line3Opacity, [0, 1], [20, 0]);

  // Animated underline
  const lineProgress = ease(interpolate(localFrame, [55, 75], [0, 1], { extrapolateRight: "clamp" }));

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
        padding: "0 80px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: outfit,
          fontWeight: 400,
          fontSize: 70,
          color: COLORS.white,
          lineHeight: 1.15,
          letterSpacing: -1,
          opacity: line1Opacity,
          transform: `translateY(${line1Y}px)`,
        }}
      >
        El arte de
      </div>
      <div
        style={{
          fontFamily: playfair,
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: 120,
          color: COLORS.white,
          lineHeight: 1.05,
          letterSpacing: -2,
          marginTop: 8,
          opacity: line2Opacity,
          transform: `translateY(${line2Y}px)`,
        }}
      >
        formular
      </div>
      <div
        style={{
          fontFamily: outfit,
          fontWeight: 400,
          fontSize: 70,
          color: COLORS.white,
          lineHeight: 1.15,
          letterSpacing: -1,
          marginTop: 8,
          opacity: line3Opacity,
          transform: `translateY(${line3Y}px)`,
        }}
      >
        con calma.
      </div>

      <div
        style={{
          width: 180,
          height: 2,
          background: "rgba(255,255,255,0.7)",
          marginTop: 40,
          transform: `scaleX(${lineProgress})`,
          transformOrigin: "left",
        }}
      />
    </div>
  );
};

// ───────── Scene 3: Three values ─────────
const ValueLine: React.FC<{ label: string; index: number; localFrame: number }> = ({
  label,
  index,
  localFrame,
}) => {
  const start = index * 18;
  const opacity = interpolate(localFrame, [start, start + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(opacity, [0, 1], [24, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        fontFamily: playfair,
        fontStyle: "italic",
        fontWeight: 500,
        fontSize: 110,
        color: COLORS.white,
        lineHeight: 1.15,
        letterSpacing: -1,
      }}
    >
      {label}
    </div>
  );
};

const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const localFrame = frame - 180;
  const opacity = fadeInOut(frame, 180, 270, 18, 22);

  // Label "Tus herramientas"
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
          fontFamily: outfit,
          fontWeight: 500,
          fontSize: 24,
          color: "rgba(255,255,255,0.7)",
          letterSpacing: 6,
          textTransform: "uppercase",
          marginBottom: 30,
          opacity: labelOpacity,
        }}
      >
        Tu práctica
      </div>
      <ValueLine label="Calcular." index={0} localFrame={localFrame} />
      <ValueLine label="Formular." index={1} localFrame={localFrame} />
      <ValueLine label="Crear." index={2} localFrame={localFrame} />
    </div>
  );
};

// ───────── Scene 4: Outro (logo returns for loop) ─────────
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
      <div
        style={{
          width: 130,
          height: 130,
          borderRadius: 32,
          background: "rgba(255,255,255,0.95)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.35)",
          overflow: "hidden",
          padding: 16,
          marginBottom: 28,
        }}
      >
        <img
          src="https://assets.cdn.filesafe.space/T2XJxTIDXN0RQBRt6TNa/media/69aaa9657bdf385b6095e0b8.png"
          alt="Savias"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
      <div
        style={{
          fontFamily: playfair,
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: 88,
          color: COLORS.white,
          letterSpacing: -1.5,
          lineHeight: 1,
        }}
      >
        Savias
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: outfit,
          fontWeight: 500,
          fontSize: 22,
          color: "rgba(255,255,255,0.75)",
          letterSpacing: 5,
          textTransform: "uppercase",
        }}
      >
        Lina Toro
      </div>
    </div>
  );
};

// ───────── Main ─────────
export const SaviasVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: inter, overflow: "hidden" }}>
      <AmbientBackground />
      <FloatingOrbs />
      <ParticleField />
      <Scene1 />
      <Scene2 />
      <Scene3 />
      <Scene4 />
      {/* Subtle vignette */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.25) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
