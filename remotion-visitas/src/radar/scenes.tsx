import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { ReactNode } from "react";
import { COLORS, FONTS, GRADIENTS, formatCOP } from "../theme";

const EXPO = Easing.bezier(0.16, 1, 0.3, 1);

// ─────────────────────────── Helpers ───────────────────────────

/** Opacidad de entrada/salida usando la duración LOCAL de la escena. */
function useReveal(dur: number, enter = 18, exit = 16) {
  const frame = useCurrentFrame();
  const e = interpolate(frame, [0, enter], [0, 1], { extrapolateRight: "clamp", easing: EXPO });
  const x = interpolate(frame, [dur - exit, dur], [1, 0], { extrapolateLeft: "clamp", easing: EXPO });
  return Math.min(e, x);
}

/** Foto con Ken Burns (zoom + paneo lento) + degradado oscuro para legibilidad. */
const KenBurns = ({
  src,
  dur,
  dir = 1,
  overlay = "linear-gradient(90deg, rgba(10,4,20,0.92) 0%, rgba(10,4,20,0.55) 45%, rgba(10,4,20,0.35) 100%)",
}: {
  src: string;
  dur: number;
  dir?: number;
  overlay?: string;
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, dur], [0, 1], { extrapolateRight: "clamp" });
  const scale = 1.06 + p * 0.12;
  const tx = dir * p * 26;
  return (
    <AbsoluteFill>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateX(${tx}px)`,
        }}
      />
      <AbsoluteFill style={{ background: overlay }} />
      {/* vignette + grano sutil de marca */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 35%, ${COLORS.bgDeep}cc 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Línea de texto que entra con spring (translateY + fade). */
const Line = ({
  children,
  delay = 0,
  y = 28,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  style?: React.CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 90, mass: 0.8 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * y}px)`, ...style }}>{children}</div>
  );
};

const Eyebrow = ({ children, delay = 0 }: { children: ReactNode; delay?: number }) => (
  <Line delay={delay} y={16}>
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        fontFamily: FONTS.body,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: 6,
        textTransform: "uppercase",
        color: COLORS.yellow,
      }}
    >
      <span style={{ width: 44, height: 2, background: COLORS.yellow, display: "inline-block" }} />
      {children}
    </div>
  </Line>
);

const sceneWrap: React.CSSProperties = {
  padding: "0 130px",
  justifyContent: "center",
};

// ─────────────────────────── Escena 1 · Hook ───────────────────────────
export const SceneHook = ({ dur }: { dur: number }) => {
  const op = useReveal(dur);
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <KenBurns src="radar/skyline.png" dur={dur} dir={-1} />
      <AbsoluteFill style={{ ...sceneWrap }}>
        <Eyebrow delay={4}>Radar de Oportunidades</Eyebrow>
        <Line delay={14} style={{ marginTop: 26 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: FONTS.display,
              fontSize: 92,
              lineHeight: 1.04,
              color: COLORS.white,
              maxWidth: 1250,
              textShadow: "0 6px 40px rgba(0,0,0,0.5)",
            }}
          >
            Las mejores oportunidades inmobiliarias están{" "}
            <span style={{ color: COLORS.yellow }}>a la vista de todos.</span>
          </h1>
        </Line>
        <Line delay={34} style={{ marginTop: 26 }}>
          <p
            style={{
              margin: 0,
              fontFamily: FONTS.body,
              fontSize: 40,
              fontWeight: 500,
              color: COLORS.offWhite,
              opacity: 0.85,
            }}
          >
            Pero casi nadie las encuentra a tiempo.
          </p>
        </Line>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────── Escena 2 · Escala ───────────────────────────
const StatChip = ({ value, label, delay }: { value: string; label: string; delay: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 110 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${(1 - s) * 30}px) scale(${0.9 + s * 0.1})`,
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${COLORS.purpleGlow}40`,
        borderRadius: 22,
        padding: "30px 38px",
        textAlign: "center",
        minWidth: 280,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ fontFamily: FONTS.display, fontSize: 76, color: COLORS.yellow, lineHeight: 1 }}>
        {value}
      </div>
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: COLORS.offWhite,
          opacity: 0.8,
          marginTop: 12,
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const SceneScale = ({ dur }: { dur: number }) => {
  const op = useReveal(dur);
  const frame = useCurrentFrame();
  const count = Math.round(interpolate(frame, [8, 60], [0, 28000], { extrapolateRight: "clamp", easing: EXPO }));
  return (
    <AbsoluteFill style={{ ...sceneWrap, opacity: op, alignItems: "center", textAlign: "center" }}>
      <Line delay={2}>
        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 60, color: COLORS.white }}>
          El mercado es <span style={{ color: COLORS.yellow }}>inabarcable</span> a mano.
        </h2>
      </Line>
      <div style={{ display: "flex", gap: 28, marginTop: 60, flexWrap: "wrap", justifyContent: "center" }}>
        <StatChip value={count.toLocaleString("es-CO") + "+"} label="Propiedades" delay={10} />
        <StatChip value="8" label="Ciudades" delay={20} />
        <StatChip value="4" label="Bancos" delay={28} />
        <StatChip value="∞" label="Remates judiciales" delay={36} />
      </div>
      <Line delay={52} style={{ marginTop: 56 }}>
        <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 34, color: COLORS.offWhite, opacity: 0.8 }}>
          Imposible de vigilar… para una persona.
        </p>
      </Line>
    </AbsoluteFill>
  );
};

// ─────────────────────────── Escena 3 · El Radar ───────────────────────────
export const SceneRadar = ({ dur }: { dur: number }) => {
  const op = useReveal(dur);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sweep = (frame / dur) * 540; // grados
  const logoS = spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 80 } });
  const rings = [220, 360, 500];
  const blips = [
    { a: 35, r: 180 }, { a: 120, r: 300 }, { a: 200, r: 240 }, { a: 290, r: 400 }, { a: 330, r: 150 },
  ];
  return (
    <AbsoluteFill style={{ opacity: op, alignItems: "center", justifyContent: "center" }}>
      {/* Radar a la izquierda */}
      <div style={{ position: "absolute", left: 230, top: "50%", width: 1, height: 1 }}>
        <div style={{ position: "absolute", transform: "translate(-50%,-50%)" }}>
          <svg width={1040} height={1040} viewBox="-520 -520 1040 1040">
            {rings.map((r, i) => (
              <circle key={i} cx={0} cy={0} r={r} fill="none" stroke={`${COLORS.purpleGlow}40`} strokeWidth={2} />
            ))}
            <line x1={-500} y1={0} x2={500} y2={0} stroke={`${COLORS.purpleGlow}25`} strokeWidth={1.5} />
            <line x1={0} y1={-500} x2={0} y2={500} stroke={`${COLORS.purpleGlow}25`} strokeWidth={1.5} />
            {blips.map((b, i) => {
              const rad = (b.a * Math.PI) / 180;
              const x = Math.cos(rad) * b.r;
              const y = Math.sin(rad) * b.r;
              const diff = ((sweep % 360) - b.a + 360) % 360;
              const lit = interpolate(diff, [0, 40, 90], [1, 0.5, 0.12], { extrapolateRight: "clamp" });
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={10 + lit * 8} fill={COLORS.yellow} opacity={lit} />
                  <circle cx={x} cy={y} r={6} fill={COLORS.yellow} />
                </g>
              );
            })}
          </svg>
          {/* barrido cónico */}
          <div
            style={{
              position: "absolute",
              left: -520,
              top: -520,
              width: 1040,
              height: 1040,
              borderRadius: "50%",
              background: `conic-gradient(from ${sweep}deg, ${COLORS.yellow}00 0deg, ${COLORS.yellow}30 26deg, ${COLORS.yellow}00 60deg)`,
              maskImage: "radial-gradient(circle, #000 0%, #000 50%, transparent 50%)",
            }}
          />
        </div>
      </div>
      {/* Texto a la derecha */}
      <div style={{ position: "absolute", right: 130, top: "50%", transform: "translateY(-50%)", maxWidth: 760 }}>
        <Eyebrow delay={6}>Sistema CRECE</Eyebrow>
        <div style={{ opacity: logoS, transform: `translateY(${(1 - logoS) * 24}px)`, marginTop: 22 }}>
          <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 110, lineHeight: 0.98, color: COLORS.white }}>
            Tu <span style={{ color: COLORS.yellow }}>radar</span> del mercado.
          </h1>
        </div>
        <Line delay={48} style={{ marginTop: 30 }}>
          <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 38, color: COLORS.offWhite, opacity: 0.85, lineHeight: 1.4 }}>
            Escaneamos bancos, remates y portales <strong style={{ color: COLORS.white }}>cada semana</strong> para encontrar lo que otros no ven.
          </p>
        </Line>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────── Escena 4 · Comparables ───────────────────────────
const OppCard = ({ delay }: { delay: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 80 } });
  const disc = Math.round(interpolate(frame, [delay + 10, delay + 45], [0, 63], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO }));
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${(1 - s) * 40}px) scale(${0.94 + s * 0.06})`,
        width: 620,
        borderRadius: 24,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ position: "relative", height: 300 }}>
        <Img src={staticFile("radar/interior.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            background: GRADIENTS.goldAccent,
            color: COLORS.purpleDeep,
            fontFamily: FONTS.body,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 1,
            padding: "10px 20px",
            borderRadius: 999,
            boxShadow: "0 6px 18px rgba(242,202,4,0.5)",
          }}
        >
          ★ −{disc}% vs mercado
        </div>
      </div>
      <div style={{ background: GRADIENTS.purpleHero, padding: "20px 26px" }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 46, color: COLORS.yellow, lineHeight: 1 }}>
          {formatCOP(255000000)}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 24, color: "rgba(255,255,255,0.8)", marginTop: 8 }}>
          Apartamento · 53 m² · Cartagena
        </div>
      </div>
      <div style={{ padding: "18px 26px", display: "flex", justifyContent: "space-between", fontFamily: FONTS.body }}>
        <div>
          <div style={{ fontSize: 18, color: "#9b87a8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Este inmueble</div>
          <div style={{ fontSize: 30, color: "#1a1a1a", fontWeight: 800 }}>$4.8M/m²</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, color: "#9b87a8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Mediana zona</div>
          <div style={{ fontSize: 30, color: "#1a1a1a", fontWeight: 800 }}>$13M/m²</div>
        </div>
      </div>
    </div>
  );
};

export const SceneComparables = ({ dur }: { dur: number }) => {
  const op = useReveal(dur);
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <KenBurns src="radar/edificio.png" dur={dur} dir={1} overlay="linear-gradient(90deg, rgba(10,4,20,0.35) 0%, rgba(10,4,20,0.7) 55%, rgba(10,4,20,0.95) 100%)" />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "0 130px" }}>
        <OppCard delay={16} />
        <div style={{ maxWidth: 640 }}>
          <Eyebrow delay={4}>El motor de comparables</Eyebrow>
          <Line delay={16} style={{ marginTop: 22 }}>
            <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 76, lineHeight: 1.04, color: COLORS.white }}>
              Comparamos cada inmueble contra el <span style={{ color: COLORS.yellow }}>precio real</span> de su zona.
            </h2>
          </Line>
          <Line delay={36} style={{ marginTop: 26 }}>
            <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 36, color: COLORS.offWhite, opacity: 0.85, lineHeight: 1.4 }}>
              Te decimos al instante si una oportunidad está realmente por debajo del mercado.
            </p>
          </Line>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────── Escena 5 · Valor ───────────────────────────
export const SceneValue = ({ dur }: { dur: number }) => {
  const op = useReveal(dur);
  const frame = useCurrentFrame();
  const big = Math.round(interpolate(frame, [10, 50], [0, 70], { extrapolateRight: "clamp", easing: EXPO }));
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <KenBurns src="radar/llaves.png" dur={dur} dir={-1} overlay="linear-gradient(90deg, rgba(10,4,20,0.9) 0%, rgba(10,4,20,0.6) 50%, rgba(10,4,20,0.85) 100%)" />
      <AbsoluteFill style={{ ...sceneWrap, alignItems: "center", textAlign: "center" }}>
        <Eyebrow delay={4}>Oportunidades reales</Eyebrow>
        <Line delay={14} style={{ marginTop: 20 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 240, lineHeight: 0.9, color: COLORS.yellow, textShadow: "0 10px 60px rgba(242,202,4,0.35)" }}>
            {big}%
          </div>
        </Line>
        <Line delay={28} style={{ marginTop: 4 }}>
          <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 72, color: COLORS.white }}>
            por debajo del mercado
          </h2>
        </Line>
        <Line delay={44} style={{ marginTop: 26 }}>
          <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 36, color: COLORS.offWhite, opacity: 0.85 }}>
            En remates judiciales y activos de banco. Una sola compra puede cambiarlo todo.
          </p>
        </Line>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────── Escena 6 · CTA ───────────────────────────
export const SceneCTA = ({ dur }: { dur: number }) => {
  const op = useReveal(dur, 18, 24);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 80 } });
  const btn = spring({ frame: frame - 30, fps, config: { damping: 14, stiffness: 120 } });
  const pulse = 1 + Math.sin(frame / 7) * 0.02;
  return (
    <AbsoluteFill style={{ opacity: op, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ opacity: logo, transform: `translateY(${(1 - logo) * 26}px)` }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 30, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase", color: COLORS.yellow }}>
          Radar de Oportunidades · CRECE
        </div>
        <h1 style={{ margin: "26px 0 0", fontFamily: FONTS.display, fontSize: 104, lineHeight: 1.02, color: COLORS.white, maxWidth: 1400 }}>
          Empieza a ver lo que <span style={{ color: COLORS.yellow }}>otros no ven.</span>
        </h1>
      </div>
      <div
        style={{
          opacity: btn,
          transform: `scale(${(0.9 + btn * 0.1) * pulse})`,
          marginTop: 60,
          background: GRADIENTS.goldAccent,
          color: COLORS.purpleDeep,
          fontFamily: FONTS.body,
          fontWeight: 800,
          fontSize: 42,
          letterSpacing: 1,
          padding: "26px 64px",
          borderRadius: 999,
          boxShadow: "0 18px 50px rgba(242,202,4,0.45)",
        }}
      >
        Crea tu cuenta gratis →
      </div>
      <Line delay={46} style={{ marginTop: 34 }}>
        <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 30, color: COLORS.offWhite, opacity: 0.7 }}>
          Regístrate y recibe las mejores oportunidades antes que nadie.
        </p>
      </Line>
    </AbsoluteFill>
  );
};
