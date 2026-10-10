import React from "react";
import { interpolate } from "remotion";
import { C, FONTS, EXPO, SOFT } from "../crece/theme";

// ───────────────────────────────────────────────────────────────
// Overlays para las clases (tutorial) — kit SAVIAS. Pensados para NO
// tapar a Lina: secciones abajo-centro, tarjetas a los lados, chips
// en esquinas superiores. `t` = segundos relativos al cuerpo de la clase.
// ───────────────────────────────────────────────────────────────

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const tcToSec = (tc: string): number => {
  const [m, s] = tc.split(":").map(Number);
  return m * 60 + s;
};

// Ciclo de vida: 0→1 al entrar, 1→0 al salir.
const useLife = (t: number, show: number, hide: number, enter = 0.5, exit = 0.45) => {
  const since = t - show;
  const until = hide - t;
  const e = interpolate(since, [0, enter], [0, 1], { ...clamp, easing: EXPO });
  const x = interpolate(until, [0, exit], [0, 1], clamp);
  return { vis: Math.min(e, x), since };
};

const dash = (w = 28, color = C.gold) => (
  <span style={{ width: w, height: 1.6, background: color, display: "inline-block" }} />
);

// ── sección · chip de título de paso, abajo-centro (debajo del trabajo) ──
export const SectionBand: React.FC<{ t: number; show: number; hide: number; text: string }> = ({
  t,
  show,
  hide,
  text,
}) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.55, 0.45);
  const y = (1 - interpolate(since, [0, 0.6], [0, 1], { ...clamp, easing: EXPO })) * 24;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 72,
        display: "flex",
        justifyContent: "center",
        opacity: vis,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `translateY(${y}px)`,
          display: "flex",
          alignItems: "center",
          gap: 18,
          background: "rgba(95, 115, 82, 0.95)",
          border: `1px solid ${C.goldSoft}`,
          borderRadius: 999,
          padding: "16px 40px",
          boxShadow: "0 18px 44px -14px rgba(0,0,0,0.5)",
          fontFamily: FONTS.display,
          fontSize: 44,
          fontWeight: 600,
          color: C.paper,
          letterSpacing: "-0.01em",
        }}
      >
        <span style={{ color: C.goldSoft, fontSize: 26 }}>✦</span>
        {text}
      </div>
    </div>
  );
};

// ── ingredientes · tarjeta-lista crema a la izquierda ──
export const IngredientCard: React.FC<{ t: number; show: number; hide: number; copy: string }> = ({
  t,
  show,
  hide,
  copy,
}) => {
  if (t < show - 0.1 || t > hide + 0.6) return null;
  const { vis, since } = useLife(t, show, hide, 0.6, 0.5);
  const x = (1 - interpolate(since, [0, 0.7], [0, 1], { ...clamp, easing: EXPO })) * -36;
  const [title, ...items] = copy.split("\n");
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        top: "50%",
        transform: `translateY(-50%) translateX(${x}px)`,
        width: 560,
        opacity: vis,
        background: C.bandaSolid,
        border: `1px solid ${C.hairSage}`,
        borderLeft: `3px solid ${C.gold}`,
        borderRadius: 18,
        padding: "24px 30px 26px",
        boxShadow: "0 24px 60px -22px rgba(31,31,27,0.5)",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sc,
          fontSize: 20,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: C.sageDeep,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {dash(24)} {title}
      </div>
      {items.map((it, i) => {
        const rowVis = interpolate(since - 0.2 - i * 0.12, [0, 0.4], [0, 1], {
          ...clamp,
          easing: SOFT,
        });
        return (
          <div
            key={i}
            style={{
              fontSize: 29,
              lineHeight: 1.32,
              color: C.ink,
              opacity: rowVis,
              transform: `translateX(${(1 - rowVis) * 10}px)`,
            }}
          >
            {it}
          </div>
        );
      })}
    </div>
  );
};

// ── medida · chip dorado arriba-derecha ──
export const MeasureChip: React.FC<{ t: number; show: number; hide: number; copy: string }> = ({
  t,
  show,
  hide,
  copy,
}) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.45, 0.4);
  const pop = interpolate(since, [0, 0.45], [0.85, 1], { ...clamp, easing: EXPO });
  return (
    <div
      style={{
        position: "absolute",
        top: 110,
        right: 80,
        opacity: vis,
        transform: `scale(${pop})`,
        transformOrigin: "top right",
        background: `linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,
        border: "1px solid rgba(255,255,255,0.45)",
        borderRadius: 18,
        padding: "16px 28px",
        boxShadow: "0 20px 48px -16px rgba(0,0,0,0.5)",
        fontFamily: FONTS.display,
        fontWeight: 700,
        fontSize: 40,
        lineHeight: 1.12,
        color: C.ink,
        textAlign: "right",
        maxWidth: 640,
        whiteSpace: "pre-line",
        letterSpacing: "-0.01em",
      }}
    >
      {copy}
    </div>
  );
};

// ── dato · badge sage arriba-izquierda ──
export const DataBadge: React.FC<{ t: number; show: number; hide: number; copy: string }> = ({
  t,
  show,
  hide,
  copy,
}) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.45, 0.4);
  const x = (1 - interpolate(since, [0, 0.55], [0, 1], { ...clamp, easing: EXPO })) * -22;
  return (
    <div
      style={{
        position: "absolute",
        top: 110,
        left: 80,
        maxWidth: 620,
        opacity: vis,
        transform: `translateX(${x}px)`,
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        background: "rgba(31, 31, 27, 0.80)",
        border: `1px solid ${C.hairSage}`,
        borderRadius: 16,
        padding: "16px 26px",
        boxShadow: "0 18px 46px -18px rgba(0,0,0,0.6)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        fontFamily: FONTS.body,
        fontSize: 32,
        fontWeight: 600,
        lineHeight: 1.2,
        color: "#FBF7EE",
        whiteSpace: "pre-line",
      }}
    >
      <span style={{ color: C.goldSoft, fontSize: 30, lineHeight: 1, marginTop: 2 }}>✦</span>
      {copy}
    </div>
  );
};

// ── énfasis · frase corta en cursiva, abajo-centro con scrim ──
export const EmphasisLine: React.FC<{ t: number; show: number; hide: number; text: string }> = ({
  t,
  show,
  hide,
  text,
}) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.55, 0.45);
  const y = (1 - interpolate(since, [0, 0.6], [0, 1], { ...clamp, easing: EXPO })) * 18;
  const blur = (1 - interpolate(since, [0, 0.5], [0, 1], clamp)) * 7;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 150,
        display: "flex",
        justifyContent: "center",
        opacity: vis,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          textAlign: "center",
          padding: "10px 60px",
          background:
            "radial-gradient(ellipse 80% 150% at 50% 50%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.18) 52%, rgba(0,0,0,0) 78%)",
          transform: `translateY(${y}px)`,
          filter: `blur(${blur}px)`,
          fontFamily: FONTS.display,
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: 56,
          lineHeight: 1.12,
          color: "#FFFDF8",
          letterSpacing: "-0.01em",
          textShadow: "0 3px 22px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.7)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ── cierre · tarjeta central crema (despedida / CTA) ──
export const ClosingCard: React.FC<{ t: number; show: number; hide: number; copy: string }> = ({
  t,
  show,
  hide,
  copy,
}) => {
  if (t < show - 0.1) return null;
  const { vis, since } = useLife(t, show, hide, 0.7, 0.5);
  const rise = interpolate(since, [0, 0.8], [0, 1], { ...clamp, easing: EXPO });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: vis,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `translateY(${(1 - rise) * 24}px)`,
          textAlign: "center",
          background: "rgba(245, 239, 230, 0.96)",
          border: `1px solid ${C.hairSage}`,
          borderRadius: 22,
          padding: "34px 64px 38px",
          boxShadow: "0 30px 72px -22px rgba(0,0,0,0.55)",
          fontFamily: FONTS.display,
          whiteSpace: "pre-line",
        }}
      >
        <div style={{ color: C.gold, fontSize: 34, marginBottom: 10 }}>✦</div>
        <div style={{ fontSize: 50, fontWeight: 600, color: C.ink, lineHeight: 1.18 }}>{copy}</div>
      </div>
    </div>
  );
};

// ── Duración por tipo (segundos en pantalla) ──
export const BEAT_DUR: Record<string, number> = {
  seccion: 3.8,
  ingredientes: 6.5,
  medida: 4.6,
  dato: 4.4,
  enfasis: 3.8,
  cierre: 6.5,
};

export type Beat = { tc: string; scene: string; overlay: string; copy: string };

// Driver: mapea un beat a su overlay. La bienvenida se maneja aparte (captions).
export const renderBeat = (b: Beat, i: number, t: number, bodyDur: number) => {
  if (b.overlay === "bienvenida") return null;
  const show = tcToSec(b.tc);
  const dur = BEAT_DUR[b.overlay] ?? 4;
  const hide = b.overlay === "cierre" ? bodyDur : Math.min(show + dur, bodyDur);
  const key = `${b.tc}-${i}`;
  switch (b.overlay) {
    case "seccion":
      return <SectionBand key={key} t={t} show={show} hide={hide} text={b.copy} />;
    case "ingredientes":
      return <IngredientCard key={key} t={t} show={show} hide={hide} copy={b.copy} />;
    case "medida":
      return <MeasureChip key={key} t={t} show={show} hide={hide} copy={b.copy} />;
    case "dato":
      return <DataBadge key={key} t={t} show={show} hide={hide} copy={b.copy} />;
    case "enfasis":
      return <EmphasisLine key={key} t={t} show={show} hide={hide} text={b.copy} />;
    case "cierre":
      return <ClosingCard key={key} t={t} show={show} hide={hide} copy={b.copy} />;
    default:
      return null;
  }
};
