import { interpolate, spring, useVideoConfig } from "remotion";
import { JAKARTA } from "../fonts";
import { JC } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type Chip = { at: number; label: string; icon?: string };

// Lista de chips configurable (generaliza LeverChips de marca-personal):
// chip-título arriba + ítems que entran uno a uno sincronizados al audio.
// Sirve para CLEE, los 4 pasos, canales omnicanal, 3 CTAs, Pain·Gain·Claim, DFY/DWY/DIY.
export const ChipList: React.FC<{
  t: number;
  show: number;
  hide: number;
  title: string;
  items: Chip[];
  side?: "left" | "right";
  numbered?: boolean;
  top?: number;
}> = ({ t, show, hide, title, items, side = "left", numbered = true, top = 300 }) => {
  const { fps } = useVideoConfig();
  if (t < show || t > hide + 0.4) return null;

  const out = interpolate(t, [hide - 0.3, hide + 0.2], [1, 0], clamp);
  const titlePop = spring({
    frame: (t - show) * fps,
    fps,
    config: { damping: 12, stiffness: 150, mass: 0.7 },
  });
  const anchor = side === "left" ? { left: 104 } : { right: 104 };
  const originX = side === "left" ? "left center" : "right center";
  const slideFrom = side === "left" ? -60 : 60;

  return (
    <div
      style={{
        position: "absolute",
        ...anchor,
        top,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: side === "left" ? "flex-start" : "flex-end",
        opacity: out,
        fontFamily: JAKARTA,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${titlePop * out}) rotate(-2deg)`,
          transformOrigin: originX,
          background: JC.gold,
          color: JC.ink,
          fontWeight: 800,
          fontSize: 29,
          padding: "11px 24px",
          borderRadius: 12,
          boxShadow: "0 14px 36px -12px rgba(7,10,19,0.4)",
        }}
      >
        {title}
      </div>
      {items.map((c, i) => {
        if (t < c.at) return null;
        const pop = spring({
          frame: (t - c.at) * fps,
          fps,
          config: { damping: 11, stiffness: 170, mass: 0.6 },
        });
        return (
          <div
            key={i}
            style={{
              transform: `translateX(${(1 - pop) * slideFrom}px) scale(${0.7 + pop * 0.3})`,
              transformOrigin: originX,
              opacity: pop * out,
              background: "rgba(7, 10, 19, 0.88)",
              border: `2px solid ${JC.gold}`,
              color: JC.cream,
              fontWeight: 800,
              fontSize: 31,
              padding: "13px 28px",
              borderRadius: 999,
              boxShadow: "0 16px 40px -14px rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              gap: 15,
            }}
          >
            {c.icon ? <span style={{ fontSize: 33 }}>{c.icon}</span> : null}
            <span>
              {numbered ? <span style={{ color: JC.gold, marginRight: 11 }}>{i + 1}.</span> : null}
              {c.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
