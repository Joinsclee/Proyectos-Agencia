import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";

const BLACK = "#050505";
const BLACK_SOFT = "#0d0d0d";
const BLACK_WARM = "#120e0a";
const GOLD = "#c9a961";
const GOLD_LIGHT = "#e8d4a2";
const GOLD_DEEP = "#8a7a48";
const WHITE = "#f5f1ea";
const WHITE_DIM = "rgba(245, 241, 234, 0.55)";
const WHITE_FAINT = "rgba(245, 241, 234, 0.28)";

const FONT_SERIF = "'Playfair Display', Georgia, serif";
const FONT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

type Question = {
  num: string;
  label: string;
  title: string;
};

const QUESTIONS: Question[] = [
  { num: "I", label: "Sobre ti", title: "¿A qué te dedicas hoy?" },
  { num: "II", label: "Diagnóstico", title: "¿Cuál es tu mayor obstáculo ahora mismo?" },
  { num: "III", label: "Herramientas", title: "¿Usas inteligencia artificial en tu trabajo?" },
  { num: "IV", label: "Contexto", title: "¿Conoces Claude?" },
  { num: "V", label: "Mentalidad", title: "Cuando piensas en IA y tu negocio, ¿qué sientes?" },
  { num: "VI", label: "Trayectoria", title: "¿Hace cuánto intentas monetizar tu conocimiento?" },
];

const GoldDust: React.FC = () => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 30 }, (_, i) => {
    const seed = i * 17.3;
    const baseX = ((seed * 9301 + 49297) % 233280) / 2332.8;
    const baseY = ((seed * 1103 + 12345) % 233280) / 2332.8;
    const drift = Math.sin((frame + i * 30) * 0.008) * 8;
    const rise = ((frame * 0.3 + seed * 100) % 1200) - 100;
    const size = 1 + (i % 3);
    const opacity =
      0.15 + Math.abs(Math.sin((frame + i * 25) * 0.02)) * 0.35;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${baseX}%`,
          top: baseY * 10 + rise,
          width: size,
          height: size,
          borderRadius: "50%",
          background: GOLD_LIGHT,
          opacity,
          filter: "blur(0.5px)",
          boxShadow: `0 0 ${size * 3}px ${GOLD}`,
          transform: `translateX(${drift}px)`,
          pointerEvents: "none",
        }}
      />
    );
  });
  return <>{particles}</>;
};

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const glowShift = Math.sin(frame * 0.01) * 20;
  return (
    <AbsoluteFill style={{ background: BLACK }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% ${
            40 + glowShift
          }%, ${BLACK_WARM} 0%, ${BLACK_SOFT} 40%, ${BLACK} 80%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 20% 20%, ${GOLD}18 0%, transparent 40%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 85% 80%, ${GOLD}14 0%, transparent 45%)`,
        }}
      />
      <GoldDust />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.008) 0px, rgba(255,255,255,0.008) 1px, transparent 1px, transparent 3px)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

const GoldRule: React.FC<{ progress: number; width?: number }> = ({
  progress,
  width = 200,
}) => (
  <div
    style={{
      width,
      height: 1,
      background: `linear-gradient(90deg, transparent 0%, ${GOLD} 50%, transparent 100%)`,
      transform: `scaleX(${progress})`,
      transformOrigin: "center",
      opacity: progress,
    }}
  />
);

const Ornament: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      opacity,
    }}
  >
    <div
      style={{
        width: 80,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${GOLD})`,
      }}
    />
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: GOLD,
        boxShadow: `0 0 12px ${GOLD}`,
      }}
    />
    <div
      style={{
        width: 80,
        height: 1,
        background: `linear-gradient(90deg, ${GOLD}, transparent)`,
      }}
    />
  </div>
);

const IntroScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, mass: 1 } });
  const exit = interpolate(frame, [duration - 18, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);
  const translateY = interpolate(enter, [0, 1], [24, 0]);
  const ruleProgress = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", padding: 50 }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: "center",
          maxWidth: 1800,
        }}
      >
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 38,
            color: GOLD,
            fontWeight: 600,
            letterSpacing: 12,
            textTransform: "uppercase",
            marginBottom: 48,
          }}
        >
          Antes del 27 de abril
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 56 }}>
          <GoldRule progress={ruleProgress} width={260} />
        </div>

        <h1
          style={{
            fontFamily: FONT_SERIF,
            fontWeight: 400,
            fontSize: 200,
            lineHeight: 1.05,
            color: WHITE,
            margin: 0,
            marginBottom: 56,
            letterSpacing: -2,
          }}
        >
          Ayúdanos a{" "}
          <span
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              color: GOLD_LIGHT,
            }}
          >
            personalizar
          </span>
          <br />
          la clase para ti
        </h1>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 48 }}>
          <GoldRule progress={ruleProgress} width={180} />
        </div>

        <p
          style={{
            fontFamily: FONT_SANS,
            fontSize: 48,
            color: WHITE_DIM,
            margin: 0,
            fontWeight: 400,
            letterSpacing: 3,
          }}
        >
          Dos minutos · Seis preguntas
        </p>
      </div>
    </AbsoluteFill>
  );
};

const QuestionScene: React.FC<{
  question: Question;
  index: number;
  total: number;
  duration: number;
}> = ({ question, index, total, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 22, mass: 1.1 } });
  const exit = interpolate(frame, [duration - 14, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);
  const translateY = interpolate(enter, [0, 1], [30, 0]);

  const progress = (index + 1) / total;
  const progressAnim = interpolate(enter, [0, 1], [0, progress], {
    extrapolateRight: "clamp",
  });
  const ruleProgress = interpolate(frame, [8, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        padding: "70px 90px",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 40,
            marginBottom: 56,
          }}
        >
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 240,
              fontWeight: 400,
              fontStyle: "italic",
              color: GOLD,
              lineHeight: 1,
              letterSpacing: -3,
              minWidth: 280,
            }}
          >
            {question.num}
          </div>
          <div style={{ paddingBottom: 36 }}>
            <div
              style={{
                fontFamily: FONT_SANS,
                fontSize: 36,
                color: GOLD_LIGHT,
                fontWeight: 600,
                letterSpacing: 10,
                textTransform: "uppercase",
                marginBottom: 22,
              }}
            >
              {question.label}
            </div>
            <GoldRule progress={ruleProgress} width={200} />
          </div>
        </div>

        <h2
          style={{
            fontFamily: FONT_SERIF,
            fontWeight: 500,
            fontSize: 144,
            lineHeight: 1.08,
            color: WHITE,
            margin: 0,
            maxWidth: 1700,
            letterSpacing: -1.5,
          }}
        >
          {question.title}
        </h2>

        <div
          style={{
            marginTop: 100,
            display: "flex",
            alignItems: "center",
            gap: 40,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 2,
              background: WHITE_FAINT,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: -2,
                width: `${progressAnim * 100}%`,
                height: 6,
                background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD} 50%, ${GOLD_LIGHT})`,
                boxShadow: `0 0 14px ${GOLD}aa`,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontStyle: "italic",
              fontSize: 44,
              color: GOLD_LIGHT,
              fontWeight: 500,
              letterSpacing: 2,
            }}
          >
            {String(index + 1).padStart(2, "0")}
            <span style={{ color: WHITE_FAINT, margin: "0 10px" }}>/</span>
            <span style={{ color: WHITE_DIM }}>
              {String(total).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CtaScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, mass: 1 } });
  const exit = interpolate(frame, [duration - 18, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);
  const translateY = interpolate(enter, [0, 1], [24, 0]);
  const buttonGlow = 0.6 + Math.sin(frame * 0.08) * 0.2;
  const ornamentProgress = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", padding: 50 }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 44 }}>
          <Ornament opacity={ornamentProgress} />
        </div>

        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 36,
            color: GOLD,
            fontWeight: 600,
            letterSpacing: 12,
            textTransform: "uppercase",
            marginBottom: 44,
          }}
        >
          Tu turno
        </div>

        <h1
          style={{
            fontFamily: FONT_SERIF,
            fontWeight: 500,
            fontSize: 188,
            lineHeight: 1.02,
            color: WHITE,
            margin: 0,
            marginBottom: 48,
            letterSpacing: -2,
          }}
        >
          Responde la{" "}
          <span style={{ fontStyle: "italic", color: GOLD_LIGHT, fontWeight: 500 }}>
            encuesta
          </span>
        </h1>

        <p
          style={{
            fontFamily: FONT_SANS,
            fontSize: 46,
            color: WHITE_DIM,
            margin: "0 auto 88px",
            maxWidth: 1500,
            fontWeight: 400,
            lineHeight: 1.4,
            letterSpacing: 1,
          }}
        >
          Tus respuestas calibran los ejemplos
          <br />y las demostraciones en vivo.
        </p>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 36,
            padding: "38px 84px",
            borderRadius: 6,
            background: "transparent",
            border: `2px solid ${GOLD}`,
            color: GOLD_LIGHT,
            fontFamily: FONT_SANS,
            fontWeight: 600,
            fontSize: 50,
            letterSpacing: 8,
            textTransform: "uppercase",
            boxShadow: `0 0 ${50 * buttonGlow}px ${GOLD}${Math.round(
              buttonGlow * 99
            ).toString(16)}, inset 0 0 ${28 * buttonGlow}px ${GOLD}33`,
          }}
        >
          Ir a la encuesta
          <span
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 56,
              fontStyle: "italic",
              display: "inline-block",
            }}
          >
            →
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const INTRO = 90;
const PER_Q = 66;
const CTA = 105;
export const SURVEY_VIDEO_DURATION = INTRO + QUESTIONS.length * PER_Q + CTA;

export const SurveyVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Background />
      <Sequence from={0} durationInFrames={INTRO}>
        <IntroScene duration={INTRO} />
      </Sequence>
      {QUESTIONS.map((q, i) => (
        <Sequence
          key={i}
          from={INTRO + i * PER_Q}
          durationInFrames={PER_Q}
        >
          <QuestionScene
            question={q}
            index={i}
            total={QUESTIONS.length}
            duration={PER_Q}
          />
        </Sequence>
      ))}
      <Sequence
        from={INTRO + QUESTIONS.length * PER_Q}
        durationInFrames={CTA}
      >
        <CtaScene duration={CTA} />
      </Sequence>
    </AbsoluteFill>
  );
};
