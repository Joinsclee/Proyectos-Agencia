import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONTS, EXPO, drawLine } from "./crece/theme";

// ───────────────────────────────────────────────────────────────
// CONTADOR 5:00 → 0:00 · SAVIAS · Lina Toro
// Para proyectar en Zoom ANTES de que arranque la clase en vivo.
// Estética editorial artesanal (papel crema + glow salvia/dorado),
// timer hero con anillo dorado que se vacía y una galería de jabones
// de glicerina que se funde con frases sensoriales (sin vender nada).
// 1920×1080 · 30fps · 5:00 de cuenta regresiva + 9s de bienvenida.
// ───────────────────────────────────────────────────────────────

export const COUNTDOWN_FPS = 30;
const COUNTDOWN_SECONDS = 300; // 5:00 exactos de cuenta regresiva
const OUTRO_SECONDS = 9; // bloom de "Comenzamos"
export const COUNTDOWN_DURATION = Math.round(
  (COUNTDOWN_SECONDS + OUTRO_SECONDS) * COUNTDOWN_FPS,
); // 9270 frames

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const TAU = Math.PI * 2;

// PRNG determinista (mulberry32) para esparcir decoraciones sin Math.random.
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ── Galería de jabones (imagen + frase sensorial, NUNCA de venta) ──
// `shape: spotlight` → producto sobre fondo claro (recibe backing circular).
type Soap = { img: string; caption: string };
const GALLERY: Soap[] = [
  { img: "cd-soap-01-cut.png", caption: "Capa a capa, como un postre" },
  { img: "soap-hero-cut.png", caption: "Flores reales, encapsuladas" },
  { img: "cd-soap-00-cut.png", caption: "Hecho a mano, se ve de tienda" },
  { img: "cd-soap-07-cut.png", caption: "Marmoleados únicos" },
  { img: "sales-soap-cut.png", caption: "Cada barra, una pieza" },
  { img: "cd-soap-04-cut.png", caption: "Texturas que dan ganas" },
  { img: "soap-set-cut.png", caption: "Ninguno igual al otro" },
];

const SLOT = 21; // segundos por jabón
const XFADE = 2.6; // fundido cruzado

// Sprigs de salvia flotando (parallax + deriva lenta hacia arriba).
const SPRIGS = (() => {
  const r = rng(7321);
  return Array.from({ length: 7 }, () => ({
    x: r(),
    y0: r(),
    size: 90 + r() * 150,
    speed: 5 + r() * 7, // px/s hacia arriba
    rot: r() * 360,
    rotSpd: (r() - 0.5) * 8,
    sway: 20 + r() * 50,
    swaySpd: 0.2 + r() * 0.3,
    op: 0.12 + r() * 0.18,
    flip: r() > 0.5 ? -1 : 1,
  }));
})();

// Bokeh dorado/salvia (puntos suaves que titilan y derivan).
const BOKEH = (() => {
  const r = rng(99173);
  return Array.from({ length: 30 }, () => ({
    x: r(),
    y0: r(),
    size: 6 + r() * 26,
    speed: 4 + r() * 10,
    sway: 14 + r() * 40,
    swaySpd: 0.15 + r() * 0.4,
    phase: r() * TAU,
    op: 0.1 + r() * 0.3,
    gold: r() > 0.42,
  }));
})();

// ── Ornamento · ✦ · ──
const Ornament: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <span
    style={{
      fontFamily: FONTS.display,
      color: C.gold,
      fontSize: size,
      letterSpacing: "0.5em",
      lineHeight: 1,
    }}
  >
    · ✦ ·
  </span>
);

export const CountdownVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const W = width;
  const H = height;

  // Tiempo restante y dígitos del timer.
  const remaining = Math.min(COUNTDOWN_SECONDS, Math.max(0, COUNTDOWN_SECONDS - t));
  const frac = remaining / COUNTDOWN_SECONDS; // 1 → 0
  const displayInt = Math.max(0, COUNTDOWN_SECONDS - Math.floor(t)); // 300…0
  const mm = Math.floor(displayInt / 60);
  const ss = displayInt % 60;
  const timeStr = `${mm}:${String(ss).padStart(2, "0")}`;

  const inOutro = t >= COUNTDOWN_SECONDS;

  // Fade in de entrada (0.8s) y respiración ambiental continua.
  const introFade = interpolate(t, [0, 0.8], [0, 1], clamp);
  const breathe = 1 + Math.sin(t * 0.6) * 0.025;
  const driftX = interpolate(t, [0, durationInFrames / fps], [0, -26], clamp);

  // Pulsos de glow en cada minuto (4:00, 3:00, 2:00, 1:00).
  const minutePulse = [60, 120, 180, 240].reduce(
    (acc, m) => acc + Math.exp(-((t - m) ** 2) / 0.5),
    0,
  );
  const glowBoost = 1 + minutePulse * 0.5 + (inOutro ? 1 : 0);

  // Pulso del colon (brillante en cada segundo entero).
  const sub = t - Math.floor(t);
  const colonOp = inOutro ? 1 : 0.32 + 0.68 * (0.5 + 0.5 * Math.cos(TAU * sub));
  // "Tick" sutil del número en cada segundo.
  const tickPop = Math.exp(-sub * 7);
  const numScale = 1 + 0.02 * tickPop;

  // Anillo: geometría.
  const ringSize = 600;
  const rr = 262;
  const circ = TAU * rr;
  const dash = circ * (1 - frac); // se vacía a medida que corre el tiempo

  // Galería: índice y fundido cruzado.
  const k = Math.floor(t / SLOT);
  const local = t - k * SLOT;
  const xf = interpolate(local, [0, XFADE], [0, 1], clamp); // 0→1 al entrar
  const cur = GALLERY[k % GALLERY.length];
  const prev = GALLERY[(k - 1 + GALLERY.length) % GALLERY.length];
  const prevVisible = k > 0 && local < XFADE;
  const floatY = Math.sin(t * 0.7 + 1) * 12;
  const spotScale = 1 + Math.sin(t * 0.5) * 0.02;

  // Outro: bloom de bienvenida (florece justo al tocar 0:00).
  const outroP = interpolate(t, [COUNTDOWN_SECONDS, COUNTDOWN_SECONDS + 2], [0, 1], clamp);
  const countdownDim = 1 - outroP * 0.85;

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, opacity: introFade }}>
      {/* ── Fondo papel crema ── */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(155deg, ${C.paper} 0%, ${C.cream} 48%, ${C.creamDeep} 100%)`,
        }}
      />
      {/* Glow salvia (sup-izq) que respira */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 28% 24%, rgba(156,175,136,0.40) 0%, rgba(156,175,136,0) 56%)",
          transform: `translateX(${driftX}px) scale(${breathe * (1 + minutePulse * 0.06)})`,
          transformOrigin: "28% 24%",
          opacity: 0.9 * glowBoost,
        }}
      />
      {/* Glow dorado (inf-der) que respira */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 76% 72%, rgba(184,148,62,0.26) 0%, rgba(184,148,62,0) 52%)",
          transform: `scale(${breathe * (1 + minutePulse * 0.08)})`,
          transformOrigin: "76% 72%",
          opacity: glowBoost,
        }}
      />
      {/* Viñeta para asentar el cuadro */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 92% 84% at 50% 50%, rgba(0,0,0,0) 56%, rgba(31,31,27,0.12) 100%)",
        }}
      />

      {/* ── Bokeh flotante ── */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="bok-gold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(201,168,86,0.9)" />
            <stop offset="100%" stopColor="rgba(201,168,86,0)" />
          </radialGradient>
          <radialGradient id="bok-sage" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(156,175,136,0.9)" />
            <stop offset="100%" stopColor="rgba(156,175,136,0)" />
          </radialGradient>
        </defs>
        {BOKEH.map((b, i) => {
          const span = H + 240;
          const y = ((b.y0 * span - t * b.speed) % span + span) % span - 120;
          const x = b.x * W + Math.sin(t * b.swaySpd + b.phase) * b.sway;
          const edge = Math.min(1, Math.min(y + 120, H + 120 - y) / 160);
          const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + b.phase);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={b.size}
              fill={`url(#${b.gold ? "bok-gold" : "bok-sage"})`}
              opacity={b.op * Math.max(0, edge) * tw}
            />
          );
        })}
      </svg>

      {/* ── Sprigs de salvia flotando ── */}
      {SPRIGS.map((s, i) => {
        const span = H + 360;
        const y = ((s.y0 * span - t * s.speed) % span + span) % span - 180;
        const x = s.x * W + Math.sin(t * s.swaySpd + i) * s.sway;
        const edge = Math.min(1, Math.min(y + 180, H + 180 - y) / 220);
        return (
          <Img
            key={i}
            src={staticFile("sprig.png")}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: s.size,
              opacity: s.op * Math.max(0, edge),
              transform: `rotate(${s.rot + t * s.rotSpd}deg) scaleX(${s.flip})`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* ── Marca: chip SS + wordmark (sup-izq) ── */}
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 76,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: countdownDim,
        }}
      >
        <Img
          src={staticFile("savias-logo.png")}
          style={{
            width: 66,
            height: 66,
            borderRadius: 15,
            boxShadow: "0 12px 30px -10px rgba(95,115,82,0.6)",
          }}
        />
        <span
          style={{
            fontFamily: FONTS.sc,
            fontSize: 28,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: C.sageDeep,
          }}
        >
          Savias
        </span>
      </div>

      {/* ── Indicador "en vivo con Lina" (sup-der) ── */}
      <div
        style={{
          position: "absolute",
          right: 104,
          top: 84,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: countdownDim,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: C.gold,
            boxShadow: "0 0 0 0 rgba(184,148,62,0.5)",
            opacity: 0.5 + 0.5 * Math.sin(t * 3.2),
          }}
        />
        <span
          style={{
            fontFamily: FONTS.sc,
            fontSize: 24,
            letterSpacing: "0.36em",
            textTransform: "uppercase",
            color: C.sageDeep,
          }}
        >
          En vivo con Lina
        </span>
      </div>

      {/* ── TIMER (izquierda, hero) ── */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 0,
          bottom: 0,
          width: 820,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: countdownDim,
        }}
      >
        {/* eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 30,
          }}
        >
          <span
            style={{
              width: 44,
              height: 1.6,
              background: C.gold,
              display: "inline-block",
              transformOrigin: "left",
              transform: `scaleX(${drawLine(t, 0.4, 0.8)})`,
            }}
          />
          <span
            style={{
              fontFamily: FONTS.sc,
              fontSize: 27,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: C.gold,
            }}
          >
            La clase comienza en
          </span>
        </div>

        {/* anillo + número */}
        <div style={{ position: "relative", width: ringSize, height: ringSize }}>
          <svg
            width={ringSize}
            height={ringSize}
            style={{ position: "absolute", inset: 0 }}
          >
            <defs>
              <linearGradient id="ring-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={C.goldSoft} />
                <stop offset="100%" stopColor={C.gold} />
              </linearGradient>
            </defs>
            {/* track salvia */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={rr}
              fill="none"
              stroke="rgba(123,143,106,0.22)"
              strokeWidth={14}
            />
            {/* arco dorado que se vacía */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={rr}
              fill="none"
              stroke="url(#ring-gold)"
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={dash}
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              style={{ filter: "drop-shadow(0 0 14px rgba(184,148,62,0.55))" }}
            />
          </svg>
          {/* número MM:SS */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontFamily: FONTS.display,
                fontWeight: 500,
                fontSize: 196,
                lineHeight: 1,
                color: C.ink,
                letterSpacing: "-0.01em",
                display: "flex",
                alignItems: "baseline",
                transform: `scale(${numScale})`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ width: 150, textAlign: "right" }}>{mm}</span>
              <span style={{ color: C.gold, opacity: colonOp, margin: "0 6px" }}>
                :
              </span>
              <span style={{ width: 230, textAlign: "left" }}>
                {String(ss).padStart(2, "0")}
              </span>
            </div>
            <div
              style={{
                marginTop: 14,
                fontFamily: FONTS.sc,
                fontSize: 22,
                letterSpacing: "0.34em",
                textTransform: "uppercase",
                color: C.sageDeep,
              }}
            >
              min&nbsp;&nbsp;·&nbsp;&nbsp;seg
            </div>
          </div>
        </div>

        {/* mensaje cálido bajo el anillo */}
        <div
          style={{
            marginTop: 34,
            fontFamily: FONTS.body,
            fontStyle: "italic",
            fontSize: 34,
            color: C.inkSoft,
            textAlign: "center",
            maxWidth: 640,
            lineHeight: 1.3,
          }}
        >
          Ponte cómoda, respira… ya casi empezamos.
        </div>
      </div>

      {/* ── GALERÍA de jabones (derecha) ── */}
      <div
        style={{
          position: "absolute",
          right: 96,
          top: 0,
          bottom: 0,
          width: 780,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: countdownDim,
        }}
      >
        {/* escenario circular (spotlight) */}
        <div
          style={{
            position: "relative",
            width: 540,
            height: 540,
            transform: `translateY(${floatY}px) scale(${spotScale})`,
          }}
        >
          {/* halo dorado detrás */}
          <div
            style={{
              position: "absolute",
              inset: "-10%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(184,148,62,0.24) 0%, rgba(184,148,62,0) 64%)",
              transform: `scale(${breathe})`,
            }}
          />
          {/* halo de luz suave (sin borde duro: el jabón flota limpio) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 50% 44%, rgba(255,255,255,0.72) 0%, rgba(250,246,238,0.40) 36%, rgba(245,239,230,0) 66%)",
            }}
          />
          {/* sombra de contacto bajo el jabón (lo asienta) */}
          <div
            style={{
              position: "absolute",
              left: "18%",
              right: "18%",
              bottom: "11%",
              height: 56,
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse at center, rgba(31,31,27,0.34) 0%, rgba(31,31,27,0) 72%)",
              filter: "blur(10px)",
            }}
          />
          {/* jabón anterior (saliendo) */}
          {prevVisible && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 1 - xf,
              }}
            >
              <Img
                src={staticFile(prev.img)}
                style={{
                  width: 380,
                  height: 380,
                  objectFit: "contain",
                  filter: "drop-shadow(0 30px 34px rgba(31,31,27,0.34))",
                }}
              />
            </div>
          )}
          {/* jabón actual (entrando) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: xf,
            }}
          >
            <Img
              src={staticFile(cur.img)}
              style={{
                width: 380,
                height: 380,
                objectFit: "contain",
              }}
            />
          </div>
        </div>

        {/* frase sensorial (fundido cruzado) */}
        <div style={{ position: "relative", height: 120, marginTop: 30, width: 720 }}>
          {prevVisible && (
            <Caption text={prev.caption} opacity={1 - xf} />
          )}
          <Caption text={cur.caption} opacity={xf} />
        </div>
      </div>

      {/* ── OUTRO · bloom de bienvenida ── */}
      {outroP > 0.001 && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: outroP,
          }}
        >
          {/* bloom dorado central */}
          <AbsoluteFill
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(184,148,62,0.30) 0%, rgba(184,148,62,0) 50%)",
              transform: `scale(${0.9 + outroP * 0.2})`,
            }}
          />
          <div style={{ opacity: interpolate(outroP, [0.1, 0.6], [0, 1], clamp) }}>
            <Ornament size={26} />
          </div>
          <div
            style={{
              fontFamily: FONTS.display,
              fontWeight: 500,
              fontSize: 150,
              color: C.ink,
              marginTop: 18,
              letterSpacing: "-0.01em",
              transform: `translateY(${(1 - outroP) * 24}px)`,
            }}
          >
            Comenzamos
          </div>
          <div
            style={{
              fontFamily: FONTS.body,
              fontStyle: "italic",
              fontSize: 42,
              color: C.inkSoft,
              marginTop: 12,
              opacity: interpolate(outroP, [0.35, 0.9], [0, 1], clamp),
            }}
          >
            Bienvenida a la Ruta Jabonera
          </div>
        </AbsoluteFill>
      )}

      {/* ── Música ambiente original (sin copyright) ── */}
      <Audio src={staticFile("countdown-ambient.mp3")} volume={0.8} />
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      opacity,
    }}
  >
    <span
      style={{
        fontFamily: FONTS.display,
        fontStyle: "italic",
        fontWeight: 500,
        fontSize: 46,
        color: C.ink,
        textAlign: "center",
        lineHeight: 1.15,
      }}
    >
      {text}
    </span>
    <span
      style={{
        marginTop: 16,
        width: 60,
        height: 2,
        background: C.gold,
        opacity: 0.8,
      }}
    />
  </div>
);
