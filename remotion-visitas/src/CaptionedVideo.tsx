import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { Video } from "@remotion/media";
import { loadFont as loadHanken } from "@remotion/google-fonts/HankenGrotesk";

const { fontFamily: hanken } = loadHanken("normal", {
  weights: ["600", "700", "800"],
});

export type Word = { t: string; start: number; end: number };
export type Caption = { show: number; hide: number; words: Word[] };

// Paleta de marca Lina / SAVIAS (sage / dorado / crema sobre fondo oscuro)
const GOLD = "#EBC15A";
const CREAM = "#F7F2E8";
const UPCOMING = "rgba(247, 242, 232, 0.42)";

const findActiveLine = (captions: Caption[], t: number): Caption | null => {
  for (const c of captions) {
    if (t >= c.show && t < c.hide) return c;
  }
  if (captions.length && t < captions[0].show) return captions[0];
  return null;
};

type Props = {
  videoFile: string;
  captions: Caption[];
};

// Componente reutilizable: reproduce el video de fondo y superpone subtítulos
// quemados con resaltado dorado palabra-por-palabra sincronizado al audio.
export const CaptionedVideo = ({ videoFile, captions }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const line = findActiveLine(captions, t);

  // índice de la palabra que se está hablando ahora (última con start <= t)
  let activeIdx = -1;
  if (line) {
    for (let i = 0; i < line.words.length; i++) {
      if (t >= line.words[i].start) activeIdx = i;
    }
  }

  // animación de entrada / salida de la línea
  let lineOpacity = 1;
  let lineY = 0;
  if (line) {
    const since = t - line.show;
    lineOpacity = interpolate(since, [0, 0.16], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    lineY = interpolate(since, [0, 0.18], [16, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const untilHide = line.hide - t;
    if (untilHide < 0.12) {
      lineOpacity = Math.min(
        lineOpacity,
        interpolate(untilHide, [0, 0.12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      );
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: hanken }}>
      <Video
        src={staticFile(videoFile)}
        style={{ width: "100%", height: "100%" }}
      />

      {line && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 132,
            paddingLeft: 80,
            paddingRight: 80,
          }}
        >
          <div
            style={{
              maxWidth: 1360,
              textAlign: "center",
              background: "rgba(18, 17, 14, 0.72)",
              border: `1px solid rgba(156, 175, 136, 0.55)`,
              borderRadius: 22,
              padding: "20px 38px 24px",
              boxShadow: "0 26px 64px -22px rgba(0,0,0,0.7)",
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
                rowGap: 6,
                fontWeight: 800,
                fontSize: 62,
                lineHeight: 1.16,
                letterSpacing: "-0.015em",
              }}
            >
              {line.words.map((w, i) => {
                const spoken = t >= w.start;
                const isActive = i === activeIdx;
                const color = isActive ? GOLD : spoken ? CREAM : UPCOMING;
                const pop = isActive
                  ? interpolate(t - w.start, [0, 0.1], [1, 1.07], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })
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
                      transition: "none",
                    }}
                  >
                    {w.t}
                  </span>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
