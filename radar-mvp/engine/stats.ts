/**
 * Funciones estadísticas robustas (puras, sin dependencias) para el motor de
 * comparables. Robustas = resistentes a outliers, porque los listados de
 * FincaRaíz incluyen precios atípicos (penthouses, datos mal cargados) que
 * un promedio simple distorsionaría.
 */

/** Ordena ascendente sin mutar el input. */
function sorted(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

/** Mediana. Robusta (breakdown 50%) frente al promedio. */
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = sorted(xs);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Cuantil con interpolación lineal (método R-7, el de NumPy/Excel).
 * q en [0,1]. quantile(xs, 0.25) = Q1.
 */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  if (xs.length === 1) return xs[0];
  const s = sorted(xs);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Cercos de Tukey (IQR). Valores fuera de [Q1 - k·IQR, Q3 + k·IQR] son outliers.
 * k=1.5 es el estándar; k=3 para outliers extremos.
 */
export function iqrBounds(xs: number[], k = 1.5): { lo: number; hi: number; q1: number; q3: number } {
  const q1 = quantile(xs, 0.25);
  const q3 = quantile(xs, 0.75);
  const iqr = q3 - q1;
  return { lo: q1 - k * iqr, hi: q3 + k * iqr, q1, q3 };
}

/** Descarta outliers por IQR. Si quedaran <3 valores, no recorta (datos escasos). */
export function trimOutliers(xs: number[], k = 1.5): number[] {
  if (xs.length < 4) return [...xs];
  const { lo, hi } = iqrBounds(xs, k);
  const trimmed = xs.filter((x) => x >= lo && x <= hi);
  return trimmed.length >= 3 ? trimmed : [...xs];
}

/** Mediana tras recortar outliers por IQR. El estimador central que usamos. */
export function robustMedian(xs: number[], k = 1.5): number {
  return median(trimOutliers(xs, k));
}

/**
 * Coeficiente de dispersión robusto: IQR / mediana. Mide qué tan "apretado"
 * está el set de comparables. Bajo (<0.25) = mercado homogéneo → alta confianza.
 */
export function robustSpread(xs: number[]): number {
  const m = median(xs);
  if (!Number.isFinite(m) || m === 0) return Infinity;
  const { q1, q3 } = iqrBounds(xs);
  return (q3 - q1) / m;
}

/**
 * Distancia en km entre dos coordenadas (fórmula de Haversine).
 * Base del matching geográfico de comparables (reemplaza el slug de barrio,
 * que era de granularidad inconsistente).
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // radio terrestre km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
