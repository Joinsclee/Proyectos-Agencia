import { AbsoluteFill, interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA, SERIF } from "./fonts";
import { JC } from "./theme";
import { Asterisk } from "./Asterisk";
import type { JCWord } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const QUOTE_SHOW = 560.6;
export const QUOTE_HIDE = 577.8;

// Tarjeta de cita estilo referencia (también cubre el popup de macOS que
// aparece en el screencast entre 561.3s y 562.8s).
export const QuoteCard: React.FC<{ t: number; words: JCWord[] }> = ({
  t,
  words,
}) => {
  const { fps } = useVideoConfig();
  if (t < QUOTE_SHOW || t > QUOTE_HIDE) return null;

  const pop = spring({
    frame: (t - QUOTE_SHOW) * fps,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.9 },
  });
  const out = interpolate(t, [QUOTE_HIDE - 0.4, QUOTE_HIDE], [1, 0], clamp);

  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (t >= words[i].start) activeIdx = i;
  }

  const sway = Math.sin(t * 0.9) * 2;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(7, 10, 19, 0.38)",
          opacity: pop * out,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 330,
          right: 450,
          top: 140,
          transform: `scale(${0.92 + pop * 0.08})`,
          transformOrigin: "center center",
          opacity: pop * out,
          background: "rgba(7, 10, 19, 0.96)",
          border: `1px solid rgba(242, 194, 75, 0.6)`,
          borderRadius: 30,
          padding: "70px 80px 54px",
          boxShadow: "0 50px 120px -30px rgba(0,0,0,0.8)",
        }}
      >
        <Asterisk
          size={86}
          color={JC.gold}
          style={{ top: -34, left: -30, transform: `rotate(${sway * 4}deg)` }}
        />
        <Asterisk
          size={64}
          color="#D9826B"
          style={{ bottom: -24, right: -18, transform: `rotate(${-sway * 5}deg)` }}
        />
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 56,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 130,
            color: JC.gold,
            lineHeight: 1,
          }}
        >
          “
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 47,
            lineHeight: 1.42,
            textAlign: "center",
          }}
        >
          {words.map((w, i) => {
            const spoken = t >= w.start;
            const isActive = i === activeIdx;
            const grow = isActive
              ? interpolate(t - w.start, [0, 0.12], [1, 1.06], clamp)
              : 1;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color: isActive ? JC.gold : spoken ? JC.cream : "rgba(248,250,252,0.4)",
                  marginRight: "0.26em",
                  transform: `scale(${grow})`,
                  textShadow: isActive ? "0 0 24px rgba(242,194,75,0.4)" : "none",
                }}
              >
                {w.t}
              </span>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            fontFamily: JAKARTA,
          }}
        >
          <div style={{ width: 54, height: 3, background: JC.gold, borderRadius: 2 }} />
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 30,
                color: JC.cream,
                letterSpacing: "0.06em",
              }}
            >
              BLAIR WARREN
            </div>
            <div style={{ fontWeight: 600, fontSize: 21, color: JC.blueLight }}>
              The One Sentence Persuasion Course
            </div>
          </div>
          <div style={{ width: 54, height: 3, background: JC.gold, borderRadius: 2 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
