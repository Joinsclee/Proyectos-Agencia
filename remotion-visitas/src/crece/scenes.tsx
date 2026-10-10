import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Img, staticFile } from "remotion";
import { C, FONTS, blurRise, rise, slideBlur, drawLine, pop, EXPO, IN_HARD, useSceneDur, CARD_SHADOW } from "./theme";
import { Card, Banner, Eyebrow, Ornament, Chip } from "./primitives";

// duración local de la escena (frames) → para animaciones de salida
const useSceneFps = () => {
  const { durationInFrames, fps } = useVideoConfig();
  const dur = useSceneDur() ?? durationInFrames;
  return { dur, fps };
};

// QR enmarcado en papel (pop-in) para los banners de CTA
const QRFrame: React.FC<{ src: string; t: number; delay: number; size?: number }> = ({ src, t, delay, size = 234 }) => {
  const op = interpolate(t, [delay, delay + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  return (
    <div
      style={{
        width: size,
        height: size,
        padding: 9,
        background: "#fff",
        borderRadius: 4,
        boxShadow: "0 8px 26px rgba(31,31,27,0.24)",
        opacity: op,
        transform: `scale(${pop(t, delay, 0.6, 0.86)})`,
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
};

// Bloque "Escanéame ➜" + QR para la derecha del banner
const ScanBlock: React.FC<{ src: string; title: string; t: number; delay: number }> = ({ src, title, t, delay }) => (
  <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 26 }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, ...rise(t, delay, 0.7) }}>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 38, color: C.ink, lineHeight: 1.08, textAlign: "right", maxWidth: 280 }}>
        {title}
      </div>
      <div style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 19, letterSpacing: "0.2em", textTransform: "uppercase", color: C.sageDeep, display: "flex", alignItems: "center", gap: 10 }}>
        Escanéame <span style={{ color: C.gold, fontFamily: FONTS.display, fontStyle: "italic", fontSize: 28 }}>➜</span>
      </div>
    </div>
    <QRFrame src={src} t={t} delay={delay + 0.2} />
  </div>
);

// helper: segundos locales de la escena
const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

// ════════════════════════════════════════════════════════════
// 1 · INTRO TITLE — lockup centrado en el tercio inferior
// ════════════════════════════════════════════════════════════
export const IntroTitle: React.FC = () => {
  const t = useT();
  const { dur, fps } = useSceneFps();
  const exitT = dur / fps - 0.6;
  const out = interpolate(t, [exitT, exitT + 0.6], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: IN_HARD,
  });
  const line = drawLine(t, 0.5, 0.9);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 150,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: out,
        textShadow: "0 2px 24px rgba(31,31,27,0.45)",
      }}
    >
      <div style={{ ...rise(t, 0.35, 0.6) }}>
        <Eyebrow color={C.cream} dashColor={C.goldSoft} size={24} style={{ justifyContent: "center" }}>
          Cosmética con base científica
        </Eyebrow>
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 116,
          lineHeight: 1.0,
          color: C.paper,
          marginTop: 18,
          ...blurRise(t, 0.55, 0.95, 18, 10),
        }}
      >
        Tónico <span style={{ fontStyle: "italic", color: C.goldSoft }}>crece-pelo</span>
      </div>
      <div
        style={{
          width: 220,
          height: 2,
          background: C.goldSoft,
          margin: "26px 0 22px",
          transform: `scaleX(${line})`,
          transformOrigin: "center",
        }}
      />
      <div
        style={{
          fontFamily: FONTS.body,
          fontStyle: "italic",
          fontSize: 34,
          color: C.cream,
          letterSpacing: "0.01em",
          ...rise(t, 0.9, 0.7),
        }}
      >
        100% natural · te enseño el porqué de cada paso
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// 2 · ROADMAP — qué vas a aprender (lista numerada)
// ════════════════════════════════════════════════════════════
const RoadRow: React.FC<{ n: string; label: string; t: number; delay: number }> = ({
  n,
  label,
  t,
  delay,
}) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 22, padding: "15px 0", borderBottom: `1px solid ${C.hairSage}`, ...slideBlur(t, delay) }}>
    <span style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 600, fontSize: 44, color: C.gold, lineHeight: 1, minWidth: 64 }}>
      {n}
    </span>
    <span style={{ fontFamily: FONTS.display, fontWeight: 500, fontSize: 40, color: C.ink, lineHeight: 1.1 }}>
      {label}
    </span>
  </div>
);

export const Roadmap: React.FC = () => {
  const t = useT();
  return (
    <Card width={600}>
      <Eyebrow style={{ marginBottom: 16, ...rise(t, 0.9, 0.6) }}>En este video</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontStyle: "italic", fontSize: 32, color: C.inkSoft, marginBottom: 22, ...rise(t, 1.05, 0.6) }}>
        de los activos al frasco
      </div>
      <div>
        <RoadRow n="01" label="Conocer los activos" t={t} delay={1.4} />
        <RoadRow n="02" label="Mezclar con técnica" t={t} delay={1.6} />
        <RoadRow n="03" label="Verificar el pH" t={t} delay={1.8} />
        <RoadRow n="04" label="Envasar tu tónico" t={t} delay={2.0} />
      </div>
      <Ornament style={{ marginTop: 26, opacity: interpolate(t, [2.4, 2.95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }), transform: `scale(${pop(t, 2.4)})` }} />
    </Card>
  );
};

// 3 · TÓNICO vs SHAMPOO → mini-video full-screen en ./TonicoVsShampoo.tsx

// ════════════════════════════════════════════════════════════
// 4 · FICHA DE LA FÓRMULA — tarjeta central, reveals al hablar
// ════════════════════════════════════════════════════════════
const FormulaRow: React.FC<{
  name: string;
  role: string;
  alt?: string;
  t: number;
  delay: number;
}> = ({ name, role, alt, t, delay }) => (
  <li style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 24, padding: "13px 0", borderBottom: `1px solid ${C.hairSage}`, listStyle: "none", ...slideBlur(t, delay) }}>
    <span style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: FONTS.display, fontWeight: 500, fontSize: 38, color: C.ink, lineHeight: 1.05 }}>{name}</span>
      {alt && <span style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 19, color: C.inkSoft }}>{alt}</span>}
    </span>
    <span style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 500, fontSize: 28, color: C.gold, whiteSpace: "nowrap" }}>{role}</span>
  </li>
);

export const FichaFormula: React.FC = () => {
  const t = useT();
  // reveals en segundos locales (la escena arranca en 71s del video)
  return (
    <Card width={620}>
      <Eyebrow style={{ marginBottom: 12, ...rise(t, 0.9, 0.6) }}>La fórmula</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 58, color: C.ink, lineHeight: 1, ...blurRise(t, 1.05) }}>
        Tónico capilar
      </div>
      <div style={{ fontFamily: FONTS.display, fontStyle: "italic", fontSize: 30, color: C.inkSoft, marginBottom: 22, marginTop: 6, ...rise(t, 1.3, 0.6) }}>
        con base científica
      </div>
      <ul style={{ margin: 0, padding: 0 }}>
        <FormulaRow name="Agua destilada" role="vehículo" t={t} delay={1.8} />
        <FormulaRow name="Fenogreco" role="frena la caída" t={t} delay={2.9} />
        <FormulaRow name="Té verde" alt="o extracto de ortiga" role="microcirculación" t={t} delay={4.0} />
        <FormulaRow name="Niacinamida · B3" role="fortalece y nutre" t={t} delay={5.1} />
        <FormulaRow name="Menta + Romero" alt="aceites esenciales" role="estimulan" t={t} delay={6.2} />
        <FormulaRow name="Conservante" role="protege" t={t} delay={7.3} />
      </ul>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// 5 · STEP CHIP — indicador de paso (arriba-izquierda)
// ════════════════════════════════════════════════════════════
export const StepChip: React.FC<{ n: string; label: string }> = ({ n, label }) => {
  const t = useT();
  const { dur, fps } = useSceneFps();
  const enterOp = interpolate(t, [0, 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const slideIn = interpolate(t, [0, 0.6], [-34, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const exitT = dur / fps - 0.45;
  const out = interpolate(t, [exitT, exitT + 0.45], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: IN_HARD });

  return (
    <div
      style={{
        position: "absolute",
        top: 72,
        left: 72,
        display: "flex",
        alignItems: "stretch",
        opacity: enterOp * out,
        transform: `translateX(${slideIn}px)`,
        boxShadow: "0 10px 30px rgba(31,31,27,0.22)",
      }}
    >
      <div style={{ background: C.sageDeep, color: C.paper, fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 700, fontSize: 40, lineHeight: 1, display: "grid", placeItems: "center", padding: "0 24px", minWidth: 92 }}>
        {n}
      </div>
      <div style={{ background: C.bandaSolid, display: "flex", flexDirection: "column", justifyContent: "center", padding: "14px 26px", borderTop: `2px solid ${C.gold}` }}>
        <span style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 16, letterSpacing: "0.26em", textTransform: "uppercase", color: C.sageDeep }}>Paso</span>
        <span style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 36, color: C.ink, lineHeight: 1.05 }}>{label}</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// 6 · TIP SOLUBILIZANTE — tarjeta izquierda
// ════════════════════════════════════════════════════════════
export const TipSolub: React.FC = () => {
  const t = useT();
  return (
    <Card width={600}>
      <Eyebrow style={{ marginBottom: 18, ...rise(t, 0.9, 0.6) }}>Tip · Ingrediente opcional</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 56, color: C.ink, marginBottom: 26, ...blurRise(t, 1.05) }}>
        Solubilizante
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 27, lineHeight: 1.55, color: C.inkSoft, ...rise(t, 1.5, 0.7) }}>
        Dispersa los aceites esenciales en la base acuosa para que <span style={{ color: C.gold, fontFamily: FONTS.display, fontWeight: 600, fontStyle: "italic" }}>no se separen</span>.
      </div>
      <div style={{ height: 1.5, background: C.hairSage, margin: "22px 0 16px", transform: `scaleX(${drawLine(t, 1.95)})`, transformOrigin: "left" }} />
      <div style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 23, color: C.inkSoft, ...rise(t, 2.2, 0.6) }}>
        Polisorbato 80/20 · ricino hidrogenado
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// 7 · CTA CALCULADORAS — banner inferior ★
// ════════════════════════════════════════════════════════════
export const CTACalc: React.FC = () => {
  const t = useT();
  return (
    <Banner height={346}>
      <div style={{ position: "absolute", top: -18, left: 110, opacity: interpolate(t, [2.2, 2.75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }), transform: `scale(${pop(t, 2.2)}) rotate(-3deg)` }}>
        <Chip>Para alumnos</Chip>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...rise(t, 0.85, 0.6) }}>
          <Eyebrow color={C.gold} dashColor={C.gold} size={22}>Dentro de SAVIAS · Mi Comunidad</Eyebrow>
        </div>
        <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 64, lineHeight: 1.0, color: C.ink, ...blurRise(t, 1.05) }}>
          Calculadoras y simuladores <span style={{ fontStyle: "italic", color: C.gold }}>en un solo clic</span>
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 26, color: C.inkSoft, ...rise(t, 1.4, 0.6) }}>
          Las cantidades exactas de cada ingrediente, sin cálculos a mano.
        </div>
      </div>
      <ScanBlock src="skool-qr.png" title="Mira la comunidad" t={t} delay={1.7} />
    </Banner>
  );
};

// ════════════════════════════════════════════════════════════
// 8 · PH CARD — el rango clave (4,5–5,0)
// ════════════════════════════════════════════════════════════
export const PHCard: React.FC = () => {
  const t = useT();
  return (
    <Card width={620}>
      <Eyebrow style={{ marginBottom: 16, ...rise(t, 0.9, 0.6) }}>El paso clave</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 56, color: C.ink, marginBottom: 18, ...blurRise(t, 1.05) }}>
        El pH lo es todo
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18, ...blurRise(t, 1.45, 0.85, 14, 6) }}>
        <span style={{ fontFamily: FONTS.display, fontWeight: 700, fontStyle: "italic", fontSize: 110, color: C.gold, lineHeight: 0.9 }}>4,5–5,0</span>
        <span style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 26, letterSpacing: "0.22em", textTransform: "uppercase", color: C.sageDeep }}>pH ideal</span>
      </div>
      <div style={{ height: 1.5, background: C.hairSage, margin: "20px 0 18px", transform: `scaleX(${drawLine(t, 1.95)})`, transformOrigin: "left" }} />
      <div style={{ fontFamily: FONTS.body, fontSize: 26, lineHeight: 1.55, color: C.inkSoft, ...rise(t, 2.2, 0.7) }}>
        El cuero cabelludo es ácido. A <span style={{ color: C.gold, fontFamily: FONTS.display, fontWeight: 600 }}>pH 5</span> la niacinamida es estable y el conservante, <span style={{ color: C.gold, fontFamily: FONTS.display, fontWeight: 600 }}>100% efectivo</span>.
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// 8b · PH CONFIRM — chip de confirmación "pH 5 ✓"
// ════════════════════════════════════════════════════════════
export const PHConfirm: React.FC = () => {
  const t = useT();
  const { dur, fps } = useSceneFps();
  const enter = interpolate(t, [0, 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const exitT = dur / fps - 0.45;
  const out = interpolate(t, [exitT, exitT + 0.45], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: IN_HARD });
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        bottom: 150,
        display: "flex",
        alignItems: "center",
        gap: 18,
        background: C.bandaSolid,
        padding: "20px 34px",
        boxShadow: "0 14px 40px rgba(31,31,27,0.22)",
        borderLeft: `4px solid ${C.gold}`,
        opacity: enter * out,
        transform: `scale(${0.92 + enter * 0.08})`,
      }}
    >
      <span style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 700, fontSize: 64, color: C.gold, lineHeight: 1 }}>pH 5</span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 17, letterSpacing: "0.24em", textTransform: "uppercase", color: C.sageDeep }}>Logrado</span>
        <span style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 34, color: C.ink, lineHeight: 1 }}>✓ Respetuoso y estable</span>
      </span>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// 9 · USAGE — modo de uso
// ════════════════════════════════════════════════════════════
const UseRow: React.FC<{ label: string; t: number; delay: number }> = ({ label, t, delay }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "12px 0", borderBottom: `1px solid ${C.hairSage}`, ...slideBlur(t, delay) }}>
    <span style={{ color: C.gold, fontSize: 18 }}>✦</span>
    <span style={{ fontFamily: FONTS.display, fontWeight: 500, fontSize: 36, color: C.ink, lineHeight: 1.1 }}>{label}</span>
  </div>
);

export const Usage: React.FC = () => {
  const t = useT();
  return (
    <Card width={600}>
      <Eyebrow style={{ marginBottom: 16, ...rise(t, 0.9, 0.6) }}>Modo de uso</Eyebrow>
      <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 56, color: C.ink, marginBottom: 22, ...blurRise(t, 1.05) }}>
        Cómo aplicarlo
      </div>
      <UseRow label="2 veces por semana" t={t} delay={1.4} />
      <UseRow label="De noche, antes del lavado" t={t} delay={1.6} />
      <UseRow label="Masajea sobre la raíz" t={t} delay={1.8} />
      <UseRow label="Déjalo actuar hasta el otro día" t={t} delay={2.0} />
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
// 10 · CTA FINAL — comunidad SAVIAS + método EVA ★ (se mantiene)
// ════════════════════════════════════════════════════════════
const EvaBadge: React.FC<{ letter: string; word: string; t: number; delay: number }> = ({ letter, word, t, delay }) => {
  const p = interpolate(t, [delay, delay + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
      <span style={{ fontFamily: FONTS.display, fontStyle: "italic", fontWeight: 700, fontSize: 40, color: C.gold }}>{letter}</span>
      <span style={{ fontFamily: FONTS.display, fontWeight: 500, fontSize: 32, color: C.ink }}>{word}</span>
    </div>
  );
};

export const CTAFinal: React.FC = () => {
  const t = useT();
  return (
    <Banner height={350} exit={false}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...rise(t, 0.85, 0.6) }}>
          <Eyebrow color={C.gold} dashColor={C.gold} size={22}>SAVIAS · Mi comunidad de cosmética artesanal</Eyebrow>
        </div>
        <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 58, lineHeight: 1.0, color: C.ink, ...blurRise(t, 1.05) }}>
          Aprende a formular <span style={{ fontStyle: "italic", color: C.gold }}>con criterio</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 4 }}>
          <span style={{ fontFamily: FONTS.sc, fontWeight: 600, fontSize: 18, letterSpacing: "0.24em", textTransform: "uppercase", color: C.sageDeep, ...rise(t, 1.5, 0.5) }}>Método EVA</span>
          <EvaBadge letter="E" word="ntiende" t={t} delay={1.7} />
          <EvaBadge letter="V" word="erifica" t={t} delay={1.9} />
          <EvaBadge letter="A" word="plica" t={t} delay={2.1} />
        </div>
        <div style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 23, color: C.inkSoft, marginTop: 6, ...rise(t, 2.3, 0.6) }}>
          Sin compromiso · las puertas siempre están abiertas
        </div>
      </div>
      <ScanBlock src="whatsapp-qr.png" title="Escríbeme por WhatsApp" t={t} delay={1.9} />
    </Banner>
  );
};

// ════════════════════════════════════════════════════════════
// 0b · INTRO CAPTIONS — subtítulos selectivos del hook (frases clave)
// ════════════════════════════════════════════════════════════
type CapLine = { show: number; hide: number; parts: { t: string; g?: boolean }[] };
const INTRO_LINES: CapLine[] = [
  { show: 0.7, hide: 4.0, parts: [{ t: "La clave no es un " }, { t: "shampoo milagroso", g: true }] },
  { show: 4.3, hide: 8.6, parts: [{ t: "es lo que aplicas en tu " }, { t: "cuero cabelludo", g: true }] },
  { show: 32.6, hide: 37.4, parts: [{ t: "Si apenas empiezas, " }, { t: "este video es para ti", g: true }] },
];

export const IntroCaptions: React.FC = () => {
  const t = useT();
  const line = INTRO_LINES.find((l) => t >= l.show && t < l.hide);
  if (!line) return null;
  const since = t - line.show;
  const until = line.hide - t;
  const op = Math.min(
    interpolate(since, [0, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }),
    interpolate(until, [0, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  );
  const y = interpolate(since, [0, 0.42], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const blur = interpolate(since, [0, 0.42], [7, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 132, display: "flex", justifyContent: "center", padding: "0 80px" }}>
      <div style={{ background: C.banda, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", padding: "18px 46px", boxShadow: CARD_SHADOW, borderTop: `2px solid ${C.gold}`, opacity: op, transform: `translateY(${y}px)`, filter: `blur(${blur}px)`, maxWidth: 1500 }}>
        <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 58, lineHeight: 1.12, color: C.ink, textAlign: "center" }}>
          {line.parts.map((p, i) => (
            <span key={i} style={{ color: p.g ? C.gold : C.ink, fontStyle: p.g ? "italic" : "normal" }}>{p.t}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// 8c · PH SCALE — escala de pH legible (la cámara difumina la tira real)
// ════════════════════════════════════════════════════════════
const PH_GRAD =
  "linear-gradient(to right, #B23A2E 0%, #D2552E 11%, #E08230 22%, #E6B23A 31%, #D5C24A 39%, #A9BE55 47%, #6FAE61 55%, #4CA17F 64%, #3E8FA8 73%, #3E66A8 83%, #5A49A0 92%, #3A2A5E 100%)";
const phPos = (v: number) => (v / 14) * 100;

export const PHScale: React.FC = () => {
  const t = useT();
  // la tira marca ~6 y se baja con ácido cítrico hasta la zona ideal (≈5)
  const reading = interpolate(t, [2, 6, 14], [6.2, 6.2, 5.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO });
  const barW = drawLine(t, 0.9, 0.9);
  const idealL = phPos(4.5);
  const idealR = phPos(5.0);
  const markerOp = interpolate(t, [2.0, 2.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Banner height={318}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ ...rise(t, 0.85, 0.6) }}>
            <Eyebrow color={C.sageDeep} dashColor={C.gold} size={22}>Medir el pH · el paso clave</Eyebrow>
            <div style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: 46, color: C.ink, marginTop: 8 }}>Zona ideal para el cuero cabelludo</div>
          </div>
          <div style={{ fontFamily: FONTS.body, fontStyle: "italic", fontSize: 24, color: C.inkSoft, textAlign: "right", maxWidth: 360, ...rise(t, 1.2, 0.6) }}>
            ácido y respetuoso · lo bajamos con ácido cítrico
          </div>
        </div>

        {/* escala de pH */}
        <div style={{ position: "relative", height: 98 }}>
          {/* barra de color */}
          <div style={{ position: "absolute", top: 32, left: 0, width: "100%", height: 42, borderRadius: 8, background: PH_GRAD, transform: `scaleX(${barW})`, transformOrigin: "left", boxShadow: "inset 0 0 0 1px rgba(31,31,27,0.18)" }} />
          {/* recuadro zona ideal 4,5–5,0 */}
          <div style={{ position: "absolute", top: 26, left: `${idealL}%`, width: `${idealR - idealL}%`, height: 54, border: `3px solid ${C.ink}`, borderRadius: 6, background: "rgba(255,255,255,0.22)", opacity: interpolate(t, [1.6, 2.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), boxShadow: "0 0 0 3px rgba(245,239,230,0.6)" }} />
          <div style={{ position: "absolute", top: -4, left: `${(idealL + idealR) / 2}%`, transform: "translateX(-50%)", fontFamily: FONTS.sc, fontWeight: 600, fontSize: 17, letterSpacing: "0.16em", textTransform: "uppercase", color: C.sageDeep, whiteSpace: "nowrap", opacity: interpolate(t, [1.9, 2.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }) }}>
            4,5–5,0 · ideal
          </div>
          {/* marcador con lectura */}
          <div style={{ position: "absolute", top: 4, left: `${phPos(reading)}%`, transform: "translateX(-50%)", opacity: markerOp, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: FONTS.display, fontWeight: 700, fontStyle: "italic", fontSize: 32, color: C.ink, lineHeight: 1 }}>{reading.toFixed(1).replace(".", ",")}</div>
            <div style={{ width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: `14px solid ${C.ink}`, marginTop: 4 }} />
          </div>
          {/* números de la escala */}
          {[0, 2, 4, 6, 8, 10, 12, 14].map((n, i) => (
            <div key={n} style={{ position: "absolute", top: 78, left: `${phPos(n)}%`, transform: "translateX(-50%)", fontFamily: FONTS.body, fontSize: 18, color: C.inkSoft, opacity: interpolate(t, [1.0 + i * 0.06, 1.5 + i * 0.06], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              {n}
            </div>
          ))}
        </div>
      </div>
    </Banner>
  );
};
