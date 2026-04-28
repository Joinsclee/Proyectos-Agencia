import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

const URGENT_COLORS = {
  red: "#ef4444",
  redDark: "#dc2626",
  orange: "#f97316",
};

// Animated fake countdown: starts at 47h 58m and ticks down per frame
const computeCountdown = (frame: number, offsetH: number) => {
  const baseSec = (offsetH * 3600) - frame * 5;
  const secs = Math.max(0, baseSec);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
};

const CountdownBox = ({ value, unit }: { value: string; unit: string }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "10px 12px",
      background: `linear-gradient(180deg, ${COLORS.purpleDark} 0%, ${COLORS.purpleDeep} 100%)`,
      borderRadius: 12,
      border: `2px solid ${URGENT_COLORS.red}`,
      minWidth: 70,
      boxShadow: `0 4px 15px ${URGENT_COLORS.red}44`,
    }}
  >
    <div
      style={{
        fontSize: 36,
        fontWeight: 900,
        color: COLORS.white,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        fontFamily: FONTS.display,
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 11,
        color: URGENT_COLORS.red,
        fontWeight: 800,
        letterSpacing: 2,
        textTransform: "uppercase",
        marginTop: 4,
      }}
    >
      {unit}
    </div>
  </div>
);

type Bono = {
  badge: string;
  title: string;
  description: string;
  value: number;
  cupos: string;
  offsetH: number;
};

const BONOS: Bono[] = [
  {
    badge: "PRIMERAS 24 HORAS",
    title: "Sesión Diagnóstico 1-a-1 (50 min) con Andrés Giraldo",
    description:
      "Trazamos tu mapa personal de inversión y resolvemos tu punto de partida específico.",
    value: 100,
    cupos: "Solo primeros 5 cupos",
    offsetH: 23,
  },
  {
    badge: "PRIMERAS 48 HORAS",
    title: "6 meses EXTRA en la Comunidad CRECE VIP",
    description:
      "Pasas de 6 a 12 meses totales de acompañamiento, networking y herramientas.",
    value: 290,
    cupos: "Tiempo limitado",
    offsetH: 47,
  },
];

export const Scene7BonosUrgency = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headP = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  // Pulse effect for urgency
  const urgentPulse = 1 + Math.sin(frame * 0.2) * 0.03;
  const flameFlicker = 0.85 + Math.sin(frame * 0.35) * 0.15;

  const totalProgress = spring({
    frame: frame - 80,
    fps,
    config: { damping: 14, stiffness: 100 },
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
          padding: "50px 80px",
        }}
      >
        {/* Red alert bar at top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: `linear-gradient(90deg, ${URGENT_COLORS.red}, ${URGENT_COLORS.orange}, ${URGENT_COLORS.red})`,
            opacity: headP,
            boxShadow: `0 0 30px ${URGENT_COLORS.red}`,
          }}
        />

        {/* Header */}
        <div
          style={{
            textAlign: "center",
            opacity: headP,
            transform: `translateY(${(1 - headP) * -20}px) scale(${urgentPulse})`,
            marginBottom: 30,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 32px",
              background: `linear-gradient(135deg, ${URGENT_COLORS.red} 0%, ${URGENT_COLORS.orange} 100%)`,
              borderRadius: 999,
              color: COLORS.white,
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: 4,
              textTransform: "uppercase",
              marginBottom: 20,
              boxShadow: `0 15px 40px ${URGENT_COLORS.red}88`,
            }}
          >
            <span
              style={{
                fontSize: 28,
                opacity: flameFlicker,
                filter: `drop-shadow(0 0 8px ${COLORS.yellow})`,
              }}
            >
              🔥
            </span>
            Bonos de Acción Rápida
            <span
              style={{
                fontSize: 28,
                opacity: flameFlicker,
                filter: `drop-shadow(0 0 8px ${COLORS.yellow})`,
              }}
            >
              🔥
            </span>
          </div>
          <div
            style={{
              fontSize: 70,
              fontWeight: 900,
              color: COLORS.white,
              letterSpacing: -2,
              lineHeight: 1.05,
            }}
          >
            Si tomas acción{" "}
            <span
              style={{
                color: URGENT_COLORS.red,
                fontFamily: FONTS.elegant,
                fontStyle: "italic",
                textShadow: `0 0 30px ${URGENT_COLORS.red}`,
              }}
            >
              HOY
            </span>{" "}
            te llevas esto GRATIS
          </div>
        </div>

        {/* 2 Urgent cards */}
        <div
          style={{
            display: "flex",
            gap: 32,
            flex: 1,
            alignItems: "stretch",
          }}
        >
          {BONOS.map((b, i) => {
            const p = spring({
              frame: frame - (20 + i * 18),
              fps,
              config: { damping: 12, stiffness: 90 },
            });
            const cd = computeCountdown(frame, b.offsetH);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: `linear-gradient(160deg, ${URGENT_COLORS.red}28 0%, ${COLORS.purple}60 50%, ${COLORS.purpleDark}80 100%)`,
                  border: `3px solid ${URGENT_COLORS.red}`,
                  borderRadius: 28,
                  padding: 36,
                  backdropFilter: "blur(14px)",
                  opacity: p,
                  transform: `translateY(${(1 - p) * 80}px) scale(${
                    0.9 + p * 0.1
                  })`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  boxShadow: `0 25px 70px ${URGENT_COLORS.red}55, inset 0 0 30px ${URGENT_COLORS.red}22`,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Clock urgency watermark */}
                <div
                  style={{
                    position: "absolute",
                    top: -30,
                    right: -30,
                    fontSize: 200,
                    opacity: 0.07,
                    transform: `rotate(${frame * 0.5}deg)`,
                  }}
                >
                  ⏰
                </div>

                {/* Time badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 18px",
                    background: URGENT_COLORS.red,
                    color: COLORS.white,
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 900,
                    letterSpacing: 3,
                    alignSelf: "flex-start",
                    boxShadow: `0 6px 18px ${URGENT_COLORS.red}88`,
                  }}
                >
                  ⏱ {b.badge}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    color: COLORS.white,
                    lineHeight: 1.15,
                    letterSpacing: -0.5,
                  }}
                >
                  {b.title}
                </div>

                {/* Description */}
                <div
                  style={{
                    fontSize: 19,
                    color: COLORS.white,
                    opacity: 0.9,
                    lineHeight: 1.4,
                    fontWeight: 500,
                  }}
                >
                  {b.description}
                </div>

                {/* Value box */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 16px",
                    background: `${COLORS.yellow}18`,
                    border: `2px dashed ${COLORS.yellow}`,
                    borderRadius: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      color: COLORS.white,
                      opacity: 0.7,
                      fontWeight: 700,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    Valor real:
                  </span>
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: COLORS.yellow,
                      fontFamily: FONTS.display,
                      textDecoration: "line-through",
                      textDecorationColor: URGENT_COLORS.red,
                    }}
                  >
                    ${b.value} USD
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 18,
                      fontWeight: 900,
                      color: COLORS.green,
                      letterSpacing: 1,
                    }}
                  >
                    GRATIS →
                  </span>
                </div>

                {/* Cupos */}
                <div
                  style={{
                    fontSize: 15,
                    color: URGENT_COLORS.orange,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  ⚡ {b.cupos}
                </div>

                {/* Countdown */}
                <div
                  style={{
                    marginTop: "auto",
                    padding: 14,
                    background: COLORS.purpleDeep,
                    borderRadius: 14,
                    border: `1.5px solid ${URGENT_COLORS.red}66`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: URGENT_COLORS.red,
                      fontWeight: 900,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      marginBottom: 8,
                      textAlign: "center",
                    }}
                  >
                    Esta oferta expira en
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "center",
                    }}
                  >
                    <CountdownBox value={cd.h} unit="Horas" />
                    <CountdownBox value={cd.m} unit="Min" />
                    <CountdownBox value={cd.s} unit="Seg" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total value savings bar */}
        <div
          style={{
            marginTop: 24,
            padding: "16px 32px",
            background: GRADIENTS.goldGreen,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            opacity: totalProgress,
            transform: `scale(${0.9 + totalProgress * 0.1})`,
            boxShadow: `0 20px 50px ${COLORS.yellow}66`,
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: COLORS.purpleDark,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Bonos por valor de
          </span>
          <span
            style={{
              fontSize: 42,
              fontWeight: 900,
              color: COLORS.purpleDark,
              fontFamily: FONTS.display,
              letterSpacing: -1,
            }}
          >
            $390 USD
          </span>
          <span
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: COLORS.purpleDark,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            · GRATIS SI ACTÚAS YA
          </span>
        </div>
      </div>
    </SceneTransition>
  );
};
