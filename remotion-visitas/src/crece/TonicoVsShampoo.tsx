import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, random } from "remotion";
import { C, FONTS, EXPO, useSceneDur } from "./theme";

// ════════════════════════════════════════════════════════════════
// Escena cinematográfica · SHAMPOO → TÓNICO (foto-ilustración + cámara)
//   3 beats con cross-dissolve, Ken Burns (push-in), partículas/bokeh,
//   grano de película, viñeta y tipografía cinética. Día → noche.
//   Imágenes generadas con Codex (image_generation) en public/.
// ════════════════════════════════════════════════════════════════

type Beat = {
  src: string;
  inS: number;
  outS: number;
  eyebrow: string;
  head: string;
  sub: string;
  zoom: [number, number];
  pan: [number, number]; // px de desplazamiento al final
  night?: boolean;
};

const BEATS: Beat[] = [
  { src: "scene-shower.png", inS: 0, outS: 7.2, eyebrow: "Con shampoo", head: "Se enjuaga y listo", sub: "minutos de contacto · se va con el agua", zoom: [1.06, 1.16], pan: [-40, 20] },
  { src: "scene-apply.png", inS: 6.6, outS: 12.4, eyebrow: "Con tónico", head: "Te lo aplicas en la raíz", sub: "va directo al folículo", zoom: [1.05, 1.15], pan: [40, -16], night: true },
  { src: "scene-night.png", inS: 11.8, outS: 21, eyebrow: "Toda la noche", head: "Actúa mientras duermes", sub: "fortalece y nutre el folículo en profundidad", zoom: [1.04, 1.18], pan: [-30, -24], night: true },
];

const fadeIO = (t: number, inS: number, outS: number, d = 0.8) =>
  Math.min(
    interpolate(t, [inS, inS + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }),
    interpolate(t, [outS - d, outS], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO })
  );

// ── Capa de imagen con Ken Burns ──
const KenBurns: React.FC<{ beat: Beat; t: number }> = ({ beat, t }) => {
  const p = interpolate(t, [beat.inS, beat.outS], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const scale = interpolate(p, [0, 1], beat.zoom);
  const x = interpolate(p, [0, 1], [0, beat.pan[0]]);
  const y = interpolate(p, [0, 1], [0, beat.pan[1]]);
  const op = fadeIO(t, beat.inS, beat.outS);
  if (op <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Img
        src={staticFile(beat.src)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale}) translate(${x}px, ${y}px)`, transformOrigin: "50% 42%" }}
      />
    </AbsoluteFill>
  );
};

// ── Partículas / bokeh a la deriva ──
const Bokeh: React.FC<{ t: number; night: number }> = ({ t, night }) => {
  const dots = React.useMemo(
    () =>
      new Array(22).fill(0).map((_, i) => ({
        x: random(`x${i}`) * 100,
        y: random(`y${i}`) * 100,
        r: 2 + random(`r${i}`) * 7,
        sp: 0.4 + random(`s${i}`) * 1.1,
        ph: random(`p${i}`) * Math.PI * 2,
        tw: 0.5 + random(`t${i}`) * 0.5,
      })),
    []
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {dots.map((d, i) => {
        const yy = (d.y - t * d.sp * 2.2) % 108;
        const yPos = yy < -4 ? yy + 112 : yy;
        const xx = d.x + Math.sin(t * 0.5 + d.ph) * 1.6;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * d.tw + d.ph));
        const opacity = tw * (0.18 + night * 0.5);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${xx}%`,
              top: `${yPos}%`,
              width: d.r * 2,
              height: d.r * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(251,246,234,${0.9}) 0%, rgba(201,168,86,0.25) 55%, transparent 75%)`,
              opacity,
              filter: "blur(1px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ── Lower-third con tipografía cinética ──
const Caption: React.FC<{ beat: Beat; t: number; fps: number }> = ({ beat, t, fps }) => {
  const op = fadeIO(t, beat.inS + 0.3, beat.outS, 0.6);
  if (op <= 0) return null;
  const local = t - (beat.inS + 0.5);
  const sp = spring({ frame: local * fps, fps, config: { damping: 200, stiffness: 90, mass: 0.7 }, durationInFrames: Math.round(0.7 * fps) });
  const rule = interpolate(local, [0.25, 0.95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const subOp = interpolate(local, [0.45, 1.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  return (
    <div style={{ position: "absolute", left: 112, bottom: 132, opacity: op, maxWidth: 1100 }}>
      <div style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 26, letterSpacing: "0.3em", textTransform: "uppercase", color: C.goldSoft, textShadow: "0 2px 14px rgba(0,0,0,0.6)", opacity: interpolate(local, [0, 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `translateY(${(1 - sp) * 14}px)` }}>
        {beat.eyebrow}
      </div>
      <div style={{ height: 2, width: 130, background: C.goldSoft, margin: "16px 0", transform: `scaleX(${rule})`, transformOrigin: "left", boxShadow: "0 0 12px rgba(201,168,86,0.6)" }} />
      <div style={{ overflow: "hidden" }}>
        <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 84, lineHeight: 1.02, color: "#FBF6EA", textShadow: "0 4px 28px rgba(0,0,0,0.65)", transform: `translateY(${(1 - sp) * 96}px)` }}>
          {beat.head}
        </div>
      </div>
      <div style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 32, color: "rgba(247,242,232,0.92)", marginTop: 14, textShadow: "0 2px 16px rgba(0,0,0,0.6)", opacity: subOp, transform: `translateY(${(1 - subOp) * 12}px)` }}>
        {beat.sub}
      </div>
    </div>
  );
};

export const TonicoVsShampoo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const dur = useSceneDur() ?? durationInFrames;
  const t = frame / fps;

  const fade = Math.min(
    interpolate(t, [0, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(t, [dur / fps - 0.7, dur / fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  );

  // nivel de "noche" para teñir partículas / overlays
  const night = BEATS.reduce((acc, b) => (b.night ? Math.max(acc, fadeIO(t, b.inS, b.outS, 0.8)) : acc), 0);

  // grano de película (seed cambia para dar textura viva)
  const seed = Math.floor(frame / 2) % 90;

  return (
    <AbsoluteFill style={{ opacity: fade, backgroundColor: "#1c2118", fontFamily: FONTS.body }}>
      {/* imágenes con Ken Burns + cross-dissolve */}
      {BEATS.map((b, i) => (
        <KenBurns key={i} beat={b} t={t} />
      ))}

      {/* viñeta cinematográfica */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 44%, transparent 42%, rgba(15,18,12,0.5) 100%)", pointerEvents: "none" }} />
      {/* graduación cálida inferior para legibilidad del texto */}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(12,15,10,0.72) 0%, rgba(12,15,10,0.12) 30%, transparent 52%)", pointerEvents: "none" }} />

      {/* partículas / bokeh */}
      <Bokeh t={t} night={night} />

      {/* grano de película */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, mixBlendMode: "overlay", opacity: 0.07, pointerEvents: "none" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={seed} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* eyebrow superior persistente */}
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center", fontFamily: FONTS.sc, fontWeight: 600, fontSize: 24, letterSpacing: "0.36em", textTransform: "uppercase", color: "rgba(251,246,234,0.9)", textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
        Tónico vs Shampoo
      </div>

      {/* captions */}
      {BEATS.map((b, i) => (
        <Caption key={i} beat={b} t={t} fps={fps} />
      ))}
    </AbsoluteFill>
  );
};
