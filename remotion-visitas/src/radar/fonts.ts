// Carga las fuentes del branding del Radar (mismas del dashboard):
// Tilt Warp (display) + Barlow Semi Condensed (body). Importar este módulo
// registra las familias; los strings de FONTS en ../theme las resuelven.
import { loadFont as loadTilt } from "@remotion/google-fonts/TiltWarp";
import { loadFont as loadBarlow } from "@remotion/google-fonts/BarlowSemiCondensed";

export const tilt = loadTilt();
export const barlow = loadBarlow("normal", {
  weights: ["400", "500", "600", "700", "800"],
});
