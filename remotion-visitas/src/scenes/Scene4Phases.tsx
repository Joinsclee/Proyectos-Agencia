import {
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

const PHASES = [
  {
    num: "01",
    title: "Claridad y Fundamentos",
    bullets: [
      "Cómo funciona realmente el negocio inmobiliario",
      "Define objetivos con o sin ahorros",
      "Rastrea oportunidades con alto potencial",
    ],
  },
  {
    num: "02",
    title: "Habilidades del Inversionista",
    bullets: [
      "Detecta oportunidades reales de inversión",
      "Negocia con inteligencia",
      "Apalancamiento estratégico experto",
    ],
  },
  {
    num: "03",
    title: "Capitalización y Cierre",
    bullets: [
      "Vende y capitaliza correctamente",
      "Señales de alerta que evitan pérdidas",
      "Promesa, escritura y cierre perfecto",
    ],
  },
];

export const Scene4Phases = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headP = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  return (
    <SceneTransition>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          fontFamily: FONTS.body,
          padding: "70px 80px",
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: "center",
            opacity: headP,
            transform: `translateY(${(1 - headP) * -20}px)`,
            marginBottom: 50,
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "8px 22px",
              background: `${COLORS.green}20`,
              border: `2px solid ${COLORS.green}`,
              borderRadius: 999,
              color: COLORS.green,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Las 3 Fases que lo cambian todo
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: COLORS.white,
              letterSpacing: -1.5,
              lineHeight: 1.1,
            }}
          >
            Un camino{" "}
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
              probado
            </span>{" "}
            para inversionistas reales
          </div>
        </div>

        {/* Phase cards */}
        <div
          style={{
            display: "flex",
            gap: 30,
            flex: 1,
            alignItems: "stretch",
          }}
        >
          {PHASES.map((phase, i) => {
            const p = spring({
              frame: frame - (15 + i * 14),
              fps,
              config: { damping: 14, stiffness: 90 },
            });
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: `linear-gradient(160deg, ${COLORS.purple}80 0%, ${COLORS.purpleDark}60 100%)`,
                  border: `2px solid ${COLORS.purpleLight}`,
                  borderRadius: 24,
                  padding: 36,
                  backdropFilter: "blur(16px)",
                  opacity: p,
                  transform: `translateY(${(1 - p) * 60}px) scale(${
                    0.94 + p * 0.06
                  })`,
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: `0 20px 60px ${COLORS.purpleDeep}`,
                }}
              >
                {/* Number watermark */}
                <div
                  style={{
                    position: "absolute",
                    top: -30,
                    right: -10,
                    fontSize: 260,
                    fontWeight: 900,
                    color: `${COLORS.yellow}10`,
                    fontFamily: FONTS.display,
                    lineHeight: 1,
                  }}
                >
                  {phase.num}
                </div>

                {/* Phase badge */}
                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 14px",
                    background: GRADIENTS.goldAccent,
                    borderRadius: 999,
                    color: COLORS.purpleDark,
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: 2,
                    marginBottom: 16,
                  }}
                >
                  FASE {phase.num}
                </div>

                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    color: COLORS.white,
                    lineHeight: 1.1,
                    marginBottom: 24,
                    letterSpacing: -0.5,
                    position: "relative",
                  }}
                >
                  {phase.title}
                </div>

                <div style={{ position: "relative" }}>
                  {phase.bullets.map((b, bi) => {
                    const bulletP = spring({
                      frame: frame - (30 + i * 14 + bi * 6),
                      fps,
                      config: { damping: 16, stiffness: 100 },
                    });
                    return (
                      <div
                        key={bi}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          marginBottom: 14,
                          opacity: bulletP,
                          transform: `translateX(${(1 - bulletP) * -20}px)`,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: GRADIENTS.goldGreen,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginTop: 4,
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M5 12 L10 17 L19 7"
                              stroke={COLORS.purpleDark}
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <div
                          style={{
                            fontSize: 22,
                            color: COLORS.white,
                            opacity: 0.95,
                            lineHeight: 1.3,
                            fontWeight: 500,
                          }}
                        >
                          {b}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneTransition>
  );
};
