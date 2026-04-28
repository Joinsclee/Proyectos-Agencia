import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

export const Scene9CTA = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleP = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 95 },
  });

  const ctaP = spring({
    frame: frame - 15,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const pulse = 1 + Math.sin(frame * 0.18) * 0.025;

  const avatarP = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const starsP = interpolate(frame, [30, 50], [0, 1], {
    extrapolateRight: "clamp",
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
        {/* Headline */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 900,
            color: COLORS.white,
            textAlign: "center",
            lineHeight: 1.05,
            letterSpacing: -2.5,
            opacity: titleP,
            transform: `translateY(${(1 - titleP) * -30}px)`,
            maxWidth: 1600,
          }}
        >
          Tu próxima{" "}
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
            inversión inteligente
          </span>
          <br />
          empieza hoy
        </div>

        {/* Meta info */}
        <div
          style={{
            display: "flex",
            gap: 40,
            marginTop: 40,
            opacity: avatarP,
            transform: `translateY(${(1 - avatarP) * 20}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: GRADIENTS.goldAccent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 900,
                color: COLORS.purpleDark,
                border: `3px solid ${COLORS.white}`,
              }}
            >
              AG
            </div>
            <div>
              <div
                style={{
                  fontSize: 16,
                  color: COLORS.yellow,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                Tu Mentor
              </div>
              <div
                style={{
                  fontSize: 26,
                  color: COLORS.white,
                  fontWeight: 800,
                }}
              >
                Andrés Giraldo
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: starsP,
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} width="28" height="28" viewBox="0 0 24 24">
                <path
                  d="M12 2 L14.09 8.26 L20.5 8.27 L15.45 12.14 L17.54 18.4 L12 14.52 L6.46 18.4 L8.55 12.14 L3.5 8.27 L9.91 8.26 Z"
                  fill={COLORS.yellow}
                />
              </svg>
            ))}
            <div
              style={{
                fontSize: 20,
                color: COLORS.white,
                fontWeight: 700,
                marginLeft: 10,
              }}
            >
              Comunidad CRECE
            </div>
          </div>
        </div>

        {/* Big CTA button */}
        <div
          style={{
            marginTop: 56,
            padding: "28px 80px",
            background: GRADIENTS.goldGreen,
            borderRadius: 999,
            fontSize: 42,
            fontWeight: 900,
            color: COLORS.purpleDark,
            letterSpacing: -0.5,
            opacity: ctaP,
            transform: `scale(${(0.8 + ctaP * 0.2) * pulse})`,
            boxShadow: `0 25px 80px ${COLORS.yellow}88, inset 0 -6px 0 ${COLORS.yellowDark}`,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          SÍ, QUIERO EL SISTEMA CRECE
          <span style={{ fontSize: 48 }}>→</span>
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 24,
            color: COLORS.white,
            opacity: ctaP * 0.8,
            fontWeight: 500,
            letterSpacing: 1,
          }}
        >
          ⚡ Solo primeros 5 cupos con bono 1-a-1 · Oferta por tiempo limitado
        </div>
      </div>
    </SceneTransition>
  );
};
