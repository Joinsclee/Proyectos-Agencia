/**
 * Scraper de rematandobienes.com
 *
 * Pipeline:
 *  1. Restaura la sesión de `_session/remates-storage.json` (requiere `npm run remates:login` previo).
 *  2. Itera /departamento/{slug}/  → /ciudad/{slug}/  → /remates-judiciales/{slug}/
 *  3. Para cada aviso: extrae jet_fields + full_text + categorías y parsea con `parser.ts`.
 *  4. Upsert a Supabase y refresca `last_seen_at`.
 *  5. Al final del run: marca como `is_active=false` los avisos NO vistos
 *     (alimenta el reporte "salidos del portal").
 *
 * Modo de ejecución:
 *  - Por defecto, headed (más estable contra Cloudflare).
 *  - REMATES_HEADLESS=1 para forzar headless cuando dejemos esto en un cron Linux.
 *
 * Modos de prueba:
 *  - `--dept=cundinamarca`  limita a un solo departamento
 *  - `--city=la-vega`        limita a una sola ciudad (slug)
 *  - `--max=10`              límite de avisos a procesar (debug)
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { createLogger } from '../../../lib/logger.js';
import { isEntrypoint } from '../../../lib/is-main.js';
import { upsertRemates, markInactiveRemates } from '../../../lib/remates-db.js';
import { startScrapingLog, finishScrapingLog } from '../../../lib/supabase.js';
import { parseAviso } from './parser.js';
import type { RemateAvisoRaw, Remate } from './types.js';

const log = createLogger('rematandobienes');

const BASE_URL = process.env.REMATES_BASE_URL ?? 'https://rematandobienes.com';
const STORAGE_PATH = join(process.cwd(), '_session', 'remates-storage.json');
const SOURCE = 'rematandobienes';
const COUNTRY = 'CO';

// Parámetros CLI
interface Opts {
  dept?: string;        // ej. "cundinamarca" (modo navegación por menú — solo tests)
  city?: string;        // ej. "la-vega"
  maxAvisos?: number;   // límite total de avisos
  headless?: boolean;
  useSitemap?: boolean; // sitemap XML (incluye ~600 muertos 404) — NO recomendado
  useSitemapAlive?: boolean;
  useArchive?: boolean; // ⭐ blog archive /remates-judiciales/page/N/ — TODOS los avisos vivos (default)
}

function parseArgs(): Opts {
  const args = process.argv.slice(2);
  const o: Opts = {};
  for (const a of args) {
    if (a.startsWith('--dept=')) o.dept = a.split('=')[1];
    else if (a.startsWith('--city=')) o.city = a.split('=')[1];
    else if (a.startsWith('--max=')) o.maxAvisos = parseInt(a.split('=')[1]!, 10);
    else if (a === '--sitemap') o.useSitemap = true;
    else if (a === '--sitemap-alive') o.useSitemapAlive = true;
    else if (a === '--archive') o.useArchive = true;
  }
  if (process.env.REMATES_HEADLESS === '1') o.headless = true;
  // DEFAULT: blog archive. Es la única fuente que da TODOS los avisos vivos
  // (~597) sin los 404 zombies del sitemap ni el cap de paginación del menú.
  if (!o.dept && !o.city && !o.useSitemap && !o.useSitemapAlive) o.useArchive = true;
  return o;
}

// ──────────────────────────────────────────────────────────────────
// Blog archive Woodmart: /remates-judiciales/page/N/ → 8 avisos/página.
// Es la fuente canónica de TODOS los avisos VIVOS (WordPress post archive).
// El sitemap XML lista ~600 muertos (404); el menú depto/ciudad capa a ~8/ciudad.
// Esta paginación recorre las ~75 páginas hasta el primer 404.
// ──────────────────────────────────────────────────────────────────
async function listAvisosFromArchive(page: Page): Promise<Array<{ url: string; slug: string; title: string }>> {
  const all = new Map<string, { url: string; slug: string; title: string }>();
  let pageNum = 1;
  let prevFirst = '';
  const MAX_PAGES = 120;

  while (pageNum <= MAX_PAGES) {
    // Página 1 = /remates-judiciales/ (WordPress redirige /page/1/ → base).
    const url = pageNum === 1
      ? `${BASE_URL}/remates-judiciales/`
      : `${BASE_URL}/remates-judiciales/page/${pageNum}/`;

    // goto propio con detección por status HTTP (NO gotoSafe: su networkidle deja
    // que el script load-on-scroll de Woodmart altere page.url() y rompa el loop).
    // Retry: un blip de red NO debe abortar el listado entero. Distinguimos un
    // 404 real (fin de paginación) de un error transitorio (timeout/red).
    let resp: Awaited<ReturnType<typeof page.goto>> = null;
    let lastErr = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        .catch((e) => { lastErr = (e as Error).message.substring(0, 60); return null; });
      if (resp) break;
      if (attempt < 3) {
        log.warn(`  archive page ${pageNum}: intento ${attempt} falló (${lastErr}). Reintentando…`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    if (!resp) {
      // Tras 3 intentos sin respuesta: tratamos como error transitorio, NO como fin.
      // Saltamos esta página pero seguimos (mejor perder 8 avisos que abortar 597).
      log.warn(`  archive page ${pageNum}: sin respuesta tras 3 intentos — saltando página`);
      pageNum++;
      continue;
    }
    if (resp.status() === 404) {
      log.info(`  archive page ${pageNum}: HTTP 404 → fin (total ${all.size})`);
      break;
    }

    const items = await page.$$eval('a[href*="/remates-judiciales/"]', (els) => {
      const seen = new Set<string>();
      const out: Array<{ url: string; slug: string; title: string }> = [];
      for (const el of els) {
        const a = el as HTMLAnchorElement;
        const u = a.href.split('?')[0].split('#')[0];
        const m = u.match(/\/remates-judiciales\/([^/]+)\/?$/);
        if (!m) continue;
        const slug = m[1]!;
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push({ url: u, slug, title: (a.getAttribute('title') || a.innerText || '').trim() });
      }
      return out;
    });

    if (items.length === 0) { log.info(`  archive page ${pageNum}: 0 avisos → fin (total ${all.size})`); break; }
    if (items[0]!.url === prevFirst) { log.info(`  archive page ${pageNum}: repite → fin (total ${all.size})`); break; }
    prevFirst = items[0]!.url;

    for (const it of items) if (!all.has(it.slug)) all.set(it.slug, it);
    if (pageNum % 10 === 0) log.info(`  archive page ${pageNum}: acumulado ${all.size}`);
    pageNum++;
  }
  return [...all.values()];
}

// ──────────────────────────────────────────────────────────────────
// Sitemap: fuente exhaustiva de URLs (vs menú con paginación oculta)
// ──────────────────────────────────────────────────────────────────
async function listAvisosFromSitemap(): Promise<Array<{ url: string; slug: string; title: string }>> {
  const sitemaps = [
    `${BASE_URL}/remates-judiciales-sitemap1.xml`,
    `${BASE_URL}/remates-judiciales-sitemap2.xml`,
    `${BASE_URL}/remates-judiciales-sitemap3.xml`,
    `${BASE_URL}/remates-judiciales-sitemap4.xml`,
  ];
  const allUrls = new Map<string, string>(); // slug → url
  for (const sm of sitemaps) {
    try {
      const r = await fetch(sm, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RadarMVP/1.0)' },
      });
      if (!r.ok) {
        log.warn(`  sitemap ${sm}: HTTP ${r.status}`);
        continue;
      }
      const xml = await r.text();
      // Extraer <loc>URL</loc> que sean de remates-judiciales
      const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
      for (const m of matches) {
        const u = m[1]!.trim();
        const slugMatch = u.match(/\/remates-judiciales\/([^/]+)\/?$/);
        if (!slugMatch) continue;
        allUrls.set(slugMatch[1]!, u);
      }
    } catch (e) {
      log.warn(`  sitemap fetch ${sm}: ${(e as Error).message}`);
    }
  }
  return [...allUrls.entries()].map(([slug, url]) => ({ url, slug, title: '' }));
}

/** Infiere department y city desde los jet_fields del aviso (extracción en página). */
function inferDeptCityFromUrl(url: string): { dept: string; city: string } {
  // Para avisos extraídos por sitemap no tenemos contexto de la URL padre.
  // El parser usará el contenido del aviso (jet_field 2 = depto, dirección) para
  // determinar dept/city. Acá retornamos vacíos como ctx por defecto.
  return { dept: '', city: '' };
}

// ──────────────────────────────────────────────────────────────────
async function gotoSafe(page: Page, url: string): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
      return true;
    } catch (e) {
      log.warn(`  intento ${i + 1} falló: ${(e as Error).message.substring(0, 80)}`);
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────
// Extracción de páginas
// ──────────────────────────────────────────────────────────────────
async function listDepartments(page: Page, only?: string): Promise<Array<{ slug: string; url: string }>> {
  await gotoSafe(page, BASE_URL);
  const all = await page.$$eval('a[href*="/departamento/"]', (els) => {
    const seen = new Set<string>();
    const out: Array<{ slug: string; url: string }> = [];
    for (const el of els) {
      const a = el as HTMLAnchorElement;
      const m = a.href.match(/\/departamento\/([^/]+)\/?/);
      if (!m) continue;
      const slug = m[1]!;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, url: a.href.split('?')[0].split('#')[0] });
    }
    return out;
  });
  return only ? all.filter((d) => d.slug === only) : all;
}

async function listCities(page: Page, deptUrl: string, only?: string): Promise<Array<{ slug: string; label: string; url: string }>> {
  await gotoSafe(page, deptUrl);
  const all = await page.$$eval('a[href*="/ciudad/"]', (els) => {
    const seen = new Set<string>();
    const out: Array<{ slug: string; label: string; url: string }> = [];
    for (const el of els) {
      const a = el as HTMLAnchorElement;
      const m = a.href.match(/\/ciudad\/([^/]+)\/?/);
      if (!m) continue;
      const slug = m[1]!;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, label: (a.innerText || '').trim(), url: a.href.split('?')[0].split('#')[0] });
    }
    return out;
  });
  return only ? all.filter((c) => c.slug === only) : all;
}

async function listAvisos(page: Page, cityUrl: string): Promise<Array<{ url: string; slug: string; title: string }>> {
  await gotoSafe(page, cityUrl);
  return await page.$$eval('a[href*="/remates-judiciales/"]', (els) => {
    const seen = new Set<string>();
    const out: Array<{ url: string; slug: string; title: string }> = [];
    for (const el of els) {
      const a = el as HTMLAnchorElement;
      const m = a.href.match(/\/remates-judiciales\/([^/]+)\/?/);
      if (!m) continue;
      const slug = m[1]!;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({
        url: a.href.split('?')[0].split('#')[0],
        slug,
        title: (a.getAttribute('title') || a.innerText || '').trim(),
      });
    }
    return out;
  });
}

async function extractAvisoRaw(
  page: Page,
  aviso: { url: string; slug: string; title: string },
  ctx: { department_slug: string; city_slug: string; city_label: string },
): Promise<RemateAvisoRaw | null> {
  const ok = await gotoSafe(page, aviso.url);
  if (!ok) return null;

  // OJO: evaluate sin funciones helper internas (problema __name de esbuild).
  const data = await page.evaluate(() => {
    const jets = document.querySelectorAll('.elementor-widget-jet-listing-dynamic-field');
    const jet_field_texts: string[] = [];
    jets.forEach((el) => {
      const html = el as HTMLElement;
      jet_field_texts.push((html.innerText || '').trim());
    });

    const cats: string[] = [];
    document.querySelectorAll('a[href*="/category/"], a[href*="/tipo/"], a[rel="tag"]').forEach((a) => {
      const t = ((a as HTMLAnchorElement).innerText || '').trim();
      if (t && cats.indexOf(t) === -1) cats.push(t);
    });

    // Cuando llegamos vía sitemap NO conocemos depto/ciudad del contexto.
    // Buscamos en el propio aviso los breadcrumbs / links a /departamento/{x}/ y /ciudad/{y}/.
    let dept_in_aviso = '';
    let city_in_aviso = '';
    let city_label_in_aviso = '';
    const deptLink = document.querySelector('a[href*="/departamento/"]') as HTMLAnchorElement | null;
    if (deptLink) {
      const m = deptLink.href.match(/\/departamento\/([^/]+)\//);
      if (m) dept_in_aviso = m[1]!;
    }
    const cityLink = document.querySelector('a[href*="/ciudad/"]') as HTMLAnchorElement | null;
    if (cityLink) {
      const m = cityLink.href.match(/\/ciudad\/([^/]+)\//);
      if (m) city_in_aviso = m[1]!;
      city_label_in_aviso = (cityLink.innerText || '').trim();
    }

    return {
      jet_field_texts,
      full_text: document.body.innerText.substring(0, 12_000),
      categories: cats,
      title: document.title,
      dept_in_aviso,
      city_in_aviso,
      city_label_in_aviso,
    };
  });

  return {
    url: aviso.url,
    slug: aviso.slug,
    // Si vinimos del menú, usamos ctx; si no, lo que el aviso mismo declara.
    department_slug: ctx.department_slug || data.dept_in_aviso,
    city_slug: ctx.city_slug || data.city_in_aviso,
    city_label: ctx.city_label || data.city_label_in_aviso,
    jet_field_texts: data.jet_field_texts,
    full_text: data.full_text,
    categories: data.categories,
    title: aviso.title || data.title,
  };
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────
export async function run(opts: Opts = {}): Promise<{
  records_found: number;
  records_inserted: number;
  records_inactivated: number;
  errors: Array<{ message: string }>;
}> {
  const args = { ...parseArgs(), ...opts };

  if (!existsSync(STORAGE_PATH)) {
    throw new Error(`No hay sesión guardada en ${STORAGE_PATH}. Corre primero: npm run remates:login`);
  }

  const runStartISO = new Date().toISOString();
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const errors: Array<{ message: string }> = [];

  const browser = await chromium.launch({ headless: !!args.headless });
  const context: BrowserContext = await browser.newContext({
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: STORAGE_PATH,
  });
  context.setDefaultNavigationTimeout(90_000);
  context.setDefaultTimeout(45_000);
  const page = await context.newPage();

  const remates: Remate[] = [];
  let processed = 0;
  let savedTotal = 0; // filas ya guardadas por flushes incrementales (modo archive)

  /**
   * Procesa una lista de URLs sueltas (provenientes del sitemap-alive),
   * extrayendo dept/city del aviso mismo.
   */
  async function procesarUrlsSueltas(avisos: Array<{ url: string; slug: string; title: string }>): Promise<void> {
    log.info(`▶ Procesando ${avisos.length} avisos sueltos (sitemap-alive)`);
    for (const aviso of avisos) {
      if (args.maxAvisos && processed >= args.maxAvisos) break;
      try {
        const raw = await extractAvisoRaw(page, aviso, {
          department_slug: '',
          city_slug: '',
          city_label: '',
        });
        if (!raw) { errors.push({ message: `extract failed: ${aviso.url}` }); continue; }
        const remate = parseAviso(raw);
        if (!remate.source_id || !remate.city) {
          errors.push({ message: `aviso inválido (sin source_id o city): ${aviso.url}` });
          continue;
        }
        remates.push(remate);
        processed++;
      } catch (err) {
        errors.push({ message: `parse ${aviso.url}: ${(err as Error).message}` });
      }
    }
  }

  try {
    if (args.useArchive) {
      // ⭐ MODO ARCHIVE (DEFAULT): pagina el blog Woodmart /remates-judiciales/page/N/.
      // Es la ÚNICA fuente que da TODOS los avisos VIVOS (~597) sin los 404
      // zombies del sitemap ni el cap del menú. department/city se infieren del
      // aviso mismo en extractAvisoRaw.
      //
      // ⭐ UPSERT INCREMENTAL POR LOTES: en vez de acumular los 597 en memoria y
      // hacer un solo upsert al final (frágil: un blip de red de 40 min lo pierde
      // todo), guardamos cada FLUSH_EVERY avisos. Así un fallo solo pierde el lote
      // en curso, no las 40 minutos de trabajo.
      const FLUSH_EVERY = 40;
      log.info('Listando avisos desde blog archive (paginación completa)…');
      const avisos = await listAvisosFromArchive(page);
      log.info(`  ${avisos.length} avisos vivos en archive`);
      const targets = args.maxAvisos ? avisos.slice(0, args.maxAvisos) : avisos;
      let i = 0;
      let batch: Remate[] = [];
      for (const aviso of targets) {
        i++;
        if (i % 25 === 0) log.info(`  …${i}/${targets.length} procesados (${remates.length} OK, ${savedTotal} guardados)`);
        try {
          const raw = await extractAvisoRaw(page, aviso, { department_slug: '', city_slug: '', city_label: '' });
          if (!raw) { errors.push({ message: `extract failed: ${aviso.url}` }); continue; }
          const remate = parseAviso(raw);
          if (!remate.source_id || !remate.city) {
            errors.push({ message: `aviso inválido (sin source_id o city): ${aviso.url}` });
            continue;
          }
          remates.push(remate);
          batch.push(remate);
          processed++;

          // Flush periódico
          if (batch.length >= FLUSH_EVERY) {
            const up = await upsertRemates(batch);
            savedTotal += up.inserted;
            if (up.errors.length) errors.push(...up.errors);
            batch = [];
          }
        } catch (err) {
          errors.push({ message: `parse ${aviso.url}: ${(err as Error).message}` });
        }
      }
      // Flush final del lote restante
      if (batch.length > 0) {
        const up = await upsertRemates(batch);
        savedTotal += up.inserted;
        if (up.errors.length) errors.push(...up.errors);
      }
    } else if (args.useSitemap) {
      // MODO SITEMAP: lista exhaustiva (~800 URLs) directo de los sitemaps XML.
      // No requiere navegar el menú con paginación oculta. department/city
      // se inferirán del aviso mismo en `extractAvisoRaw`.
      log.info('Obteniendo lista de avisos desde sitemap…');
      const avisos = await listAvisosFromSitemap();
      log.info(`  ${avisos.length} avisos en sitemap`);

      const limit = args.maxAvisos ?? avisos.length;
      let i = 0;
      for (const aviso of avisos) {
        if (processed >= limit) {
          log.info(`Límite de --max=${args.maxAvisos} alcanzado. Cortando.`);
          break;
        }
        i++;
        if (i % 20 === 0) log.info(`  …${i}/${avisos.length} (${remates.length} OK)`);
        try {
          const raw = await extractAvisoRaw(page, aviso, {
            department_slug: '',
            city_slug: '',
            city_label: '',
          });
          if (!raw) {
            errors.push({ message: `extract failed: ${aviso.url}` });
            continue;
          }
          const remate = parseAviso(raw);
          if (!remate.source_id || !remate.city) {
            errors.push({ message: `aviso inválido (sin source_id o city): ${aviso.url}` });
            continue;
          }
          remates.push(remate);
          processed++;
        } catch (err) {
          errors.push({ message: `parse ${aviso.url}: ${(err as Error).message}` });
        }
      }
    } else if (args.useSitemapAlive) {
      // MODO SITEMAP-ALIVE: usa la lista pre-filtrada en _session/remates-sitemap-alive.json
      const alivePath = join(process.cwd(), '_session', 'remates-sitemap-alive.json');
      if (!existsSync(alivePath)) {
        throw new Error(`No existe ${alivePath}. Corre primero: tsx scripts/check-sitemap-alive.ts`);
      }
      const data = JSON.parse(readFileSync(alivePath, 'utf8')) as { urls: string[] };
      const avisos = data.urls.map((u) => ({
        url: u,
        slug: u.match(/\/remates-judiciales\/([^/]+)\/?$/)?.[1] ?? u,
        title: '',
      }));
      await procesarUrlsSueltas(avisos);
    } else {
      // MODO POR DEFECTO (sin flags) = cobertura COMPLETA: menú + sitemap-alive.
      // El menú lista ~112 avisos de los 7 deptos destacados; el sitemap-alive
      // aporta los ~20 sueltos en otros deptos (Norte de Santander, Magdalena,
      // vehículos, etc.). Se procesan secuencialmente y se deduplican en upsert.
      // MODO MENÚ: navega /departamento/x/ciudad/y/, útil para tests focalizados.
      log.info('Listando departamentos…');
      const departments = await listDepartments(page, args.dept);
      log.info(`  ${departments.length} departamento(s) a procesar`);

      for (const dept of departments) {
        log.info(`▶ ${dept.slug}`);
        const cities = await listCities(page, dept.url, args.city);
        log.info(`  ${cities.length} ciudad(es)`);

        for (const city of cities) {
          log.info(`  · ${city.label || city.slug}`);
          const avisos = await listAvisos(page, city.url);
          log.info(`    ${avisos.length} aviso(s)`);

          for (const aviso of avisos) {
            if (args.maxAvisos && processed >= args.maxAvisos) {
              log.info(`Límite de --max=${args.maxAvisos} alcanzado. Cortando.`);
              break;
            }
            try {
              const raw = await extractAvisoRaw(page, aviso, {
                department_slug: dept.slug,
                city_slug: city.slug,
                city_label: city.label,
              });
              if (!raw) {
                errors.push({ message: `extract failed: ${aviso.url}` });
                continue;
              }
              const remate = parseAviso(raw);
              if (!remate.source_id || !remate.city) {
                errors.push({ message: `aviso inválido (sin source_id o city): ${aviso.url}` });
                continue;
              }
              remates.push(remate);
              processed++;
            } catch (err) {
              errors.push({ message: `parse ${aviso.url}: ${(err as Error).message}` });
            }
          }

          if (args.maxAvisos && processed >= args.maxAvisos) break;
        }
        if (args.maxAvisos && processed >= args.maxAvisos) break;
      }

      // Si es modo default (sin --dept --city), agregamos el sitemap-alive
      // para cubrir avisos en deptos NO destacados (Cúcuta, Santa Marta, vehículos…).
      if (!args.dept && !args.city) {
        const alivePath = join(process.cwd(), '_session', 'remates-sitemap-alive.json');
        if (existsSync(alivePath)) {
          const data = JSON.parse(readFileSync(alivePath, 'utf8')) as { urls: string[] };
          // Solo URLs que NO procesamos ya (dedup por slug)
          const alreadySeenSlugs = new Set(remates.map((r) => r.source_id));
          const sueltas = data.urls
            .map((u) => ({
              url: u,
              slug: u.match(/\/remates-judiciales\/([^/]+)\/?$/)?.[1] ?? u,
              title: '',
            }))
            .filter((a) => !alreadySeenSlugs.has(a.slug));
          if (sueltas.length > 0) {
            await procesarUrlsSueltas(sueltas);
          }
        } else {
          log.warn(`No existe ${alivePath}. Para cobertura completa, corre: tsx scripts/check-sitemap-alive.ts`);
        }
      }
    }

    log.info(`Total remates parseados: ${remates.length}`);

    // 4. Upsert final.
    // En modo archive ya se hizo upsert INCREMENTAL por lotes durante el procesamiento
    // (savedTotal), así que NO re-upserteamos todo (evita un big-upsert frágil al final).
    // En los demás modos, los remates se acumularon y se guardan acá.
    let totalInserted: number;
    if (args.useArchive) {
      totalInserted = savedTotal;
      log.info(`Guardados incrementalmente: ${savedTotal} filas`);
    } else {
      const upsertResult = await upsertRemates(remates);
      errors.push(...upsertResult.errors);
      totalInserted = upsertResult.inserted;
    }

    // 5. Marcar inactivos (los que no se vieron en ESTE run)
    // Solo si scrapeamos cobertura COMPLETA: ni filtros (dept/city), ni límites
    // (max), ni modos parciales (sitemap-only o sitemap-alive-only). Si alguno
    // de esos flags está activo, este run NO vio todos los avisos y no debe
    // tocar is_active de los demás.
    // Run completo = sin filtros (dept/city) ni límites (max) ni modos parciales.
    // El modo archive SÍ es completo (recorre las 75 páginas = todos los vivos).
    const isFullRun = !args.dept && !args.city && !args.maxAvisos
                   && !args.useSitemap && !args.useSitemapAlive;
    let inactivated = 0;
    let bumped = 0;
    if (isFullRun) {
      const r = await markInactiveRemates(SOURCE, COUNTRY, runStartISO);
      bumped = r.incremented;
      inactivated = r.deactivated;
    }

    await finishScrapingLog(logId, errors.length === 0 ? 'success' : 'partial', {
      records_found: remates.length,
      records_inserted: totalInserted,
      records_updated: 0,
      errors,
      meta: { run_start: runStartISO, bumped, inactivated },
    });

    return {
      records_found: remates.length,
      records_inserted: totalInserted,
      records_inactivated: inactivated,
      errors,
    };
  } finally {
    await browser.close();
  }
}

// CLI
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
