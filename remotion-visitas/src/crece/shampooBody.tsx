import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, Img, staticFile } from "remotion";
import { C, FONTS, EXPO, IN_HARD, blurRise, rise, slideBlur, drawLine, pop, useSceneDur } from "./theme";
import { Card, Banner, Eyebrow, Ornament, Chip } from "./primitives";

const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

// fila genérica con bullet ✦
const Row: React.FC<{ label: string; sub?: string; t: number; delay: number }> = ({ label, sub, t, delay }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "13px 0", borderBottom: `1px solid ${C.hairSage}`, ...slideBlur(t, delay) }}>
    <span style={{ color: C.gold, fontSize: 18 }}>✦</span>
    <span style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: FONTS.display, fontWeight: 500, fontSize: 36, color: C.ink, lineHeight: 1.12 }}>{label}</span>
      {sub && <span style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 21, color: C.inkSoft }}>{sub}</span>}
    </span>
  </div>
);

// ════════════════════════════════════════════════════════════
// TIP CARD — tarjeta genérica de tip/aviso (eyebrow + título + texto)
// ════════════════════════════════════════════════════════════
export const TipCard: React.FC<{
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  width?: number;
}> = ({ eyebrow, title, body, width = 600 }) => {
  const t = useT();
  return (
    <Card width={width}>
      <Eyebrow style={{ marginBottom: 16, ...rise(t, 0.85, 0.6) }}>{eyebrow}</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 54, color: C.ink, marginBottom: 22, lineHeight: 1.02, ...blurRise(t, 1.0) }}>
        {title}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 27, lineHeight: 1.55, color: C.inkSoft, ...rise(t, 1.45, 0.7) }}>
        {body}
      </div>
    </Card>
  );
};

const gold = (s: React.ReactNode) => (
  <span style={{ color: C.gold, fontFamily: FONTS.display, fontWeight: 600, fontStyle: "italic" }}>{s}</span>
);

// ════════════════════════════════════════════════════════════
// INGREDIENTES — los 3 bloques de la sinergia
// ════════════════════════════════════════════════════════════
export const IngredientsOverview: React.FC = () => {
  const t = useT();
  const Block: React.FC<{ n: string; name: string; detail: string; delay: number }> = ({ n, name, detail, delay }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 20, padding: "14px 0", borderBottom: `1px solid ${C.hairSage}`, ...slideBlur(t, delay) }}>
      <span style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 600, fontSize: 42, color: C.gold, minWidth: 58, lineHeight: 1 }}>{n}</span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 38, color: C.ink, lineHeight: 1.08 }}>{name}</span>
        <span style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 21, color: C.inkSoft }}>{detail}</span>
      </span>
    </div>
  );
  return (
    <Card width={640}>
      <Eyebrow style={{ marginBottom: 12, ...rise(t, 0.85, 0.6) }}>La sinergia</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 56, color: C.ink, lineHeight: 1, marginBottom: 18, ...blurRise(t, 1.0) }}>
        Tres bloques de ingredientes
      </div>
      <Block n="01" name="Activos lavantes" detail="tensioactivos del coco · SCI + coco glucósido" delay={1.5} />
      <Block n="02" name="Agentes de textura" detail="jojoba · fécula de maíz · agua destilada" delay={1.75} />
      <Block n="03" name="Los activos" detail="fenogreco · cafeína · niacinamida" delay={2.0} />
      <Ornament style={{ marginTop: 24, opacity: interpolate(t, [2.4, 2.95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }), transform: `scale(${pop(t, 2.4)})` }} />
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// ¿POR QUÉ DISOLVER? — explicador (microcristales + activación)
// ════════════════════════════════════════════════════════════
export const WhyDissolve: React.FC = () => {
  const t = useT();
  return (
    <Card width={620}>
      <Eyebrow style={{ marginBottom: 14, ...rise(t, 0.85, 0.6) }}>El porqué</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 54, color: C.ink, lineHeight: 1.0, marginBottom: 8, ...blurRise(t, 1.0) }}>
        ¿Por qué disolver la cafeína?
      </div>
      <div style={{ fontFamily: FONTS.display, fontStyle: "italic", fontSize: 30, color: C.inkSoft, marginBottom: 18, ...rise(t, 1.25, 0.6) }}>
        aunque la barra sea sólida
      </div>
      <Row label="Sin disolver son microcristales" sub="textura rugosa e incómoda en la barra" t={t} delay={1.7} />
      <Row label="Si no se activa, no es efectiva" sub="el calor la disuelve y la activa" t={t} delay={2.05} />
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// VENTAJAS DEL SÓLIDO
// ════════════════════════════════════════════════════════════
export const SolidAdvantages: React.FC = () => {
  const t = useT();
  return (
    <Card width={600}>
      <Eyebrow style={{ marginBottom: 14, ...rise(t, 0.85, 0.6) }}>Por qué un sólido</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 56, color: C.ink, lineHeight: 1, marginBottom: 16, ...blurRise(t, 1.0) }}>
        Ventajas de la barra
      </div>
      <Row label="Sin cálculos extra" sub="más simple que un shampoo líquido" t={t} delay={1.5} />
      <Row label="Sin envase y dura más" sub="rinde mucho tiempo en uso" t={t} delay={1.72} />
      <Row label="Espuma cremosa" sub="experiencia sensorial agradable" t={t} delay={1.94} />
      <Row label="Es tendencia" sub="un diferencial en tu catálogo" t={t} delay={2.16} />
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// pH · POR QUÉ MEDIRLO
// ════════════════════════════════════════════════════════════
export const PhWhy: React.FC = () => {
  const t = useT();
  return (
    <Card width={620}>
      <Eyebrow style={{ marginBottom: 14, ...rise(t, 0.85, 0.6) }}>El paso clave</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 56, color: C.ink, lineHeight: 1, marginBottom: 18, ...blurRise(t, 1.0) }}>
        Medir el pH, sí o sí
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 27, lineHeight: 1.55, color: C.inkSoft, ...rise(t, 1.5, 0.7) }}>
        Los tensioactivos son {gold("ligeramente alcalinos")}; el cuero cabelludo es {gold("ácido")}. Hay que ajustarlo para no resecar ni irritar.
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// pH · CÓMO MEDIR UNA MASA DENSA (9 g agua + 1 g masa)
// ════════════════════════════════════════════════════════════
export const PhHowMeasure: React.FC = () => {
  const t = useT();
  const Ratio: React.FC<{ big: string; lbl: string; delay: number }> = ({ big, lbl, delay }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", ...rise(t, delay, 0.6) }}>
      <span style={{ fontFamily: FONTS.display, fontWeight: 700, fontStyle: "italic", fontSize: 78, color: C.gold, lineHeight: 0.9 }}>{big}</span>
      <span style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 18, letterSpacing: "0.2em", textTransform: "uppercase", color: C.sageDeep, marginTop: 6 }}>{lbl}</span>
    </div>
  );
  return (
    <Card width={620}>
      <Eyebrow style={{ marginBottom: 14, ...rise(t, 0.85, 0.6) }}>Cómo medir una masa densa</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 48, color: C.ink, lineHeight: 1.02, marginBottom: 24, ...blurRise(t, 1.0) }}>
        Disuélvela primero
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", marginBottom: 22 }}>
        <Ratio big="9 g" lbl="agua destilada" delay={1.5} />
        <span style={{ fontFamily: FONTS.display, fontSize: 50, color: C.sageDeep, opacity: interpolate(t, [1.7, 2.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `scale(${pop(t, 1.7, 0.5, 0.6)})` }}>+</span>
        <Ratio big="1 g" lbl="de tu masa" delay={1.9} />
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 25, lineHeight: 1.5, color: C.inkSoft, ...rise(t, 2.2, 0.6) }}>
        Agita hasta una solución jabonosa y mide con {gold("tira reactiva")} o pHímetro.
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// pH · BAJARLO CON ÁCIDO CÍTRICO
// ════════════════════════════════════════════════════════════
export const PhLower: React.FC = () => {
  const t = useT();
  return (
    <Card width={620}>
      <Eyebrow style={{ marginBottom: 14, ...rise(t, 0.85, 0.6) }}>Ajustar el pH</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 54, color: C.ink, lineHeight: 1.0, marginBottom: 18, ...blurRise(t, 1.0) }}>
        Bájalo con ácido cítrico
      </div>
      <Row label="Las gotas van a la masa" sub="no al agua de medición" t={t} delay={1.55} />
      <Row label="Amasa e incorpora bien" sub="empieza con 5 gotas" t={t} delay={1.8} />
      <Row label="Repite y vuelve a medir" sub="hasta llegar a pH 4,5–5,0" t={t} delay={2.05} />
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// REPOSO 24 H
// ════════════════════════════════════════════════════════════
export const RestCard: React.FC = () => {
  const t = useT();
  return (
    <Card width={600}>
      <Eyebrow style={{ marginBottom: 14, ...rise(t, 0.85, 0.6) }}>Último paso</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18, ...blurRise(t, 1.0, 0.9, 16, 8) }}>
        <span style={{ fontFamily: FONTS.display, fontWeight: 700, fontStyle: "italic", fontSize: 120, color: C.gold, lineHeight: 0.85 }}>24 h</span>
        <span style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 24, letterSpacing: "0.18em", textTransform: "uppercase", color: C.sageDeep }}>de reposo</span>
      </div>
      <div style={{ height: 1.5, background: C.hairSage, margin: "22px 0 18px", transform: `scaleX(${drawLine(t, 1.7)})`, transformOrigin: "left" }} />
      <div style={{ fontFamily: FONTS.body, fontSize: 27, lineHeight: 1.55, color: C.inkSoft, ...rise(t, 2.0, 0.7) }}>
        Deja endurecer la barra por completo y úsala {gold("tranquila")} en tu cabello.
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// BLOQUE QR (reutilizable para los banners de CTA)
// ════════════════════════════════════════════════════════════
const ScanBlock: React.FC<{ src: string; title: string; t: number; delay: number }> = ({ src, title, t, delay }) => (
  <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 26 }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, ...rise(t, delay, 0.7) }}>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 38, color: C.ink, lineHeight: 1.08, textAlign: "right", maxWidth: 300 }}>{title}</div>
      <div style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 19, letterSpacing: "0.2em", textTransform: "uppercase", color: C.sageDeep, display: "flex", alignItems: "center", gap: 10 }}>
        Escanéame <span style={{ color: C.gold, fontFamily: FONTS.display, fontStyle: "italic", fontSize: 28 }}>➜</span>
      </div>
    </div>
    <div style={{ width: 232, height: 232, padding: 9, background: "#fff", borderRadius: 4, boxShadow: "0 8px 26px rgba(31,31,27,0.24)", opacity: interpolate(t, [delay + 0.2, delay + 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }), transform: `scale(${pop(t, delay + 0.2, 0.6, 0.86)})` }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  </div>
);

// CTA intermedio — el porqué de cada paso (WhatsApp)
export const CtaSavias: React.FC = () => {
  const t = useT();
  return (
    <Banner height={336}>
      <div style={{ position: "absolute", top: -18, left: 110, opacity: interpolate(t, [2.0, 2.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }), transform: `scale(${pop(t, 2.0)}) rotate(-3deg)` }}>
        <Chip>El porqué de cada paso</Chip>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...rise(t, 0.85, 0.6) }}>
          <Eyebrow color={C.gold} dashColor={C.gold} size={22}>SAVIAS · Mi comunidad de cosmética artesanal</Eyebrow>
        </div>
        <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 62, lineHeight: 1.0, color: C.ink, ...blurRise(t, 1.0) }}>
          Aprende el <span style={{ fontStyle: "italic", color: C.gold }}>porqué</span> detrás de cada ingrediente
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 26, color: C.inkSoft, ...rise(t, 1.4, 0.6) }}>
          Te dejo el enlace en la descripción · charlemos por WhatsApp.
        </div>
      </div>
      <ScanBlock src="whatsapp-qr.png" title="Escríbeme por WhatsApp" t={t} delay={1.7} />
    </Banner>
  );
};

// CTA final — se mantiene
export const CtaFinal: React.FC = () => {
  const t = useT();
  return (
    <Banner height={350} exit={false}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...rise(t, 0.85, 0.6) }}>
          <Eyebrow color={C.gold} dashColor={C.gold} size={22}>SAVIAS · Jabonería y cosmética artesanal</Eyebrow>
        </div>
        <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 60, lineHeight: 1.0, color: C.ink, ...blurRise(t, 1.0) }}>
          Aprende a formular <span style={{ fontStyle: "italic", color: C.gold }}>con criterio</span>
        </div>
        <div style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 25, color: C.inkSoft, marginTop: 2, ...rise(t, 1.5, 0.6) }}>
          Líquido o sólido · te muestro si SAVIAS es tu camino, sin compromiso.
        </div>
      </div>
      <ScanBlock src="whatsapp-qr.png" title="Escríbeme por WhatsApp" t={t} delay={1.7} />
    </Banner>
  );
};

// ════════════════════════════════════════════════════════════
// CIERRE — comenta tu parte favorita + suscríbete
// ════════════════════════════════════════════════════════════
export const EndCard: React.FC = () => {
  const t = useT();
  const { fps, durationInFrames } = useVideoConfig();
  const durSec = (useSceneDur() ?? durationInFrames) / fps;
  const out = interpolate(t, [durSec - 0.6, durSec], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: IN_HARD });
  const appear = interpolate(t, [0, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const Ask: React.FC<{ n: string; label: string; sub: string; delay: number }> = ({ n, label, sub, delay }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 22, ...rise(t, delay, 0.6) }}>
      <span style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 700, fontSize: 60, color: C.goldSoft, lineHeight: 1, minWidth: 70 }}>{n}</span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 50, color: C.paper, lineHeight: 1.05 }}>{label}</span>
        <span style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 26, color: C.cream }}>{sub}</span>
      </span>
    </div>
  );
  return (
    <div style={{ position: "absolute", inset: 0, opacity: out }}>
      {/* velo oscuro para que el texto resalte sobre la cocina clara */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: appear,
          background:
            "radial-gradient(circle at 50% 46%, rgba(18,17,14,0.84) 0%, rgba(18,17,14,0.64) 42%, rgba(18,17,14,0.30) 100%)",
        }}
      />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 24, textShadow: "0 2px 20px rgba(0,0,0,0.7)" }}>
        <div style={{ ...rise(t, 0.4, 0.6) }}>
          <Eyebrow color={C.cream} dashColor={C.goldSoft} size={24} style={{ justifyContent: "center" }}>Antes de irte</Eyebrow>
        </div>
        <div style={{ fontFamily: FONTS.display, fontWeight: 700, fontSize: 86, color: C.paper, lineHeight: 1, textAlign: "center", ...blurRise(t, 0.6) }}>
          Dos favores rápidos
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 16,
            padding: "30px 46px",
            background: "rgba(18,17,14,0.40)",
            border: "1px solid rgba(245,239,230,0.16)",
            borderLeft: `3px solid ${C.gold}`,
            borderRadius: 4,
            ...rise(t, 0.9, 0.6),
          }}
        >
          <Ask n="01" label="Comenta tu parte favorita" sub="¿qué producto formulamos juntas?" delay={1.1} />
          <Ask n="02" label="Suscríbete al canal" sub="es gratis y ayuda un montón" delay={1.4} />
        </div>
      </div>
    </div>
  );
};
