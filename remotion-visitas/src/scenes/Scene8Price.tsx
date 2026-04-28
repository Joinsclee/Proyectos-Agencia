import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

const REAL_VALUE = 3110;
const FINAL_PRICE = 448;

export const Scene8Price = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headP = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  const realValueP = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 95 },
  });

  const strikeP = interpolate(frame, [25, 45], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const priceP = spring({
    frame: frame - 35,
    fps,
    config: { damping: 10, stiffness: 120 },
  });

  const priceCount = interpolate(frame, [35, 75], [0, FINAL_PRICE], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <SceneTransition>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONTS.body,
          padding: 80,
        }}
      >
        <div
          style={{
            fontSize: 24,
            color: COLORS.yellow,
            letterSpacing: 5,
            textTransform: "uppercase",
            fontWeight: 800,
            opacity: headP,
            marginBottom: 10,
          }}
        >
          Mentoría + Kit + Bonos exclusivos + Bonos de acción rápida
        </div>
        <div
          style={{
            fontSize: 28,
            color: COLORS.white,
            letterSpacing: 6,
            textTransform: "uppercase",
            fontWeight: 700,
            opacity: headP,
            marginBottom: 24,
          }}
        >
          Inversión total
        </div>

        {/* Real value crossed out */}
        <div
          style={{
            position: "relative",
            display: "inline-block",
            marginBottom: 20,
            opacity: realValueP,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: COLORS.white,
              opacity: 0.55,
              letterSpacing: -1,
            }}
          >
            Valor real: ${REAL_VALUE.toLocaleString("en-US")} USD
          </div>
          {/* Strike line */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              height: 6,
              width: `${strikeP * 100}%`,
              background: COLORS.yellow,
              transform: "translateY(-50%) rotate(-3deg)",
              borderRadius: 3,
              boxShadow: `0 0 16px ${COLORS.yellow}`,
            }}
          />
        </div>

        {/* Divider arrow */}
        <div
          style={{
            fontSize: 48,
            color: COLORS.yellow,
            opacity: strikeP,
            transform: `translateY(${(1 - strikeP) * -10}px)`,
            marginBottom: 10,
          }}
        >
          ↓
        </div>

        {/* Price display */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 18,
            opacity: priceP,
            transform: `scale(${0.8 + priceP * 0.2})`,
            filter: `drop-shadow(0 0 60px ${COLORS.yellow}66)`,
          }}
        >
          <div
            style={{
              fontSize: 280,
              fontWeight: 900,
              fontFamily: FONTS.display,
              lineHeight: 1,
              letterSpacing: -10,
              background: GRADIENTS.whiteGold,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${Math.round(priceCount)}
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: COLORS.white,
              letterSpacing: 2,
            }}
          >
            USD
          </div>
        </div>

        <div
          style={{
            fontSize: 30,
            color: COLORS.white,
            opacity: priceP * 0.85,
            marginTop: 20,
            fontWeight: 500,
            letterSpacing: 1,
          }}
        >
          Pago único · Acceso completo por 6 meses
        </div>

        {/* Savings badge */}
        <div
          style={{
            marginTop: 36,
            padding: "14px 32px",
            background: GRADIENTS.goldGreen,
            borderRadius: 999,
            fontSize: 26,
            fontWeight: 900,
            color: COLORS.purpleDark,
            opacity: priceP,
            transform: `translateY(${(1 - priceP) * 20}px) rotate(-2deg)`,
            boxShadow: `0 15px 40px ${COLORS.green}66`,
          }}
        >
          AHORRA MÁS DE ${(REAL_VALUE - FINAL_PRICE).toLocaleString("en-US")} USD
        </div>
      </div>
    </SceneTransition>
  );
};
