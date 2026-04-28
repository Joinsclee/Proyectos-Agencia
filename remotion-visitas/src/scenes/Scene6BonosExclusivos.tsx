import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

const BONOS = [
  {
    title: "Biblioteca de Contratos",
    desc: "Minutas listas para usar: promesas de compraventa, arrendamientos residenciales/comerciales y más. No improvises.",
    tag: "BONO #1",
    highlight: "Plantillas legales",
  },
  {
    title: "3 Talleres Estratégicos en Vivo",
    desc: "Acompañamiento · Meta Ads para vender 3× más rápido · Inversión en planos y cesión de derechos.",
    tag: "BONO #2",
    highlight: "3 sesiones grupales",
  },
  {
    title: "Acceso a Equipos de Inversión",
    desc: "Alianzas estratégicas entre alumnos. Une esfuerzos, complementa habilidades, avanza con seguridad.",
    tag: "BONO #3",
    highlight: "Networking real",
  },
];

const Star = () => (
  <svg width="22" height="22" viewBox="0 0 24 24">
    <path
      d="M12 2 L14.09 8.26 L20.5 8.27 L15.45 12.14 L17.54 18.4 L12 14.52 L6.46 18.4 L8.55 12.14 L3.5 8.27 L9.91 8.26 Z"
      fill={COLORS.purpleDark}
    />
  </svg>
);

export const Scene6BonosExclusivos = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headP = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  const sparkleAngle = interpolate(frame, [0, 60], [0, 360]);

  return (
    <SceneTransition>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          fontFamily: FONTS.body,
          padding: "70px 90px",
        }}
      >
        {/* Header with sparkles */}
        <div
          style={{
            textAlign: "center",
            opacity: headP,
            transform: `translateY(${(1 - headP) * -20}px)`,
            marginBottom: 40,
            position: "relative",
          }}
        >
          {/* Sparkle decoration */}
          <svg
            width="60"
            height="60"
            viewBox="0 0 60 60"
            style={{
              position: "absolute",
              left: "30%",
              top: -10,
              transform: `rotate(${sparkleAngle}deg)`,
            }}
          >
            <path
              d="M30 0 L33 27 L60 30 L33 33 L30 60 L27 33 L0 30 L27 27 Z"
              fill={COLORS.yellow}
              opacity="0.6"
            />
          </svg>
          <svg
            width="40"
            height="40"
            viewBox="0 0 60 60"
            style={{
              position: "absolute",
              right: "28%",
              top: 30,
              transform: `rotate(${-sparkleAngle * 1.5}deg)`,
            }}
          >
            <path
              d="M30 0 L33 27 L60 30 L33 33 L30 60 L27 33 L0 30 L27 27 Z"
              fill={COLORS.green}
              opacity="0.5"
            />
          </svg>

          <div
            style={{
              display: "inline-block",
              padding: "10px 30px",
              background: GRADIENTS.goldAccent,
              borderRadius: 999,
              color: COLORS.purpleDark,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 5,
              textTransform: "uppercase",
              marginBottom: 16,
              boxShadow: `0 12px 30px ${COLORS.yellow}55`,
            }}
          >
            ★ Bonos Exclusivos Incluidos ★
          </div>
          <div
            style={{
              fontSize: 66,
              fontWeight: 900,
              color: COLORS.white,
              letterSpacing: -1.5,
              lineHeight: 1.05,
            }}
          >
            3 regalos para{" "}
            <span
              style={{
                fontFamily: FONTS.elegant,
                fontStyle: "italic",
                fontWeight: 700,
                background: GRADIENTS.goldGreen,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              acelerar
            </span>{" "}
            tus resultados
          </div>
        </div>

        {/* Bonos cards */}
        <div
          style={{
            display: "flex",
            gap: 28,
            flex: 1,
            alignItems: "stretch",
          }}
        >
          {BONOS.map((b, i) => {
            const p = spring({
              frame: frame - (18 + i * 16),
              fps,
              config: { damping: 13, stiffness: 90 },
            });
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: `linear-gradient(160deg, ${COLORS.yellow}22 0%, ${COLORS.purple}60 60%, ${COLORS.purpleDark}50 100%)`,
                  border: `3px solid ${COLORS.yellow}`,
                  borderRadius: 24,
                  padding: 32,
                  backdropFilter: "blur(14px)",
                  opacity: p,
                  transform: `translateY(${(1 - p) * 60}px) rotate(${
                    (1 - p) * (i - 1) * 2
                  }deg)`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  boxShadow: `0 25px 60px ${COLORS.purpleDeep}, 0 0 40px ${COLORS.yellow}33 inset`,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Ribbon */}
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    right: -40,
                    padding: "8px 50px",
                    background: GRADIENTS.goldAccent,
                    color: COLORS.purpleDark,
                    fontSize: 16,
                    fontWeight: 900,
                    letterSpacing: 3,
                    transform: "rotate(35deg)",
                    boxShadow: `0 4px 12px ${COLORS.purpleDeep}`,
                  }}
                >
                  {b.tag}
                </div>

                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: "50%",
                    background: GRADIENTS.goldAccent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 10px 25px ${COLORS.yellow}66`,
                  }}
                >
                  <div style={{ transform: "scale(1.8)" }}>
                    <Star />
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: COLORS.yellow,
                    fontWeight: 800,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  {b.highlight}
                </div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    color: COLORS.white,
                    lineHeight: 1.1,
                    letterSpacing: -0.5,
                  }}
                >
                  {b.title}
                </div>
                <div
                  style={{
                    fontSize: 19,
                    color: COLORS.white,
                    opacity: 0.88,
                    lineHeight: 1.4,
                    fontWeight: 500,
                  }}
                >
                  {b.desc}
                </div>

                <div
                  style={{
                    marginTop: "auto",
                    padding: "10px 16px",
                    background: `${COLORS.green}25`,
                    border: `1.5px solid ${COLORS.green}`,
                    borderRadius: 10,
                    color: COLORS.green,
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textAlign: "center",
                  }}
                >
                  ✓ INCLUIDO SIN COSTO EXTRA
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneTransition>
  );
};
