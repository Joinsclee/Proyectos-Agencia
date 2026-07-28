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
  MAX_CIUDADES_PANEL,
  ciudadesPrincipales,
  construirTablaZonas,
  type FilaCiudad,
  type FilaOportunidad,
  type TablaZonas,
} from './zonas.js';
import {
  estadoTrabajos,
  serieCorridasPorDia,
  type FilaCorrida,
  type FilaTrabajo,
  type SerieCorridas,
  type TrabajoAutomatico,
} from './metricas.js';
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

/**
 * Qué cuenta como inventario PUBLICABLE del portal abierto.
 *
 * Vive en un solo sitio porque lo usan tres consumidores que tienen que decir el
 * mismo número: las estadísticas del dashboard, el listado paginado y la tabla
 * de oportunidades por zona del panel. Cuando esta definición estaba duplicada,
 * la pestaña anunciaba 115.636 y el paginador de adentro ofrecía otra cifra —la
 * contradicción más fácil de detectar que puede tener un tablero, porque se ve
 * sin hacer clic en nada—.
 *
 * Fuera quedan los proyectos de preventa (no son un inmueble que se pueda ir a
 * ver) y todo lo que supere el tope de precio del sistema.
 */
function soloPortalPublicable(qb: any) {
  return qb
    .eq('is_active', true)
    .eq('source', 'fincaraiz')
    .or('features->>is_project.is.null,features->>is_project.eq.false')
    .lte('price', MAX_DISPLAY_PRICE);
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
  // Sin filtros NO se usa el estimador del planificador de Postgres: se equivoca
  // por dos órdenes de magnitud. Medido el 2026-07-28 en producción — estimaba
  // 1.010 fichas cuando hay 108.016, así que el paginador ofrecía 43 páginas de
  // las ~4.500 reales y contradecía al contador de la pestaña en la primera
  // pantalla que ve cualquiera. El conteo exacto tarda 5,4 s, demasiado para una
  // carga, así que se hace UNA vez y se cachea, igual que las estadísticas.
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
  const total = cheapFilter ? (count ?? 0) : await totalPortalSinFiltros(count ?? 0);
  return { data: data ?? [], total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/**
 * Total real del portal sin filtros, cacheado.
 *
 * Se calcula con EXACTAMENTE los mismos filtros que el listado —activo, FincaRaíz,
 * sin proyectos de preventa y bajo el tope de precio— para que el número del
 * paginador y el de la pestaña puedan cuadrar. Si la consulta falla o tarda de
 * más, se devuelve la estimación del planificador: un total aproximado es mucho
 * mejor que una pantalla en blanco.
 */
const TOTAL_PORTAL_TTL_MS = 10 * 60_000;
let totalPortalCache: { at: number; total: number } | null = null;
let totalPortalEnVuelo: Promise<number> | null = null;

async function totalPortalSinFiltros(estimado: number): Promise<number> {
  if (totalPortalCache && Date.now() - totalPortalCache.at < TOTAL_PORTAL_TTL_MS) {
    return totalPortalCache.total;
  }
  if (!totalPortalEnVuelo) {
    totalPortalEnVuelo = (async () => {
      const { count, error } = await supabase
        .from('inmuebles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('source', 'fincaraiz')
        .or('features->>is_project.is.null,features->>is_project.eq.false')
        .lte('price', MAX_DISPLAY_PRICE);
      if (error) throw new Error(error.message);
      const total = count ?? 0;
      totalPortalCache = { at: Date.now(), total };
      return total;
    })().finally(() => { totalPortalEnVuelo = null; });
  }
  try {
    return await totalPortalEnVuelo;
  } catch (e) {
    log.warn(`total del portal: ${e instanceof Error ? e.message : String(e)}`);
    return estimado;
  }
}

/** Precalienta el total del portal para que la primera visita no pague los 5,4 s. */
export async function warmTotalPortal(): Promise<void> {
  try { await totalPortalSinFiltros(0); } catch { /* best-effort */ }
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
  // Los MISMOS filtros que el listado y que el panel de zonas, en una sola
  // definición (`soloPortalPublicable`) para que no puedan volver a divergir.
  const base = () => soloPortalPublicable(
    supabase.from('inmuebles').select('id', { count: 'exact', head: true }),
  );
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

// ── Oportunidades por zona (panel de administración) ─────────────────────────
//
// El panel promete «estadísticas de uso Y DE OPORTUNIDADES POR ZONA». Lo de uso
// sale de `server/account.ts`; esto es lo otro: dónde está el inventario.
//
// La restricción real es que son ~116.000 inmuebles (108.016 publicables) y que
// PostgREST no expone GROUP BY. Traerlos todos al servidor para agrupar en
// memoria son ~116 peticiones de 1.000 filas y decenas de MB por cada carga del
// panel: inviable. La salida es no leer nunca la tabla entera:
//   · las OPORTUNIDADES sí se traen completas (~20.300 filas, 3 columnas) porque
//     el promedio y el mejor descuento no se pueden calcular con un conteo, pero
//     se entra por el índice de descuento, no por la clave primaria;
//   · los inmuebles de banco (~460) caben en una sola respuesta;
//   · remates (~690) y arriendos (~10.300) son tablas propias y pequeñas, así
//     que ahí sí sale barato recorrerlas por franjas de `id`;
//   · el inventario por ciudad se resuelve con `head: true`, que no transporta ni
//     una fila, y solo para las ciudades que caben en la tabla.
// El conteo global del sistema se reutiliza de `stats()` en vez de repetirlo:
// ese conteo sobre las 116.000 filas tarda segundos por sí solo y ya está
// cacheado y precalentado al arrancar. De paso garantiza que el panel y el
// dashboard publiquen exactamente el mismo número, que es medio problema menos.
//
// Medición del cálculo completo contra producción (2026-07-28): ~3 s en frío,
// caché de 10 minutos por delante y precalentado al arrancar el servidor.

const LOTE_ZONAS = 1000;      // tope duro de filas por respuesta de PostgREST
// Medido contra producción el 2026-07-28: el cuello no es la base sino la latencia
// de ida y vuelta de cada petición. Con 6 en paralelo el recorrido de
// oportunidades tardaba 5,2 s y con 12 tarda 1,0 s; de 12 a 20 ya no mejora.
const CONCURRENCIA_ZONAS = 12;

/** Recorre `items` con un número fijo de trabajadores en paralelo. */
async function enParalelo<T>(
  items: readonly T[],
  limite: number,
  tarea: (item: T) => Promise<void>,
): Promise<void> {
  const cola = [...items];
  const trabajadores = Array.from({ length: Math.min(limite, cola.length) }, async () => {
    for (;;) {
      const item = cola.shift();
      if (item === undefined) return;
      await tarea(item);
    }
  });
  await Promise.all(trabajadores);
}

/** Constructor de la consulta ya filtrada, sin orden ni rango. */
type ConsultaLote = (columnas: string) => any;

/**
 * Franjas del espacio de UUID por su primer dígito hexadecimal.
 *
 * POR QUÉ NO SE PAGINA CON `OFFSET`: la primera versión pedía las páginas con
 * `range(9000, 9999)` y compañía, y cada página profunda obliga a Postgres a
 * recorrer y descartar miles de filas antes de empezar a devolver: funcionaba en
 * pruebas aisladas y se caía con «canceling statement due to statement timeout»
 * en cuanto la base tenía algo de trabajo encima. Recortando por rango de `id`
 * no hay nada que descartar y ninguna consulta se vuelve más cara que la
 * anterior.
 *
 * OJO CON CUÁNDO USARLO: recorrer por `id` obliga a entrar por la clave
 * primaria, así que solo vale la pena sobre tablas donde se quiere CASI TODA la
 * tabla (`rental_listings`, `remates`). Para un subconjunto pequeño de una tabla
 * grande —las oportunidades dentro de los 116.000 inmuebles— sale carísimo: se
 * paga leer las 116.000 filas para quedarse con 20.000. Ese caso va por
 * `traerOportunidades`, que entra por el índice de descuento.
 */
const FRANJAS_UUID = (() => {
  const digitos = '0123456789abcdef'.split('');
  const limite = (d: string) => `${d}0000000-0000-0000-0000-000000000000`;
  return digitos.map((d, i) => ({
    desde: limite(d),
    hasta: i + 1 < digitos.length ? limite(digitos[i + 1]) : null,
  }));
})();

/**
 * Reintenta una consulta que Postgres cortó por «statement timeout».
 *
 * No es defensa gratuita: estas consultas conviven con el cron de scraping, con
 * el precalentamiento de comparables del arranque y con el propio dashboard, y
 * basta que coincidan para que una franja suelta se pase del tiempo permitido.
 * Reintentarla cuesta milisegundos; dejar caer el panel entero por eso es lo que
 * hace que el administrador deje de confiar en la pantalla. Los errores que NO
 * son de tiempo (permisos, columna inexistente) se relanzan de inmediato: ahí
 * reintentar solo retrasa el diagnóstico.
 */
interface RespuestaSupabase {
  data?: unknown;
  count?: number | null;
  error: { message: string } | null;
}

async function conReintentoPorTimeout<R extends RespuestaSupabase>(
  etiqueta: string,
  ejecutar: () => PromiseLike<R>,
): Promise<R> {
  const INTENTOS = 3;
  for (let intento = 1; ; intento += 1) {
    // La consulta se reconstruye en cada intento a propósito: los constructores
    // de supabase-js se ejecutan al esperarlos y no está garantizado que
    // reutilizar el mismo objeto vuelva a lanzar la petición.
    const resultado = await ejecutar();
    if (!resultado.error) return resultado;
    if (intento >= INTENTOS || !isTimeout(resultado.error.message)) {
      throw new Error(`${etiqueta}: ${resultado.error.message}`);
    }
    log.warn(`${etiqueta}: timeout, reintento ${intento} de ${INTENTOS - 1}`);
    await new Promise((listo) => setTimeout(listo, 300 * intento));
  }
}

/**
 * Trae TODAS las filas de una consulta, por franjas de `id` y en paralelo.
 *
 * Dentro de cada franja se avanza por cursor (`id > último`), nunca por
 * desplazamiento, así que la consulta cuesta lo mismo en la primera vuelta que
 * en la última. Con ~20.500 oportunidades cada franja son ~1.300 filas: dos
 * vueltas como mucho.
 *
 * El orden por `id` también es lo que hace consistente la paginación: sin
 * `ORDER BY`, Postgres no garantiza el mismo orden entre dos consultas y una
 * fila podría salir dos veces —o ninguna—. Aun así, si un scraper inserta
 * mientras se recorre, el corte puede quedar desalineado por unas pocas filas;
 * para un panel de estadísticas es aceptable, para un listado no lo sería.
 */
async function traerTodasLasFilas<T>(
  etiqueta: string,
  consulta: ConsultaLote,
  columnas: string,
): Promise<T[]> {
  // El `id` viaja siempre aunque quien llama no lo pida: es el cursor.
  type ConId = T & { id?: string };
  const filas: ConId[] = [];
  await enParalelo(FRANJAS_UUID, CONCURRENCIA_ZONAS, async (franja) => {
    let cursor: string | null = null;
    for (;;) {
      const { data } = await conReintentoPorTimeout(etiqueta, () => {
        let qb = consulta(`id, ${columnas}`).order('id').limit(LOTE_ZONAS);
        // La primera vuelta incluye el borde de la franja (`gte`); las
        // siguientes arrancan justo después de la última fila vista (`gt`), que
        // es lo que impide repetirla.
        qb = cursor === null ? qb.gte('id', franja.desde) : qb.gt('id', cursor);
        if (franja.hasta) qb = qb.lt('id', franja.hasta);
        return qb;
      });
      const lote = (data ?? []) as ConId[];
      filas.push(...lote);
      if (lote.length < LOTE_ZONAS) return;
      cursor = lote[lote.length - 1].id ?? null;
      if (cursor === null) throw new Error(`${etiqueta}: lote sin id, no se puede avanzar el cursor`);
    }
  });
  return filas;
}

/**
 * Conjuntos que caben de sobra en una sola respuesta (los ~460 inmuebles de
 * banco activos).
 *
 * Se pide sin ordenar para que el planificador entre por el índice que quiera —
 * ordenar por `id` lo forzaría a la clave primaria y a leer los 116.000
 * inmuebles para quedarse con 460—. Si algún día no cupieran en una respuesta se
 * avisa y se recurre al recorrido por franjas, que es más caro pero correcto:
 * quedarse callado con las primeras 1.000 filas sería publicar un conteo falso.
 */
async function traerConjuntoPequeno<T>(
  etiqueta: string,
  consulta: ConsultaLote,
  columnas: string,
): Promise<T[]> {
  const { data } = await conReintentoPorTimeout(etiqueta, () => consulta(columnas).limit(LOTE_ZONAS));
  const filas = (data ?? []) as T[];
  if (filas.length < LOTE_ZONAS) return filas;
  log.warn(`${etiqueta}: pasó de ${LOTE_ZONAS} filas, se recorre por franjas de id`);
  return traerTodasLasFilas<T>(etiqueta, consulta, columnas);
}

/**
 * Ancho de los tramos de descuento en que se parte el recorrido de
 * oportunidades. Con ~20.300 repartidas entre 0 % y 70 %, tramos de 1 punto dan
 * ~290 filas cada uno y ninguno se acerca al tope de 1.000. Medido: con tramos
 * de 2 puntos nueve de ellos llegaban al tope y había que partirlos sobre la
 * marcha, que salía más lento que pedir el doble de tramos pequeños.
 */
const TRAMO_DESCUENTO = 1;

/** Suelo defensivo por si el motor llegara a marcar un descuento negativo. */
const DESCUENTO_MINIMO = -10_000;

/**
 * Recorre las oportunidades del portal por TRAMOS DE DESCUENTO.
 *
 * Es el mismo conjunto de filas que devolvería un recorrido por `id`, pero por
 * un camino radicalmente más barato: existe el índice parcial
 * `inmuebles_opp_source_idx (source, discount_pct) where is_opportunity and
 * is_active`, así que acotar por descuento entra directo por él y solo se tocan
 * las ~20.500 filas que interesan. Recorriendo por `id` había que leer las
 * 116.000 del portal para descartar 95.000, y eso es exactamente lo que hacía
 * saltar el «statement timeout» cuando la base tenía algo más que hacer.
 *
 * Si un tramo llegara al tope de 1.000 filas se parte en dos y se vuelve a
 * pedir: perder filas en silencio falsearía los conteos del panel, que es el
 * único error que este archivo no se puede permitir.
 */
async function traerOportunidades<T>(consulta: ConsultaLote, columnas: string): Promise<T[]> {
  const etiqueta = 'zonas/oportunidades';

  const traerTramo = async (desde: number, hasta: number, profundidad: number): Promise<T[]> => {
    const { data } = await conReintentoPorTimeout(etiqueta, () => {
      const qb = consulta(columnas).gte('discount_pct', desde).limit(LOTE_ZONAS);
      // El último tramo cierra inclusivo para no dejar fuera el descuento máximo.
      return hasta >= MAX_OPP_DISCOUNT ? qb.lte('discount_pct', hasta) : qb.lt('discount_pct', hasta);
    });
    const filas = (data ?? []) as T[];
    if (filas.length < LOTE_ZONAS) return filas;
    if (profundidad >= 8) {
      throw new Error(`${etiqueta}: el tramo [${desde}, ${hasta}) no se puede partir más`);
    }
    const medio = (desde + hasta) / 2;
    const [bajo, alto] = await Promise.all([
      traerTramo(desde, medio, profundidad + 1),
      traerTramo(medio, hasta, profundidad + 1),
    ]);
    return [...bajo, ...alto];
  };

  const tramos: Array<[number, number]> = [[DESCUENTO_MINIMO, 0]];
  for (let d = 0; d < MAX_OPP_DISCOUNT; d += TRAMO_DESCUENTO) {
    tramos.push([d, Math.min(d + TRAMO_DESCUENTO, MAX_OPP_DISCOUNT)]);
  }

  const filas: T[] = [];
  await enParalelo(tramos, CONCURRENCIA_ZONAS, async ([desde, hasta]) => {
    filas.push(...await traerTramo(desde, hasta, 0));
  });
  return filas;
}

/**
 * Tabla de oportunidades por zona, CACHEADA igual que `stats()`.
 *
 * Los datos solo cambian cuando corre el motor o un scraper (1-2 veces al día),
 * pero calcularla cuesta ~4 s y unas 60 consultas contra Supabase. Sin caché,
 * cada refresco del panel volvería a pagarlo. Se sirve rancio y se refresca por
 * detrás: el administrador nunca espera dos veces.
 */
const ZONAS_TTL_MS = 10 * 60_000;
let zonasCache: { at: number; data: TablaZonas } | null = null;
let zonasInFlight: Promise<TablaZonas> | null = null;

export async function oportunidadesPorZona(): Promise<TablaZonas> {
  if (zonasCache) {
    if (Date.now() - zonasCache.at >= ZONAS_TTL_MS && !zonasInFlight) void refrescarZonas().catch(() => {});
    return zonasCache.data; // fresco o rancio: se responde ya
  }
  return zonasInFlight ?? refrescarZonas();
}

function refrescarZonas() {
  zonasInFlight = computarZonas()
    .then((data) => { zonasCache = { at: Date.now(), data }; return data; })
    .finally(() => { zonasInFlight = null; });
  return zonasInFlight;
}

/**
 * Precalienta la tabla de zonas al arrancar.
 *
 * Va de ÚLTIMA en la cadena de arranque y es best-effort: son ~60 consultas que
 * no le sirven a nadie que entre al dashboard público, así que no pueden
 * competir con `warmStats()` ni con los comparables de las ciudades grandes. A
 * cambio, quien abra el panel de administración lo encuentra ya calculado en vez
 * de esperar los ~3 s del cálculo en frío.
 */
export async function warmZonas(): Promise<void> {
  // `oportunidadesPorZona()` y no `refrescarZonas()`: si un administrador ya
  // abrió el panel mientras arrancaba el servidor, hay un cálculo en vuelo y
  // lanzar el segundo duplicaría ~60 consultas contra la misma base, que es
  // justo lo que hacía saltar el «statement timeout».
  try { await oportunidadesPorZona(); } catch { /* best-effort */ }
}

/**
 * Marca una promesa lanzada pero todavía no esperada como «ya tiene manejador».
 *
 * Sin esto, si el recorrido de bancos fallara mientras seguimos esperando el de
 * oportunidades, Node vería un rechazo sin manejador y —con el comportamiento
 * por defecto desde Node 15— tumbaría el proceso entero del servidor. El error
 * no se traga: la promesa original se sigue esperando más abajo y vuelve a
 * lanzarlo ahí, que es donde sí hay un `try/catch` que lo convierte en un 500.
 */
function sinRechazoHuerfano<T>(promesa: Promise<T>): Promise<T> {
  promesa.catch(() => { /* se relanza al esperarla de verdad */ });
  return promesa;
}

/**
 * Total de inmuebles activos del portal, reutilizado de `stats()`.
 *
 * Un fallo aquí NO puede tumbar la tabla entera: el resto de las cifras —que es
 * lo que de verdad se viene a mirar— ya está calculado y sería absurdo perderlo
 * por un conteo global. Se devuelve `null` y el panel muestra una raya, que es
 * honesto; un cero ahí se leería como «no hay inventario».
 */
async function totalActivosDelSistema(): Promise<number | null> {
  try {
    return (await stats()).portal_total;
  } catch (e) {
    log.warn(`zonas/total: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Inventario activo del portal por ciudad, sin transportar una sola fila. */
async function contarActivosPorCiudad(ciudades: readonly string[]): Promise<Map<string, number>> {
  const activos = new Map<string, number>();
  await enParalelo(ciudades, CONCURRENCIA_ZONAS, async (ciudad) => {
    const { count } = await conReintentoPorTimeout(`zonas/activos(${ciudad})`, () => (
      soloPortalPublicable(
        supabase.from('inmuebles').select('id', { count: 'exact', head: true }),
      ).eq('city', ciudad)
    ));
    activos.set(ciudad, count ?? 0);
  });
  return activos;
}

async function computarZonas(): Promise<TablaZonas> {
  const inicio = Date.now();

  const oportunidadesActivas: ConsultaLote = (columnas) => soloPortalPublicable(
    supabase.from('inmuebles').select(columnas),
  )
    .eq('is_opportunity', true)
    // Mismo tope que `stats()`: un «descuento» del 95 % es un error de datos, no
    // una ganga. Si el panel no lo aplicara, sus totales no cuadrarían con los
    // que el dashboard le muestra al usuario final.
    .lte('discount_pct', MAX_OPP_DISCOUNT);
  const bancosActivos: ConsultaLote = (columnas) => supabase
    .from('inmuebles').select(columnas)
    .eq('is_active', true).in('source', BANK_SOURCES as unknown as string[]);
  const rematesActivos: ConsultaLote = (columnas) => supabase
    .from('remates').select(columnas).eq('is_active', true);
  const arriendosActivos: ConsultaLote = (columnas) => supabase
    .from('rental_listings').select(columnas).eq('is_active', true);

  // Los cinco trabajos arrancan a la vez, pero solo el de oportunidades bloquea:
  // es el que decide QUÉ ciudades entran a la tabla y, por tanto, de cuáles hay
  // que pedir el conteo de inventario. Dejando que los conteos por ciudad se
  // solapen con los recorridos que siguen en vuelo, el cálculo completo baja de
  // ~7 s a ~3 s; hacerlo en dos fases limpias costaba el doble por nada.
  // Cada conjunto se recorre por donde le sale barato: los bancos son un
  // subconjunto diminuto de una tabla enorme (una respuesta basta), remates y
  // arriendos son tablas pequeñas que se quieren casi enteras (franjas de `id`),
  // y las oportunidades entran por el índice de descuento.
  const bancosEnVuelo = sinRechazoHuerfano(traerConjuntoPequeno<FilaCiudad>('zonas/bancos', bancosActivos, 'city'));
  const rematesEnVuelo = sinRechazoHuerfano(traerTodasLasFilas<FilaCiudad>('zonas/remates', rematesActivos, 'city'));
  const arriendosEnVuelo = sinRechazoHuerfano(traerTodasLasFilas<FilaCiudad>('zonas/arriendos', arriendosActivos, 'city'));
  const totalEnVuelo = sinRechazoHuerfano(totalActivosDelSistema());

  const oportunidades = await traerOportunidades<FilaOportunidad>(
    oportunidadesActivas, 'city, discount_pct, is_high',
  );

  // El corte va ANTES de los conteos por ciudad: son 133 ciudades y cada una
  // cuesta un conteo sobre las 116.000 filas del portal. Contarlas todas serían
  // ~133 consultas pesadas para descartar noventa y tantas filas al final.
  const ciudades = ciudadesPrincipales(oportunidades, MAX_CIUDADES_PANEL);
  const activosEnVuelo = sinRechazoHuerfano(contarActivosPorCiudad(ciudades));

  const [bancos, remates, arriendos, totalActivosSistema, activosPorCiudad] = await Promise.all([
    bancosEnVuelo, rematesEnVuelo, arriendosEnVuelo, totalEnVuelo, activosEnVuelo,
  ]);

  const tabla = construirTablaZonas({
    ciudades,
    oportunidades,
    activosPorCiudad,
    bancos,
    remates,
    arriendos,
    totalActivosSistema,
    // El MISMO tope con el que se filtró la consulta de arriba: si el histograma
    // usara otro, tendría tramos que la consulta nunca iba a poder llenar.
    maxDescuento: MAX_OPP_DISCOUNT,
  });
  log.info(`zonas: ${tabla.zonas.length} ciudades en ${Date.now() - inicio}ms`);
  return tabla;
}

/* ─────────────────  MÉTRICAS DE OPERACIÓN (gráficas del panel)  ───────────────── */

/**
 * Días de historia de scraping que se dibujan.
 *
 * Treinta cubre cuatro ciclos completos del cron semanal, que es lo que hace
 * falta para distinguir «esta semana falló» de «lleva un mes fallando». Con más
 * ventana las columnas se vuelven ilegibles sin aportar una decisión distinta.
 */
export const DIAS_METRICAS = 30;

/**
 * Tope defensivo de filas de `scraping_logs`.
 *
 * Hoy la tabla entera tiene menos de cien filas, pero crece una por corrida y
 * para siempre: sin tope, dentro de un año esta consulta traería miles de filas
 * en cada carga del panel. Se pide ordenado por fecha descendente para que, si
 * algún día se llegara al tope, lo que se recorte sea lo VIEJO —que ya está
 * fuera de la ventana de 30 días— y no lo reciente.
 */
const MAX_FILAS_CORRIDAS = 2_000;

export interface MetricasOperacion {
  generadoEn: string;
  ventanaDias: number;
  scraping: SerieCorridas;
  trabajos: TrabajoAutomatico[];
}

/**
 * Métricas de operación, CACHEADAS igual que `stats()` y la tabla de zonas.
 *
 * Son dos consultas pequeñas (unas decenas de filas de `scraping_logs` y las
 * cinco de `radar_cron_jobs`), así que el motivo de la caché no es el costo:
 * es que el panel entero se recarga tras cada cambio de suscripción y no tiene
 * sentido volver a preguntar por unos datos que solo se mueven cuando corre un
 * scraper. TTL corto —cinco minutos— porque aquí lo que se viene a mirar es
 * justamente si algo acaba de fallar.
 */
const METRICAS_TTL_MS = 5 * 60_000;
let metricasCache: { at: number; data: MetricasOperacion } | null = null;
let metricasEnVuelo: Promise<MetricasOperacion> | null = null;

export async function metricasOperacion(): Promise<MetricasOperacion> {
  if (metricasCache) {
    if (Date.now() - metricasCache.at >= METRICAS_TTL_MS && !metricasEnVuelo) {
      void refrescarMetricas().catch(() => {});
    }
    return metricasCache.data; // fresco o rancio: se responde ya
  }
  return metricasEnVuelo ?? refrescarMetricas();
}

function refrescarMetricas() {
  metricasEnVuelo = computarMetricas()
    .then((data) => { metricasCache = { at: Date.now(), data }; return data; })
    .finally(() => { metricasEnVuelo = null; });
  return metricasEnVuelo;
}

/** Precalienta las métricas del panel al arrancar (van con las zonas, al final). */
export async function warmMetricas(): Promise<void> {
  try { await metricasOperacion(); } catch { /* best-effort */ }
}

async function computarMetricas(): Promise<MetricasOperacion> {
  // Solo se piden las corridas que pueden caer dentro de la ventana. El margen
  // de un día cubre el desfase horario de Bogotá: una corrida de las 20:00 del
  // primer día de la ventana es del día siguiente en UTC.
  const desde = new Date(Date.now() - (DIAS_METRICAS + 1) * 86_400_000).toISOString();

  const [corridas, trabajos] = await Promise.all([
    supabase
      .from('scraping_logs')
      .select('source, status, started_at, records_found, records_inserted')
      .gte('started_at', desde)
      .order('started_at', { ascending: false })
      .limit(MAX_FILAS_CORRIDAS),
    supabase
      .from('radar_cron_jobs')
      .select('nombre, cadencia_dias, habilitado, ultima_corrida, ultimo_estado, corriendo_desde'),
  ]);

  // Un fallo aquí NO tumba el panel: el resto de las secciones —que es lo que
  // el administrador viene a operar— no depende de estas dos tablas. Se devuelve
  // la serie vacía y la interfaz dice que no pudo leerlas, que es honesto.
  if (corridas.error) log.warn(`metricas/scraping_logs: ${corridas.error.message}`);
  if (trabajos.error) log.warn(`metricas/radar_cron_jobs: ${trabajos.error.message}`);

  return {
    generadoEn: new Date().toISOString(),
    ventanaDias: DIAS_METRICAS,
    scraping: serieCorridasPorDia((corridas.data ?? []) as FilaCorrida[], { dias: DIAS_METRICAS }),
    trabajos: estadoTrabajos((trabajos.data ?? []) as FilaTrabajo[]),
  };
}
