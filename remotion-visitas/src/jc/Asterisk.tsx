// Asterisco/estrella dibujada a mano, como los elementos decorativos coral
// del video de referencia.
export const Asterisk: React.FC<{
  size: number;
  color: string;
  style?: React.CSSProperties;
}> = ({ size, color, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{ position: "absolute", pointerEvents: "none", ...style }}
  >
    {Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      const x1 = 50 + Math.cos(a) * 14;
      const y1 = 50 + Math.sin(a) * 14;
      const x2 = 50 + Math.cos(a) * 46;
      const y2 = 50 + Math.sin(a) * 46;
      return (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
        />
      );
    })}
    {Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 6 + Math.PI;
      const x1 = 50 + Math.cos(a) * 14;
      const y1 = 50 + Math.sin(a) * 14;
      const x2 = 50 + Math.cos(a) * 46;
      const y2 = 50 + Math.sin(a) * 46;
      return (
        <line
          key={`b${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
        />
      );
    })}
  </svg>
);
