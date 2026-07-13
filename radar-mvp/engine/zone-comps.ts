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
import { MAX_DISPLAY_PRICE } from '../lib/types.js';
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

/** Ancla de la propiedad analizada para acotar los comparables (geo + atributos). */
export interface ZoneAnchor {
  zone?: string | null;
  lat?: number | null;
  lng?: number | null;
  bedrooms?: number | null;
  garages?: number | null;
  /** Se excluye del pool: si el analizado ES un aviso de FincaRaíz, no puede ser su propio comparable. */
  excludeSourceId?: string | null;
}

export interface MarketContext {
  city: string;
  type: string | null;
  matched_type: boolean; // ¿se filtró por tipo o se cayó a todos los tipos?
  scope: CompScope;      // granularidad efectiva: barrio (geo) / zona / ciudad
  scope_label: string;   // texto legible: "1.5 km a la redonda", "barrio X", "toda la ciudad"
  radius_km: number | null;
  criteria: string[];    // condicionales realmente aplicadas (tipo, hab., parqueadero…)
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
  bedrooms: number | null;
  garages: number | null;
  source_id: string;
}

/**
 * Caché en memoria del baseline por ciudad.
 *
 * Cada análisis relee toda la ciudad de FincaRaíz (hasta ~20K filas = ~20 consultas).
 * Como el baseline sólo cambia cuando corre el scraper, cachearlo evita repetir ese
 * costo en cada ficha abierta: la 1ª abre en segundos, las siguientes de la misma
 * ciudad son instantáneas.
 */
const POOL_TTL_MS = 30 * 60_000;
const poolCache = new Map<string, { at: number; rows: PoolRow[] }>();
const poolInFlight = new Map<string, Promise<PoolRow[]>>();

/**
 * Carga listados FincaRaíz activos (no-proyecto) de una ciudad.
 *
 * Estrategia stale-while-revalidate: si el baseline está vencido igual se devuelve
 * al instante y se refresca por detrás. El usuario nunca espera dos veces por la
 * misma ciudad, y el baseline sólo cambia cuando corre el scraper.
 *
 * Consecuencia asumida: el scraper corre en OTRO proceso, así que no puede invalidar
 * este caché. Durante los primeros POOL_TTL_MS tras un scrape, los comparables
 * pueden incluir avisos recién vendidos o ignorar los nuevos. Es tolerable porque la
 * mediana de un barrio no se mueve con unos pocos avisos; si algún día importa,
 * reiniciar el servidor tras el scrape lo limpia.
 */
export async function loadCityPool(city: string): Promise<PoolRow[]> {
  const c = normCity(city);
  if (!c) return [];
  const hit = poolCache.get(c);
  const flying = poolInFlight.get(c);

  if (hit) {
    if (Date.now() - hit.at >= POOL_TTL_MS && !flying) void refreshPool(c).catch(() => {});
    return hit.rows; // fresco o rancio: se responde ya
  }
  if (flying) return flying; // dos fichas de la misma ciudad a la vez → una sola consulta
  return refreshPool(c);
}

function refreshPool(c: string): Promise<PoolRow[]> {
  const p = fetchCityPool(c)
    .then((rows) => { poolCache.set(c, { at: Date.now(), rows }); return rows; })
    .finally(() => poolInFlight.delete(c));
  poolInFlight.set(c, p);
  return p;
}

/**
 * Precalienta el baseline de las ciudades más consultadas.
 *
 * Va DESPACIO a propósito: la instancia de Supabase es pequeña y una precarga a
 * toda velocidad compite con las consultas del dashboard hasta hacerlas fallar por
 * statement timeout. Se espera a que el arranque se asiente y se deja respirar
 * entre ciudades: el objetivo es que la primera ficha abra rápida, no llegar antes.
 */
export async function warmCityPools(cities: string[], delayMs = 30_000): Promise<void> {
  await sleep(delayMs);
  for (const c of cities) {
    // Vía refreshPool (no fetchCityPool directo): así queda registrada en
    // poolInFlight y un usuario que abra una ficha de esa ciudad mientras se
    // precarga espera a ESTA consulta en vez de lanzar otra igual en paralelo.
    try { await refreshPool(normCity(c)); }
    catch { /* una ciudad caída no debe afectar al servidor */ }
    await sleep(5_000);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Proyección LIGERA: se extraen los campos del JSON en el servidor de Postgres
// en vez de traer `features` entero (fotos + descripción). En Bogotá eso baja la
// carga de decenas de MB a unos pocos.
const COLS = 'source_id, type, price, area_m2, price_per_m2, zone,'
  + ' lat:features->lat, lng:features->lng, stratum:features->stratum,'
  + ' bedrooms:features->bedrooms, garages:features->garages,'
  + ' neighborhood:features->neighborhood, is_project:features->is_project';

/**
 * Una página del baseline, con reintentos.
 *
 * El `statement timeout` de Supabase es TRANSITORIO: aparece cuando la base está
 * ocupada (p. ej. justo después de que el motor reescribe filas). Sin reintento, un
 * pico puntual dejaba la ficha sin análisis de mercado.
 */
async function pageWithRetry(c: string, cursor: string, intentos = 3): Promise<any[]> {
  let last: unknown;
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await sleep(400 * i);
    const { data, error } = await supabase
      .from('inmuebles')
      .select(COLS)
      .eq('source', 'fincaraiz').eq('is_active', true).eq('city', c)
      .lte('price', MAX_DISPLAY_PRICE) // excluir super-elevados del baseline (mediana limpia)
      .gt('source_id', cursor)
      .order('source_id').limit(1000);
    if (!error) return (data ?? []) as any[];
    last = error.message;
  }
  throw new Error(`loadCityPool(${c}): ${last}`);
}

async function fetchCityPool(c: string): Promise<PoolRow[]> {
  const rows: PoolRow[] = [];
  // KEYSET (no OFFSET): en una tabla de 100K+ filas el OFFSET profundo se degrada
  // hasta el statement timeout. Avanzar por `source_id > último` usa el índice y
  // cuesta lo mismo en la página 1 que en la 30.
  let cursor = '';
  let pages = 0;
  for (;;) {
    if (pages++ > 0) await sleep(250); // no acaparar la base: el dashboard sigue vivo
    const batch = await pageWithRetry(c, cursor);
    for (const r of batch) {
      if (r.is_project === true) continue;
      const price = num(r.price);
      if (!price) continue;
      const area = num(r.area_m2);
      rows.push({
        type: r.type, price, area,
        ppm2: num(r.price_per_m2) ?? (area ? price / area : null),
        zone: r.zone ?? (r.neighborhood as string | null) ?? null,
        lat: num(r.lat), lng: num(r.lng), stratum: num(r.stratum),
        bedrooms: num(r.bedrooms), garages: num(r.garages),
        source_id: r.source_id,
      });
    }
    if (batch.length < 1000) break;
    cursor = batch[batch.length - 1].source_id;
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
  const criteria: string[] = [];
  const wantType = type;
  if (anchor?.excludeSourceId) pool = pool.filter((r) => r.source_id !== anchor.excludeSourceId);
  let typeRows = wantType ? pool.filter((r) => r.type === wantType) : pool;
  const matched = !!wantType && typeRows.length >= 5;
  if (!matched) typeRows = pool; // relajar a todos los tipos
  else criteria.push('mismo tipo de inmueble');

  // 1) UBICACIÓN primero (decisión del cliente: "zona = el barrio cuando se pueda").
  //    Se elige el conjunto geográfico más fino que llegue al mínimo de comparables.
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
  // Ojo con el texto: sólo se puede decir "no hubo suficientes en el barrio" si
  // de verdad se INTENTÓ acotar al barrio. En remates no llega ubicación fina, y
  // afirmarlo sería mentir (y esa frase se le pasa además a la IA como un hecho).
  const teniaUbicacion = hasGeo || !!anchor?.zone;
  criteria.push(scope === 'barrio' ? `mismo sector (${radius} km a la redonda)`
    : scope === 'zona' ? `mismo barrio (${anchor?.zone})`
    : teniaUbicacion ? 'misma ciudad (no hubo suficientes comparables en el barrio)'
    : 'misma ciudad (el aviso no indica barrio exacto)');

  // 2) ATRIBUTOS después, DENTRO de esa ubicación (habitaciones / parqueadero).
  //    Cada condicional se aplica sólo si deja suficientes comparables; si no, se
  //    relaja: es mejor comparar contra el barrio correcto que contra la ciudad
  //    entera sólo por exigir el mismo número de cuartos.
  //    Sólo tienen sentido en vivienda: en un lote o una bodega, "0 habitaciones"
  //    y "sin parqueadero" no son rasgos que distingan nada.
  const vivienda = wantType === 'apartment' || wantType === 'house';
  if (vivienda && anchor?.bedrooms != null && anchor.bedrooms > 0) {
    const b = rows.filter((r) => r.bedrooms != null && Math.abs(r.bedrooms - anchor.bedrooms!) <= DEFAULT_CONFIG.bedroomsTol);
    if (b.length >= MIN) { rows = b; criteria.push(`${anchor.bedrooms} habitaciones (±1)`); }
  }
  if (vivienda && anchor?.garages != null) {
    const con = anchor.garages > 0;
    const g = rows.filter((r) => r.garages != null && (r.garages > 0) === con);
    if (g.length >= MIN) { rows = g; criteria.push(con ? 'con parqueadero' : 'sin parqueadero'); }
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
    scope, scope_label: scopeLabel, radius_km: radius, criteria,
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
      bedrooms: r.bedrooms, garages: r.garages,
    }));
  return evaluate(candidate, comps, DEFAULT_CONFIG);
}
