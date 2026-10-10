import { AbsoluteFill, interpolate } from "remotion";
import { JAKARTA, SERIF } from "./fonts";
import { JC } from "./theme";
import type { JCLine } from "./types";

const UPCOMING = "rgba(248, 250, 252, 0.4)";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const findActiveLine = (lines: JCLine[], t: number): JCLine | null => {
  for (const l of lines) {
    if (t >= l.show && t < l.hide) return l;
  }
  return null;
};

type Variant = "intro" | "overlay";

// Captions kinéticos palabra-por-palabra al estilo del video de referencia.
// intro: texto grande centrado sin fondo, sobre el talking head.
// overlay: píldora navy abajo-centro-izquierda, sobre el screencast de Miro.
export const KineticCaptions: React.FC<{
  lines: JCLine[];
  t: number;
  variant: Variant;
}> = ({ lines, t, variant }) => {
  const line = findActiveLine(lines, t);
  if (!line) return null;

  let activeIdx = -1;
  for (let i = 0; i < line.words.length; i++) {
    if (t >= line.words[i].start) activeIdx = i;
  }

  const since = t - line.show;
  const untilHide = line.hide - t;
  const opacity = Math.min(
    interpolate(since, [0, 0.14], [0, 1], clamp),
    interpolate(untilHide, [0, 0.1], [0, 1], clamp)
  );
  const y = interpolate(since, [0, 0.16], [14, 0], clamp);

  const isIntro = variant === "intro";
  const accent = Boolean(line.accent);

  // Banda dorada que barre de izquierda a derecha en líneas de acento
  const bandScale = accent
    ? interpolate(since, [0.05, 0.32], [0, 1], clamp)
    : 1;

  const fontSize = isIntro ? (accent ? 70 : 62) : 48;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: isIntro ? 280 : 64,
        paddingLeft: 90,
        paddingRight: isIntro ? 90 : 460,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: isIntro ? 1380 : 1150,
          textAlign: "center",
          opacity,
          transform: `translateY(${y}px)`,
          padding: accent ? "14px 44px 18px" : isIntro ? "8px 20px" : "16px 34px 20px",
          borderRadius: accent ? 16 : 18,
          background: accent
            ? undefined
            : isIntro
              ? "transparent"
              : "rgba(7, 10, 19, 0.82)",
          border: !isIntro && !accent ? `1px solid rgba(0, 112, 243, 0.55)` : undefined,
          boxShadow: !isIntro && !accent ? "0 22px 56px -20px rgba(0,0,0,0.65)" : undefined,
        }}
      >
        {accent ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: JC.gold,
              borderRadius: 16,
              transform: `scaleX(${bandScale})`,
              transformOrigin: "left center",
              boxShadow: "0 18px 48px -16px rgba(242, 194, 75, 0.55)",
            }}
          />
        ) : null}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "flex-end",
            rowGap: 4,
            fontFamily: accent ? SERIF : JAKARTA,
            fontStyle: accent ? "italic" : "normal",
            fontWeight: accent ? 400 : 800,
            fontSize,
            lineHeight: 1.14,
            letterSpacing: accent ? "0" : "-0.015em",
          }}
        >
          {line.words.map((w, i) => {
            const spoken = t >= w.start;
            const isActive = i === activeIdx;
            const pop = isActive
              ? interpolate(t - w.start, [0, 0.1], [1, 1.08], clamp)
              : 1;
            const color = accent
              ? spoken
                ? JC.ink
                : "rgba(7, 10, 19, 0.42)"
              : isActive || w.hl
                ? JC.gold
                : spoken
                  ? JC.cream
                  : UPCOMING;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color,
                  marginRight: "0.28em",
                  transform: `scale(${pop})`,
                  transformOrigin: "center bottom",
                  textShadow: accent
                    ? "none"
                    : isActive
                      ? `0 2px 18px rgba(242, 194, 75, 0.45), 0 3px 10px rgba(0,0,0,0.65)`
                      : "0 3px 10px rgba(0,0,0,0.65)",
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
