import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

const LETTERS = "CRECE".split("");

export const Scene1Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const topBadgeProgress = spring({
    frame: frame - 5,
    fps,
    config: { damping: 15, stiffness: 90 },
  });

  const subtitleProgress = spring({
    frame: frame - 35,
    fps,
    config: { damping: 18, stiffness: 80 },
  });

  const lineProgress = interpolate(frame, [20, 40], [0, 1], {
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
        }}
      >
        {/* Top badge */}
        <div
          style={{
            opacity: topBadgeProgress,
            transform: `translateY(${(1 - topBadgeProgress) * -20}px)`,
            padding: "10px 28px",
            border: `2px solid ${COLORS.yellow}`,
            borderRadius: 999,
            background: `${COLORS.yellow}15`,
            color: COLORS.yellow,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 40,
          }}
        >
          Mentoría en vivo · 5 semanas
        </div>

        {/* Animated CRECE letters */}
        <div
          style={{
            display: "flex",
            gap: 8,
            fontFamily: FONTS.display,
          }}
        >
          {LETTERS.map((letter, i) => {
            const letterProgress = spring({
              frame: frame - (10 + i * 5),
              fps,
              config: { damping: 12, stiffness: 110 },
            });
            return (
              <span
                key={i}
                style={{
                  fontSize: 260,
                  fontWeight: 900,
                  letterSpacing: -6,
                  background: GRADIENTS.whiteGold,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  lineHeight: 1,
                  display: "inline-block",
                  opacity: letterProgress,
                  transform: `translateY(${(1 - letterProgress) * 60}px) scale(${
                    0.7 + letterProgress * 0.3
                  })`,
                  filter: `drop-shadow(0 0 ${letterProgress * 40}px ${COLORS.yellow}66)`,
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>

        {/* Underline */}
        <div
          style={{
            width: `${lineProgress * 520}px`,
            height: 4,
            background: GRADIENTS.goldGreen,
            marginTop: 20,
            borderRadius: 2,
            boxShadow: `0 0 20px ${COLORS.yellow}`,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            fontSize: 40,
            color: COLORS.white,
            opacity: subtitleProgress * 0.9,
            fontFamily: FONTS.elegant,
            fontStyle: "italic",
            marginTop: 32,
            letterSpacing: -0.5,
            transform: `translateY(${(1 - subtitleProgress) * 20}px)`,
          }}
        >
          El sistema para invertir en bienes raíces
        </div>

        {/* Bottom by-line */}
        <div
          style={{
            fontSize: 22,
            color: COLORS.white,
            opacity: subtitleProgress * 0.6,
            marginTop: 16,
            letterSpacing: 6,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Con Andrés Giraldo
        </div>
      </div>
    </SceneTransition>
  );
};
