import React from "react";
import { interpolate } from "remotion";
import { C, FONTS, EXPO } from "../crece/theme";

// ───────────────────────────────────────────────────────────────
// Motion graphic de suscripción a YouTube (intro).
// Logo play → botón "SUSCRÍBETE" → cursor hace click → "SUSCRITO ✓"
// + campanita que suena. Vectorial (nítido y determinista).
// `t` = segundos de la composición. Sub-animaciones relativas a `since`.
// ───────────────────────────────────────────────────────────────

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const YT_RED = "#FF0033";
const YT_RED_DK = "#CC0029";

const YouTubeGlyph: React.FC<{ size?: number }> = ({ size = 58 }) => (
  <svg width={size} height={(size * 20) / 28} viewBox="0 0 28 20" aria-hidden>
    <rect x="0" y="0" width="28" height="20" rx="5" fill={YT_RED} />
    <path d="M11 5.2 L20 10 L11 14.8 Z" fill="#fff" />
  </svg>
);

const Bell: React.FC<{ ring: number; filled: boolean }> = ({ ring, filled }) => {
  // ring 0→1 activa el balanceo; oscilación amortiguada.
  const swing = ring > 0 ? Math.sin(ring * Math.PI * 7) * (1 - ring) * 16 : 0;
  const col = filled ? C.gold : "#3a3a34";
  return (
    <div style={{ position: "relative", width: 54, height: 54 }}>
      {/* ondas de sonido */}
      {ring > 0.05 && ring < 0.98
        ? [0, 1].map((k) => {
            const p = interpolate(ring, [0.1 + k * 0.12, 0.55 + k * 0.12], [0, 1], clamp);
            return (
              <span
                key={k}
                style={{
                  position: "absolute",
                  inset: -6 - k * 6,
                  borderRadius: "50%",
                  border: `2px solid ${C.gold}`,
                  opacity: (1 - p) * 0.5,
                  transform: `scale(${0.7 + p * 0.6})`,
                }}
              />
            );
          })
        : null}
      <svg
        width="54"
        height="54"
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${swing}deg)`, transformOrigin: "50% 18%" }}
        aria-hidden
      >
        <path
          d="M12 3.2c-.9 0-1.6.7-1.6 1.6v.5C7.9 6 6.2 8.3 6.2 11v3.2l-1.4 1.9c-.4.5 0 1.2.6 1.2h13.2c.6 0 1-.7.6-1.2l-1.4-1.9V11c0-2.7-1.7-5-4.2-5.7v-.5c0-.9-.7-1.6-1.6-1.6Z"
          fill={filled ? col : "none"}
          stroke={col}
          strokeWidth={filled ? 0 : 1.7}
          strokeLinejoin="round"
        />
        <path
          d="M10 19c0 1.1.9 2 2 2s2-.9 2-2"
          fill="none"
          stroke={col}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

// Cursor tipo puntero de mouse (SVG).
const Cursor: React.FC<{ press: number }> = ({ press }) => (
  <svg width="34" height="34" viewBox="0 0 24 24" style={{ transform: `scale(${1 - press * 0.16})` }} aria-hidden>
    <path
      d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.6 L19 13.6 Z"
      fill="#fff"
      stroke="#1b1b1b"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export const SubscribeCTA: React.FC<{ t: number; show: number; hide: number }> = ({
  t,
  show,
  hide,
}) => {
  if (t < show - 0.1 || t > hide + 0.6) return null;
  const since = t - show;
  const until = hide - t;

  const rise = interpolate(since, [0, 0.6], [0, 1], { ...clamp, easing: EXPO });
  const outFade = interpolate(until, [0, 0.5], [0, 1], clamp);
  const vis = Math.min(1, outFade);

  // Cursor: entra desde abajo-derecha y "hace click" ~2.5s (cuando dice "dale click").
  const CLICK = 2.5;
  const cursorIn = interpolate(since, [1.5, CLICK], [0, 1], { ...clamp, easing: EXPO });
  const press = interpolate(since, [CLICK, CLICK + 0.12, CLICK + 0.3], [0, 1, 0], clamp);
  // Tras el click el cursor se retira (abajo-derecha) y desaparece → deja
  // "SUSCRITO ✓ + campana" limpio para el beat de la campanita.
  const cursorLeave = interpolate(since, [CLICK + 0.35, CLICK + 1.0], [0, 1], clamp);
  const subscribed = since >= CLICK + 0.08;
  // Pop del botón al suscribirse.
  const subPop = subscribed ? interpolate(since, [CLICK + 0.08, CLICK + 0.4], [0.88, 1], clamp) : 1;
  // Campanita suena ~3.2–5.2s ("campanita").
  const ring = interpolate(since, [3.1, 5.2], [0, 1], clamp);

  const btnBg = subscribed ? "#2b2b28" : YT_RED;
  const btnLabel = subscribed ? "SUSCRITO" : "SUSCRÍBETE";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 92,
        display: "flex",
        justifyContent: "center",
        opacity: vis,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `translateY(${(1 - rise) * 30}px)`,
          opacity: rise,
          display: "flex",
          alignItems: "center",
          gap: 24,
          background: "rgba(250, 247, 242, 0.96)",
          border: `1px solid ${C.hairSage}`,
          borderRadius: 18,
          padding: "16px 26px",
          boxShadow: "0 26px 64px -20px rgba(31,31,27,0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          fontFamily: FONTS.body,
        }}
      >
        {/* Logo + copy */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <YouTubeGlyph size={56} />
          <div style={{ lineHeight: 1.1 }}>
            <div
              style={{
                fontFamily: FONTS.sc,
                fontSize: 15,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: C.sageDeep,
              }}
            >
              Canal SAVIAS
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 30, fontWeight: 600, color: C.ink }}>
              Nuevos videos cada semana
            </div>
          </div>
        </div>

        {/* Botón + campana + cursor */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              transform: `scale(${subPop})`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: btnBg,
              color: "#fff",
              borderRadius: 999,
              padding: "13px 26px",
              fontWeight: 800,
              fontSize: 23,
              letterSpacing: "0.02em",
              fontFamily:
                'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
              boxShadow: subscribed
                ? "inset 0 0 0 1px rgba(255,255,255,0.12)"
                : `0 10px 26px -10px ${YT_RED_DK}`,
              whiteSpace: "nowrap",
            }}
          >
            {subscribed ? <span style={{ fontSize: 20 }}>✓</span> : null}
            {btnLabel}
          </div>

          <Bell ring={ring} filled={subscribed} />

          {/* Cursor animado hacia el botón */}
          <div
            style={{
              position: "absolute",
              left: 78,
              top: 18,
              opacity: cursorIn * (1 - cursorLeave),
              transform: `translate(${(1 - cursorIn) * 90 + cursorLeave * 66}px, ${(1 - cursorIn) * 70 + cursorLeave * 54}px)`,
            }}
          >
            <Cursor press={press} />
            {/* onda de click */}
            {press > 0.02 ? (
              <span
                style={{
                  position: "absolute",
                  left: -10,
                  top: -6,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,0,51,0.6)",
                  transform: `scale(${0.5 + press})`,
                  opacity: 1 - press,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
