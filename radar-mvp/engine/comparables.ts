/**
 * Motor de comparables: dado un inmueble candidato (banco / remate / portal),
 * encuentra propiedades realmente comparables en el baseline de FincaRaíz y
 * estima el precio de mercado robusto para decidir si es oportunidad.
 *
 * Mejoras de robustez frente al diseño inicial del cliente (AVG por slug):
 *  1. MEDIANA winsorizada (IQR), no promedio → inmune a penthouses/outliers.
 *  2. Matching GEOGRÁFICO por radio (haversine sobre lat/lng), no por slug de
 *     barrio (cuya granularidad variaba). Cada aviso trae lat/lng geocodificado.
 *  3. Normalización por área (banda ±%) y estrato → comparar peras con peras.
 *  4. n mínimo con CASCADA de relajación: si no hay suficientes comparables en
 *     la banda estricta, se afloja progresivamente; si nunca se llega al mínimo,
 *     NO se marca oportunidad (evita falsos positivos por evidencia pobre).
 *  5. LEAVE-ONE-OUT: si el candidato es un listado de FincaRaíz, se excluye a sí
 *     mismo del baseline (no contamina su propia mediana).
 *
 * Limitación honesta: el baseline son precios de OFERTA (asking), no de cierre.
 * El "descuento" es contra el asking-mediano del mercado, no contra ventas
 * reales. Se etiqueta como tal en el dashboard.
 */
import { robustMedian, robustSpread, haversineKm, trimOutliers, quantile } from './stats.js';
import { MAX_OPP_DISCOUNT } from '../lib/types.js';
import { creceIndex, clasificar, type CreceTier } from './crece.js';

export interface Candidate {
  id: string;
  source: string;
  source_id: string;
  type: string | null;
  price: number | null;
  area_m2: number | null;
  lat: number | null;
  lng: number | null;
  stratum: number | null;
  city: string | null; // normalizado (sin tildes, lowercase)
  zone: string | null;
  // Opcionales: si la fuente no los trae, la condición simplemente no se aplica.
  bedrooms?: number | null; // habitaciones
  garages?: number | null;  // parqueaderos
  /** construida | terreno | no_especificada. Ver nota en matches(). */
  area_tipo?: string | null;
}

export interface Comp {
  source_id: string;
  type: string | null;
  ppm2: number; // price_per_m2
  area_m2: number;
  lat: number | null;
  lng: number | null;
  stratum: number | null;
  city: string | null;
  zone: string | null;
  bedrooms?: number | null;
  garages?: number | null;
  area_tipo?: string | null;
}

/** Normaliza texto de localidad para comparar (sin tildes, lowercase, trim). */
function normLoc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export interface ComparablesConfig {
  radiusKm: number; // radio base de búsqueda
  areaTolPct: number; // tolerancia de área (0.30 = ±30%)
  stratumTol: number; // ±estratos
  bedroomsTol: number; // ±habitaciones
  minComparables: number; // n mínimo para confiar
  discountThresholdPct: number; // % bajo mercado para marcar oportunidad
  highDiscountPct: number; // % para "OPORTUNIDAD ALTA"
}

export const DEFAULT_CONFIG: ComparablesConfig = {
  radiusKm: 1.5,
  areaTolPct: 0.3,
  stratumTol: 1,
  bedroomsTol: 1,
  minComparables: 5, // regla de muestra mínima de la spec Radar CRECE (antes 8)
  discountThresholdPct: 12,
  highDiscountPct: 25,
};

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface Verdict {
  evaluable: boolean; // ¿tenía precio+área+geo para evaluar?
  is_opportunity: boolean;
  is_high: boolean;
  discount_pct: number | null; // (mercado - candidato) / mercado * 100
  candidate_ppm2: number | null;
  market_ppm2: number | null;
  n_comparables: number;
  confidence: Confidence;
  method: string; // qué nivel de la cascada se usó
  radius_used_km: number | null;
  criteria: string[]; // condicionales realmente aplicadas (lo que se le muestra al usuario)
  /** Índice CRECE: precio/m² ÷ mediana del grupo comparable (tabla maestra en crece.ts). */
  crece_index: number | null;
  crece_tier: CreceTier | null;
  /** Nivel de la cascada con el que se logró la muestra: barrio | zona_ampliada | ciudad. */
  cascada_nivel: string | null;
  /**
   * Los comparables que de verdad se usaron, cuando se piden expresamente.
   *
   * Existe para poder AUDITAR el veredicto. El cliente vio un inmueble marcado a
   * «416% sobre el valor del mercado» y la pregunta fue inmediata y correcta:
   * ¿contra qué lo está comparando? Sin esta lista la única respuesta posible es
   * «confía en el motor», que no es una respuesta.
   *
   * No viaja por defecto: son decenas de filas por ficha y el listado las pide de
   * cien en cien. Solo cuando alguien abre el detalle.
   */
  comparables?: ComparableUsado[];
}

/** Un comparable, con lo justo para poder juzgar si tenía algo que ver. */
export interface ComparableUsado {
  source_id: string;
  type: string | null;
  zone: string | null;
  area_m2: number;
  price: number;
  ppm2: number;
  stratum: number | null;
  url: string | null;
}

const INSUFFICIENT: Verdict = {
  evaluable: false,
  is_opportunity: false,
  is_high: false,
  discount_pct: null,
  candidate_ppm2: null,
  market_ppm2: null,
  n_comparables: 0,
  confidence: 'insufficient',
  method: 'sin-datos',
  radius_used_km: null,
  criteria: [],
  crece_index: null,
  crece_tier: null,
  cascada_nivel: null,
};

/**
 * Niveles de la cascada de relajación: del MÁS parecido al más laxo.
 *
 * Se arranca comparando con propiedades casi idénticas (mismo tipo, mismo barrio,
 * mismas habitaciones, con/sin parqueadero, área y estrato similares) y solo se
 * afloja si no hay suficientes comparables. Así el precio de referencia sale de
 * inmuebles REALMENTE similares, no de "cualquier cosa en la ciudad".
 */
interface Level {
  name: string;
  radiusMult: number;
  areaTolMult: number;
  useStratum: boolean;
  useArea: boolean;
  useZone: boolean; // solo aplica al régimen textual (sin geo)
  useBedrooms: boolean;
  useGarages: boolean;
}

const CASCADE: Level[] = [
  { name: 'estricto',         radiusMult: 1, areaTolMult: 1, useStratum: true,  useArea: true,  useZone: true,  useBedrooms: true,  useGarages: true },
  { name: 'sin-parqueadero',  radiusMult: 1, areaTolMult: 1, useStratum: true,  useArea: true,  useZone: true,  useBedrooms: true,  useGarages: false },
  { name: 'sin-estrato',      radiusMult: 1, areaTolMult: 1, useStratum: false, useArea: true,  useZone: true,  useBedrooms: true,  useGarages: false },
  { name: 'sin-habitaciones', radiusMult: 1, areaTolMult: 1, useStratum: false, useArea: true,  useZone: true,  useBedrooms: false, useGarages: false },
  { name: 'area-amplia',      radiusMult: 1, areaTolMult: 2, useStratum: false, useArea: true,  useZone: true,  useBedrooms: false, useGarages: false },
  { name: 'radio-2x',         radiusMult: 2, areaTolMult: 2, useStratum: false, useArea: true,  useZone: false, useBedrooms: false, useGarages: false },
  { name: 'radio-3x',         radiusMult: 3, areaTolMult: 2, useStratum: false, useArea: true,  useZone: false, useBedrooms: false, useGarages: false },
  { name: 'solo-localidad',   radiusMult: 3, areaTolMult: 1, useStratum: false, useArea: false, useZone: false, useBedrooms: false, useGarages: false },
];

/** ¿La localidad coincide? Geo si ambos tienen lat/lng; si no, ciudad/zona textual. */
function sameLocality(c: Candidate, comp: Comp, lvl: Level, cfg: ComparablesConfig): boolean {
  const geo = c.lat != null && c.lng != null && comp.lat != null && comp.lng != null;
  if (geo) {
    const dist = haversineKm(c.lat!, c.lng!, comp.lat!, comp.lng!);
    return dist <= cfg.radiusKm * lvl.radiusMult;
  }
  // Régimen textual (candidato sin geo, ej. inmueble bancario de PDF)
  const cCity = normLoc(c.city);
  if (!cCity || cCity !== normLoc(comp.city)) return false;
  if (lvl.useZone && c.zone && comp.zone) {
    return normLoc(c.zone) === normLoc(comp.zone);
  }
  return true; // mismo ciudad; en niveles laxos basta la ciudad
}

function matches(c: Candidate, comp: Comp, lvl: Level, cfg: ComparablesConfig): boolean {
  // Mismo tipo (apartamento con apartamento)
  if (c.type && comp.type && c.type !== comp.type) return false;

  // El metro cuadrado de TERRENO y el de CONSTRUIDA son mercados distintos: un
  // lote de 8.000 m² a $1.800/m² y un apartamento a $4.000.000/m² no se comparan.
  // Esta regla NO se relaja en ningún nivel de la cascada — mezclarlos no es una
  // aproximación aceptable, es un número sin sentido.
  const ac = c.area_tipo, aq = comp.area_tipo;
  if (ac && aq && ac !== 'no_especificada' && aq !== 'no_especificada' && ac !== aq) return false;

  if (!sameLocality(c, comp, lvl, cfg)) return false;

  // Área dentro de la banda
  if (lvl.useArea && c.area_m2) {
    const tol = cfg.areaTolPct * lvl.areaTolMult;
    const lo = c.area_m2 * (1 - tol);
    const hi = c.area_m2 * (1 + tol);
    if (comp.area_m2 < lo || comp.area_m2 > hi) return false;
  }

  // Estrato dentro de ±tol
  if (lvl.useStratum && c.stratum != null && comp.stratum != null) {
    if (Math.abs(c.stratum - comp.stratum) > cfg.stratumTol) return false;
  }

  // Habitaciones dentro de ±tol: un 1-alcoba no se compara contra un 4-alcobas
  // (aunque midan lo mismo, el mercado los valora distinto).
  if (lvl.useBedrooms && c.bedrooms != null && comp.bedrooms != null) {
    if (Math.abs(c.bedrooms - comp.bedrooms) > cfg.bedroomsTol) return false;
  }

  // Parqueadero: tener o no tener mueve el precio → comparar con-con y sin-sin.
  if (lvl.useGarages && c.garages != null && comp.garages != null) {
    if ((c.garages > 0) !== (comp.garages > 0)) return false;
  }

  return true;
}

function confidenceFor(ppm2s: number[], level: Level, cfg: ComparablesConfig): Confidence {
  const n = ppm2s.length;
  if (n < cfg.minComparables) return 'low';
  const spread = robustSpread(ppm2s);
  // La estrictez se DERIVA del nivel, no de una lista de nombres: al añadir
  // niveles nuevos a la cascada, una lista se queda desactualizada en silencio y
  // la confianza "alta" se vuelve inalcanzable sin que nadie se entere.
  // Estricto = radio sin ampliar, banda de área sin ampliar y misma zona.
  const strict = level.radiusMult === 1 && level.areaTolMult === 1 && level.useArea && level.useZone;
  if (n >= cfg.minComparables * 2 && spread < 0.25 && strict) return 'high';
  if (n >= cfg.minComparables && spread < 0.45) return 'medium';
  return 'low';
}

/**
 * Criterios REALMENTE aplicados para elegir estos comparables.
 *
 * No basta con mirar el nivel de la cascada: una condición como "mismas
 * habitaciones" se cumple vacíamente cuando el dato falta (los inmuebles de Aval,
 * por ejemplo, salen de un PDF sin alcobas ni parqueadero). Afirmar en la ficha que
 * se filtró por algo que nunca se filtró es mentirle al usuario, así que sólo se
 * declara la condición si el candidato tiene el dato Y lo tiene la mayoría de los
 * comparables elegidos.
 */
function criteriaFor(c: Candidate, comps: Comp[], lvl: Level, cfg: ComparablesConfig): string[] {
  const out: string[] = [];
  const mayoria = (f: (x: Comp) => boolean) => comps.length > 0 && comps.filter(f).length >= comps.length / 2;

  if (c.type) out.push('mismo tipo de inmueble');
  out.push(
    lvl.radiusMult != null && c.lat != null && c.lng != null
      ? `mismo sector (${Math.round(cfg.radiusKm * lvl.radiusMult * 10) / 10} km a la redonda)`
      : lvl.useZone && c.zone
        ? `mismo barrio (${c.zone})`
        : 'misma ciudad',
  );
  if (lvl.useArea && c.area_m2) {
    out.push(`área similar (±${Math.round(cfg.areaTolPct * lvl.areaTolMult * 100)}%)`);
  }
  if (lvl.useStratum && c.stratum != null && mayoria((x) => x.stratum != null)) {
    out.push(`estrato ${c.stratum} (±${cfg.stratumTol})`);
  }
  if (lvl.useBedrooms && c.bedrooms != null && c.bedrooms > 0 && mayoria((x) => x.bedrooms != null)) {
    out.push(`${c.bedrooms} habitaciones (±${cfg.bedroomsTol})`);
  }
  if (lvl.useGarages && c.garages != null && mayoria((x) => x.garages != null)) {
    out.push(c.garages > 0 ? 'con parqueadero' : 'sin parqueadero');
  }
  return out;
}

/**
 * Evalúa un candidato contra el pool de comparables (listados FincaRaíz).
 * Devuelve el veredicto con descuento, confianza y método usado.
 */
export function evaluate(
  candidate: Candidate,
  pool: Comp[],
  cfg: ComparablesConfig = DEFAULT_CONFIG,
  opciones: { incluirComparables?: boolean } = {},
): Verdict {
  // Requisitos mínimos para estimar precio/m²: precio, área y alguna localidad
  // (geo o ciudad). Sin esto no hay con qué comparar.
  if (!candidate.price || !candidate.area_m2 || candidate.area_m2 <= 0) return INSUFFICIENT;
  const hasGeo = candidate.lat != null && candidate.lng != null;
  if (!hasGeo && !candidate.city) return INSUFFICIENT;

  const candidatePpm2 = candidate.price / candidate.area_m2;
  const regime = hasGeo ? 'geo' : 'texto';

  // Leave-one-out: excluye al propio candidato si está en el baseline
  const base = pool.filter((p) => p.source_id !== candidate.source_id);

  for (const level of CASCADE) {
    const comps = base.filter((comp) => matches(candidate, comp, level, cfg));
    if (comps.length < cfg.minComparables) continue;

    const ppm2s = comps.map((c) => c.ppm2);
    const clean = trimOutliers(ppm2s); // sin atípicos para percentiles estables
    const market = robustMedian(ppm2s);
    if (!Number.isFinite(market) || market <= 0) continue;

    // Percentiles del precio/m² de los comparables. La clave: una oportunidad
    // NO es "estar bajo la mediana" (la mitad lo está por definición), sino caer
    // en la COLA BAJA de la distribución, controlando por área/estrato/zona.
    const p25 = quantile(clean, 0.25);
    const p10 = quantile(clean, 0.1);
    const discount = ((market - candidatePpm2) / market) * 100;
    // Índice CRECE: la métrica primaria de la spec. El descuento es su otra cara
    // (descuento = (1 − índice) × 100) y se conserva porque es como lo lee el usuario.
    const crece = creceIndex(candidatePpm2, market);
    const confidence = confidenceFor(ppm2s, level, cfg);

    // Oportunidad: en el cuartil más barato POR m² Y con descuento absoluto
    // relevante vs la mediana. Alta: en el decil más barato + descuento fuerte.
    const inLowTail = candidatePpm2 <= p25;
    const inDeepTail = candidatePpm2 <= p10;
    // Descuento por encima de MAX_OPP_DISCOUNT = error de datos, no oportunidad.
    const plausible = discount <= MAX_OPP_DISCOUNT;
    const isOpp = inLowTail && discount >= cfg.discountThresholdPct && plausible && confidence !== 'low';
    // Alta = señal fuerte Y bien soportada: decil más barato, descuento grande
    // y comparables homogéneos (alta confianza). Así la insignia dorada es rara.
    const isHigh = isOpp && inDeepTail && discount >= cfg.highDiscountPct && confidence === 'high';

    return {
      evaluable: true,
      is_opportunity: isOpp,
      is_high: isHigh,
      discount_pct: Math.round(discount * 10) / 10,
      candidate_ppm2: Math.round(candidatePpm2),
      market_ppm2: Math.round(market),
      n_comparables: comps.length,
      confidence,
      method: `${regime}:${level.name}`,
      radius_used_km: hasGeo ? cfg.radiusKm * level.radiusMult : null,
      criteria: criteriaFor(candidate, comps, level, cfg),
      crece_index: crece,
      crece_tier: crece != null ? clasificar(crece).tier : null,
      cascada_nivel: cascadaNivel(level),
      // Del más barato al más caro por m²: así se ve de un golpe dónde cae el
      // candidato dentro de su grupo, que es lo que el veredicto afirma.
      ...(opciones.incluirComparables
        ? { comparables: [...comps].sort((a, b) => a.ppm2 - b.ppm2).map(aComparableUsado) }
        : {}),
    };
  }

  // Nunca se alcanzó el mínimo de comparables → evaluable pero sin veredicto firme
  return {
    ...INSUFFICIENT,
    evaluable: true,
    candidate_ppm2: Math.round(candidatePpm2),
  };
}

/**
 * Traduce el nivel interno de la cascada al vocabulario de la HU
 * (barrio / zona_ampliada / ciudad), que es el que se audita y se muestra.
 * Los niveles estrictos siguen acotados al sector del inmueble; los que amplían
 * radio o sueltan la zona ya son "zona ampliada"; el último es la ciudad entera.
 */
function cascadaNivel(lvl: Level): string {
  if (lvl.name === 'solo-localidad') return 'ciudad';
  if (lvl.radiusMult > 1 || !lvl.useZone) return 'zona_ampliada';
  return 'barrio';
}

/** Un comparable del pool, reducido a lo que hace falta para juzgarlo. */
function aComparableUsado(comp: Comp): ComparableUsado {
  return {
    source_id: String(comp.source_id ?? ''),
    type: comp.type ?? null,
    zone: comp.zone ?? null,
    area_m2: Math.round(comp.area_m2),
    // El precio total se reconstruye: `Comp` solo lleva el precio por m², que es de
    // donde salió. Es exacto salvo redondeo, y ahorra arrastrar una columna más por
    // todo el motor solo para poder enseñarla.
    price: Math.round(comp.ppm2 * comp.area_m2),
    ppm2: Math.round(comp.ppm2),
    stratum: comp.stratum ?? null,
    // La URL no está en `Comp` y no se añade: el listado la resuelve con el
    // `source_id`, que es la clave con la que el aviso vive en la base.
    url: null,
  };
}
