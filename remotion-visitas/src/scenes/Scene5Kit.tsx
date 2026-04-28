import {
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, GRADIENTS } from "../theme";
import { SceneTransition } from "../components/SceneTransition";

type KitItem = {
  title: string;
  desc: string;
  icon: "shield" | "calculator" | "check" | "radar" | "bot" | "chat";
};

const KIT: KitItem[] = [
  {
    title: "Validador de Oportunidades",
    desc: "Detecta riesgos y calcula precio objetivo de compra.",
    icon: "shield",
  },
  {
    title: "5 Simuladores de Inversión",
    desc: "Compra-venta, alquiler y proyectos sobre planos.",
    icon: "calculator",
  },
  {
    title: "Checklists Exclusivas",
    desc: "Evalúa inmuebles antes y durante las visitas.",
    icon: "check",
  },
  {
    title: "Radar de Oportunidades Colombia",
    desc: "Red de contactos, inmobiliarias y activos bancarios.",
    icon: "radar",
  },
  {
    title: "3 Tutores Virtuales 24/7",
    desc: "Legal · Tributario · Método CRECE. Siempre disponibles.",
    icon: "bot",
  },
  {
    title: "WhatsApp privado con Andrés",
    desc: "Canal directo + comunidad de inversionistas activos.",
    icon: "chat",
  },
];

const Icon = ({ type }: { type: KitItem["icon"] }) => {
  const stroke = COLORS.purpleDark;
  const strokeWidth = 2.5;
  const props = {
    width: 34,
    height: 34,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 2 L20 5 V11 C20 16 16 20 12 22 C8 20 4 16 4 11 V5 Z" />
          <path d="M9 12 L11 14 L15 10" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...props}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <line x1="9" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="9" y2="11.01" />
          <line x1="12" y1="11" x2="12" y2="11.01" />
          <line x1="15" y1="11" x2="15" y2="11.01" />
          <line x1="9" y1="15" x2="9" y2="15.01" />
          <line x1="12" y1="15" x2="12" y2="15.01" />
          <line x1="15" y1="15" x2="15" y2="15.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="M9 11 L12 14 L22 4" />
          <path d="M21 12 V19 A2 2 0 0 1 19 21 H5 A2 2 0 0 1 3 19 V5 A2 2 0 0 1 5 3 H16" />
        </svg>
      );
    case "radar":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" fill={stroke} />
          <line x1="12" y1="2" x2="12" y2="6" />
        </svg>
      );
    case "bot":
      return (
        <svg {...props}>
          <rect x="4" y="7" width="16" height="13" rx="2" />
          <line x1="12" y1="4" x2="12" y2="7" />
          <circle cx="9" cy="13" r="1" fill={stroke} />
          <circle cx="15" cy="13" r="1" fill={stroke} />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "chat":
      return (
        <svg {...props}>
          <path d="M21 11.5 A8.38 8.38 0 0 1 12.5 20 A8.5 8.5 0 0 1 4 11.5 A8.5 8.5 0 0 1 12.5 3 A8.38 8.38 0 0 1 21 11.5 Z" />
          <path d="M12.5 8 V12 L15 13.5" />
        </svg>
      );
  }
};

export const Scene5Kit = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headP = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  return (
    <SceneTransition>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          fontFamily: FONTS.body,
          padding: "60px 100px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            opacity: headP,
            transform: `translateY(${(1 - headP) * -20}px)`,
            marginBottom: 36,
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "10px 28px",
              background: GRADIENTS.goldAccent,
              borderRadius: 999,
              color: COLORS.purpleDark,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 4,
              textTransform: "uppercase",
              marginBottom: 16,
              boxShadow: `0 12px 30px ${COLORS.yellow}55`,
            }}
          >
            ★ Kit del Inversionista CRECE
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: COLORS.white,
              letterSpacing: -1.5,
              lineHeight: 1.05,
            }}
          >
            Todo el{" "}
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
              arsenal
            </span>{" "}
            para invertir con método, no con corazonadas
          </div>
        </div>

        {/* Grid 3x2 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: 22,
            flex: 1,
          }}
        >
          {KIT.map((item, i) => {
            const p = spring({
              frame: frame - (15 + i * 8),
              fps,
              config: { damping: 14, stiffness: 95 },
            });
            return (
              <div
                key={i}
                style={{
                  background: `linear-gradient(160deg, ${COLORS.purple}85 0%, ${COLORS.purpleDark}55 100%)`,
                  border: `2px solid ${COLORS.purpleLight}`,
                  borderRadius: 22,
                  padding: 28,
                  backdropFilter: "blur(14px)",
                  opacity: p,
                  transform: `translateY(${(1 - p) * 40}px) scale(${
                    0.94 + p * 0.06
                  })`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  boxShadow: `0 18px 50px ${COLORS.purpleDeep}`,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Decorative corner */}
                <div
                  style={{
                    position: "absolute",
                    top: -40,
                    right: -40,
                    width: 120,
                    height: 120,
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${COLORS.yellow}25 0%, transparent 70%)`,
                  }}
                />

                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: GRADIENTS.goldGreen,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 10px 25px ${COLORS.yellow}55`,
                  }}
                >
                  <Icon type={item.icon} />
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    color: COLORS.white,
                    lineHeight: 1.15,
                    letterSpacing: -0.5,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: 19,
                    color: COLORS.white,
                    opacity: 0.82,
                    lineHeight: 1.35,
                    fontWeight: 500,
                  }}
                >
                  {item.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneTransition>
  );
};
