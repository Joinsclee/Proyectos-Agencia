import { Config } from "@remotion/cli/config";

// ── Velocidad de render ──
// JPEG para los frames intermedios (más rápido que PNG; PNG solo si se necesita alpha).
Config.setVideoImageFormat("jpeg");
// Sube de 80 (default) a 90: menos artefactos de doble compresión antes del encode H.264.
Config.setJpegQuality(90);
Config.setConcurrency(4);

// ── Calidad de salida (único punto de verdad; antes repartido en flags CLI) ──
Config.setCodec("h264");
// 18 es el default de H.264 (menor = más calidad y archivo más grande). Mantiene la
// calidad actual del proyecto; para entregas web más livianas se puede subir a 20-23.
Config.setCrf(18);
// Mejor compresión (archivos más livianos) a igual CRF; el coste extra de encode es
// despreciable frente al render de frames React.
Config.setX264Preset("slow");
// Máxima compatibilidad de reproducción web (móviles, navegadores, redes).
Config.setPixelFormat("yuv420p");
