/**
 * Capa de datos del servidor local (entorno "real"): consulta Supabase EN VIVO
 * con filtros + paginación. A diferencia del HTML estático para GHL, acá no hay
 * topes — se devuelven todos los resultados de cada ciudad, paginados.
 */
import { supabase } from '../lib/supabase.js';
import { MAX_DISPLAY_PRICE, MAX_OPP_DISCOUNT } from '../lib/types.js';

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
      qb = qb.eq('is_opportunity', true).gte('discount_pct', 25).eq('features->market->>confidence', 'high');
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
    .neq('source', 'fincaraiz');

  qb = applyInmuebleFilters(qb, q);
  if (q.opp === '1') qb = qb.eq('is_opportunity', true);
  qb = applyOrderInmuebles(qb, q.order ?? 'precio_m2_asc');
  qb = qb.range(from, from + pageSize - 1);

  const { data, count, error } = await qb;
  if (error) throw new Error(`queryBancos: ${error.message}`);
  const total = count ?? 0;
  return { data: data ?? [], total, page, pageSize, pages: Math.ceil(total / pageSize) };
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
  return { data: data ?? [], total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Una sola propiedad por id (para abrir una recomendación en su modal). */
export async function getProperty(kind: 'portal' | 'banco' | 'remate', id: string) {
  const table = kind === 'remate' ? 'remates' : 'inmuebles';
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) return null;
  return data;
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
  qb = source === 'portal' ? qb.eq('source', 'fincaraiz') : qb.neq('source', 'fincaraiz');
  if (city) qb = qb.eq('city', city);
  const { data, error } = await qb;
  if (error) throw new Error(`facets: ${error.message}`);
  const cities = [...new Set((data ?? []).map((r) => r.city).filter(Boolean))].sort();
  const zones = [...new Set((data ?? []).map((r) => r.zone).filter(Boolean))].sort();
  const types = [...new Set((data ?? []).map((r) => r.type).filter(Boolean))].sort();
  return { cities, zones, types };
}

/** Métricas de portada: totales y oportunidades por ciudad. */
export async function stats() {
  const head = (q: any) => q.then((r: any) => r.count ?? 0);
  const base = () => supabase.from('inmuebles').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'fincaraiz');
  const [total, opps, high, bancos, remates] = await Promise.all([
    head(base()),
    head(base().eq('is_opportunity', true).lte('discount_pct', MAX_OPP_DISCOUNT)),
    head(base().eq('is_opportunity', true).gte('discount_pct', 25).lte('discount_pct', MAX_OPP_DISCOUNT).eq('features->market->>confidence', 'high')),
    head(supabase.from('inmuebles').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('source', 'fincaraiz')),
    head(supabase.from('remates').select('id', { count: 'exact', head: true }).eq('is_active', true)),
  ]);

  // Lista de ciudades del portal (solo nombres). Antes se hacían 2 counts por
  // ciudad (~266 consultas) que saturaban Supabase al iniciar, y la UI solo usa
  // la CANTIDAD de ciudades — así que basta la lista.
  const { cities } = await facets('portal');
  const perCity = cities.map((c) => ({ city: c }));

  return { portal_total: total, portal_opps: opps, portal_high: high, bancos, remates, perCity };
}
