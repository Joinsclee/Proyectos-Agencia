export const COLORS = {
  purple: "#613174",
  purpleDark: "#4d265c",
  purpleDeep: "#2a1438",
  purpleLight: "#8a4fa3",
  purpleGlow: "#a86cc4",
  green: "#37ca37",
  greenDark: "#2ba82b",
  yellow: "#f2ca04",
  yellowDark: "#d4b000",
  white: "#ffffff",
  offWhite: "#f5f0fa",
  bg: "#120820",
  bgDeep: "#0a0414",
} as const;

export const FONTS = {
  display:
    "'Tilt Warp', 'Inter Tight', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
  body:
    "'Barlow Semi Condensed', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  elegant:
    "'Playfair Display', 'Georgia', serif",
} as const;

export const GRADIENTS = {
  purpleHero: `linear-gradient(135deg, ${COLORS.purple} 0%, ${COLORS.purpleDark} 100%)`,
  goldAccent: `linear-gradient(135deg, ${COLORS.yellow} 0%, ${COLORS.yellowDark} 100%)`,
  goldGreen: `linear-gradient(135deg, ${COLORS.yellow} 0%, ${COLORS.green} 100%)`,
  whiteGold: `linear-gradient(135deg, ${COLORS.white} 0%, ${COLORS.yellow} 100%)`,
  bgRadial: `radial-gradient(ellipse at top, ${COLORS.purpleDark} 0%, ${COLORS.bg} 45%, ${COLORS.bgDeep} 100%)`,
} as const;

export const formatCOP = (n: number) =>
  `$${Math.round(n).toLocaleString("es-CO")}`;

export const formatUSD = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;
