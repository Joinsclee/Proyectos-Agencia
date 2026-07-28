/**
 * Orquestador del motor de comparables.
 *
 * Pipeline:
 *   1. Carga el BASELINE de mercado: listados activos de FincaRaíz con
 *      precio + área + (geo o ciudad).
 *   2. Carga los CANDIDATOS: todos los inmuebles activos con precio + área
 *      (bancos, y los propios de FincaRaíz vía leave-one-out).
 *   3. Evalúa cada candidato contra el baseline (engine/comparables.ts).
 *   4. Persiste el veredicto en inmuebles: is_opportunity, discount_pct y un
 *      objeto features.market con la trazabilidad (mercado, n, confianza, método).
 *
 * Uso:
 *   tsx engine/run.ts                  # evalúa todo
 *   tsx engine/run.ts --source=davivienda
 *   tsx engine/run.ts --dry            # no escribe, solo reporta
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { isEntrypoint } from '../lib/is-main.js';
import { evaluate, DEFAULT_CONFIG, type Candidate, type Comp, type Verdict } from './comparables.js';
import { MAX_DISPLAY_PRICE } from '../lib/types.js';

const log = createLogger('engine');

/** Veredicto fijo para unidades de proyecto (preventa): no se evalúan. */
const PROJECT_VERDICT: Verdict = {
  evaluable: false,
  is_opportunity: false,
  is_high: false,
  discount_pct: null,
  candidate_ppm2: null,
  market_ppm2: null,
  n_comparables: 0,
  confidence: 'insufficient',
  method: 'proyecto-preventa',
  radius_used_km: null,
  criteria: [],
  crece_index: null,
  crece_tier: null,
  cascada_nivel: null,
};

interface Opts {
  source?: string;
  dry?: boolean;
}

function parseArgs(): Opts {
  const o: Opts = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--source=')) o.source = a.split('=')[1];
    else if (a === '--dry') o.dry = true;
  }
  return o;
}

type Row = {
  id: string;
  source: string;
  source_id: string;
  type: string | null;
  price: number | null;
  area_m2: number | null;
  price_per_m2: number | null;
  city: string | null;
  zone: string | null;
  // Escalares proyectados desde features (NO el features completo: traer los
  // arrays de fotos de 87K filas estanca la transferencia y agota memoria).
  lat: number | null;
  lng: number | null;
  stratum: number | null;
  bedrooms: number | null;
  garages: number | null;
  neighborhood: string | null;
  is_project: boolean | null;
  area_tipo: string | null;
  // Veredicto ya almacenado: permite no reescribir filas cuyo resultado no cambió.
  is_opportunity: boolean | null;
  is_high: boolean | null;
  discount_pct: number | null;
  crece_index: number | null;
  crece_tier: string | null;
  cascada_nivel: string | null;
};

// Proyección JSON: solo los escalares que el motor necesita. 14× menos payload
// que traer `features` entero (medido: 0.8MB vs 11MB / 3 págs).
const SELECT =
  'id, source, source_id, type, price, area_m2, price_per_m2, city, zone, ' +
  'is_opportunity, is_high, discount_pct, crece_index, crece_tier, cascada_nivel, ' +
  'lat:features->lat, lng:features->lng, stratum:features->stratum, ' +
  'bedrooms:features->bedrooms, garages:features->garages, ' +
  'neighborhood:features->neighborhood, is_project:features->is_project, area_tipo:features->area_tipo';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

function toCandidate(r: Row): Candidate {
  return {
    id: r.id,
    source: r.source,
    source_id: r.source_id,
    type: r.type,
    price: num(r.price),
    area_m2: num(r.area_m2),
    lat: num(r.lat),
    lng: num(r.lng),
    stratum: num(r.stratum),
    city: r.city,
    zone: r.zone ?? r.neighborhood ?? null,
    bedrooms: num(r.bedrooms),
    garages: num(r.garages),
    area_tipo: r.area_tipo,
  };
}

/**
 * Carga todas las filas de inmuebles. Paginación por KEYSET (cursor sobre `id`),
 * NO por range/OFFSET: a 87K filas el OFFSET profundo (range(52000,...)) hace que
 * Postgres salte todas las filas previas y exceda el statement_timeout (cód 57014).
 * El keyset (`id > lastId`) usa el índice de PK → O(1) por página, sin timeout.
 */
async function loadAll(filterSource?: string): Promise<Row[]> {
  const rows: Row[] = [];
  const PAGE = 1000;
  let lastId = '00000000-0000-0000-0000-000000000000'; // piso uuid válido ('' no lo es)
  for (;;) {
    const batch = await cargarPagina(lastId, PAGE, filterSource);
    rows.push(...batch);
    if (batch.length < PAGE) break;
    lastId = batch[batch.length - 1].id;
  }
  return rows;
}

/** Códigos y mensajes de Postgres que significan «vuelve a intentarlo». */
const ES_TRANSITORIO = /statement timeout|canceling statement|57014|timeout|ECONNRESET|fetch failed/i;

/**
 * Una página del inventario, con reintentos ante fallo transitorio.
 *
 * El motor lee más de cien páginas seguidas y tarda varios minutos. Medido contra
 * la base real: la mediana de una página es 2,4 s y la peor 4,6 s — ninguna se
 * acerca por sí sola al `statement_timeout`. Aun así la corrida se cayó, y se cayó
 * justo cuando había un scraper escribiendo y varias sesiones leyendo: el problema
 * no es una consulta lenta, es CONTENCIÓN puntual.
 *
 * Contra eso, abortar quince minutos de trabajo por una página que llegó tarde es
 * la peor respuesta posible. Se reintenta esa página, con espera creciente para no
 * empujar más una base que ya va justa. Un error que no sea transitorio —una
 * columna que no existe, un permiso— sigue abortando de inmediato: ahí reintentar
 * solo retrasaría el diagnóstico.
 */
async function cargarPagina(lastId: string, page: number, filterSource?: string): Promise<Row[]> {
  const INTENTOS = 4;
  let ultimo = '';
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    let q = supabase
      .from('inmuebles')
      .select(SELECT)
      .eq('is_active', true)
      .gt('id', lastId)
      .order('id')
      .limit(page);
    if (filterSource) q = q.eq('source', filterSource);
    const { data, error } = await q;
    if (!error) return (data ?? []) as unknown as Row[];

    ultimo = error.message;
    if (!ES_TRANSITORIO.test(ultimo) || intento === INTENTOS) break;
    const espera = 2000 * intento; // 2s, 4s, 6s
    log.warn(`loadAll: página tras ${lastId.slice(0, 8)} falló (${ultimo}). Reintento ${intento}/${INTENTOS - 1} en ${espera / 1000}s`);
    await new Promise((r) => setTimeout(r, espera));
  }
  throw new Error(`loadAll: ${ultimo}`);
}

/**
 * Baseline de mercado = listados FincaRaíz con ppm2 calculable.
 *
 * Recibe las filas ya cargadas en vez de pedirlas: el que llama suele tener en la
 * mano el inventario COMPLETO, y FincaRaíz es el 99,6% de él. Pedirlo aparte
 * traería casi las mismas 116.000 filas por segunda vez.
 */
function poolDesde(rows: Row[]): Comp[] {
  const pool: Comp[] = [];
  for (const r of rows) {
    if (r.is_project === true) continue; // proyectos preventa sesgan la mediana
    if (num(r.price) != null && num(r.price)! > MAX_DISPLAY_PRICE) continue; // super-elevados no van al baseline
    const ppm2 = num(r.price_per_m2);
    const area = num(r.area_m2);
    if (!ppm2 || !area) continue;
    pool.push({
      source_id: r.source_id,
      type: r.type,
      ppm2,
      area_m2: area,
      lat: num(r.lat),
      lng: num(r.lng),
      stratum: num(r.stratum),
      city: r.city,
      zone: r.zone ?? r.neighborhood ?? null,
      bedrooms: num(r.bedrooms),
      garages: num(r.garages),
      area_tipo: r.area_tipo,
    });
  }
  return pool;
}

/**
 * Persiste el veredicto. Como ya NO cargamos features (proyección ligera), hay
 * que cuidar no pisarlo al escribir:
 *  - FincaRaíz (87K filas): solo columnas is_opportunity/discount_pct. NO se
 *    toca features (conserva las fotos). market.* no aplica a su autoanálisis.
 *  - Bancos (~430): merge de features.market re-leyendo SU fila (barato).
 */
async function persist(row: Row, v: Verdict): Promise<boolean> {
  if (row.source === 'fincaraiz') {
    const { error } = await supabase
      .from('inmuebles')
      .update({ is_opportunity: v.is_opportunity, is_high: v.is_high, discount_pct: v.discount_pct,
                crece_index: v.crece_index, crece_tier: v.crece_tier, cascada_nivel: v.cascada_nivel })
      .eq('id', row.id);
    if (error) { log.error(`persist ${row.id}: ${error.message}`); return false; }
    return true;
  }
  // Banco: re-leer features actuales para no perder fotos/descripción al mergear.
  const { data } = await supabase.from('inmuebles').select('features').eq('id', row.id).single();
  const features = {
    ...((data?.features as Record<string, unknown>) ?? {}),
    market: {
      market_ppm2: v.market_ppm2,
      candidate_ppm2: v.candidate_ppm2,
      n_comparables: v.n_comparables,
      confidence: v.confidence,
      method: v.method,
      radius_km: v.radius_used_km,
      criteria: v.criteria, // lo que de verdad se exigió para elegir los comparables
      evaluated_at: new Date().toISOString(),
    },
  };
  const { error } = await supabase
    .from('inmuebles')
    .update({ is_opportunity: v.is_opportunity, is_high: v.is_high, discount_pct: v.discount_pct, features,
              crece_index: v.crece_index, crece_tier: v.crece_tier, cascada_nivel: v.cascada_nivel })
    .eq('id', row.id);
  if (error) { log.error(`persist ${row.id}: ${error.message}`); return false; }
  return true;
}

/** Corre updates en lotes con concurrencia limitada. */
async function persistAll(items: Array<{ row: Row; v: Verdict }>): Promise<number> {
  let ok = 0;
  const CONC = 20;
  for (let i = 0; i < items.length; i += CONC) {
    const slice = items.slice(i, i + CONC);
    const res = await Promise.all(slice.map(({ row, v }) => persist(row, v)));
    ok += res.filter(Boolean).length;
  }
  return ok;
}

export async function run(opts: Opts = parseArgs()) {
  // UNA sola pasada por la tabla siempre que se pueda.
  //
  // El baseline son las filas de FincaRaíz y los candidatos son todas las filas.
  // Pedirlos por separado traía casi el mismo inventario dos veces —FincaRaíz es
  // el 99,6%—: medido, 116 páginas y 285 segundos cada carga. Diez minutos de red
  // para leer dos veces lo mismo, y diez minutos expuestos al `statement_timeout`
  // que ya tumbó la corrida en producción y que se reprodujo en local en cuanto la
  // base tuvo algo más de trabajo encima.
  //
  // Solo cuando se acota a una fuente que NO es FincaRaíz hacen falta dos cargas,
  // porque el baseline siempre es FincaRaíz completo. Pero en ese caso la segunda
  // es de unos cientos de filas, no de cien mil.
  const unaPasada = !opts.source || opts.source === 'fincaraiz';

  log.info(unaPasada ? 'Cargando inventario…' : 'Cargando baseline FincaRaíz…');
  const todas = unaPasada ? await loadAll() : null;
  const pool = poolDesde(todas ? todas.filter((r) => r.source === 'fincaraiz') : await loadAll('fincaraiz'));
  log.info(`Baseline: ${pool.length} comparables (geo: ${pool.filter((p) => p.lat != null).length})`);
  if (pool.length === 0) {
    log.warn('Baseline vacío. Corre primero el scraper de FincaRaíz. Abortando.');
    return { evaluated: 0, opportunities: 0 };
  }

  // Bucketing por ciudad: los comparables geográficos no cruzan entre metros
  // distantes, así que cada candidato solo escanea el pool de su ciudad. Convierte
  // un O(n²) global en O(Σ n_ciudad²) — clave para escalar a decenas de miles.
  const poolByCity = new Map<string, Comp[]>();
  for (const c of pool) {
    const key = c.city ?? '';
    if (!poolByCity.has(key)) poolByCity.set(key, []);
    poolByCity.get(key)!.push(c);
  }

  // Los candidatos salen de la carga que ya se hizo; solo se vuelve a la base
  // cuando se acotó a una fuente distinta de FincaRaíz.
  const candidates = todas
    ? (opts.source ? todas.filter((r) => r.source === opts.source) : todas)
    : await loadAll(opts.source);
  log.info(`Candidatos: ${candidates.length}`);

  const toWrite: Array<{ row: Row; v: Verdict }> = [];
  const tally = { opp: 0, high: 0, insuff: 0, evaluable: 0 };
  const bySource: Record<string, { opp: number; total: number }> = {};

  for (const row of candidates) {
    // Proyectos preventa: no son oportunidades de reventa; marcar no-oportunidad
    // sin evaluar (y limpiar cualquier flag previo).
    if (row.is_project === true) {
      toWrite.push({ row, v: { ...PROJECT_VERDICT } });
      bySource[row.source] ??= { opp: 0, total: 0 };
      bySource[row.source].total++;
      continue;
    }
    const cand = toCandidate(row);
    const cityPool = poolByCity.get(cand.city ?? '') ?? [];
    const v = evaluate(cand, cityPool, DEFAULT_CONFIG);
    if (v.evaluable) tally.evaluable++;
    if (v.confidence === 'insufficient' && v.method === 'sin-datos') tally.insuff++;
    if (v.is_opportunity) tally.opp++;
    if (v.is_high) tally.high++;
    bySource[row.source] ??= { opp: 0, total: 0 };
    bySource[row.source].total++;
    if (v.is_opportunity) bySource[row.source].opp++;
    toWrite.push({ row, v });
  }

  log.info('─'.repeat(50));
  log.info(`Evaluables: ${tally.evaluable}/${candidates.length} · sin comparables: ${tally.insuff}`);
  log.info(`Oportunidades: ${tally.opp} (altas: ${tally.high})`);
  for (const [src, s] of Object.entries(bySource)) {
    log.info(`  ${src.padEnd(16)} ${s.opp}/${s.total} oportunidades`);
  }

  if (opts.dry) {
    log.info('DRY: no se escribió nada.');
    return { evaluated: candidates.length, opportunities: tally.opp };
  }

  // Escribir SOLO lo que cambió: en un re-run diario la mayoría de veredictos son
  // idénticos y reescribir las 100K+ filas cuesta ~20 min de UPDATEs inútiles que
  // además saturan la base para el resto de la app. Los de banco siempre se
  // escriben (ahí guardamos el detalle de mercado que consume la ficha).
  const changed = toWrite.filter(({ row, v }) => {
    if (row.source !== 'fincaraiz') return true;
    const same = (row.is_opportunity ?? false) === v.is_opportunity
      && (row.is_high ?? false) === v.is_high
      && (row.crece_tier ?? null) === (v.crece_tier ?? null)
      && Math.round((row.crece_index ?? -1) * 100) === Math.round((v.crece_index ?? -1) * 100)
      && Math.round((row.discount_pct ?? -999) * 10) === Math.round((v.discount_pct ?? -999) * 10);
    return !same;
  });
  log.info(`Persistiendo veredictos… ${changed.length} con cambios (${toWrite.length - changed.length} sin cambio, se omiten)`);
  const written = await persistAll(changed);
  log.info(`✅ ${written}/${changed.length} filas actualizadas`);
  return { evaluated: candidates.length, opportunities: tally.opp, written };
}

if (isEntrypoint(import.meta.url)) {
  run()
    .then((r) => {
      log.info('Done', r);
      process.exit(0);
    })
    .catch((e) => {
      log.error('Failed', e);
      process.exit(1);
    });
}
