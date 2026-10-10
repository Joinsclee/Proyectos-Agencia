import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { loadFont as loadHanken } from "@remotion/google-fonts/HankenGrotesk";
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: hanken } = loadHanken("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin"] });
const { fontFamily: cormorant } = loadCormorant("italic", { weights: ["500", "600"], subsets: ["latin"] });

// 30 fps · loop pensado como panel/fondo de la zona de login de la Ruta Jabonera.
export const LINA_LOGIN_FPS = 30;
export const LINA_LOGIN_DURATION = 540; // 18 s — todo es periódico para un loop perfecto

// ───────── paleta SAVIAS (idéntica al sitio) ─────────
const C = {
  sage: "#9CAF88",
  sageDeep: "#7B8F6A",
  sageLight: "#DCE2CB",
  gold: "#B8943E",
  goldSoft: "#cda651",
  cream: "#F5EFE6",
  creamDeep: "#EDE4D3",
  paper: "#FAF7F2",
  dark: "#2A2823",
  ink: "#1F1F1B",
  inkSoft: "#4A4A45",
};

const ease = (n: number) => Easing.bezier(0.22, 1, 0.36, 1)(Math.min(Math.max(n, 0), 1));
const TAU = Math.PI * 2;
const mod = (n: number, m: number) => ((n % m) + m) % m;

const fadeInOut = (frame: number, start: number, end: number, fin = 22, fout = 22) => {
  if (frame < start || frame > end) return 0;
  const a = interpolate(frame, [start, start + fin], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const b = interpolate(frame, [end - fout, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return Math.min(a, b);
};

// ───────── fondo: gradiente que respira + brillo dorado ─────────
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / durationInFrames; // 0..1 periódico
  const breath = Math.sin(p * TAU) * 0.5 + 0.5;
  const angle = 145 + breath * 12;
  const glowX = 50 + Math.sin(p * TAU) * 8;
  const glowY = 22 + Math.cos(p * TAU) * 6;
  return (
    <>
      <AbsoluteFill
        style={{ background: `linear-gradient(${angle}deg, ${C.cream} 0%, ${C.creamDeep} 55%, ${C.sageLight} 100%)` }}
      />
      <AbsoluteFill
        style={{ background: `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(184,148,62,.22), transparent 55%)` }}
      />
      <AbsoluteFill
        style={{ background: `radial-gradient(circle at 50% 118%, rgba(123,143,106,.30), transparent 60%)` }}
      />
      {/* viñeta suave */}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 220px rgba(42,40,35,.16)" }} />
    </>
  );
};

// ───────── burbujas de jabón (loopeables: cada una hace nº entero de vueltas) ─────────
const BUBBLES = Array.from({ length: 22 }, (_, i) => {
  const r = (s: number) => {
    const x = Math.sin((i + 1) * 12.9898 + s * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    x: r(1),
    y: r(2),
    size: 14 + r(3) * 70,
    loops: 1 + Math.floor(r(4) * 2), // 1 o 2 vueltas verticales -> loop perfecto
    sway: 1 + Math.floor(r(5) * 2),
    swayAmp: 10 + r(6) * 34,
    phase: r(7) * TAU,
    op: 0.10 + r(8) * 0.26,
    gold: r(9) > 0.78,
  };
});

const Bubbles: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const p = frame / durationInFrames;
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <defs>
        <radialGradient id="bub" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bubGold" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f3e2b6" stopOpacity="0.95" />
          <stop offset="50%" stopColor={C.gold} stopOpacity="0.18" />
          <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
        </radialGradient>
      </defs>
      {BUBBLES.map((b, i) => {
        const y = mod(b.y - p * b.loops, 1) * (height + 200) - 100;
        const x = b.x * width + Math.sin(p * TAU * b.sway + b.phase) * b.swayAmp;
        const tw = 0.6 + 0.4 * (Math.sin(p * TAU * b.sway + b.phase) * 0.5 + 0.5);
        return (
          <g key={i} opacity={b.op * tw}>
            <circle cx={x} cy={y} r={b.size} fill={b.gold ? "url(#bubGold)" : "url(#bub)"} />
            <circle cx={x} cy={y} r={b.size}
              fill="none" stroke={b.gold ? C.gold : "#ffffff"} strokeOpacity={0.35} strokeWidth={1.2} />
          </g>
        );
      })}
    </svg>
  );
};

// ───────── imagen flotante (fotos reales de jabón, fondo transparente) ─────────
const FloatImg: React.FC<{ src: string; a: number; size: number; amp?: number; phase?: number }> = ({
  src, a, size, amp = 14, phase = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / durationInFrames;
  const floatY = Math.sin(p * TAU * 2 + phase) * amp; // periódico → loop perfecto
  return (
    <Img
      src={staticFile(src)}
      style={{
        width: size,
        height: "auto",
        opacity: a,
        transform: `translateY(${(1 - ease(a)) * 34 + floatY}px) scale(${0.92 + ease(a) * 0.08})`,
        filter: "drop-shadow(0 34px 46px rgba(42,40,35,.30))",
      }}
    />
  );
};

// ───────── helpers de texto ─────────
const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontFamily: hanken, fontWeight: 800, fontSize: 26, letterSpacing: "0.32em",
    textTransform: "uppercase", color: C.sageDeep,
  }}>{children}</div>
);

const center: React.CSSProperties = {
  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 90px",
};

const rise = (alpha: number, dist = 26) => ({
  opacity: alpha,
  transform: `translateY(${(1 - ease(alpha)) * dist}px)`,
});

// ───────── escenas ─────────
const Scene1: React.FC<{ a: number }> = ({ a }) => (
  <div style={center}>
    <div style={{ marginBottom: 22 }}><FloatImg src="sprig.png" a={a} size={230} amp={9} /></div>
    <div style={rise(a, 22)}><Eyebrow>Comunidad SAVIAS</Eyebrow></div>
  </div>
);

const Scene2: React.FC<{ a: number }> = ({ a }) => (
  <div style={center}>
    <div style={{ ...rise(a, 24), marginBottom: 6 }}><Eyebrow>Bienvenida a tu</Eyebrow></div>
    <div style={{
      ...rise(a, 30), fontFamily: hanken, fontWeight: 800, color: C.ink,
      fontSize: 116, lineHeight: 1.02, letterSpacing: "-0.02em",
    }}>
      Ruta<br />
      <span style={{ fontFamily: cormorant, fontStyle: "italic", fontWeight: 600, color: C.gold, fontSize: 132 }}>Jabonera</span>
    </div>
  </div>
);

const Scene3: React.FC<{ a: number }> = ({ a }) => (
  <div style={center}>
    <div style={{ marginBottom: 30 }}><FloatImg src="soap-hero.png" a={a} size={470} amp={16} phase={1.1} /></div>
    <div style={{
      ...rise(a, 22), fontFamily: hanken, fontWeight: 700, color: C.inkSoft,
      fontSize: 40, lineHeight: 1.3, maxWidth: 760,
    }}>
      Jabones de glicerina <span style={{ color: C.sageDeep }}>bonitos,<br />profesionales</span> y listos para vender
    </div>
  </div>
);

const Scene4: React.FC<{ a: number }> = ({ a }) => (
  <div style={center}>
    <div style={{ marginBottom: 24 }}><FloatImg src="soap-set.png" a={a} size={520} amp={13} phase={2.2} /></div>
    <div style={{ ...rise(a, 28), fontFamily: hanken, fontWeight: 800, color: C.ink, fontSize: 60, letterSpacing: "-0.02em" }}>
      Lina Toro
    </div>
    <div style={{ ...rise(a, 22), fontFamily: cormorant, fontStyle: "italic", fontWeight: 500, color: C.sageDeep, fontSize: 38, marginTop: 4 }}>
      Jabonería y cosmética artesanal
    </div>
  </div>
);

const Scene5: React.FC<{ a: number }> = ({ a }) => (
  <div style={center}>
    <div style={{
      ...rise(a, 28), fontFamily: cormorant, fontStyle: "italic", fontWeight: 600, color: C.ink,
      fontSize: 64, lineHeight: 1.22, maxWidth: 820,
    }}>
      “No copiamos recetas.<br />Aprendemos a <span style={{ color: C.gold }}>formular.</span>”
    </div>
  </div>
);

export const LinaLoginVideo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.cream, fontFamily: hanken }}>
      <Backdrop />
      <Bubbles />
      <Scene1 a={fadeInOut(frame, 8, 110, 24, 24)} />
      <Scene2 a={fadeInOut(frame, 120, 224, 24, 24)} />
      <Scene3 a={fadeInOut(frame, 234, 344, 24, 26)} />
      <Scene4 a={fadeInOut(frame, 354, 446, 24, 24)} />
      <Scene5 a={fadeInOut(frame, 456, 532, 24, 22)} />

      {/* marca fija (esquina) — siempre presente, refuerza branding */}
      <div style={{
        position: "absolute", bottom: 46, left: 0, right: 0, textAlign: "center",
        fontFamily: hanken, fontWeight: 800, fontSize: 22, letterSpacing: "0.18em",
        textTransform: "uppercase", color: C.sageDeep, opacity: 0.85,
      }}>
        ✦ SAVIAS · Lina Toro
      </div>
    </AbsoluteFill>
  );
};
