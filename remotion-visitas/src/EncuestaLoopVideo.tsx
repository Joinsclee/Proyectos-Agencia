import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { loadFont as loadHanken } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: SANS } = loadHanken("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});
const { fontFamily: SERIF } = loadCormorant("italic", {
  weights: ["500", "600"],
  subsets: ["latin"],
});

// 5 s @ 60fps = 300 frames. Loop sin corte (todo parametrizado por frame/duration).
export const ENCUESTA_DURATION = 300;

const C = {
  sage: "#9CAF88",
  sageDeep: "#7B8F6A",
  sageLight: "#DCE2CB",
  gold: "#B8943E",
  goldSoft: "#cda651",
  cream: "#F5EFE6",
  creamDeep: "#EDE4D3",
  paper: "#FAF7F2",
  ink: "#1F1F1B",
  inkSoft: "#4A4A45",
  inkMute: "#7A7A72",
  line: "#D4CBB8",
  lineSoft: "#E5DCC8",
};

const TAU = Math.PI * 2;
const easeOut = (n: number) => Easing.bezier(0.22, 1, 0.36, 1)(Math.min(Math.max(n, 0), 1));

// Grano sutil (data-uri) que se desplaza cada frame para hacer dithering y matar el banding.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")";

const LeafSVG: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <path
      d="M52 8C28 10 12 26 12 44c0 6 3 11 8 13C22 40 34 24 52 16c-14 10-23 24-26 40 20 1 38-13 40-34 1-6 0-11-4-14z"
      fill={color}
    />
  </svg>
);

const Leaf: React.FC<{
  x: number;
  y: number;
  size: number;
  phase: number;
  color: string;
  baseRot: number;
  opacity: number;
  p: number;
}> = ({ x, y, size, phase, color, baseRot, opacity, p }) => {
  const ty = y + 26 * Math.sin(TAU * (p + phase));
  const tx = x + 18 * Math.cos(TAU * (p + phase));
  const rot = baseRot + 18 * Math.sin(TAU * (p + phase));
  return (
    <div style={{ position: "absolute", left: tx, top: ty, transform: `rotate(${rot}deg)`, opacity }}>
      <LeafSVG color={color} size={size} />
    </div>
  );
};

const QUESTIONS = ["¿Por dónde vas hoy?", "¿Qué quieres lograr?", "¿Qué te está frenando?"];
const APPEAR = [0.14, 0.3, 0.46];

export const EncuestaLoopVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / durationInFrames; // 0..1, periódico

  // Fondo crema respirando (seamless)
  const breath = Math.sin(TAU * p) * 0.5 + 0.5;
  const angle = 135 + breath * 12;

  // Glows sage moviéndose en círculo (continuo)
  const g1x = 78 + Math.sin(TAU * p) * 6;
  const g1y = 18 + Math.cos(TAU * p) * 6;
  const g2x = 16 + Math.cos(TAU * p) * 6;
  const g2y = 84 + Math.sin(TAU * p) * 6;

  // Tarjeta flotando suave
  const cardY = 14 * Math.sin(TAU * p);
  const cardRot = 0.25 * Math.sin(TAU * p);

  // Grano desplazado por frame → dithering temporal
  const noiseX = (frame * 13) % 180;
  const noiseY = (frame * 7) % 180;

  // Checks: aparecen escalonados, se mantienen y se desvanecen suave al final del loop
  const fadeChecks = interpolate(p, [0.86, 0.98], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const checkP = (i: number) => {
    const base = easeOut(interpolate(p, [APPEAR[i], APPEAR[i] + 0.09], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }));
    return base * fadeChecks;
  };

  return (
    <AbsoluteFill style={{ fontFamily: SANS, overflow: "hidden" }}>
      {/* base degradado crema */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${C.creamDeep} 0%, ${C.cream} 55%, ${C.paper} 100%)`,
        }}
      />
      {/* glow sage 1 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${g1x}% ${g1y}%, rgba(156,175,136,${0.28 + breath * 0.08}), transparent 45%)`,
        }}
      />
      {/* glow dorado 2 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${g2x}% ${g2y}%, rgba(184,148,62,${0.16 + breath * 0.05}), transparent 48%)`,
        }}
      />

      {/* hojas */}
      <Leaf x={160} y={180} size={110} phase={0} color={C.sage} baseRot={-18} opacity={0.5} p={p} />
      <Leaf x={1600} y={150} size={86} phase={0.33} color={C.gold} baseRot={30} opacity={0.42} p={p} />
      <Leaf x={210} y={820} size={74} phase={0.66} color={C.sageDeep} baseRot={10} opacity={0.4} p={p} />
      <Leaf x={1640} y={800} size={100} phase={0.15} color={C.sage} baseRot={-32} opacity={0.46} p={p} />
      <Leaf x={930} y={70} size={60} phase={0.5} color={C.goldSoft} baseRot={0} opacity={0.32} p={p} />

      {/* tarjeta */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 1240,
            background: `linear-gradient(135deg, ${C.paper}, #F3ECDD)`,
            border: `3px solid ${C.gold}`,
            borderRadius: 52,
            padding: "80px 96px 84px",
            boxShadow: "0 60px 120px -50px rgba(42,40,35,0.45)",
            transform: `translateY(${cardY}px) rotate(${cardRot}deg)`,
            position: "relative",
          }}
        >
          {/* badge */}
          <div
            style={{
              position: "absolute",
              top: -26,
              left: "50%",
              transform: "translateX(-50%)",
              background: C.gold,
              color: "#fff",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.16em",
              padding: "10px 28px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            TU OPINIÓN CUENTA
          </div>

          <div
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              color: C.sageDeep,
              fontSize: 44,
              textAlign: "center",
              marginTop: 10,
              marginBottom: 6,
            }}
          >
            Antes de la clase del 23
          </div>

          <div
            style={{
              fontWeight: 800,
              color: C.ink,
              fontSize: 86,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              textAlign: "center",
              marginBottom: 50,
            }}
          >
            1 minuto.{" "}
            <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, color: C.gold }}>
              3 preguntas.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {QUESTIONS.map((q, i) => {
              const cp = checkP(i);
              const boxBg = cp > 0.02 ? C.sage : C.cream;
              const boxBorder = cp > 0.02 ? C.sage : C.line;
              const checkScale = interpolate(cp, [0, 0.7, 1], [0.2, 1.18, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 32,
                    background: C.cream,
                    border: `2px solid ${C.line}`,
                    borderRadius: 24,
                    padding: "26px 36px",
                  }}
                >
                  <div
                    style={{
                      width: 66,
                      height: 66,
                      borderRadius: 18,
                      flex: "none",
                      background: boxBg,
                      border: `3px solid ${boxBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width={38}
                      height={38}
                      viewBox="0 0 24 24"
                      style={{ opacity: cp, transform: `scale(${checkScale})` }}
                    >
                      <path
                        d="M5 12l4 4L19 7"
                        fill="none"
                        stroke="#fff"
                        strokeWidth={3.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div style={{ fontSize: 42, fontWeight: 600, color: C.inkSoft }}>{q}</div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: 44,
              fontSize: 32,
              fontWeight: 700,
              color: C.sageDeep,
              letterSpacing: "0.02em",
            }}
          >
            Personaliza tu clase · llena la encuesta 🌿
          </div>
        </div>
      </AbsoluteFill>

      {/* grano para dither (mata el banding) */}
      <AbsoluteFill
        style={{
          backgroundImage: NOISE,
          backgroundPosition: `${noiseX}px ${noiseY}px`,
          mixBlendMode: "soft-light",
          opacity: 0.06,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
