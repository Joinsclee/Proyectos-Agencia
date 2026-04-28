import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS, formatCOP } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

const WEEK_HEIGHTS = [0.22, 0.4, 0.58, 0.78, 1];
const WEEK_LABELS = [
  "Fundamentos",
  "Análisis",
  "Negociación",
  "Apalancamiento",
  "Cierre",
];

const TARGET_PATRIMONIO = 350000000;

export const Scene3Journey = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const headProgress = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  // Bars area
  const barsAreaW = width * 0.48;
  const barsAreaH = height * 0.45;
  const barsX = width * 0.06;
  const barsY = height * 0.4;
  const barSlots = WEEK_HEIGHTS.length;
  const slotW = barsAreaW / barSlots;
  const barW = slotW * 0.62;

  // Counter
  const counterProgress = interpolate(frame, [20, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const patrimonio = counterProgress * TARGET_PATRIMONIO;

  const labelProgress = interpolate(frame, [100, 130], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      <div
        style={{
          position: "absolute",
          inset: 0,
          fontFamily: FONTS.body,
        }}
      >
        {/* Header */}
        <div
          style={{
            position: "absolute",
            top: 70,
            left: 0,
            right: 0,
            textAlign: "center",
            opacity: headProgress,
            transform: `translateY(${(1 - headProgress) * -20}px)`,
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "8px 22px",
              background: `${COLORS.yellow}20`,
              border: `2px solid ${COLORS.yellow}`,
              borderRadius: 999,
              color: COLORS.yellow,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Tu ruta semana a semana
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 900,
              color: COLORS.white,
              letterSpacing: -1.5,
              lineHeight: 1.1,
            }}
          >
            De{" "}
            <span style={{ color: COLORS.yellow }}>cero</span> a tu primera{" "}
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
              inversión rentable
            </span>
          </div>
        </div>

        {/* Bars */}
        <svg
          width={barsAreaW}
          height={barsAreaH}
          style={{
            position: "absolute",
            left: barsX,
            top: barsY,
            overflow: "visible",
          }}
        >
          <defs>
            <linearGradient id="barGrad3" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.yellow} />
              <stop offset="40%" stopColor={COLORS.purpleGlow} />
              <stop offset="100%" stopColor={COLORS.purple} />
            </linearGradient>
          </defs>

          {/* Baseline */}
          <line
            x1={0}
            y1={barsAreaH}
            x2={barsAreaW}
            y2={barsAreaH}
            stroke={COLORS.white}
            strokeOpacity={0.25}
            strokeWidth={2}
          />

          {WEEK_HEIGHTS.map((h, i) => {
            const start = 20 + i * 12;
            const p = spring({
              frame: frame - start,
              fps,
              config: { damping: 14, stiffness: 95 },
            });
            const barH = h * barsAreaH * 0.88 * p;
            const barX = i * slotW + (slotW - barW) / 2;
            const barTop = barsAreaH - barH;
            return (
              <g key={i}>
                <rect
                  x={barX}
                  y={barTop}
                  width={barW}
                  height={barH}
                  fill="url(#barGrad3)"
                  rx={14}
                />
                <circle
                  cx={barX + barW / 2}
                  cy={barTop}
                  r={p * 9}
                  fill={COLORS.yellow}
                  opacity={p}
                />
                <text
                  x={barX + barW / 2}
                  y={barTop - 20}
                  textAnchor="middle"
                  fill={COLORS.yellow}
                  fontSize="22"
                  fontWeight="800"
                  opacity={p}
                >
                  S{i + 1}
                </text>
                <text
                  x={barX + barW / 2}
                  y={barsAreaH + 40}
                  textAnchor="middle"
                  fill={COLORS.white}
                  fontSize="18"
                  fontWeight="600"
                  opacity={p * 0.9}
                >
                  {WEEK_LABELS[i]}
                </text>
              </g>
            );
          })}

          {/* Trend arrow */}
          <g opacity={labelProgress}>
            <path
              d={`M ${slotW * 0.5} ${barsAreaH - WEEK_HEIGHTS[0] * barsAreaH * 0.88 - 20}
                  Q ${barsAreaW / 2} ${barsAreaH * 0.05},
                  ${slotW * 4.5} ${barsAreaH - WEEK_HEIGHTS[4] * barsAreaH * 0.88 - 30}`}
              fill="none"
              stroke={COLORS.green}
              strokeWidth={5}
              strokeDasharray="10 8"
              strokeLinecap="round"
            />
          </g>
        </svg>

        {/* Right panel: counter + house icon */}
        <div
          style={{
            position: "absolute",
            right: width * 0.04,
            top: barsY - 20,
            width: width * 0.42,
          }}
        >
          {/* House illustration */}
          <svg
            width="100"
            height="100"
            viewBox="0 0 100 100"
            style={{
              marginBottom: 10,
              filter: `drop-shadow(0 0 20px ${COLORS.yellow}88)`,
              opacity: counterProgress,
            }}
          >
            <path
              d="M 50 15 L 85 45 L 85 85 L 15 85 L 15 45 Z"
              fill={COLORS.yellow}
              stroke={COLORS.white}
              strokeWidth={2}
            />
            <rect x="42" y="60" width="16" height="25" fill={COLORS.purpleDark} />
            <rect x="25" y="52" width="12" height="12" fill={COLORS.purpleDark} />
            <rect x="63" y="52" width="12" height="12" fill={COLORS.purpleDark} />
          </svg>

          <div
            style={{
              fontSize: 20,
              color: COLORS.white,
              opacity: 0.7,
              letterSpacing: 4,
              textTransform: "uppercase",
              marginBottom: 8,
              fontWeight: 700,
            }}
          >
            Patrimonio potencial
          </div>
          <div
            style={{
              fontSize: 130,
              fontWeight: 900,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: -4,
              fontFamily: FONTS.display,
              background: GRADIENTS.whiteGold,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {formatCOP(patrimonio)}
          </div>
          <div
            style={{
              fontSize: 22,
              color: COLORS.white,
              opacity: 0.65,
              marginTop: 4,
              fontWeight: 500,
            }}
          >
            COP · apalancamiento inteligente
          </div>

          {/* Mini stats */}
          <div
            style={{
              display: "flex",
              gap: 18,
              marginTop: 40,
              opacity: labelProgress,
              transform: `translateY(${(1 - labelProgress) * 20}px)`,
            }}
          >
            {[
              { label: "Sin depender", value: "de ahorros" },
              { label: "Análisis con", value: "IA" },
              { label: "Oportunidades", value: "reales" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  padding: "14px 16px",
                  background: `${COLORS.purple}60`,
                  border: `1px solid ${COLORS.purpleLight}`,
                  borderRadius: 12,
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.yellow,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    color: COLORS.white,
                    fontWeight: 800,
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SceneTransition>
  );
};
