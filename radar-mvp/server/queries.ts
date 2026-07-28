/**
 * Capa de datos del servidor local (entorno "real"): consulta Supabase EN VIVO
 * con filtros + paginación. A diferencia del HTML estático para GHL, acá no hay
 * topes — se devuelven todos los resultados de cada ciudad, paginados.
 */
import { supabase } from '../lib/supabase.js';
import { MAX_DISPLAY_PRICE, MAX_OPP_DISCOUNT, BANK_SOURCES } from '../lib/types.js';
import { rotarSemanal } from '../engine/rotacion.js';
import { sanitizeRemateForDisplay } from './data-quality.js';
import { evaluarFrescura, type Frescura, type TrabajoCron } from './frescura.js';
import {
  armarDestacados,
  inicioDeMes,
  DESCUENTO_MAX,
  DESCUENTO_MIN,
  type Destacados,
  type FilaInmueble,
  type FilaRemate,
} from './destacados.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('queries');

export interface ListQuery {
  city?: string;
  zone?: string;
  type?: string;
  priceMin?: number;   // COP
  priceMax?: number;   // COP
  areaMin?: number;    // m²
  areaMax?: number;    // m²
  bedroomsMin?: number;
  stratumMin?: number;
  stratumMax?: number;
  opp?: '' | '1' | 'high';
  order?: string;
  page?: number;
  pageSize?: number;
  past?: string; // '1' = incluir audiencias pasadas (remates)
  bank?: string; // '1' = solo remates con demandante banco/financiera
  bidMin?: number; // remates: postura mínima (COP)
  bidMax?: number; // remates: postura máxima (COP)
}

/** Filtros compartidos de inmuebles (portal + bancos): precio/área/hab/estrato. */
function applyInmuebleFilters(qb: any, q: ListQuery) {
  // Tope del sistema: nunca mostrar valores super-elevados (fuera de segmento /
  // errores de carga) que ensucian la percepción y las estadísticas.
  qb = qb.lte('price', MAX_DISPLAY_PRICE);
  // Descuentos imposibles (>70% = error de datos) fuera; se conservan los no
  // evaluados (discount_pct null) para no ocultar listados sin veredicto.
  qb = qb.or(`discount_pct.is.null,discount_pct.lte.${MAX_OPP_DISCOUNT}`);
  if (q.city) qb = qb.eq('city', q.city);
  if (q.type) qb = qb.eq('type', q.type);
  if (q.priceMin) qb = qb.gte('price', q.priceMin);
  if (q.priceMax) qb = qb.lte('price', Math.min(q.priceMax, MAX_DISPLAY_PRICE));
  if (q.areaMin) qb = qb.gte('area_m2', q.areaMin);
  if (q.areaMax) qb = qb.lte('area_m2', q.areaMax);
  // Campos JSON (texto): comparación string segura para dígitos 1-9.
  if (q.bedroomsMin) qb = qb.gte('features->>bedrooms', String(q.bedroomsMin));
  if (q.stratumMin) qb = qb.gte('features->>stratum', String(q.stratumMin));
  if (q.stratumMax) qb = qb.lte('features->>stratum', String(q.stratumMax));
  return qb;
}

export interface ListResult<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

const clampPage = (p?: number) => Math.max(1, Math.floor(p ?? 1));
const clampSize = (s?: number) => Math.min(60, Math.max(6, Math.floor(s ?? 24)));

function applyOrderInmuebles(qb: any, order?: string) {
  switch (order) {
    case 'none': return qb; // sin orden: salida de respaldo cuando ordenar haría timeout
    case 'precio_asc': return qb.order('price', { ascending: true, nullsFirst: false });
    case 'precio_desc': return qb.order('price', { ascending: false, nullsFirst: false });
    case 'precio_m2_asc': return qb.order('price_per_m2', { ascending: true, nullsFirst: false });
    case 'recent': return qb.order('scraped_at', { ascending: false });
    case 'discount_desc':
    default: return qb.order('discount_pct', { ascending: false, nullsFirst: false });
  }
}

const isTimeout = (msg?: string) => !!msg && /statement timeout|57014/i.test(msg);

/** Listados del portal abierto (FincaRaíz), excluyendo proyectos preventa. */
export async function queryPortal(q: ListQuery): Promise<ListResult> {
  const page = clampPage(q.page);
  const pageSize = clampSize(q.pageSize);
  const from = (page - 1) * pageSize;

  // Conteo: EXACTO cuando hay filtros (conjunto acotado → rápido y preciso, que
  // es lo que el usuario necesita para confiar en "X resultados"); PLANNED solo
  // en la vista sin filtros (los 87K completos, donde el exacto haría timeout).
  // Conteo exacto solo con filtros "baratos" (columnas indexadas / ciudad). Con
  // habitaciones/estrato (JSON) SOLOS y sin ciudad, el exacto puede hacer timeout
  // antes de aplicar el migration de índices → en ese caso se usa planned.
  const cheapFilter = !!(q.city || q.zone || q.type || q.priceMin || q.priceMax ||
    q.areaMin || q.areaMax || q.opp);
  const countMode = cheapFilter ? 'exact' : 'planned';
  const build = (order?: string) => {
    let qb = supabase
      .from('inmuebles')
      .select('*', { count: countMode })
      .eq('is_active', true)
      .eq('source', 'fincaraiz')
      // excluir proyectos preventa (is_project null o false)
      .or('features->>is_project.is.null,features->>is_project.eq.false');
    qb = applyInmuebleFilters(qb, q);
    if (q.zone) qb = qb.eq('zone', q.zone);
    if (q.opp === '1') qb = qb.eq('is_opportunity', true);
    if (q.opp === 'high') {
      qb = qb.eq('is_high', true);
    }
    return applyOrderInmuebles(qb, order).range(from, from + pageSize - 1);
  };

  // Resiliencia ante timeouts (ej. rango de estrato sobre 87K + orden): se
  // reintenta primero con 'recent' (indexado) y, si aún falla, SIN orden — que
  // siempre responde rápido (el filtro corta a pageSize). Así la app nunca cae;
  // en ese caso raro solo se pierde el ordenamiento. Con ciudad/precio todo va
  // ordenado y rápido (caso normal).
  // Caso lento conocido: filtro JSON (hab/estrato) SIN filtro barato (ciudad/
  // precio/área) sobre 87K + orden → timeout. Ahí se omite el orden de entrada
  // (responde en ms); con ciudad/precio se ordena normal.
  const jsonOnly = !!(q.bedroomsMin || q.stratumMin || q.stratumMax) && !cheapFilter;
  let { data, count, error } = await build(jsonOnly ? 'none' : q.order);
  if (error && isTimeout(error.message) && q.order !== 'recent') {
    ({ data, count, error } = await build('recent'));
  }
  if (error && isTimeout(error.message)) {
    ({ data, count, error } = await build('none'));
  }
  if (error) throw new Error(`queryPortal: ${error.message}`);
  const total = count ?? 0;
  return { data: data ?? [], total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Inmuebles bancarios (todas las fuentes salvo fincaraiz). */
export async function queryBancos(q: ListQuery): Promise<ListResult> {
  const page = clampPage(q.page);
  const pageSize = clampSize(q.pageSize);
  const from = (page - 1) * pageSize;

  let qb = supabase
    .from('inmuebles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .in('source', BANK_SOURCES as unknown as string[]);

  qb = applyInmuebleFilters(qb, q);
  if (q.opp === '1') qb = qb.eq('is_opportunity', true);
  qb = applyOrderInmuebles(qb, q.order ?? 'precio_m2_asc');
  qb = qb.range(from, from + pageSize - 1);

  const { data, count, error } = await qb;
  if (error) throw new Error(`queryBancos: ${error.message}`);
  const total = count ?? 0;
  // Rotación semanal del pool bancario (HU de frescura): el inventario de bancos
  // cambia poco, así que sin esto el usuario recurrente ve siempre la misma
  // pantalla. Se rota la página ya paginada para no alterar el conteo ni repetir
  // fichas entre páginas.
  return { data: rotarSemanal(data ?? []), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Remates judiciales activos. */
export async function queryRemates(q: ListQuery): Promise<ListResult> {
  const page = clampPage(q.page);
  const pageSize = clampSize(q.pageSize);
  const from = (page - 1) * pageSize;

  let qb = supabase
    .from('remates')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  if (q.city) qb = qb.eq('city', q.city);
  if (q.type) qb = qb.eq('property_type', q.type);
  // Por defecto solo audiencias PRÓXIMAS (hoy en adelante): las pasadas no se
  // pueden rematar, no sirven al usuario. `?past=1` las incluye.
  if (q.past !== '1') {
    const today = new Date().toISOString().slice(0, 10);
    qb = qb.gte('auction_date', today);
  }
  // Demandante: '1' = cualquier banco; un nombre = ese banco específico.
  if (q.bank === '1') qb = qb.eq('features->>is_bank_plaintiff', 'true');
  else if (q.bank) qb = qb.eq('features->>bank_name', q.bank);
  // Postura mínima/máxima (presupuesto del usuario).
  if (q.bidMin) qb = qb.gte('minimum_bid', q.bidMin);
  if (q.bidMax) qb = qb.lte('minimum_bid', q.bidMax);
  const order = q.order ?? 'auction_asc';
  if (order === 'auction_asc') qb = qb.order('auction_date', { ascending: true, nullsFirst: false });
  else if (order === 'min_asc') qb = qb.order('minimum_bid', { ascending: true, nullsFirst: false });
  else if (order === 'min_desc') qb = qb.order('minimum_bid', { ascending: false, nullsFirst: false });
  else qb = qb.order('auction_date', { ascending: true, nullsFirst: false });
  qb = qb.range(from, from + pageSize - 1);

  const { data, count, error } = await qb;
  if (error) throw new Error(`queryRemates: ${error.message}`);
  const total = count ?? 0;
  return {
    data: (data ?? []).map(sanitizeRemateForDisplay),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  };
}

/** Una sola propiedad por id (para abrir una recomendación en su modal). */
export async function getProperty(kind: 'portal' | 'banco' | 'remate', id: string) {
  const table = kind === 'remate' ? 'remates' : 'inmuebles';
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) return null;
  return kind === 'remate' ? sanitizeRemateForDisplay(data) : data;
}

/** Bancos demandantes (distintos) en remates con audiencia futura, con conteo. */
export async function remateBankFacets(): Promise<{ banks: Array<{ name: string; count: number }> }> {
  const today = new Date().toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('remates').select('features')
      .eq('is_active', true).gte('auction_date', today)
      .order('id').range(from, from + 999);
    if (error) throw new Error(`remateBankFacets: ${error.message}`);
    for (const r of (data ?? []) as any[]) {
      const name = r.features?.bank_name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  const banks = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { banks };
}

/** Valores únicos para poblar los filtros (ciudades, tipos, barrios por ciudad). */
export async function facets(source: 'portal' | 'bancos' = 'portal', city?: string) {
  let qb = supabase.from('inmuebles').select('city, zone, type').eq('is_active', true).limit(8000);
  qb = source === 'portal' ? qb.eq('source', 'fincaraiz') : qb.in('source', BANK_SOURCES as unknown as string[]);
  if (city) qb = qb.eq('city', city);
  const { data, error } = await qb;
  if (error) throw new Error(`facets: ${error.message}`);
  const cities = [...new Set((data ?? []).map((r) => r.city).filter(Boolean))].sort();
  const zones = [...new Set((data ?? []).map((r) => r.zone).filter(Boolean))].sort();
  const types = [...new Set((data ?? []).map((r) => r.type).filter(Boolean))].sort();
  return { cities, zones, types };
}

/** Métricas de portada: totales y oportunidades por ciudad. */
/**
 * Estadísticas del dashboard, CACHEADAS.
 *
 * Sólo cambian cuando corre el motor o un scraper (1-2 veces al día), pero se
 * piden en cada carga de la página y son 5 conteos sobre 105K filas. Se sirven de
 * memoria y se refrescan por detrás: el cliente nunca espera por ellas.
 */
const STATS_TTL_MS = 10 * 60_000;
let statsCache: { at: number; data: Awaited<ReturnType<typeof computeStats>> } | null = null;
let statsInFlight: Promise<Awaited<ReturnType<typeof computeStats>>> | null = null;

export async function stats() {
  if (statsCache) {
    if (Date.now() - statsCache.at >= STATS_TTL_MS && !statsInFlight) void refreshStats().catch(() => {});
    return statsCache.data; // fresco o rancio: se responde ya
  }
  return statsInFlight ?? refreshStats();
}

function refreshStats() {
  statsInFlight = computeStats()
    .then((data) => { statsCache = { at: Date.now(), data }; return data; })
    .finally(() => { statsInFlight = null; });
  return statsInFlight;
}

/** Precalienta las estadísticas al arrancar (la primera carga no debe esperarlas). */
export async function warmStats(): Promise<void> {
  try { await refreshStats(); } catch { /* best-effort */ }
}

async function computeStats() {
  // OJO: un count que falla NO puede devolver 0 en silencio — el dashboard llegó a
  // anunciar "0 oportunidades" porque el timeout se tragaba aquí.
  const head = async (q: any) => {
    const r = await q;
    if (r.error) throw new Error(`stats: ${r.error.message}`);
    return r.count ?? 0;
  };
  const base = () => supabase.from('inmuebles').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'fincaraiz');
  const [total, opps, high, bancos, remates] = await Promise.all([
    head(base()),
    head(base().eq('is_opportunity', true).lte('discount_pct', MAX_OPP_DISCOUNT)),
    head(base().eq('is_high', true).lte('discount_pct', MAX_OPP_DISCOUNT)),
    head(supabase.from('inmuebles').select('id', { count: 'exact', head: true }).eq('is_active', true).in('source', BANK_SOURCES as unknown as string[])),
    head(supabase.from('remates').select('id', { count: 'exact', head: true }).eq('is_active', true)),
  ]);

  // Lista de ciudades del portal (solo nombres). Antes se hacían 2 counts por
  // ciudad (~266 consultas) que saturaban Supabase al iniciar, y la UI solo usa
  // la CANTIDAD de ciudades — así que basta la lista.
  const { cities } = await facets('portal');
  const perCity = cities.map((c) => ({ city: c }));

  return { portal_total: total, portal_opps: opps, portal_high: high, bancos, remates, perCity, frescura: await leerFrescura() };
}

/**
 * Edad real de los datos, para que el dashboard no afirme «hoy» cuando el cron
 * lleve semanas muerto. Cinco filas, y viaja dentro de la caché de estadísticas.
 *
 * A diferencia de los conteos, un fallo aquí NO tumba las estadísticas: se
 * devuelve `null` y la interfaz dice que no pudo determinar la fecha, que es
 * honesto. Lo que no puede hacer es dejar de mostrar oportunidades por esto.
 */
/* ─────────────────────────  PORTADA (Home con destacados)  ───────────────────────── */

/**
 * Proyección de las columnas que una tarjeta de portada necesita, y NADA más.
 *
 * Traer `features` entero cuesta ~4 KB por fila (galerías completas + descripción)
 * y la portada no pinta ninguna de esas dos cosas: medido, 600 filas con `select('*')`
 * son 2,5 MB y 4 s. Con esta proyección son 135 KB y ~600 ms para 220.
 *
 * Efecto secundario deseado: la dirección, la descripción, la geolocalización y el
 * enlace a la fuente NI SIQUIERA salen de la base en esta ruta. El muro de pago
 * sigue aplicándose después con `redactarMixta` —es él quien manda—, pero una ruta
 * que no pide el dato no puede filtrarlo por descuido. Ya pasó una vez con
 * `/api/property`.
 */
const COLS_DESTACADOS =
  'id, source, city, zone, type, price, area_m2, price_per_m2, discount_pct, '
  + 'crece_index, crece_tier, cascada_nivel, is_opportunity, is_high, image_url, '
  + 'last_seen_at, first_seen_at, '
  + 'bedrooms:features->bedrooms, bathrooms:features->bathrooms, garages:features->garages, '
  + 'stratum:features->stratum, market:features->market';

const COLS_DESTACADOS_REMATE =
  'id, city, department, property_type, minimum_bid, appraisal_value, minimum_bid_pct, '
  + 'auction_date, auction_mode, cuota_parte, origen_demandante, source, image_url, updated_at';

/** Tamaño de los pools que se piden. Holgados a propósito: los bloques descuentan
 *  lo que ya usó el anterior, así que el último debe seguir teniendo de dónde elegir. */
const POOL_PORTAL = 220;
// Los bancos van holgados porque más de la mitad de sus fichas con buen descuento
// tienen confianza baja y `esInmuebleDestacable` las descarta.
const POOL_BANCOS = 140;
// Los remates se filtran y ordenan en TS (su descuento no sale de una columna),
// así que el pool es de las audiencias más próximas: lo lejano no es accionable.
const POOL_REMATES = 160;

/**
 * Reconstruye el `features` que espera el resto del sistema.
 *
 * La proyección devuelve los escalares sueltos (`bedrooms`, `market`…); las
 * tarjetas y `acceso.ts` esperan encontrarlos dentro de `features`. Se rearma aquí
 * y no en el cliente para que la ficha que viaja tenga exactamente la misma forma
 * que la de cualquier listado.
 */
function rearmarInmueble(fila: Record<string, any>): FilaInmueble {
  const { bedrooms, bathrooms, garages, stratum, market, ...resto } = fila;
  return {
    ...(resto as { id: string }),
    features: {
      ...(bedrooms != null ? { bedrooms } : {}),
      ...(bathrooms != null ? { bathrooms } : {}),
      ...(garages != null ? { garages } : {}),
      ...(stratum != null ? { stratum } : {}),
      ...(market ? { market } : {}),
      // La portada enseña una sola foto: la de portada. La galería vive en la ficha.
      images: fila.image_url ? [fila.image_url] : [],
    },
  } as FilaInmueble;
}

async function traerPoolsDestacados() {
  const hoy = new Date().toISOString().slice(0, 10);
  const desdeMes = inicioDeMes().toISOString();

  const inmueblesBase = (fuente: 'portal' | 'bancos') => {
    let qb = supabase.from('inmuebles').select(COLS_DESTACADOS)
      .eq('is_active', true)
      .gte('discount_pct', DESCUENTO_MIN)
      .lte('discount_pct', DESCUENTO_MAX)
      .lte('price', MAX_DISPLAY_PRICE);
    qb = fuente === 'portal'
      // `is_high` es la garantía del portal: el motor solo la concede con confianza
      // alta y comparables del propio barrio. Además excluye los proyectos de
      // preventa sin necesidad de filtrar el JSON, que sobre 108K filas es caro.
      ? qb.eq('source', 'fincaraiz').eq('is_high', true)
      : qb.in('source', BANK_SOURCES as unknown as string[]);
    return qb.order('discount_pct', { ascending: false, nullsFirst: false });
  };

  const [portal, mes, bancos, remates] = await Promise.all([
    inmueblesBase('portal').limit(POOL_PORTAL),
    // Consulta aparte para el bloque del mes: lo que entró este mes puede quedar
    // por debajo del corte de los 220 mejores por descuento y aun así ser lo más
    // interesante del periodo.
    inmueblesBase('portal').gte('first_seen_at', desdeMes).limit(POOL_PORTAL / 2),
    inmueblesBase('bancos').limit(POOL_BANCOS),
    // OJO con `minimum_bid_pct`: viene nula en más de la mitad de los avisos y
    // cuando trae número no es la relación postura/avalúo, así que NO se puede
    // filtrar ni ordenar por ella. El descuento real se calcula en `destacados.ts`
    // a partir de las dos cifras que sí están.
    supabase.from('remates').select(COLS_DESTACADOS_REMATE)
      .eq('is_active', true).gte('auction_date', hoy)
      .not('appraisal_value', 'is', null).not('minimum_bid', 'is', null)
      .order('auction_date', { ascending: true, nullsFirst: false }).limit(POOL_REMATES),
  ]);

  for (const r of [portal, mes, bancos, remates]) {
    if (r.error) throw new Error(`destacados: ${r.error.message}`);
  }

  // El pool del mes se une al general y se deduplica: `armarDestacados` filtra por
  // `first_seen_at`, así que da igual por qué consulta llegó cada ficha.
  const porId = new Map<string, FilaInmueble>();
  for (const fila of [...(portal.data ?? []), ...(mes.data ?? [])] as Record<string, any>[]) {
    porId.set(String(fila.id), rearmarInmueble(fila));
  }

  return {
    portal: [...porId.values()],
    bancos: ((bancos.data ?? []) as Record<string, any>[]).map(rearmarInmueble),
    remates: ((remates.data ?? []) as Record<string, any>[]).map(sanitizeRemateForDisplay) as FilaRemate[],
  };
}

/**
 * Destacados de la portada, CACHEADOS.
 *
 * Mismo trato que `stats()` y por el mismo motivo: es la PRIMERA pantalla del
 * producto, se pide en cada visita y por debajo hay cuatro consultas sobre las
 * 108.000 fichas del portal. En frío cuesta ~2,5 s; servido de memoria, milésimas.
 * Se refresca por detrás cuando caduca, así que el visitante nunca espera por él —
 * y una selección de diez minutos de antigüedad no engaña a nadie: el motor y los
 * scrapers corren una o dos veces al día.
 *
 * La caché guarda las fichas SIN redactar, a propósito: el muro depende del plan de
 * quien pregunta, así que no puede quedarse congelado dentro de una caché que
 * comparten todos. Redactar es lo último que pasa, ya en la ruta.
 */
const DESTACADOS_TTL_MS = 10 * 60_000;
let destacadosCache: { at: number; data: Destacados } | null = null;
let destacadosInFlight: Promise<Destacados> | null = null;

export async function destacados(): Promise<Destacados> {
  if (destacadosCache) {
    if (Date.now() - destacadosCache.at >= DESTACADOS_TTL_MS && !destacadosInFlight) {
      void refreshDestacados().catch(() => {});
    }
    return destacadosCache.data; // fresco o rancio: se responde ya
  }
  return destacadosInFlight ?? refreshDestacados();
}

function refreshDestacados(): Promise<Destacados> {
  destacadosInFlight = traerPoolsDestacados()
    .then((pools) => {
      const data = armarDestacados(pools);
      destacadosCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => { destacadosInFlight = null; });
  return destacadosInFlight;
}

/** Precalienta la portada al arrancar: es lo primero que verá el primer visitante. */
export async function warmDestacados(): Promise<void> {
  try { await refreshDestacados(); } catch (e) {
    log.warn(`destacados: no se pudo precalentar (${e instanceof Error ? e.message : String(e)})`);
  }
}

async function leerFrescura(): Promise<Frescura | null> {
  try {
    const { data, error } = await supabase
      .from('radar_cron_jobs')
      .select('nombre, cadencia_dias, habilitado, ultima_corrida, ultimo_estado');
    if (error) throw new Error(error.message);
    return evaluarFrescura((data ?? []) as unknown as TrabajoCron[]);
  } catch (e) {
    log.warn(`frescura: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
