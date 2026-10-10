import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "./fonts";
import { JC } from "./theme";
import { Asterisk } from "./Asterisk";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Píldora CTA con glow azul JoinsClee y flecha rebotando hacia el enlace.
export const CTABanner: React.FC<{
  t: number;
  show: number;
  hide: number;
  text: string;
  big?: boolean;
}> = ({ t, show, hide, text, big = false }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide) return null;

  const pop = spring({
    frame: (t - show) * fps,
    fps,
    config: { damping: 12, stiffness: 140, mass: 0.8 },
  });
  const out = interpolate(t, [hide - 0.3, hide], [1, 0], clamp);
  const pulse = 1 + Math.sin((t - show) * 3.2) * 0.012;
  const bounce = Math.abs(Math.sin((t - show) * 3.4)) * 12;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: big ? 0 : 560,
        bottom: big ? 72 : 56,
        display: "flex",
        justifyContent: "center",
        opacity: pop * out,
        transform: `translateY(${(1 - pop) * 60}px)`,
        pointerEvents: "none",
        fontFamily: JAKARTA,
      }}
    >
      <div
        style={{
          position: "relative",
          transform: `scale(${pulse})`,
          background: `linear-gradient(135deg, ${JC.blue} 0%, ${JC.blueDark} 100%)`,
          border: `2px solid rgba(96, 165, 250, 0.8)`,
          borderRadius: 999,
          padding: big ? "26px 56px" : "18px 40px",
          boxShadow: `0 0 0 6px rgba(0, 112, 243, 0.18), 0 24px 60px -16px rgba(0, 112, 243, 0.55)`,
          display: "flex",
          alignItems: "center",
          gap: 22,
        }}
      >
        {big ? (
          <>
            <Asterisk
              size={72}
              color={JC.gold}
              style={{ top: -46, left: -56, transform: `rotate(${Math.sin(t * 1.4) * 8}deg)` }}
            />
            <Asterisk
              size={54}
              color={JC.gold}
              style={{ top: -36, right: -48, transform: `rotate(${-Math.sin(t * 1.2) * 9}deg)` }}
            />
          </>
        ) : null}
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: big ? 44 : 32,
              color: "#fff",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            {text}
          </div>
          {big ? (
            <div
              style={{
                fontWeight: 700,
                fontSize: 24,
                color: "rgba(255,255,255,0.85)",
                marginTop: 4,
              }}
            >
              El enlace está aquí abajo · Te veo dentro
            </div>
          ) : null}
        </div>
        <div
          style={{
            fontSize: big ? 52 : 38,
            transform: `translateY(${bounce}px)`,
            lineHeight: 1,
          }}
        >
          👇
        </div>
      </div>
    </div>
  );
};
