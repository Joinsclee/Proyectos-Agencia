import { createContext, useContext } from "react";
import { Easing, interpolate, spring } from "remotion";
import type { CSSProperties } from "react";
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadCormorantSC } from "@remotion/google-fonts/CormorantSC";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";

// ── Fuentes (mismo set editorial que las animaciones de Jabones Frutales) ──
// Cargamos normal + italic para Cormorant/Lora: ambas llamadas devuelven el
// mismo fontFamily, así que basta alternar fontStyle para usar la cursiva.
const cg = loadCormorant("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"] });
loadCormorant("italic", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] });
const csc = loadCormorantSC("normal", { weights: ["500", "600"], subsets: ["latin", "latin-ext"] });
const lora = loadLora("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] });
loadLora("italic", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] });

export const FONTS = {
  display: `${cg.fontFamily}, Georgia, serif`, // Cormorant Garamond
  sc: `${csc.fontFamily}, Georgia, serif`, // Cormorant SC (small caps / eyebrows)
  body: `${lora.fontFamily}, Georgia, serif`, // Lora
} as const;

// ── Contexto: duración LOCAL (en frames) de la escena ──
// useVideoConfig().durationInFrames devuelve la duración de TODA la
// composición, no la del <Sequence>. Cada overlay se envuelve con este
// provider para que sus animaciones de SALIDA usen su propia duración.
export const SceneDurContext = createContext<number | null>(null);
export const useSceneDur = () => useContext(SceneDurContext);

// ── Paleta SAVIAS · Lina Toro ──
export const C = {
  sage: "#9CAF88",
  sageDeep: "#7B8F6A",
  sageDarker: "#5F7352",
  gold: "#B8943E",
  goldSoft: "#C9A856",
  cream: "#F5EFE6",
  creamDeep: "#EDE4D3",
  paper: "#FAF7F2",
  ink: "#1F1F1B",
  inkSoft: "#4A4A45",
  // Fondo translúcido de las bandas/tarjetas
  banda: "rgba(245, 239, 230, 0.92)",
  bandaSolid: "rgba(245, 239, 230, 0.96)",
  hairSage: "rgba(123, 143, 106, 0.28)",
} as const;

// ── Easings (idénticos a las animaciones HTML) ──
export const EXPO = Easing.bezier(0.16, 1, 0.3, 1); // cubic-bezier expo-out
export const SOFT = Easing.bezier(0.22, 1, 0.36, 1);
export const IN_HARD = Easing.bezier(0.4, 0, 1, 1); // salidas

// Sombra editorial de tarjeta
export const CARD_SHADOW = "0 18px 60px rgba(31, 31, 27, 0.20)";
export const BANNER_SHADOW = "0 -16px 56px rgba(31, 31, 27, 0.22)";

/**
 * Reveal "blur-rise": opacidad + translateY + blur que entra con expo.
 * delaySec/durSec en segundos relativos al frame local de la escena.
 */
export const blurRise = (
  t: number,
  delaySec: number,
  durSec = 0.85,
  dy = 16,
  blur = 8
) => {
  const p = interpolate(t, [delaySec, delaySec + durSec], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * dy}px)`,
    filter: `blur(${(1 - p) * blur}px)`,
  };
};

/** Reveal "rise": opacidad + translateY (sin blur). */
export const rise = (t: number, delaySec: number, durSec = 0.6, dy = 10) => {
  const p = interpolate(t, [delaySec, delaySec + durSec], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  return { opacity: p, transform: `translateY(${(1 - p) * dy}px)` };
};

/** Reveal "slide-blur": entra desde la izquierda con blur (listas). */
export const slideBlur = (t: number, delaySec: number, durSec = 0.6, dx = 16) => {
  const p = interpolate(t, [delaySec, delaySec + durSec], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });
  return {
    opacity: p,
    transform: `translateX(${(1 - p) * -dx}px)`,
    filter: `blur(${(1 - p) * 6}px)`,
  };
};

/** Línea/hairline que se dibuja (scaleX 0 → 1). */
export const drawLine = (t: number, delaySec: number, durSec = 0.7) =>
  interpolate(t, [delaySec, delaySec + durSec], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });

/** Pop con escala (chips/ornamentos). */
export const pop = (t: number, delaySec: number, durSec = 0.55, from = 0.7) =>
  interpolate(t, [delaySec, delaySec + durSec], [from, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EXPO,
  });

// ── Física: springs (el dinamismo "premium" viene de aquí, no de flashes) ──
// SNAPPY: aterriza con leve overshoot (tarjetas, chips, badges).
// SUAVE: asentamiento noble, casi sin rebote (título, lockup, sprig).
export const SPRING_SNAPPY = { damping: 14, stiffness: 170, mass: 0.8 };
export const SPRING_SOFT = { damping: 200, stiffness: 110, mass: 1 };

/** Progreso spring 0→1 (SNAPPY puede sobrepasar ~1.05) con retardo en segundos. */
export const springProg = (
  frame: number,
  fps: number,
  delaySec = 0,
  config: Record<string, number> = SPRING_SOFT
) => spring({ frame: frame - delaySec * fps, fps, config });

/** Entrada "rise" con spring (opacidad + translateY). */
export const springRise = (
  frame: number,
  fps: number,
  delaySec = 0,
  dy = 18,
  config: Record<string, number> = SPRING_SOFT
): CSSProperties => {
  const p = springProg(frame, fps, delaySec, config);
  return { opacity: Math.min(1, Math.max(0, p)), transform: `translateY(${(1 - p) * dy}px)` };
};

/** Entrada "pop" con spring (opacidad + escala, aterriza con overshoot). */
export const springPop = (
  frame: number,
  fps: number,
  delaySec = 0,
  from = 0.9,
  dy = 0,
  config: Record<string, number> = SPRING_SNAPPY
): CSSProperties => {
  const p = springProg(frame, fps, delaySec, config);
  return {
    opacity: Math.min(1, Math.max(0, p)),
    transform: `translateY(${(1 - p) * dy}px) scale(${from + (1 - from) * p})`,
  };
};
