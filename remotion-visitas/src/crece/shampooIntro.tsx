import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";
import { noise2D } from "@remotion/noise";
import { evolvePath } from "@remotion/paths";
import {
  C,
  FONTS,
  EXPO,
  IN_HARD,
  blurRise,
  rise,
  drawLine,
  springRise,
  springPop,
  springProg,
  SPRING_SNAPPY,
  SPRING_SOFT,
  useSceneDur,
} from "./theme";
import { Card, Eyebrow } from "./primitives";

const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};
const useFF = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps };
};

const useExit = (lead = 0.6) => {
  const t = useT();
  const { fps, durationInFrames } = useVideoConfig();
  const dur = useSceneDur() ?? durationInFrames;
  const exitT = dur / fps - lead;
  return interpolate(t, [exitT, exitT + lead], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: IN_HARD,
  });
};

// ════════════════════════════════════════════════════════════
// GRANO DE PELÍCULA — SVG feTurbulence (seguro en render Remotion),
// animado por frame. Funde el video real con los vectores.
// ════════════════════════════════════════════════════════════
export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.06 }) => {
  const frame = useCurrentFrame();
  const id = React.useId();
  const seed = frame % 60;
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, mixBlendMode: "overlay", pointerEvents: "none" }}
    >
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
};

// ════════════════════════════════════════════════════════════
// COLD-OPEN — el RESULTADO primero (la barra terminada) · 0–3.4s
// Empuje lento sobre el hero + microcopy, y wipe-up que revela el video.
// ════════════════════════════════════════════════════════════
export const ColdOpen: React.FC = () => {
  const { frame, fps } = useFF();
  const t = frame / fps;
  const { durationInFrames } = useVideoConfig();
  const durSec = (useSceneDur() ?? durationInFrames) / fps;

  const scale = interpolate(t, [0, durSec], [1.05, 1.13], {
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  // wipe-up en los últimos 0.55s
  const wipeStart = durSec - 0.55;
  const wipe = interpolate(t, [wipeStart, durSec], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });

  const kicker = springRise(frame, fps, 0.3, 16, SPRING_SOFT);
  const sub = springRise(frame, fps, 0.55, 14, SPRING_SOFT);

  return (
    <AbsoluteFill style={{ clipPath: `inset(0 0 ${wipe * 100}% 0)` }}>
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#1F1F1B" }}>
        <Img
          src={staticFile("shampoo-hero.jpg")}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
        />
      </AbsoluteFill>
      {/* scrim cálido + viñeta para legibilidad y código editorial */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 100% at 50% 42%, rgba(31,31,27,0) 38%, rgba(31,31,27,0.5) 100%), linear-gradient(to bottom, rgba(31,31,27,0.22) 0%, rgba(31,31,27,0) 30%, rgba(31,31,27,0.45) 100%)",
        }}
      />
      <FilmGrain opacity={0.07} />
      {/* microcopy */}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 92 }}>
        <div style={{ ...kicker, textShadow: "0 2px 18px rgba(0,0,0,0.6)" }}>
          <Eyebrow color={C.cream} dashColor={C.goldSoft} size={25} style={{ justifyContent: "center" }}>
            Lo que vas a crear hoy
          </Eyebrow>
        </div>
        <div
          style={{
            ...sub,
            fontFamily: FONTS.body,
            fontStyle: "italic",
            fontSize: 30,
            color: C.cream,
            marginTop: 14,
            textShadow: "0 2px 16px rgba(0,0,0,0.6)",
          }}
        >
          shampoo sólido crecepelo · con tus propias manos
        </div>
      </AbsoluteFill>
      {/* línea dorada en el borde del wipe */}
      {wipe > 0.001 && wipe < 0.999 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${(1 - wipe) * 100}%`,
            height: 3,
            background: `linear-gradient(to right, transparent, ${C.goldSoft}, transparent)`,
            boxShadow: `0 0 16px ${C.goldSoft}`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════
// ATMÓSFERA — viñeta + motas a la deriva (noise2D) + grano
// ════════════════════════════════════════════════════════════
const MOTES = Array.from({ length: 24 }, (_, i) => i);

export const IntroAtmosphere: React.FC = () => {
  const frame = useCurrentFrame();
  const t = useT();
  const appear = interpolate(t, [0, 1.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  const out = useExit(0.9);

  return (
    <AbsoluteFill style={{ opacity: appear * out }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 90% at 50% 38%, rgba(31,31,27,0) 42%, rgba(31,31,27,0.34) 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(31,31,27,0.16) 0%, rgba(31,31,27,0) 22%, rgba(31,31,27,0) 70%, rgba(31,31,27,0.26) 100%)",
        }}
      />
      {MOTES.map((i) => {
        const baseX = (i * 137.5) % 100;
        const baseY = (i * 53.3) % 100;
        const dx = noise2D("x" + i, i, frame * 0.006) * 6;
        const dy = noise2D("y" + i, i, frame * 0.006) * 6;
        const tw = 0.16 + (noise2D("o" + i, i, frame * 0.02) + 1) * 0.15;
        const size = 3 + ((i * 7) % 5);
        const gold = i % 3 === 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${baseX + dx}%`,
              top: `${baseY + dy}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background: gold ? C.goldSoft : C.cream,
              opacity: tw,
              filter: "blur(0.6px)",
              boxShadow: gold ? "0 0 10px rgba(201,168,86,0.5)" : "0 0 8px rgba(245,239,230,0.4)",
            }}
          />
        );
      })}
      <FilmGrain opacity={0.05} />
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════
// SPRIG BOTÁNICO — trazo que se dibuja (evolvePath)
// ════════════════════════════════════════════════════════════
const SPRIG =
  "M60 138 C 57 104, 63 78, 60 40 " +
  "M60 116 C 41 109, 31 96, 35 83 C 50 87, 59 101, 60 116 " +
  "M60 95 C 79 88, 90 75, 86 62 C 71 67, 61 81, 60 95 " +
  "M60 72 C 44 66, 35 55, 39 44 C 52 49, 60 62, 60 72 " +
  "M60 50 C 74 45, 83 35, 80 25 C 69 30, 61 41, 60 50 " +
  "M60 40 C 58 32, 62 26, 60 18";

export const BotanicalSprig: React.FC<{
  delay: number;
  size?: number;
  flip?: boolean;
  color?: string;
}> = ({ delay, size = 84, flip = false, color = C.goldSoft }) => {
  const t = useT();
  const p = interpolate(t, [delay, delay + 1.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  const { strokeDasharray, strokeDashoffset } = evolvePath(p, SPRIG);
  return (
    <svg
      width={size}
      height={size * (140 / 120)}
      viewBox="0 0 120 140"
      style={{ transform: flip ? "scaleX(-1)" : undefined, overflow: "visible" }}
    >
      <path
        d={SPRIG}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
        style={{ filter: "drop-shadow(0 2px 10px rgba(31,31,27,0.4))" }}
      />
    </svg>
  );
};

// ════════════════════════════════════════════════════════════
// HOOK — gancho palabra-por-palabra (spring) con open loop
// ════════════════════════════════════════════════════════════
type W = { w: string; g?: boolean };
type HookLine = { show: number; hide: number; words: W[] };
const HOOK: HookLine[] = [
  {
    show: 0.7,
    hide: 4.3,
    words: [
      { w: "Un" }, { w: "shampoo" }, { w: "sólido" }, { w: "que" }, { w: "frena", g: true }, { w: "la", g: true }, { w: "caída", g: true },
    ],
  },
  {
    show: 4.5,
    hide: 9.0,
    words: [
      { w: "y" }, { w: "despierta" }, { w: "tu" }, { w: "cabello" }, { w: "—" }, { w: "con" }, { w: "3", g: true }, { w: "activos", g: true },
    ],
  },
];

export const HookCaptions: React.FC = () => {
  const { frame, fps } = useFF();
  const t = frame / fps;
  const line = HOOK.find((l) => t >= l.show && t < l.hide);
  if (!line) return null;
  const until = line.hide - t;
  const boxOut = interpolate(until, [0, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const boxIn = springProg(frame, fps, line.show, SPRING_SOFT);

  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, display: "flex", justifyContent: "center", padding: "0 80px" }}>
      <div
        style={{
          background: C.banda,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          padding: "20px 50px",
          boxShadow: "0 18px 60px rgba(31,31,27,0.30)",
          borderTop: `2px solid ${C.gold}`,
          opacity: Math.min(boxIn, boxOut),
          transform: `translateY(${(1 - Math.min(1, boxIn)) * 16}px)`,
          maxWidth: 1480,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 16px", fontFamily: FONTS.display, fontWeight: 600, fontSize: 62, lineHeight: 1.12 }}>
          {line.words.map((wd, i) => {
            const wp = springProg(frame, fps, line.show + 0.12 + i * 0.05, wd.g ? SPRING_SNAPPY : SPRING_SOFT);
            const op = Math.min(1, Math.max(0, wp));
            const sc = wd.g ? 1 + Math.max(0, wp - 1) * 0.6 + (op < 1 ? -(1 - op) * 0.06 : 0) : 1;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color: wd.g ? C.gold : C.ink,
                  fontStyle: wd.g ? "italic" : "normal",
                  opacity: op,
                  transform: `translateY(${(1 - op) * 14}px) scale(${sc})`,
                }}
              >
                {wd.w}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// TRÍADA DE ACTIVOS — value stack (spring snappy + hairline dorada)
// ════════════════════════════════════════════════════════════
const ACTIVOS = [
  { name: "Niacinamida", role: "nutre y fortalece", delay: 0.2 },
  { name: "Cafeína", role: "activa la circulación", delay: 0.55 },
  { name: "Fenogreco", role: "frena la caída", delay: 0.9 },
];

const ActivoCard: React.FC<{ name: string; role: string; delay: number }> = ({ name, role, delay }) => {
  const { frame, fps } = useFF();
  const pop = springPop(frame, fps, delay, 0.9, 26, SPRING_SNAPPY);
  return (
    <div
      style={{
        width: 320,
        padding: "30px 26px 28px",
        background: C.bandaSolid,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        boxShadow: "0 18px 54px rgba(31,31,27,0.28)",
        borderTop: `3px solid ${C.gold}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        ...pop,
      }}
    >
      <BotanicalSprig delay={delay + 0.15} size={52} color={C.sageDeep} />
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 42, color: C.ink, lineHeight: 1.05, marginTop: 6 }}>{name}</div>
      <div style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 23, color: C.inkSoft, marginTop: 8 }}>{role}</div>
    </div>
  );
};

export const IngredientTriad: React.FC = () => {
  const { frame, fps } = useFF();
  const t = frame / fps;
  const out = useExit(0.55);
  const eyebrow = springRise(frame, fps, 0, 14, SPRING_SOFT);
  // hairline dorada que une las 3 tarjetas (se dibuja tras aterrizar)
  const lineD = "M0 1 L 1020 1";
  const lp = interpolate(t, [1.25, 2.05], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const { strokeDasharray, strokeDashoffset } = evolvePath(lp, lineD);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: out }}>
      <div style={{ ...eyebrow, marginBottom: 26 }}>
        <Eyebrow color={C.cream} dashColor={C.goldSoft} size={24} style={{ justifyContent: "center", textShadow: "0 2px 14px rgba(31,31,27,0.5)" }}>
          Una mezcla potente de activos
        </Eyebrow>
      </div>
      <div style={{ display: "flex", gap: 30 }}>
        {ACTIVOS.map((a) => (
          <ActivoCard key={a.name} {...a} />
        ))}
      </div>
      <svg width={1020} height={6} viewBox="0 0 1020 6" style={{ marginTop: 22, overflow: "visible" }}>
        <path d={lineD} fill="none" stroke={C.goldSoft} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} style={{ filter: `drop-shadow(0 0 8px ${C.goldSoft})` }} />
      </svg>
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════
// TÍTULO WOW — lockup como recompensa (spring + light-sweep + glow)
// ════════════════════════════════════════════════════════════
export const WowTitle: React.FC = () => {
  const { frame, fps } = useFF();
  const t = frame / fps;
  const out = useExit(0.6);

  // punch-in: blur enfoca antes de que termine la escala
  const tp = springProg(frame, fps, 0.55, SPRING_SOFT);
  const titleBlur = interpolate(t, [0.55, 1.2], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const titleScale = 1.06 - 0.06 * Math.min(1, tp);
  const titleOp = Math.min(1, Math.max(0, tp));

  const rule = drawLine(t, 1.15, 0.9);
  const ringP = springProg(frame, fps, 0.1, SPRING_SNAPPY);
  const ring = 0.85 + 0.15 * Math.min(1.05, ringP);
  const ringOp = interpolate(t, [0.1, 1.2], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // light-sweep dorado que cruza el wordmark una sola vez al asentarse
  const sweep = interpolate(t, [1.25, 2.1], [-130, 130], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const sweepOp = interpolate(t, [1.25, 1.4, 1.9, 2.1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // glow dorado que respira en la regla
  const ruleGlow = interpolate(t, [1.3, 1.8, 2.4], [0, 14, 6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // deriva de cámara orgánica (mata la rigidez)
  const driftX = noise2D("savias-cam-x", frame * 0.01, 0) * 4;
  const driftY = noise2D("savias-cam-y", frame * 0.01, 1) * 4;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", opacity: out }}>
      <div style={{ position: "absolute", bottom: 250, width: 620, height: 620, borderRadius: "50%", border: `1px solid ${C.cream}`, opacity: ringOp, transform: `scale(${ring})` }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 132, textShadow: "0 2px 26px rgba(31,31,27,0.55)", transform: `translate(${driftX}px, ${driftY}px)` }}>
        <div style={{ marginBottom: 6 }}>
          <BotanicalSprig delay={0.25} size={92} color={C.goldSoft} />
        </div>
        <div style={{ ...springRise(frame, fps, 0.45, 12, SPRING_SOFT), display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", boxShadow: "0 4px 14px rgba(31,31,27,0.4)", border: `1.5px solid ${C.goldSoft}` }}>
            <Img src={staticFile("savias-logo.png")} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
          <span style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 23, letterSpacing: "0.34em", textTransform: "uppercase", color: C.cream }}>
            SAVIAS · Lina Toro
          </span>
        </div>

        {/* wordmark con light-sweep */}
        <div style={{ position: "relative", overflow: "hidden", opacity: titleOp, transform: `scale(${titleScale})`, filter: `blur(${titleBlur}px)` }}>
          <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 120, lineHeight: 0.98, color: C.paper, textAlign: "center" }}>
            Shampoo sólido
          </div>
          <div style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 600, fontSize: 120, lineHeight: 1.0, color: C.goldSoft, textAlign: "center" }}>
            crecepelo
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: sweepOp,
              mixBlendMode: "overlay",
              background: `linear-gradient(105deg, transparent 42%, rgba(255,248,224,0.75) 50%, transparent 58%)`,
              transform: `translateX(${sweep}%)`,
            }}
          />
        </div>

        <div style={{ width: 280, height: 2, background: C.goldSoft, margin: "26px 0 20px", transform: `scaleX(${rule})`, transformOrigin: "center", boxShadow: `0 0 ${ruleGlow}px ${C.goldSoft}` }} />
        <div style={{ ...springRise(frame, fps, 1.4, 12, SPRING_SOFT), fontFamily: FONTS.body, fontStyle: "italic", fontSize: 33, color: C.cream, letterSpacing: "0.01em" }}>
          el porqué de cada paso · de los activos a la barra
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════
// ROADMAP — open loop (spring + ítem destacado con subrayado dibujado)
// ════════════════════════════════════════════════════════════
const RoadRow: React.FC<{ n: string; label: string; delay: number; highlight?: boolean }> = ({ n, label, delay, highlight }) => {
  const { frame, fps } = useFF();
  const t = frame / fps;
  const p = springProg(frame, fps, delay, SPRING_SOFT);
  const op = Math.min(1, Math.max(0, p));
  // numeral aparece ~4f antes que el texto (overlapping action)
  const np = springProg(frame, fps, delay - 0.13, SPRING_SNAPPY);
  const underline = highlight ? interpolate(t, [delay + 0.55, delay + 1.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }) : 0;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 22, padding: "15px 0", borderBottom: `1px solid ${C.hairSage}`, opacity: op, transform: `translateX(${(1 - op) * -16}px)`, filter: `blur(${(1 - op) * 6}px)` }}>
      <span style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 600, fontSize: 44, color: C.gold, lineHeight: 1, minWidth: 64, opacity: Math.min(1, Math.max(0, np)) }}>{n}</span>
      <span style={{ position: "relative", display: "inline-block" }}>
        <span style={{ fontFamily: FONTS.display, fontWeight: 500, fontSize: 40, color: C.ink, lineHeight: 1.1 }}>{label}</span>
        {highlight && (
          <span style={{ position: "absolute", left: 0, bottom: -4, height: 3, width: "100%", background: C.gold, transform: `scaleX(${underline})`, transformOrigin: "left", boxShadow: `0 0 8px ${C.goldSoft}` }} />
        )}
      </span>
    </div>
  );
};

export const IntroRoadmap: React.FC = () => {
  const { frame, fps } = useFF();
  const t = frame / fps;
  const gapCopy = interpolate(t, [2.6, 3.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  return (
    <Card width={640}>
      <div style={springRise(frame, fps, 0.55, 12, SPRING_SOFT)}>
        <Eyebrow style={{ marginBottom: 14 }}>En este video</Eyebrow>
      </div>
      <div style={{ ...springRise(frame, fps, 0.75, 12, SPRING_SOFT), fontFamily: FONTS.display, fontStyle: "italic", fontSize: 33, color: C.inkSoft, marginBottom: 20 }}>
        de los activos a la barra
      </div>
      <RoadRow n="01" label="El porqué de cada activo" delay={1.1} />
      <RoadRow n="02" label="Incorporar con técnica" delay={1.3} />
      <RoadRow n="03" label="Verificar y ajustar el pH" delay={1.5} highlight />
      <RoadRow n="04" label="Amasar y dar forma" delay={1.7} />
      <div style={{ marginTop: 14, fontFamily: FONTS.body, fontStyle: "italic", fontSize: 23, color: C.gold, opacity: gapCopy, transform: `translateY(${(1 - gapCopy) * 8}px)` }}>
        el paso que casi todas olvidan
      </div>
    </Card>
  );
};
