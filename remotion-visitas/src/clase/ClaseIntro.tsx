import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { C, FONTS, EXPO, SOFT, drawLine } from "../crece/theme";

// ───────────────────────────────────────────────────────────────
// Intro branded SAVIAS para las clases del producto (Ruta Jabonera).
// Estilo editorial "Conciencia": papel crema + glow sage/dorado,
// split asimétrico (texto a la izquierda · producto a la derecha) y
// una píldora de FECHA DE DESBLOQUEO bien visible. ~8.5 s, 1080p30.
//
// Se renderiza por separado y se antepone al cuerpo de la clase con
// `ffmpeg concat -c copy` (params idénticos) — sin re-encodear la clase.
// ───────────────────────────────────────────────────────────────

export const CLASE_INTRO_FPS = 30;
export const CLASE_INTRO_DURATION = Math.round(8.5 * CLASE_INTRO_FPS); // 255 frames

export type ClaseIntroConfig = {
  claseLabel: string; // "Clase 01"
  eyebrow: string; // "Ruta Jabonera"
  title: string; // "Jabón tipo postre"
  titleSize: number; // px
  tagline: string; // italic, una línea
  unlockDay: string; // "Lunes 29 de junio"
  product: string; // archivo en public/
  productShape: "spotlight" | "free"; // spotlight = backing claro (fondo blanco), free = png transparente
  productScale?: number; // ajuste fino del tamaño del producto
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Reveal editorial reutilizable: opacidad + translateY + blur con expo.
const reveal = (t: number, at: number, dur = 0.8, dy = 22, blur = 9) => {
  const p = interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: EXPO });
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * dy}px)`,
    filter: `blur(${(1 - p) * blur}px)`,
  };
};

const dash = (w = 34, color = C.gold) => (
  <span style={{ width: w, height: 1.6, background: color, display: "inline-block" }} />
);

// Candado fino para la píldora de fecha (se "desbloquea" tal día).
const LockIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 26,
  color = C.gold,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" stroke={color} strokeWidth="1.7" />
    <path d="M7.6 10.5V7.6a4.4 4.4 0 0 1 8.8 0v2.9" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="12" cy="15.4" r="1.5" fill={color} />
  </svg>
);

export const ClaseIntro: React.FC<{ cfg: ClaseIntroConfig }> = ({ cfg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const total = durationInFrames / fps;

  // Fade out global de salida (handoff limpio al cuerpo de la clase).
  const fadeOut = interpolate(t, [total - 0.45, total], [1, 0], clamp);

  // Vida ambiental continua (respiración del glow + flotación del producto).
  const breathe = 1 + Math.sin(t * 0.9) * 0.03;
  const floatY = Math.sin(t * 0.8 + 1) * 10;
  const driftX = interpolate(t, [0, total], [0, -18], clamp); // parallax lentísimo del fondo

  const isFree = cfg.productShape === "free";
  const pScale = cfg.productScale ?? 1;

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, opacity: fadeOut }}>
      {/* ── Fondo: papel crema + glow sage/dorado (estilo Conciencia) ── */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${C.paper} 0%, ${C.cream} 46%, ${C.creamDeep} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 30% 26%, rgba(156,175,136,0.34) 0%, rgba(156,175,136,0) 58%)",
          transform: `translateX(${driftX}px) scale(${breathe})`,
          transformOrigin: "30% 30%",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 74% 66%, rgba(184,148,62,0.20) 0%, rgba(184,148,62,0) 52%)",
          transform: `scale(${breathe})`,
          transformOrigin: "74% 66%",
        }}
      />
      {/* Viñeta sutil para asentar el cuadro */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 50%, rgba(0,0,0,0) 58%, rgba(31,31,27,0.10) 100%)",
        }}
      />

      {/* ── Marca: chip SS + wordmark (arriba-izquierda) ── */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 96,
          display: "flex",
          alignItems: "center",
          gap: 18,
          ...reveal(t, 0.0, 0.7, 14, 6),
        }}
      >
        <Img
          src={staticFile("savias-logo.png")}
          style={{
            width: 70,
            height: 70,
            borderRadius: 16,
            boxShadow: "0 12px 30px -10px rgba(95,115,82,0.6)",
          }}
        />
        <span
          style={{
            fontFamily: FONTS.sc,
            fontSize: 30,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: C.sageDeep,
          }}
        >
          Savias
        </span>
      </div>

      {/* ── Columna de texto (izquierda, centrada vertical) ── */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 0,
          bottom: 0,
          width: 980,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {/* eyebrow: Ruta Jabonera · Clase */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            ...reveal(t, 0.35, 0.7, 14, 5),
          }}
        >
          <span style={{ transformOrigin: "left", transform: `scaleX(${drawLine(t, 0.45, 0.7)})` }}>
            {dash(40)}
          </span>
          <span
            style={{
              fontFamily: FONTS.sc,
              fontSize: 27,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: C.gold,
            }}
          >
            {cfg.eyebrow}
          </span>
        </div>

        {/* Clase NN */}
        <div
          style={{
            marginTop: 22,
            fontFamily: FONTS.sc,
            fontSize: 25,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: C.sageDeep,
            ...reveal(t, 0.55, 0.7, 14, 5),
          }}
        >
          {cfg.claseLabel}
        </div>

        {/* Regla dorada que se dibuja (sin título: ancla el bloque) */}
        <div
          style={{
            marginTop: 26,
            width: 320,
            height: 3,
            background: `linear-gradient(90deg, ${C.gold}, ${C.goldSoft})`,
            transformOrigin: "left center",
            transform: `scaleX(${drawLine(t, 0.95, 0.8)})`,
            boxShadow: "0 4px 18px rgba(184,148,62,0.45)",
          }}
        />

        {/* Descriptor (cursiva) — pasa a ser la línea protagonista */}
        <div
          style={{
            marginTop: 26,
            fontFamily: FONTS.body,
            fontStyle: "italic",
            fontSize: 54,
            color: C.ink,
            maxWidth: 820,
            lineHeight: 1.16,
            letterSpacing: "-0.01em",
            ...reveal(t, 1.15, 0.85, 22, 9),
          }}
        >
          {cfg.tagline}
        </div>

        {/* Píldora de FECHA DE DESBLOQUEO */}
        <div
          style={{
            marginTop: 42,
            display: "inline-flex",
            alignSelf: "flex-start",
            alignItems: "center",
            gap: 18,
            background: C.bandaSolid,
            border: `1px solid ${C.hairSage}`,
            borderLeft: `3px solid ${C.gold}`,
            borderRadius: 16,
            padding: "16px 28px",
            boxShadow: "0 18px 46px -20px rgba(31,31,27,0.4)",
            ...reveal(t, 1.6, 0.7, 16, 6),
          }}
        >
          <LockIcon size={28} color={C.gold} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontFamily: FONTS.sc,
                fontSize: 18,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: C.sageDeep,
              }}
            >
              Se desbloquea el
            </span>
            <span
              style={{
                fontFamily: FONTS.display,
                fontWeight: 600,
                fontSize: 40,
                lineHeight: 1.05,
                color: C.ink,
                letterSpacing: "-0.01em",
              }}
            >
              {cfg.unlockDay}
            </span>
          </div>
        </div>
      </div>

      {/* ── Producto (derecha, hero flotante) ── */}
      <div
        style={{
          position: "absolute",
          right: 130,
          top: 0,
          bottom: 0,
          width: 720,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...reveal(t, 0.5, 1.0, 34, 12),
        }}
      >
        <div
          style={{
            position: "relative",
            transform: `translateY(${floatY}px) scale(${interpolate(
              t,
              [0.5, total],
              [1.0, 1.05],
              clamp
            )})`,
          }}
        >
          {cfg.productShape === "spotlight" ? (
            // Backing claro para productos con fondo blanco (jabón).
            <div
              style={{
                width: 560,
                height: 560,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 50% 42%, #FFFFFF 0%, #FBF7EF 56%, #F3EAD8 100%)",
                border: `1px solid ${C.hairSage}`,
                boxShadow:
                  "0 40px 90px -34px rgba(31,31,27,0.45), inset 0 2px 30px rgba(255,255,255,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Img
                src={staticFile(cfg.product)}
                style={{
                  width: 430 * pScale,
                  objectFit: "contain",
                  filter: "drop-shadow(0 24px 40px rgba(31,31,27,0.28))",
                }}
              />
            </div>
          ) : (
            // PNG transparente: flota directo con sombra suave.
            <Img
              src={staticFile(cfg.product)}
              style={{
                width: 620 * pScale,
                objectFit: "contain",
                filter: "drop-shadow(0 36px 56px rgba(31,31,27,0.35))",
              }}
            />
          )}
          {/* halo dorado detrás del producto */}
          <div
            style={{
              position: "absolute",
              inset: isFree ? "-14%" : "-8%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(184,148,62,0.22) 0%, rgba(184,148,62,0) 64%)",
              zIndex: -1,
              transform: `scale(${breathe})`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Presets por clase ──────────────────────────────────────────
export const CLASE_INTRO_CONFIGS: Record<string, ClaseIntroConfig> = {
  postre: {
    claseLabel: "Clase 01",
    eyebrow: "Ruta Jabonera",
    title: "Jabón tipo postre",
    titleSize: 118,
    tagline: "Capa a capa, como un postre artesanal.",
    unlockDay: "Lunes 29 de junio",
    product: "soap-hero.png",
    productShape: "spotlight",
    productScale: 1,
  },
  cromoterapia: {
    claseLabel: "Clase 02",
    eyebrow: "Ruta Jabonera",
    title: "Cromoterapia",
    titleSize: 150,
    tagline: "El color como ingrediente que sana.",
    unlockDay: "Martes 30 de junio",
    product: "item-colorantes.png",
    productShape: "free",
    productScale: 1.04,
  },
};
