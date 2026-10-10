import { AbsoluteFill, interpolate, Easing } from "remotion";
import { JAKARTA, SERIF } from "../fonts";
import { JC } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EXPO = Easing.bezier(0.16, 1, 0.3, 1);
const NAVY_BG = "radial-gradient(ellipse 90% 80% at 50% 45%, #131F38 0%, #0A0E1A 68%, #05070E 100%)";

// Ventanas de las title cards de la intro (alineadas al audio)
export const COM_CARD_A = { show: 3.4, hide: 6.6 };
export const COM_CARD_B = { show: 13.5, hide: 16.4 };
export const COM_CARD_C = { show: 16.5, hide: 19.6 };

export const inComIntroCard = (t: number) =>
  (t >= COM_CARD_A.show && t < COM_CARD_A.hide) ||
  (t >= COM_CARD_B.show && t < COM_CARD_B.hide) ||
  (t >= COM_CARD_C.show && t < COM_CARD_C.hide);

// ── Capas de acabado premium (grano, viñeta, barrido de luz) ──
const Grain: React.FC<{ t: number; show: number; opacity?: number }> = ({ t, show, opacity = 0.07 }) => {
  const seed = Math.floor((t - show) * 9) % 40;
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "overlay", opacity, pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed={seed} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </div>
  );
};

const Vignette: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 320px 90px rgba(0,0,0,0.55)" }} />
);

const LightSweep: React.FC<{ t: number; show: number }> = ({ t, show }) => {
  const p = interpolate(t - show, [0.05, 0.75], [-25, 130], clamp);
  const op = interpolate(t - show, [0.05, 0.35, 0.75], [0, 0.45, 0], clamp);
  if (op <= 0.002) return null;
  return (
    <div
      style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: op, mixBlendMode: "screen",
        background: `linear-gradient(108deg, transparent ${p - 16}%, rgba(255,255,255,0.22) ${p}%, transparent ${p + 16}%)`,
      }}
    />
  );
};

// Reveal tipográfico con máscara (las palabras suben desde un clip) + stagger
const MaskWords: React.FC<{
  words: string[]; t: number; start: number; step?: number; style: React.CSSProperties; color: string;
}> = ({ words, t, start, step = 0.07, style, color }) => (
  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: "0.28em", rowGap: 2, ...style }}>
    {words.map((w, i) => {
      const at = start + i * step;
      const p = interpolate(t - at, [0, 0.5], [0, 1], { ...clamp, easing: EXPO });
      return (
        <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
          <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 112}%)`, color }}>{w}</span>
        </span>
      );
    })}
  </div>
);

// Banda dorada (branding) con frase de acento en serif italic + brillo
const GoldBand: React.FC<{ t: number; show: number; delay: number; children: React.ReactNode; fontSize?: number }> = ({ t, show, delay, children, fontSize = 86 }) => {
  const band = interpolate(t - show, [delay, delay + 0.5], [0, 1], { ...clamp, easing: EXPO });
  const textP = interpolate(t - show, [delay + 0.18, delay + 0.6], [0, 1], { ...clamp, easing: EXPO });
  return (
    <div style={{ position: "relative", display: "inline-block", marginTop: 18, padding: "10px 40px 16px" }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, ${JC.goldDeep}, ${JC.gold} 55%, #FFE08A)`, borderRadius: 14, transform: `scaleX(${band})`, transformOrigin: "left center", boxShadow: "0 18px 48px -16px rgba(242,194,75,0.55)" }} />
      <div style={{ position: "relative", fontFamily: SERIF, fontStyle: "italic", fontSize, lineHeight: 1.1, color: JC.ink, opacity: textP, transform: `translateY(${(1 - textP) * 8}px)` }}>{children}</div>
    </div>
  );
};

// Wrapper: focus-pull (blur) + push-in continuo + acabado (grano/viñeta/sweep)
const CardShell: React.FC<{ t: number; show: number; hide: number; background: string; children: React.ReactNode }> = ({ t, show, hide, background, children }) => {
  if (t < show || t > hide + 0.05) return null;
  const dur = hide - show;
  const inBlur = interpolate(t - show, [0, 0.24], [16, 0], clamp);
  const outBlur = interpolate(t, [hide - 0.28, hide], [0, 18], clamp);
  const opacity = Math.min(interpolate(t - show, [0, 0.12], [0, 1], clamp), interpolate(t, [hide - 0.16, hide + 0.04], [1, 0], clamp));
  // settle (focus) + push-in continuo (micro-transición)
  const scale = interpolate(t - show, [0, 0.28, dur], [1.07, 1.0, 1.035], { ...clamp, easing: EXPO });
  return (
    <AbsoluteFill style={{ background, opacity }}>
      <AbsoluteFill style={{ filter: `blur(${Math.max(inBlur, outBlur)}px)`, transform: `scale(${scale})`, justifyContent: "center", alignItems: "center" }}>
        {children}
      </AbsoluteFill>
      <Vignette />
      <LightSweep t={t} show={show} />
      <Grain t={t} show={show} />
    </AbsoluteFill>
  );
};

// ── MOTIF A · Ondas de señal: el mensaje se emite y llega a la audiencia ──
const SignalWaves: React.FC<{ t: number; show: number }> = ({ t, show }) => {
  const PERIOD = 2.4;
  const rings = [0, 0.4, 0.8, 1.2, 1.6, 2.0];
  const dots = [
    { x: 17, y: 26 }, { x: 83, y: 22 }, { x: 11, y: 68 }, { x: 89, y: 66 },
    { x: 50, y: 11 }, { x: 50, y: 89 }, { x: 27, y: 49 }, { x: 73, y: 49 },
  ];
  const bloom = 0.5 + Math.sin((t - show) * 2.4) * 0.18;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* líneas de red center→audiencia */}
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {dots.map((d, i) => {
          const cx = 50, cy = 25.2; // ~45% alto en viewBox 56
          const x = (d.x / 100) * 100, y = (d.y / 100) * 56;
          const op = 0.10 + Math.abs(Math.sin((t - show) * 1.4 + i)) * 0.16;
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={JC.blueLight} strokeWidth={0.18} opacity={op} />;
        })}
      </svg>
      {/* bloom central */}
      <div style={{ position: "absolute", left: "50%", top: "45%", width: 520, height: 520, marginLeft: -260, marginTop: -260, borderRadius: "50%", background: `radial-gradient(circle, rgba(242,194,75,${0.16 * bloom}) 0%, transparent 60%)` }} />
      {rings.map((ph, i) => {
        const cyc = (((t - show) + ph) % PERIOD) / PERIOD;
        const size = 200 + cyc * 1500;
        const op = Math.pow(1 - cyc, 1.4) * 0.5;
        return (
          <div key={i} style={{ position: "absolute", left: "50%", top: "45%", width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: "50%", border: `2px solid ${JC.gold}`, opacity: op }} />
        );
      })}
      {/* núcleo emisor */}
      <div style={{ position: "absolute", left: "50%", top: "45%", width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: "50%", background: JC.gold, boxShadow: `0 0 ${30 + bloom * 26}px rgba(242,194,75,0.85)` }} />
      {dots.map((d, i) => {
        const pulse = 0.35 + Math.abs(Math.sin(((t - show) * 1.7) + i * 0.8)) * 0.65;
        return <div key={i} style={{ position: "absolute", left: `${d.x}%`, top: `${d.y}%`, width: 13, height: 13, marginLeft: -6.5, marginTop: -6.5, borderRadius: "50%", background: JC.blueLight, opacity: pulse, boxShadow: `0 0 ${pulse * 16}px rgba(96,165,250,0.7)` }} />;
      })}
    </AbsoluteFill>
  );
};

const CardSignal: React.FC<{ t: number }> = ({ t }) => (
  <CardShell t={t} show={COM_CARD_A.show} hide={COM_CARD_A.hide} background={NAVY_BG}>
    <SignalWaves t={t} show={COM_CARD_A.show} />
    <div style={{ position: "relative", maxWidth: 1240, textAlign: "center" }}>
      <MaskWords
        words={["Cómo", "vender", "más", "con", "tu"]}
        t={t}
        start={COM_CARD_A.show + 0.18}
        color={JC.cream}
        style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 70, lineHeight: 1.12, letterSpacing: "-0.015em", textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}
      />
      <GoldBand t={t} show={COM_CARD_A.show} delay={0.62}>estrategia de comunicación</GoldBand>
    </div>
  </CardShell>
);

// ── MOTIF B · Anillo de brevedad: "<15 min" como reloj que se llena ──
const CardBrevity: React.FC<{ t: number }> = ({ t }) => {
  const s = COM_CARD_B.show;
  const fillEnd = COM_CARD_B.hide - 0.35;
  const fill = interpolate(t, [s + 0.25, fillEnd], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  const R = 150;
  const C = 2 * Math.PI * R;
  const numPop = interpolate(t - s, [0.2, 0.6], [0.7, 1], { ...clamp, easing: EXPO });
  const done = fill > 0.985;
  const flash = done ? interpolate(t, [fillEnd, fillEnd + 0.25], [0.6, 0], clamp) : 0;
  // posición del punto líder
  const ang = -Math.PI / 2 + fill * 2 * Math.PI;
  const lx = 190 + Math.cos(ang) * R, ly = 190 + Math.sin(ang) * R;
  return (
    <CardShell t={t} show={COM_CARD_B.show} hide={COM_CARD_B.hide} background={NAVY_BG}>
      <div style={{ position: "relative", width: 380, height: 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* glow de fondo del anillo */}
        <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: `radial-gradient(circle, rgba(242,194,75,${0.10 + flash}) 0%, transparent 62%)` }} />
        <svg width={380} height={380} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={190} cy={190} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={14} />
          <circle cx={190} cy={190} r={R} fill="none" stroke={JC.gold} strokeWidth={14} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fill)} style={{ filter: "drop-shadow(0 0 12px rgba(242,194,75,0.6))" }} />
        </svg>
        {/* marcas tipo reloj */}
        <svg width={380} height={380} style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            const x1 = 190 + Math.cos(a) * 171, y1 = 190 + Math.sin(a) * 171;
            const x2 = 190 + Math.cos(a) * 180, y2 = 190 + Math.sin(a) * 180;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(248,250,252,0.3)" strokeWidth={3} strokeLinecap="round" />;
          })}
          {/* punto líder */}
          <circle cx={lx} cy={ly} r={9} fill="#FFE08A" style={{ filter: "drop-shadow(0 0 10px rgba(242,194,75,0.9))" }} />
        </svg>
        <div style={{ textAlign: "center", transform: `scale(${numPop})` }}>
          <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 96, color: JC.cream, lineHeight: 0.9, letterSpacing: "-0.02em" }}>&lt;15</div>
          <div style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 30, color: JC.gold, letterSpacing: "0.22em", marginTop: 4 }}>MINUTOS</div>
        </div>
      </div>
      <div style={{ marginTop: 30, fontFamily: SERIF, fontStyle: "italic", fontSize: 50, color: JC.cream, textAlign: "center", opacity: interpolate(t - s, [0.4, 0.9], [0, 1], { ...clamp, easing: EXPO }), transform: `translateY(${(1 - interpolate(t - s, [0.4, 0.9], [0, 1], clamp)) * 12}px)` }}>
        así lo hacemos en la agencia
      </div>
    </CardShell>
  );
};

// ── MOTIF C · Flujo: dos canales alimentan la conversión ($ más ventas) ──
const FlowNode: React.FC<{ left?: number; right?: number; top: number; bg: string; color: string; children: React.ReactNode; pop: number; glow?: number }> = ({ left, right, top, bg, color, children, pop, glow = 0 }) => (
  <div style={{ position: "absolute", left, right, top, transform: `translateY(-50%) scale(${pop})`, background: bg, color, fontFamily: JAKARTA, fontWeight: 800, fontSize: 36, padding: "18px 34px", borderRadius: 16, display: "flex", alignItems: "center", gap: 14, boxShadow: glow > 0 ? `0 0 ${40 + glow * 40}px rgba(242,194,75,${0.4 + glow * 0.4}), 0 20px 50px -16px rgba(0,0,0,0.6)` : "0 18px 44px -14px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
    {children}
  </div>
);

const CardFlow: React.FC<{ t: number }> = ({ t }) => {
  const s = COM_CARD_C.show;
  const popA = interpolate(t - s, [0.15, 0.5], [0, 1], { ...clamp, easing: EXPO });
  const popB = interpolate(t - s, [0.35, 0.7], [0, 1], { ...clamp, easing: EXPO });
  const popT = interpolate(t - s, [0.95, 1.3], [0, 1], { ...clamp, easing: EXPO });
  const lineDraw = interpolate(t - s, [0.5, 1.05], [0, 1], { ...clamp, easing: EXPO });
  const arrived = lineDraw > 0.95;
  const burst = arrived ? interpolate(t - s, [1.3, 1.7], [0, 1], clamp) : 0;
  const targetGlow = popT * (0.4 + Math.abs(Math.sin((t - s) * 3)) * 0.6);
  // partículas con cola
  const particles = [0, 0.2, 0.4, 0.6, 0.8];
  return (
    <CardShell t={t} show={COM_CARD_C.show} hide={COM_CARD_C.hide} background={NAVY_BG}>
      <div style={{ position: "absolute", top: 150, fontFamily: JAKARTA, fontWeight: 700, fontSize: 26, letterSpacing: "0.28em", textTransform: "uppercase", color: JC.gold, opacity: interpolate(t - s, [0, 0.4], [0, 1], clamp) }}>
        Tu sistema de comunicación
      </div>
      <div style={{ position: "relative", width: 1400, height: 460 }}>
        <svg viewBox="0 0 1400 460" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <path d="M 360 150 C 620 150 760 230 1010 230" fill="none" stroke="rgba(96,165,250,0.5)" strokeWidth={4} strokeDasharray={900} strokeDashoffset={900 * (1 - lineDraw)} />
          <path d="M 360 310 C 620 310 760 230 1010 230" fill="none" stroke="rgba(96,165,250,0.5)" strokeWidth={4} strokeDasharray={900} strokeDashoffset={900 * (1 - lineDraw)} />
          {arrived && particles.map((ph, i) => {
            const topPath = i % 2 === 0;
            return [0, 1, 2].map((trail) => {
              const prog = ((((t - s) * 0.5 + ph) % 1) - trail * 0.035);
              if (prog < 0 || prog > 1) return null;
              const x = 360 + prog * 650;
              const y = (topPath ? 150 : 310) + (230 - (topPath ? 150 : 310)) * prog;
              return <circle key={`${i}-${trail}`} cx={x} cy={y} r={7 - trail * 1.6} fill={JC.gold} opacity={(0.9 - trail * 0.28) * (1 - prog * 0.3)} style={{ filter: "drop-shadow(0 0 7px rgba(242,194,75,0.8))" }} />;
            });
          })}
        </svg>
        {/* burst en el nodo destino */}
        {burst > 0 && burst < 1 ? (
          <div style={{ position: "absolute", right: 70 - 80 * burst, top: 230, marginTop: -80 * burst, width: 160 * burst, height: 160 * burst, borderRadius: "50%", border: `3px solid ${JC.gold}`, opacity: (1 - burst) * 0.8, transform: "translateY(-50%)" }} />
        ) : null}
        <FlowNode left={120} top={150} bg="#FF0033" color="#fff" pop={popA}>▶ YouTube</FlowNode>
        <FlowNode left={120} top={310} bg={JC.ink} color={JC.cream} pop={popB}>📱 Contenido vertical</FlowNode>
        <FlowNode right={70} top={230} bg={JC.gold} color={JC.ink} pop={popT} glow={targetGlow}>
          <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 52 }}>más ventas</span>
        </FlowNode>
      </div>
    </CardShell>
  );
};

export const ComunicacionIntroCards: React.FC<{ t: number }> = ({ t }) => (
  <>
    <CardSignal t={t} />
    <CardBrevity t={t} />
    <CardFlow t={t} />
  </>
);
