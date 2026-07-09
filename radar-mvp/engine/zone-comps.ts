/**
 * Comparables de ZONA para UNA propiedad (bajo demanda), usados por el análisis.
 *
 * Es el complemento on-demand del motor batch (engine/run.ts): dado un inmueble
 * de banco o un remate, carga el baseline de FincaRaíz de SU ciudad y resume el
 * mercado de su tipo (mediana y cuartil bajo, por m² y por total). El análisis
 * con IA usa ese contexto numérico como anclaje para emitir una opinión.
 *
 * Doble régimen:
 *  - Bancos: traen precio + área (+ a veces geo) → comparación por m² (ppm2) vía
 *    el motor `evaluate` (mismo criterio que el batch).
 *  - Remates: rara vez traen área → comparación por TOTALES (avalúo/postura vs
 *    precio mediano de oferta del mismo tipo en la ciudad).
 */
import { supabase } from '../lib/supabase.js';
import { robustMedian, quantile, trimOutliers, robustSpread, haversineKm } from './stats.js';
import { evaluate, DEFAULT_CONFIG, type Candidate, type Comp, type Verdict } from './comparables.js';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Normaliza ciudad al formato almacenado (minúsculas, sin tildes). */
export function normCity(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Mapea tipo de remate → vocabulario de tipo de FincaRaíz. null = sin match útil. */
export function mapType(t: string | null | undefined): string | null {
  switch ((t ?? '').toLowerCase()) {
    case 'apartment': return 'apartment';
    case 'house': return 'house';
    case 'lot': return 'lot';
    case 'office': return 'office';
    case 'commercial': return 'commercial';
    case 'warehouse': return 'warehouse';
    case 'farm': return 'house'; // rural: comparabilidad débil, casa como proxy
    case 'building': return 'building';
    default: return null; // vehicle, parking, rights → sin comparables inmobiliarios
  }
}

export type CompConfidence = 'high' | 'medium' | 'low' | 'insufficient';
export type CompScope = 'barrio' | 'zona' | 'ciudad';

/** Ancla geográfica de la propiedad analizada para acotar los comparables. */
export interface ZoneAnchor {
  zone?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface MarketContext {
  city: string;
  type: string | null;
  matched_type: boolean; // ¿se filtró por tipo o se cayó a todos los tipos?
  scope: CompScope;      // granularidad efectiva: barrio (geo) / zona / ciudad
  scope_label: string;   // texto legible: "1.5 km a la redonda", "barrio X", "toda la ciudad"
  radius_km: number | null;
  n: number;
  n_ppm2: number;
  median_total: number | null;
  p25_total: number | null;
  median_ppm2: number | null;
  p25_ppm2: number | null;
  spread: number | null;
  confidence: CompConfidence;
  sample: Array<{ price: number; area: number | null; ppm2: number | null; zone: string | null }>;
}

interface PoolRow {
  type: string | null;
  price: number;
  area: number | null;
  ppm2: number | null;
  zone: string | null;
  lat: number | null;
  lng: number | null;
  stratum: number | null;
  source_id: string;
}

/** Carga listados FincaRaíz activos (no-proyecto) de una ciudad. */
export async function loadCityPool(city: string): Promise<PoolRow[]> {
  const c = normCity(city);
  if (!c) return [];
  const rows: PoolRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('type, price, area_m2, price_per_m2, zone, features, source_id')
      .eq('source', 'fincaraiz').eq('is_active', true).eq('city', c)
      .order('source_id').range(from, from + 999);
    if (error) throw new Error(`loadCityPool: ${error.message}`);
    for (const r of (data ?? []) as any[]) {
      const f = r.features ?? {};
      if (f.is_project === true) continue;
      const price = num(r.price);
      if (!price) continue;
      const area = num(r.area_m2);
      rows.push({
        type: r.type, price, area,
        ppm2: num(r.price_per_m2) ?? (area ? price / area : null),
        zone: r.zone ?? (f.neighborhood as string | null) ?? null,
        lat: num(f.lat), lng: num(f.lng), stratum: num(f.stratum),
        source_id: r.source_id,
      });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

function confFor(n: number, spread: number | null): CompConfidence {
  if (n < DEFAULT_CONFIG.minComparables) return n >= 4 ? 'low' : 'insufficient';
  if (spread != null && n >= DEFAULT_CONFIG.minComparables * 2 && spread < 0.3) return 'high';
  if (spread != null && spread < 0.5) return 'medium';
  return 'low';
}

/**
 * Resume el mercado para un tipo dado, lo MÁS PUNTUAL posible a la propiedad.
 *
 * Cascada de granularidad (decisión del cliente: "zona = barrio cuando se pueda,
 * si no la ciudad"): se elige el conjunto más fino que tenga ≥ mínimo de comparables.
 *   1. BARRIO por geo: avisos dentro de 1.5 km (luego 3 km) del lat/lng del inmueble.
 *   2. ZONA por texto: avisos con el mismo barrio (zone) normalizado.
 *   3. CIUDAD: todos los del tipo en la ciudad.
 * Si ningún nivel llega al mínimo, usa el más amplio disponible (ciudad). El tipo
 * se relaja a "todos" si hay muy pocos del tipo pedido.
 */
export function summarizeMarket(
  pool: PoolRow[],
  city: string,
  type: string | null,
  anchor?: ZoneAnchor,
): MarketContext {
  const MIN = DEFAULT_CONFIG.minComparables;
  const wantType = type;
  let typeRows = wantType ? pool.filter((r) => r.type === wantType) : pool;
  const matched = !!wantType && typeRows.length >= 5;
  if (!matched) typeRows = pool; // relajar a todos los tipos

  // Cascada espacial: lo más fino con ≥ MIN comparables.
  let rows = typeRows;
  let scope: CompScope = 'ciudad';
  let radius: number | null = null;
  let scopeLabel = `${city} (toda la ciudad)`;

  const hasGeo = anchor?.lat != null && anchor?.lng != null;
  if (hasGeo) {
    for (const rk of [1.5, 3]) {
      const near = typeRows.filter(
        (r) => r.lat != null && r.lng != null && haversineKm(anchor!.lat!, anchor!.lng!, r.lat, r.lng) <= rk,
      );
      if (near.length >= MIN) {
        rows = near; scope = 'barrio'; radius = rk; scopeLabel = `${rk} km a la redonda`; break;
      }
    }
  }
  if (scope === 'ciudad' && anchor?.zone) {
    const target = normCity(anchor.zone);
    const z = typeRows.filter((r) => r.zone && normCity(r.zone) === target);
    if (z.length >= MIN) { rows = z; scope = 'zona'; scopeLabel = `barrio ${anchor.zone}`; }
  }

  const totals = rows.map((r) => r.price);
  const ppm2s = rows.map((r) => r.ppm2).filter((x): x is number => x != null && x > 0);
  const cleanTotals = trimOutliers(totals);
  const cleanPpm2 = trimOutliers(ppm2s);
  const spread = ppm2s.length >= 4 ? robustSpread(ppm2s) : (totals.length >= 4 ? robustSpread(totals) : null);

  const sample = [...rows]
    .sort((a, b) => (a.ppm2 ?? a.price) - (b.ppm2 ?? b.price))
    .slice(0, 6)
    .map((r) => ({ price: r.price, area: r.area, ppm2: r.ppm2 ? Math.round(r.ppm2) : null, zone: r.zone }));

  return {
    city: normCity(city),
    type: wantType,
    matched_type: matched,
    scope, scope_label: scopeLabel, radius_km: radius,
    n: rows.length,
    n_ppm2: ppm2s.length,
    median_total: totals.length ? Math.round(robustMedian(totals)) : null,
    p25_total: cleanTotals.length ? Math.round(quantile(cleanTotals, 0.25)) : null,
    median_ppm2: ppm2s.length ? Math.round(robustMedian(ppm2s)) : null,
    p25_ppm2: cleanPpm2.length ? Math.round(quantile(cleanPpm2, 0.25)) : null,
    spread: spread != null ? Math.round(spread * 100) / 100 : null,
    confidence: confFor(rows.length, spread),
    sample,
  };
}

/** Veredicto ppm² del motor para un banco (geo/área), usando el pool de ciudad. */
export function evaluateBank(candidate: Candidate, pool: PoolRow[]): Verdict {
  const comps: Comp[] = pool
    .filter((r) => r.ppm2 != null && r.area != null)
    .map((r) => ({
      source_id: r.source_id, type: r.type, ppm2: r.ppm2!, area_m2: r.area!,
      lat: r.lat, lng: r.lng, stratum: r.stratum, city: candidate.city, zone: r.zone,
    }));
  return evaluate(candidate, comps, DEFAULT_CONFIG);
}
