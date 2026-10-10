import React from "react";
import { interpolate, staticFile, Img } from "remotion";
import { C, FONTS, EXPO, SOFT } from "../crece/theme";

// ───────────────────────────────────────────────────────────────
// Overlays para el tutorial "Jabón tipo Cupcake" — kit SAVIAS.
// Pensados para NO tapar a Lina (rostro centro-arriba): banner de
// seguridad arriba, tarjetas de receta a los lados, QR a un costado.
// `t` = segundos relativos al inicio de la composición.
// ───────────────────────────────────────────────────────────────

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Ciclo de vida: 0→1 al entrar, 1→0 al salir.
const useLife = (t: number, show: number, hide: number, enter = 0.5, exit = 0.45) => {
  const since = t - show;
  const until = hide - t;
  const e = interpolate(since, [0, enter], [0, 1], { ...clamp, easing: EXPO });
  const x = interpolate(until, [0, exit], [0, 1], clamp);
  return { vis: Math.min(e, x), since };
};

const dash = (w = 26, color = C.gold) => (
  <span style={{ width: w, height: 1.6, background: color, display: "inline-block" }} />
);

// ── 1 · Banner de protección personal (arriba, ancho) ──────────
export const SafetyBanner: React.FC<{
  t: number;
  show: number;
  hide: number;
  items: string[];
  note: string;
}> = ({ t, show, hide, items, note }) => {
  if (t < show - 0.1 || t > hide + 0.5) return null;
  const { vis, since } = useLife(t, show, hide, 0.6, 0.45);
  const y = (1 - interpolate(since, [0, 0.6], [0, 1], { ...clamp, easing: EXPO })) * -26;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 64,
        display: "flex",
        justifyContent: "center",
        opacity: vis,
        pointerEvents: "none",
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          background: "rgba(95, 115, 82, 0.94)",
          border: `1px solid ${C.goldSoft}`,
          borderRadius: 20,
          padding: "18px 40px 20px",
          boxShadow: "0 20px 52px -16px rgba(0,0,0,0.55)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: FONTS.sc,
            fontSize: 22,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: C.cream,
          }}
        >
          {dash(24, C.goldSoft)}
          <span style={{ fontSize: 26 }}>🧤</span> Equipo de protección
          {dash(24, C.goldSoft)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {items.map((it, i) => {
            const rowVis = interpolate(since - 0.25 - i * 0.14, [0, 0.4], [0, 1], {
              ...clamp,
              easing: SOFT,
            });
            return (
              <div
                key={i}
                style={{
                  opacity: rowVis,
                  transform: `translateY(${(1 - rowVis) * 10}px)`,
                  background: C.bandaSolid,
                  border: `1px solid ${C.hairSage}`,
                  borderRadius: 999,
                  padding: "10px 26px",
                  fontFamily: FONTS.display,
                  fontSize: 40,
                  fontWeight: 600,
                  color: C.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                {it}
              </div>
            );
          })}
        </div>
        <div
          style={{
            opacity: interpolate(since - 0.7, [0, 0.5], [0, 1], clamp),
            fontFamily: FONTS.display,
            fontStyle: "italic",
            fontSize: 30,
            color: C.cream,
          }}
        >
          <span style={{ color: C.goldSoft }}>✦</span> {note}
        </div>
      </div>
    </div>
  );
};

// ── 2 · Tarjeta de receta (lista con cantidades) a un costado ──
export type RecipeRow = { name: string; amount?: string };

export const RecipeCard: React.FC<{
  t: number;
  show: number;
  hide: number;
  title: string;
  rows: RecipeRow[];
  side?: "left" | "right";
  footnote?: string;
}> = ({ t, show, hide, title, rows, side = "left", footnote }) => {
  if (t < show - 0.1 || t > hide + 0.6) return null;
  const { vis, since } = useLife(t, show, hide, 0.6, 0.5);
  const dir = side === "left" ? -1 : 1;
  const x =
    (1 - interpolate(since, [0, 0.7], [0, 1], { ...clamp, easing: EXPO })) * 40 * dir;
  return (
    <div
      style={{
        position: "absolute",
        [side]: 72,
        top: "50%",
        transform: `translateY(-50%) translateX(${x}px)`,
        width: 588,
        opacity: vis,
        background: C.bandaSolid,
        border: `1px solid ${C.hairSage}`,
        [side === "left" ? "borderLeft" : "borderRight"]: `3px solid ${C.gold}`,
        borderRadius: 18,
        padding: "26px 32px 28px",
        boxShadow: "0 26px 64px -22px rgba(31,31,27,0.55)",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sc,
          fontSize: 21,
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color: C.sageDeep,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {dash(24)} {title}
      </div>
      {rows.map((r, i) => {
        const rowVis = interpolate(since - 0.22 - i * 0.1, [0, 0.4], [0, 1], {
          ...clamp,
          easing: SOFT,
        });
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 18,
              padding: "9px 0",
              borderTop: i === 0 ? "none" : `1px solid rgba(123,143,106,0.20)`,
              opacity: rowVis,
              transform: `translateX(${(1 - rowVis) * 10 * dir}px)`,
            }}
          >
            <span
              style={{
                fontSize: 30,
                lineHeight: 1.24,
                color: C.ink,
                fontWeight: 500,
              }}
            >
              {r.name}
            </span>
            {r.amount ? (
              <span
                style={{
                  flex: "0 0 auto",
                  fontFamily: FONTS.display,
                  fontWeight: 700,
                  fontSize: 32,
                  color: C.gold,
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  // Cifras lining tabulares: cantidades nítidas e inequívocas.
                  fontVariantNumeric: "lining-nums tabular-nums",
                }}
              >
                {r.amount}
              </span>
            ) : null}
          </div>
        );
      })}
      {footnote ? (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid rgba(123,143,106,0.28)`,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontFamily: FONTS.display,
            fontStyle: "italic",
            fontSize: 25,
            lineHeight: 1.2,
            color: C.sageDeep,
            opacity: interpolate(since - 0.4, [0, 0.5], [0, 1], clamp),
          }}
        >
          <span style={{ color: C.gold, fontStyle: "normal" }}>✦</span>
          {footnote}
        </div>
      ) : null}
    </div>
  );
};

// ── 3 · Tarjeta QR de WhatsApp (a un costado) ──────────────────
const WHATSAPP = "#25D366";
const WHATSAPP_DARK = "#128C7E";

export const QrWhatsappCard: React.FC<{
  t: number;
  show: number;
  hide: number;
  qr: string;
  title: string;
  sub: string;
  side?: "left" | "right";
}> = ({ t, show, hide, qr, title, sub, side = "right" }) => {
  if (t < show - 0.1 || t > hide + 0.6) return null;
  const { vis, since } = useLife(t, show, hide, 0.6, 0.5);
  const dir = side === "left" ? -1 : 1;
  const x =
    (1 - interpolate(since, [0, 0.7], [0, 1], { ...clamp, easing: EXPO })) * 44 * dir;
  const pulse = 1 + Math.sin(since * 3.0) * 0.01;
  return (
    <div
      style={{
        position: "absolute",
        [side]: 84,
        top: "50%",
        transform: `translateY(-50%) translateX(${x}px)`,
        width: 468,
        opacity: vis,
        background: "rgba(245, 239, 230, 0.97)",
        border: `1px solid ${C.hairSage}`,
        borderRadius: 24,
        padding: "30px 34px 34px",
        boxShadow: "0 30px 72px -22px rgba(31,31,27,0.6)",
        fontFamily: FONTS.body,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sc,
          fontSize: 20,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: C.sageDeep,
          marginBottom: 6,
        }}
      >
        SAVIAS
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 42,
          fontWeight: 600,
          lineHeight: 1.12,
          color: C.ink,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          margin: "22px auto 20px",
          width: 300,
          height: 300,
          borderRadius: 18,
          background: "#fff",
          padding: 12,
          boxShadow: "0 12px 30px -12px rgba(31,31,27,0.4)",
          transform: `scale(${pulse})`,
        }}
      >
        <Img src={qr} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          background: `linear-gradient(135deg, ${WHATSAPP} 0%, ${WHATSAPP_DARK} 100%)`,
          borderRadius: 999,
          padding: "12px 26px",
          boxShadow: "0 12px 30px -10px rgba(18,140,126,0.6)",
        }}
      >
        <span style={{ fontSize: 30, lineHeight: 1 }}>💬</span>
        <span style={{ fontWeight: 700, fontSize: 27, color: "#fff", letterSpacing: "-0.01em" }}>
          {sub}
        </span>
      </div>
    </div>
  );
};

// Helper: staticFile del QR (evita hardcodear la ruta en la composición).
export const QR_WHATSAPP = () => staticFile("whatsapp-qr.png");
