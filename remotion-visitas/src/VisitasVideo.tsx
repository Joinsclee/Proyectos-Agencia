import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const TARGET = 125000;

const DATA_POINTS = [
  5, 8, 12, 10, 18, 25, 32, 40, 55, 68, 82, 95, 110, 125,
];

const formatNumber = (n: number) =>
  Math.round(n).toLocaleString("es-ES");

export const VisitasVideo = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const counterProgress = spring({
    frame,
    fps,
    config: { damping: 200, mass: 1, stiffness: 30 },
    durationInFrames: 150,
  });

  const currentValue = counterProgress * TARGET;

  const chartProgress = spring({
    frame,
    fps,
    config: { damping: 200, mass: 1, stiffness: 25 },
    durationInFrames: 160,
  });

  const chartWidth = width * 0.75;
  const chartHeight = height * 0.45;
  const chartX = (width - chartWidth) / 2;
  const chartY = height * 0.45;

  const maxValue = Math.max(...DATA_POINTS);
  const stepX = chartWidth / (DATA_POINTS.length - 1);

  const points = DATA_POINTS.map((v, i) => ({
    x: i * stepX,
    y: chartHeight - (v / maxValue) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartHeight} L 0 ${chartHeight} Z`;

  const revealWidth = chartWidth * chartProgress;

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 25], [-40, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 42,
            color: "#94a3b8",
            fontWeight: 500,
            letterSpacing: 8,
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          Visitas totales
        </div>
        <div
          style={{
            fontSize: 180,
            fontWeight: 800,
            background:
              "linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {formatNumber(currentValue)}
        </div>
      </div>

      <svg
        width={chartWidth}
        height={chartHeight}
        style={{
          position: "absolute",
          left: chartX,
          top: chartY,
          overflow: "visible",
        }}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
          <clipPath id="revealClip">
            <rect x="0" y="-20" width={revealWidth} height={chartHeight + 40} />
          </clipPath>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1="0"
            y1={chartHeight * t}
            x2={chartWidth}
            y2={chartHeight * t}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4 8"
            opacity="0.5"
          />
        ))}

        <g clipPath="url(#revealClip)">
          <path d={areaPath} fill="url(#areaGradient)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => {
            const pointProgress = interpolate(
              chartProgress,
              [i / points.length, (i + 1) / points.length],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={10 * pointProgress}
                fill="#f472b6"
                stroke="#fff"
                strokeWidth="3"
              />
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
