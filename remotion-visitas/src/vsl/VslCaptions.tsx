import { AbsoluteFill, interpolate } from "remotion";
import { loadFont as loadHanken } from "@remotion/google-fonts/HankenGrotesk";

const { fontFamily: hanken } = loadHanken("normal", {
  weights: ["600", "700", "800"],
});

export type Word = { t: string; start: number; end: number };
export type Caption = { show: number; hide: number; words: Word[] };

// Paleta de subtítulos SAVIAS · Lina (dorado activo sobre crema, fondo oscuro)
const GOLD = "#EBC15A";
const CREAM = "#F7F2E8";
const UPCOMING = "rgba(247, 242, 232, 0.40)";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const findActiveLine = (captions: Caption[], t: number): Caption | null => {
  for (const c of captions) {
    if (t >= c.show && t < c.hide) return c;
  }
  if (captions.length && t < captions[0].show) return captions[0];
  return null;
};

// Subtítulos quemados palabra-por-palabra. Píldora oscura abajo-centro con
// resaltado dorado de la palabra que se habla. Siempre presentes durante el
// VSL; los overlays-de-momento viven en la mitad superior para no chocar.
export const VslCaptions: React.FC<{ captions: Caption[]; t: number }> = ({
  captions,
  t,
}) => {
  const line = findActiveLine(captions, t);
  if (!line) return null;

  let activeIdx = -1;
  for (let i = 0; i < line.words.length; i++) {
    if (t >= line.words[i].start) activeIdx = i;
  }

  const since = t - line.show;
  const untilHide = line.hide - t;
  const lineOpacity = Math.min(
    interpolate(since, [0, 0.16], [0, 1], clamp),
    interpolate(untilHide, [0, 0.12], [0, 1], clamp)
  );
  const lineY = interpolate(since, [0, 0.18], [16, 0], clamp);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 116,
        paddingLeft: 80,
        paddingRight: 80,
        fontFamily: hanken,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          textAlign: "center",
          background: "rgba(18, 17, 14, 0.70)",
          border: "1px solid rgba(156, 175, 136, 0.50)",
          borderRadius: 22,
          padding: "18px 36px 22px",
          boxShadow: "0 26px 64px -22px rgba(0,0,0,0.7)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: lineOpacity,
          transform: `translateY(${lineY}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "flex-end",
            rowGap: 4,
            fontWeight: 800,
            fontSize: 60,
            lineHeight: 1.14,
            letterSpacing: "-0.015em",
          }}
        >
          {line.words.map((w, i) => {
            const spoken = t >= w.start;
            const isActive = i === activeIdx;
            const color = isActive ? GOLD : spoken ? CREAM : UPCOMING;
            const pop = isActive
              ? interpolate(t - w.start, [0, 0.1], [1, 1.06], clamp)
              : 1;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color,
                  marginRight: "0.3em",
                  transform: `scale(${pop})`,
                  transformOrigin: "center bottom",
                  textShadow: isActive
                    ? "0 2px 18px rgba(235,193,90,0.45), 0 2px 6px rgba(0,0,0,0.55)"
                    : "0 2px 6px rgba(0,0,0,0.55)",
                }}
              >
                {w.t}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
