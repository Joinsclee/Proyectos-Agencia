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
  // Los MISMOS filtros que el listado: sin proyectos de preventa y bajo el tope de
  // precio. Sin esto el contador de la pestaña anunciaba 115.636 y al abrirla el
  // paginador ofrecía otra cifra, que es la contradicción más fácil de detectar
  // que puede tener un tablero: se ve sin hacer clic en nada.
  const base = () => supabase.from('inmuebles').select('id', { count: 'exact', head: true })
    .eq('is_active', true).eq('source', 'fincaraiz')
    .or('features->>is_project.is.null,features->>is_project.eq.false')
    .lte('price', MAX_DISPLAY_PRICE);
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
// La restricción real es que son 116.000 inmuebles y Supabase no expone GROUP BY
// por PostgREST. Traerlos todos al servidor para agrupar en memoria son ~116
// peticiones de 1.000 filas y decenas de MB por cada carga del panel: inviable.
// La salida es no tocar nunca la tabla completa:
//   · las OPORTUNIDADES sí se traen enteras (~20.500 filas, 3 columnas) porque
//     el promedio y el mejor descuento no se pueden calcular con un conteo;
//   · bancos (~460) y remates (~690) son pequeños y se traen enteros;
//   · de arriendos solo interesa la ciudad, y son ~10.300 filas;
//   · el total de inmuebles activos por ciudad se resuelve con `head: true`, que
//     no transporta ni una fila, y solo para las ciudades que caben en la tabla.
// El conteo global del sistema se reutiliza de `stats()` en vez de repetirlo:
// ese conteo sobre las 116.000 filas tarda ~3 s por sí solo y ya está cacheado y
// precalentado al arrancar. De paso garantiza que el panel y el dashboard
// publiquen exactamente el mismo número, que es medio problema menos.

const LOTE_ZONAS = 1000;      // tope duro de filas por respuesta de PostgREST
const CONCURRENCIA_ZONAS = 8; // medido: por encima el pool de Supabase deja de mejorar

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
 * POR QUÉ NO SE PAGINA CON `OFFSET`: la primera versión pedía las 21 páginas de
 * oportunidades con `range(20000, 20999)` y compañía. Funcionaba en pruebas
 * aisladas y se caía con «canceling statement due to statement timeout» en
 * cuanto la base tenía algo más de trabajo encima (el precalentamiento de
 * comparables del arranque bastaba), porque cada página profunda obliga a
 * Postgres a recorrer y descartar decenas de miles de filas antes de empezar a
 * devolver. Recortando por rango de `id` no hay nada que descartar: cada franja
 * entra por el índice de la clave primaria y ninguna consulta pasa de ~1.300
 * filas. Sale más barato, y sobre todo deja de depender de que la base esté
 * ociosa.
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
      let qb = consulta(`id, ${columnas}`).order('id').limit(LOTE_ZONAS);
      // La primera vuelta incluye el borde de la franja (`gte`); las siguientes
      // arrancan justo después de la última fila vista (`gt`), que es lo que
      // impide repetirla.
      qb = cursor === null ? qb.gte('id', franja.desde) : qb.gt('id', cursor);
      if (franja.hasta) qb = qb.lt('id', franja.hasta);
      const { data, error } = await qb;
      if (error) throw new Error(`${etiqueta}: ${error.message}`);
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
    const { count, error } = await supabase
      .from('inmuebles').select('id', { count: 'exact', head: true })
      .eq('is_active', true).eq('source', 'fincaraiz').eq('city', ciudad);
    if (error) throw new Error(`zonas/activos(${ciudad}): ${error.message}`);
    activos.set(ciudad, count ?? 0);
  });
  return activos;
}

async function computarZonas(): Promise<TablaZonas> {
  const inicio = Date.now();

  const oportunidadesActivas: ConsultaLote = (columnas) => supabase
    .from('inmuebles').select(columnas)
    .eq('is_active', true).eq('source', 'fincaraiz').eq('is_opportunity', true)
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
  const bancosEnVuelo = sinRechazoHuerfano(traerTodasLasFilas<FilaCiudad>('zonas/bancos', bancosActivos, 'city'));
  const rematesEnVuelo = sinRechazoHuerfano(traerTodasLasFilas<FilaCiudad>('zonas/remates', rematesActivos, 'city'));
  const arriendosEnVuelo = sinRechazoHuerfano(traerTodasLasFilas<FilaCiudad>('zonas/arriendos', arriendosActivos, 'city'));
  const totalEnVuelo = sinRechazoHuerfano(totalActivosDelSistema());

  const oportunidades = await traerTodasLasFilas<FilaOportunidad>(
    'zonas/oportunidades', oportunidadesActivas, 'city, discount_pct, is_high',
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
  });
  log.info(`zonas: ${tabla.zonas.length} ciudades en ${Date.now() - inicio}ms`);
  return tabla;
}
