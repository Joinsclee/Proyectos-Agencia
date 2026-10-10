import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONTS, EXPO, SOFT } from "../crece/theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Ciclo de vida común: visibilidad 0→1 al entrar, 1→0 al salir.
const useLife = (
  t: number,
  show: number,
  hide: number,
  enterDur = 0.5,
  exitDur = 0.4
) => {
  const since = t - show;
  const until = hide - t;
  const enter = interpolate(since, [0, enterDur], [0, 1], {
    ...clamp,
    easing: EXPO,
  });
  const exit = interpolate(until, [0, exitDur], [0, 1], clamp);
  return { vis: Math.min(enter, exit), since, until };
};

const dash = (color: string = C.gold, w: number = 30) => (
  <span
    style={{ width: w, height: 1.6, background: color, display: "inline-block" }}
  />
);

// ─────────────────────────────────────────────────────────────
// 1 · Lower-third de marca (apertura). Arriba-izquierda para no
//     chocar con la píldora de subtítulos (abajo-centro).
// ─────────────────────────────────────────────────────────────
export const BrandLowerThird: React.FC<{
  t: number;
  show: number;
  hide: number;
  name: string;
  sub: string;
}> = ({ t, show, hide, name, sub }) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.7, 0.5);
  const x = (1 - interpolate(since, [0, 0.7], [0, 1], { ...clamp, easing: EXPO })) * -26;
  const lineW = interpolate(since, [0.25, 0.95], [0, 1], { ...clamp, easing: EXPO });
  return (
    <div
      style={{
        position: "absolute",
        left: 84,
        top: 92,
        opacity: vis,
        transform: `translateX(${x}px)`,
        paddingLeft: 22,
        borderLeft: `2px solid ${C.gold}`,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sc,
          fontSize: 19,
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: C.cream,
          display: "flex",
          alignItems: "center",
          gap: 12,
          textShadow: "0 2px 10px rgba(0,0,0,0.6)",
        }}
      >
        {dash(C.goldSoft, 26)} {name}
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: FONTS.display,
          fontSize: 44,
          fontWeight: 600,
          color: "#fff",
          letterSpacing: "-0.01em",
          textShadow: "0 3px 16px rgba(0,0,0,0.65)",
          transform: `scaleX(${0.96 + lineW * 0.04})`,
          transformOrigin: "left center",
        }}
      >
        {sub}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 2 · Reveal editorial del producto: "La Ruta Jabonera".
//     Centrado en la mitad superior. Hero del video.
// ─────────────────────────────────────────────────────────────
export const TitleReveal: React.FC<{
  t: number;
  show: number;
  hide: number;
  eyebrow: string;
  title: string;
  tagline?: string;
}> = ({ t, show, hide, eyebrow, title, tagline }) => {
  if (t < show - 0.1 || t > hide + 0.6) return null;
  const { vis, since } = useLife(t, show, hide, 0.6, 0.5);
  const rise = interpolate(since, [0, 0.7], [0, 1], { ...clamp, easing: EXPO });
  const blur = (1 - interpolate(since, [0, 0.55], [0, 1], clamp)) * 10;
  const underline = interpolate(since, [0.35, 1.1], [0, 1], { ...clamp, easing: EXPO });
  const eyeOp = interpolate(since, [0, 0.4], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 220,
        opacity: vis,
        pointerEvents: "none",
      }}
    >
      {/* Scrim radial suave para que el título/eyebrow lean sobre el rostro */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 58% 48% at 50% 42%, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.30) 46%, rgba(0,0,0,0) 72%)",
        }}
      />
      <div
        style={{
          position: "relative",
          fontFamily: FONTS.sc,
          fontSize: 24,
          letterSpacing: "0.42em",
          textTransform: "uppercase",
          color: "#F0D98B",
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: eyeOp,
          marginBottom: 18,
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        {dash(C.gold, 34)} {eyebrow} {dash(C.gold, 34)}
      </div>
      <div
        style={{
          position: "relative",
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 132,
          lineHeight: 0.98,
          color: "#FFFDF8",
          textAlign: "center",
          letterSpacing: "-0.01em",
          transform: `translateY(${(1 - rise) * 26}px)`,
          filter: `blur(${blur}px)`,
          textShadow: "0 8px 40px rgba(0,0,0,0.7), 0 2px 10px rgba(0,0,0,0.6)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 18,
          width: 360,
          height: 3,
          background: C.gold,
          transform: `scaleX(${underline})`,
          boxShadow: "0 4px 20px rgba(184,148,62,0.6)",
        }}
      />
      {tagline ? (
        <div
          style={{
            position: "relative",
            marginTop: 22,
            fontFamily: FONTS.body,
            fontStyle: "italic",
            fontSize: 36,
            color: "#FBF3E2",
            opacity: interpolate(since, [0.5, 1.0], [0, 1], clamp),
            textShadow: "0 2px 16px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.7)",
          }}
        >
          {tagline}
        </div>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 3 · Stack de valor: tarjeta arriba-derecha que ACUMULA ítems.
//     Cada fila se revela en su tiempo `at`; la tarjeta entra/sale
//     una sola vez (no satura: un único elemento que crece).
// ─────────────────────────────────────────────────────────────
export type ValueItem = { at: number; label: string; bonus?: boolean };

export const ValueStack: React.FC<{
  t: number;
  show: number;
  hide: number;
  title: string;
  items: ValueItem[];
}> = ({ t, show, hide, title, items }) => {
  if (t < show - 0.1 || t > hide + 0.6) return null;
  const { vis, since } = useLife(t, show, hide, 0.6, 0.5);
  const cardX = (1 - interpolate(since, [0, 0.7], [0, 1], { ...clamp, easing: EXPO })) * -40;
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        top: 130,
        width: 560,
        opacity: vis,
        transform: `translateX(${cardX}px)`,
        background: "rgba(31, 31, 27, 0.74)",
        border: `1px solid ${C.hairSage}`,
        borderRadius: 18,
        padding: "26px 30px 28px",
        boxShadow: "0 26px 64px -20px rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sc,
          fontSize: 19,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: C.goldSoft,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {dash(C.gold, 26)} {title}
      </div>
      {items.map((it, i) => {
        const rowSince = t - it.at;
        const rowVis = interpolate(rowSince, [0, 0.45], [0, 1], { ...clamp, easing: SOFT });
        const rowY = (1 - rowVis) * 14;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              padding: "11px 0",
              opacity: rowVis,
              transform: `translateY(${rowY}px)`,
              borderTop: i === 0 ? "none" : `1px solid rgba(247,242,232,0.10)`,
            }}
          >
            <span
              style={{
                flex: "0 0 auto",
                width: 30,
                height: 30,
                borderRadius: 999,
                background: it.bonus ? C.gold : C.sage,
                color: it.bonus ? C.ink : "#14160F",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 800,
                marginTop: 2,
                boxShadow: `0 6px 16px -4px ${it.bonus ? "rgba(184,148,62,0.6)" : "rgba(156,175,136,0.5)"}`,
              }}
            >
              {it.bonus ? "★" : "✓"}
            </span>
            <span
              style={{
                fontSize: 31,
                fontWeight: 600,
                lineHeight: 1.18,
                color: it.bonus ? C.goldSoft : "#FBF7EE",
                letterSpacing: "-0.01em",
              }}
            >
              {it.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 3b · Énfasis: frase corta (Cormorant italic) con una palabra en
//      dorado. Refuerzo sutil de un beat, en una esquina superior.
// ─────────────────────────────────────────────────────────────
export const EmphasisText: React.FC<{
  t: number;
  show: number;
  hide: number;
  text: string;
  highlight?: string;
  side?: "left" | "right";
}> = ({ t, show, hide, text, highlight, side = "left" }) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.55, 0.45);
  const dx = (1 - interpolate(since, [0, 0.6], [0, 1], { ...clamp, easing: EXPO })) *
    (side === "left" ? -28 : 28);
  const blur = (1 - interpolate(since, [0, 0.5], [0, 1], clamp)) * 7;
  const parts = highlight ? text.split(new RegExp(`(${highlight})`, "i")) : [text];
  return (
    <div
      style={{
        position: "absolute",
        top: 150,
        [side]: 56,
        maxWidth: 660,
        padding: side === "left" ? "14px 40px 16px 32px" : "14px 32px 16px 40px",
        textAlign: side === "left" ? "left" : "right",
        background:
          side === "left"
            ? "radial-gradient(ellipse 78% 135% at 8% 50%, rgba(0,0,0,0.46) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0) 72%)"
            : "radial-gradient(ellipse 78% 135% at 92% 50%, rgba(0,0,0,0.46) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0) 72%)",
        opacity: vis,
        transform: `translateX(${dx}px)`,
        filter: `blur(${blur}px)`,
        fontFamily: FONTS.display,
        fontStyle: "italic",
        fontWeight: 600,
        fontSize: 54,
        lineHeight: 1.12,
        color: "#FFFDF8",
        letterSpacing: "-0.01em",
        textShadow:
          "0 3px 22px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      {parts.map((p, i) =>
        highlight && p.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} style={{ color: C.goldSoft }}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 4 · Badge superior (urgencia / garantía). Píldora small-caps.
// ─────────────────────────────────────────────────────────────
export const TopBadge: React.FC<{
  t: number;
  show: number;
  hide: number;
  text: string;
  icon?: string;
  variant?: "gold" | "sage";
}> = ({ t, show, hide, text, icon, variant = "sage" }) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.45, 0.4);
  const pop = interpolate(since, [0, 0.4], [0.82, 1], { ...clamp, easing: EXPO });
  const isGold = variant === "gold";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 116,
        display: "flex",
        justifyContent: "center",
        opacity: vis,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${pop})`,
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: isGold ? C.gold : "rgba(95, 115, 82, 0.95)",
          color: isGold ? C.ink : C.paper,
          fontFamily: FONTS.sc,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          padding: "16px 34px",
          borderRadius: 999,
          border: `1px solid ${isGold ? "rgba(255,255,255,0.4)" : C.goldSoft}`,
          boxShadow: `0 18px 44px -14px rgba(0,0,0,0.55)`,
        }}
      >
        {icon ? <span style={{ fontSize: 28 }}>{icon}</span> : null}
        {text}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 5 · Tarjeta de precio. Centro-superior, editorial.
// ─────────────────────────────────────────────────────────────
export const PriceCard: React.FC<{
  t: number;
  show: number;
  hide: number;
  eyebrow: string;
  price: string;
  alt: string;
  tagline?: string;
}> = ({ t, show, hide, eyebrow, price, alt, tagline }) => {
  if (t < show - 0.1 || t > hide + 0.6) return null;
  const { vis, since } = useLife(t, show, hide, 0.55, 0.5);
  const rise = interpolate(since, [0, 0.7], [0, 1], { ...clamp, easing: EXPO });
  const blur = (1 - interpolate(since, [0, 0.5], [0, 1], clamp)) * 8;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 230,
        opacity: vis,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `translateY(${(1 - rise) * 22}px)`,
          filter: `blur(${blur}px)`,
          textAlign: "center",
          background: "rgba(245, 239, 230, 0.96)",
          borderRadius: 20,
          padding: "26px 56px 30px",
          boxShadow: "0 28px 70px -22px rgba(0,0,0,0.6)",
          border: `1px solid ${C.hairSage}`,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.sc,
            fontSize: 20,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: C.sageDeep,
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 110,
            lineHeight: 1,
            color: C.ink,
            letterSpacing: "-0.02em",
          }}
        >
          {price}
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 30,
            color: C.inkSoft,
            marginTop: 6,
          }}
        >
          {alt}
        </div>
        {tagline ? (
          <div
            style={{
              fontFamily: FONTS.display,
              fontStyle: "italic",
              fontSize: 34,
              color: C.gold,
              marginTop: 14,
            }}
          >
            {tagline}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// 6 · CTA WhatsApp final. Píldora verde con flecha rebotando hacia
//     el botón real (que está DEBAJO del video en la página).
// ─────────────────────────────────────────────────────────────
const WHATSAPP = "#25D366";
const WHATSAPP_DARK = "#128C7E";

export const WhatsappCTA: React.FC<{
  t: number;
  show: number;
  hide: number;
  text: string;
  sub: string;
}> = ({ t, show, hide, text, sub }) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.5, 0.4);
  const pop = interpolate(since, [0, 0.5], [0.8, 1], { ...clamp, easing: EXPO });
  const pulse = 1 + Math.sin(since * 3.0) * 0.012;
  const bounce = Math.abs(Math.sin(since * 3.2)) * 14;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 596,
        display: "flex",
        justifyContent: "center",
        opacity: vis,
        pointerEvents: "none",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          transform: `scale(${pop * pulse})`,
          display: "flex",
          alignItems: "center",
          gap: 22,
          background: `linear-gradient(135deg, ${WHATSAPP} 0%, ${WHATSAPP_DARK} 100%)`,
          border: "2px solid rgba(255,255,255,0.55)",
          borderRadius: 999,
          padding: "22px 46px",
          boxShadow: `0 0 0 6px rgba(37,211,102,0.18), 0 26px 64px -16px rgba(18,140,126,0.6)`,
        }}
      >
        <span style={{ fontSize: 52, lineHeight: 1 }}>💬</span>
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 38,
              color: "#fff",
              letterSpacing: "-0.01em",
              lineHeight: 1.05,
            }}
          >
            {text}
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 24,
              color: "rgba(255,255,255,0.92)",
              marginTop: 3,
            }}
          >
            {sub}
          </div>
        </div>
        <span
          style={{
            fontSize: 50,
            transform: `translateY(${bounce}px)`,
            lineHeight: 1,
          }}
        >
          👇
        </span>
      </div>
    </div>
  );
};
