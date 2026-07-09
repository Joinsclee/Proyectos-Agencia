/**
 * Scraper FincaRaíz (Fuente C — portal abierto).
 *
 * Descubrimiento clave: FincaRaíz es Next.js y sirve TODAS las propiedades
 * embebidas en `<script id="__NEXT_DATA__">` (SSR). No hace falta browser,
 * ni Apify, ni Firecrawl: basta `fetch()` del HTML + parseo del JSON.
 *   Ruta: props.pageProps.fetchResult.searchFast.{data, paginatorInfo}
 *   Cada propiedad = 127 campos (precio exacto, m2, estrato, lat/lng, ...).
 *
 * Pipeline:
 *   1. Carga zonas activas de radar_zonas_monitoreadas (fallback piloto).
 *   2. Por zona: itera /pagina{N} hasta min(lastPage, max_pages).
 *   3. Mapea → Inmueble (source='fincaraiz'), filtra por elegibilidad de zona.
 *   4. Upsert incremental a `inmuebles` (alimenta el motor de comparables).
 *
 * Estrategia de zonas: scrape a nivel BARRIO (radar_zonas_monitoreadas con
 * neighborhood_slug). El SSR por barrio devuelve un set homogéneo y pequeño
 * (≤ ~600 avisos), así las comparables son realmente comparables. A nivel
 * ciudad serían 10.754 apts dominados por El Poblado (estrato 6), inútiles.
 * Guardamos TODO el baseline (no filtramos por elegibilidad acá); el motor de
 * comparables y el dashboard aplican el segmento después, matcheando además
 * por radio geográfico (lat/lng viene geocodificado en cada aviso).
 *
 * Uso:
 *   tsx scrapers/CO/fincaraiz/index.ts                 # todas las zonas activas
 *   tsx scrapers/CO/fincaraiz/index.ts --zona=robledo  # solo un barrio (o --city=)
 *   tsx scrapers/CO/fincaraiz/index.ts --max-pages=3   # límite de páginas (debug)
 *   tsx scrapers/CO/fincaraiz/index.ts --dry           # no escribe a DB
 */
import 'dotenv/config';
import { createLogger } from '../../../lib/logger.js';
import { isEntrypoint } from '../../../lib/is-main.js';
import {
  upsertInmuebles,
  markStaleInmuebles,
  startScrapingLog,
  finishScrapingLog,
} from '../../../lib/supabase.js';
import type { Inmueble } from '../../../lib/types.js';
import { loadActiveZonas, zonaLabel, type RadarZona } from './zonas.js';
import { mapFincaRaiz, isEligible, type FincaRaizRaw } from './parser.js';

const log = createLogger('fincaraiz');

const BASE = 'https://www.fincaraiz.com.co';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SOURCE = 'fincaraiz';
const COUNTRY = 'CO';
const FLUSH_EVERY = 120; // items acumulados antes de un upsert incremental
const PAGE_CONCURRENCY = 10; // páginas fetcheadas en paralelo por lote (16 validado seguro; 10 = cortés)

interface Opts {
  slug?: string; // filtra por neighborhood_slug o city_slug
  maxPages?: number;
  dry?: boolean;
}

function parseArgs(): Opts {
  const o: Opts = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--zona=')) o.slug = a.split('=')[1];
    else if (a.startsWith('--city=')) o.slug = a.split('=')[1];
    else if (a.startsWith('--max-pages=')) o.maxPages = Number(a.split('=')[1]);
    else if (a === '--dry') o.dry = true;
  }
  return o;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function zoneUrl(z: RadarZona, page: number): string {
  // /{op}/{tipo}/{barrio?}/{ciudad}/{depto}[/paginaN]
  const segs = [z.operation, z.property_type, z.neighborhood_slug, z.city_slug, z.dept_slug].filter(Boolean);
  const path = `/${segs.join('/')}`;
  return page <= 1 ? `${BASE}${path}` : `${BASE}${path}/pagina${page}`;
}

interface PageResult {
  data: FincaRaizRaw[];
  lastPage: number;
  total: number;
}

/** Descarga una página y extrae searchFast del __NEXT_DATA__. Retry 3x con backoff. */
async function fetchPage(url: string): Promise<PageResult | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) throw new Error('sin __NEXT_DATA__');
      const json = JSON.parse(m[1]);
      const sf = json?.props?.pageProps?.fetchResult?.searchFast;
      if (!sf) throw new Error('sin searchFast');
      return {
        data: (sf.data ?? []) as FincaRaizRaw[],
        lastPage: Number(sf.paginatorInfo?.lastPage ?? 1),
        total: Number(sf.paginatorInfo?.total ?? 0),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 3) {
        log.error(`  ✖ ${url} falló tras 3 intentos: ${msg}`);
        return null;
      }
      log.warn(`  ⚠ intento ${attempt} falló (${msg}); reintento…`);
      await sleep(1200 * attempt);
    }
  }
  return null;
}

interface ZoneStats {
  zona: string;
  pages: number;
  seen: number;
  eligible: number;
  total_portal: number;
  completed: boolean; // alcanzó lastPage (no quedó capado por max_pages)
}

export async function run(opts: Opts = parseArgs()) {
  const runStartISO = new Date().toISOString();
  const zonas = await loadActiveZonas(opts.slug);
  if (zonas.length === 0) {
    log.warn('No hay zonas activas que coincidan. Nada que hacer.');
    return { records_found: 0, records_inserted: 0, errors: [] };
  }

  log.info(`Zonas a procesar: ${zonas.map(zonaLabel).join(', ')}${opts.dry ? ' (DRY)' : ''}`);
  const logId = opts.dry ? null : await startScrapingLog(SOURCE, COUNTRY);

  const errors: Array<{ message: string; context?: unknown }> = [];
  const stats: ZoneStats[] = [];
  let buffer: Inmueble[] = [];
  let totalInserted = 0;

  const flush = async (force = false) => {
    if (opts.dry || buffer.length === 0) return;
    if (!force && buffer.length < FLUSH_EVERY) return;
    const batch = buffer;
    buffer = [];
    const r = await upsertInmuebles(batch);
    totalInserted += r.inserted;
    errors.push(...r.errors.map((e) => ({ message: e.message })));
    log.info(`  ⤓ flush: ${r.inserted} filas tocadas (acum ${totalInserted})`);
  };

  for (const z of zonas) {
    // hardCap: tope de seguridad. opts.maxPages (CLI) manda; si la zona trae
    // max_pages<=0 se interpreta "auto" = paginar hasta lastPage (city-deep).
    const cliCap = opts.maxPages && opts.maxPages > 0 ? opts.maxPages : null;
    const zoneCap = z.max_pages && z.max_pages > 0 ? z.max_pages : null;
    const hardCap = cliCap ?? zoneCap ?? Infinity;
    const label = zonaLabel(z);
    log.info(`▸ ${label} · ${z.operation}/${z.property_type} (tope ${hardCap === Infinity ? 'auto' : hardCap} págs)`);
    const st: ZoneStats = { zona: label, pages: 0, seen: 0, eligible: 0, total_portal: 0, completed: false };

    const ingest = (data: FincaRaizRaw[]) => {
      st.seen += data.length;
      for (const raw of data) {
        const it = mapFincaRaiz(raw, z);
        if (!it) continue;
        // Guardamos TODO el baseline; isEligible solo cuenta para el reporte.
        if (isEligible(it, z)) st.eligible++;
        buffer.push(it);
      }
    };

    // Página 1: lee total/lastPage real de la zona.
    const first = await fetchPage(zoneUrl(z, 1));
    if (!first) {
      errors.push({ message: `${label} pagina 1 no disponible` });
      stats.push(st);
      continue;
    }
    const lastPage = first.lastPage;
    st.total_portal = first.total;
    // Guard: pág 1 vacía (slug que redirige a vacío) → saltar zona SIN completar.
    if (first.data.length === 0) {
      log.warn(`  ${label}: 0 avisos en pág 1 (slug inválido o redirect). Salto la zona.`);
      stats.push(st);
      continue;
    }
    ingest(first.data);
    st.pages = 1;
    await flush();

    // Páginas 2..limit en LOTES CONCURRENTES (la investigación validó 16 hilos
    // sin rate-limit; usamos PAGE_CONCURRENCY para ser corteses). El upsert dedup
    // por source_id absorbe los duplicados que el reorder por popularidad genera.
    const limit = Math.min(lastPage, hardCap);
    for (let start = 2; start <= limit; start += PAGE_CONCURRENCY) {
      const pages: number[] = [];
      for (let pg = start; pg < start + PAGE_CONCURRENCY && pg <= limit; pg++) pages.push(pg);
      const results = await Promise.all(pages.map((pg) => fetchPage(zoneUrl(z, pg))));
      results.forEach((res, i) => {
        if (!res) { errors.push({ message: `${label} pagina ${pages[i]} no disponible` }); return; }
        ingest(res.data);
        st.pages = Math.max(st.pages, pages[i]);
      });
      await flush();
      await sleep(80 + Math.floor(Math.random() * 120)); // pausa cortés entre lotes
    }
    st.completed = limit >= lastPage; // completo si el tope no cortó antes del final
    log.info(`  ${label}: ${st.seen} avisos (${st.eligible} en segmento; portal: ${st.total_portal}; ${st.completed ? 'completo' : 'parcial'})`);
    stats.push(st);
  }

  await flush(true);

  // Marcado de stale SOLO si el scrape fue completo para todas las zonas
  // (alcanzamos lastPage en cada una). Como muestreamos max_pages << lastPage,
  // normalmente NO completamos → no marcamos stale para evitar desactivar
  // listings que solo se movieron de página. El historial de precios + last_seen_at
  // siguen reflejando frescura.
  const fullRun = !opts.slug && !opts.maxPages && !opts.dry && stats.every((s) => s.completed);
  let inactivated = 0;
  if (fullRun) {
    const r = await markStaleInmuebles(SOURCE, COUNTRY, runStartISO);
    inactivated = r.deactivated;
  } else if (!opts.dry) {
    log.info('Scrape por muestreo (no completo) → se omite marcado de stale.');
  }

  const totalSeen = stats.reduce((a, s) => a + s.seen, 0);
  const totalEligible = stats.reduce((a, s) => a + s.eligible, 0);

  if (!opts.dry) {
    await finishScrapingLog(logId, errors.length === 0 ? 'success' : 'partial', {
      records_found: totalSeen,
      records_inserted: totalInserted,
      records_updated: 0,
      errors,
      meta: { run_start: runStartISO, zonas: stats, eligible: totalEligible, inactivated, full_run: fullRun },
    });
  }

  log.info(
    `✅ FincaRaíz: ${totalSeen} avisos baseline (${totalEligible} en segmento) · ${totalInserted} filas${opts.dry ? ' (DRY, no escrito)' : ''}`,
  );
  return { records_found: totalSeen, records_inserted: totalInserted, records_eligible: totalEligible, errors };
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
