/**
 * Constructor de zonas FincaRaíz DIRIGIDO POR LA DEMANDA.
 *
 * Idea (decisión del cliente): no bajamos FincaRaíz a nivel nacional. Solo
 * traemos comparables de las ciudades donde EXISTEN oportunidades reales —
 * los inmuebles de bancos + los remates. Así cada propiedad de remate/banco
 * puede compararse contra el mercado de su zona, sin desperdiciar scraping en
 * municipios sin oportunidades.
 *
 * Flujo:
 *   1. Demanda = ciudades distintas de `remates` (con su departamento) ∪
 *      ciudades de bancos en `inmuebles` (source != fincaraiz). El departamento
 *      de los bancos se resuelve con el mapa ciudad→depto que ya traen los remates.
 *   2. Slugifica a la convención FincaRaíz: /venta/inmuebles/{ciudad}/{depto}.
 *   3. Valida cada ciudad contra FincaRaíz (pág 1): descarta las que no tienen
 *      inventario suficiente (< MIN_LISTINGS). Si el URL con depto falla, cae a
 *      city-only (/venta/inmuebles/{ciudad}).
 *   4. Reescribe radar_zonas_monitoreadas (portal=fincaraiz) con la demanda:
 *      property_type='inmuebles' (todos los tipos: casas, lotes, aptos),
 *      operation='venta', city-deep (max_pages acotado por PAGE_CAP).
 *
 * Uso:
 *   tsx scripts/build-demand-zonas.ts --dry     # solo reporta, no escribe
 *   tsx scripts/build-demand-zonas.ts           # reescribe las zonas
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('demand-zonas');
const DRY = process.argv.includes('--dry');

const MIN_LISTINGS = 10;   // ciudades con menos avisos no dan comparables fiables
const PAGE_CAP = 120;      // tope de páginas/ciudad (~3.6k avisos): acota mega-ciudades
const CONC = 8;            // validaciones en paralelo
const BASE = 'https://www.fincaraiz.com.co';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Alias de ciudades cuyo nombre llega "sucio" desde las fuentes.
const CITY_ALIAS: Record<string, string> = {
  'bogota-d-c': 'bogota',
  'bogota-dc': 'bogota',
  'santa-fe-de-bogota': 'bogota',
  'bogota-distrito-capital': 'bogota',
};
// Departamento canónico para casos especiales (distrito capital).
const DEPT_OVERRIDE: Record<string, string> = { bogota: 'bogota-dc' };

interface Cand {
  city: string;        // nombre legible (el más frecuente)
  citySlug: string;
  deptSlug: string | null;
  demand: number;      // # propiedades de banco+remate en esa ciudad
  src: Set<string>;    // 'remate' | 'banco'
}

const norm = (cs: string) => CITY_ALIAS[cs] ?? cs;

async function pageEach<T>(
  build: (from: number) => any,
  onRow: (r: T) => void,
): Promise<void> {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as T[]) onRow(r);
    if ((data?.length ?? 0) < 1000) break;
  }
}

/** Valida una ciudad en FincaRaíz; devuelve {total,lastPage,deptSlug} o null. */
async function validate(c: Cand): Promise<{ total: number; lastPage: number; deptSlug: string | null } | null> {
  const tryUrl = async (dept: string | null) => {
    const segs = ['venta', 'inmuebles', c.citySlug, dept].filter(Boolean);
    try {
      const r = await fetch(`${BASE}/${segs.join('/')}`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9' },
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) return null;
      const m = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) return null;
      const sf = JSON.parse(m[1])?.props?.pageProps?.fetchResult?.searchFast;
      const total = Number(sf?.paginatorInfo?.total ?? 0);
      const lastPage = Number(sf?.paginatorInfo?.lastPage ?? 0);
      return total > 0 ? { total, lastPage, deptSlug: dept } : null;
    } catch {
      return null;
    }
  };
  // 1) con departamento (desambigua nombres repetidos). 2) city-only.
  return (c.deptSlug ? await tryUrl(c.deptSlug) : null) ?? (await tryUrl(null));
}

async function main() {
  log.info(`Construyendo demanda${DRY ? ' (DRY)' : ''}…`);

  // ── 1. Demanda desde remates (city + department) ──
  const cands = new Map<string, Cand>();
  const cityDept = new Map<string, string>(); // citySlug → deptSlug (de remates)

  await pageEach<{ city: string; department: string | null }>(
    (from) => supabase.from('remates').select('city, department').eq('is_active', true).order('id'),
    (r) => {
      if (!r.city) return;
      const cs = norm(slug(r.city));
      if (!cs) return;
      const ds = r.department ? slug(r.department) : null;
      if (ds && !cityDept.has(cs)) cityDept.set(cs, ds);
      const cur = cands.get(cs) ?? { city: r.city, citySlug: cs, deptSlug: ds, demand: 0, src: new Set<string>() };
      cur.demand++; cur.src.add('remate');
      if (!cur.deptSlug && ds) cur.deptSlug = ds;
      cands.set(cs, cur);
    },
  );
  const remateCities = cands.size;

  // ── 2. Demanda desde bancos (inmuebles, source != fincaraiz) ──
  await pageEach<{ city: string; source: string }>(
    (from) => supabase.from('inmuebles').select('city, source').eq('is_active', true).neq('source', 'fincaraiz').order('id'),
    (r) => {
      if (!r.city) return;
      const cs = norm(slug(r.city));
      if (!cs) return;
      const ds = cityDept.get(cs) ?? null; // depto resuelto vía mapa de remates
      const cur = cands.get(cs) ?? { city: r.city, citySlug: cs, deptSlug: ds, demand: 0, src: new Set<string>() };
      cur.demand++; cur.src.add('banco');
      if (!cur.deptSlug && ds) cur.deptSlug = ds;
      cands.set(cs, cur);
    },
  );

  // Override de distrito capital y similares.
  for (const c of cands.values()) if (DEPT_OVERRIDE[c.citySlug]) c.deptSlug = DEPT_OVERRIDE[c.citySlug];

  log.info(`Ciudades de demanda: ${cands.size} (remates: ${remateCities}, +bancos)`);

  // ── 3. Validación contra FincaRaíz ──
  const list = [...cands.values()].sort((a, b) => b.demand - a.demand);
  const valid: Array<Cand & { total: number; lastPage: number }> = [];
  let discarded = 0;
  for (let i = 0; i < list.length; i += CONC) {
    const batch = list.slice(i, i + CONC);
    const res = await Promise.all(batch.map((c) => validate(c)));
    res.forEach((v, j) => {
      const c = batch[j];
      if (v && v.total >= MIN_LISTINGS) {
        valid.push({ ...c, deptSlug: v.deptSlug, total: v.total, lastPage: v.lastPage });
      } else {
        discarded++;
      }
    });
    log.info(`  validadas ${Math.min(i + CONC, list.length)}/${list.length} (ok ${valid.length}, descartadas ${discarded})`);
  }

  const totalListings = valid.reduce((a, c) => a + Math.min(c.total, PAGE_CAP * 30), 0);
  log.info(`✅ Ciudades con comparables: ${valid.length} · descartadas (sin/poco inventario): ${discarded}`);
  log.info(`   Avisos FincaRaíz estimados a traer: ~${totalListings.toLocaleString('es-CO')} (tope ${PAGE_CAP} págs/ciudad)`);
  log.info('   Top 15 por demanda:');
  for (const c of valid.slice(0, 15)) {
    log.info(`     ${c.city} (${c.citySlug}/${c.deptSlug ?? '—'}) · demanda ${c.demand} [${[...c.src].join('+')}] · FincaRaíz ${c.total}`);
  }

  if (DRY) { log.info('DRY: no se escribió nada.'); return; }

  // ── 4. Reescritura de zonas (portal=fincaraiz) ──
  const rows = valid.map((c) => ({
    country_code: 'CO',
    city: c.city,
    portal: 'fincaraiz',
    operation: 'venta',
    property_type: 'inmuebles', // TODOS los tipos: casas, lotes, aptos (matchea remates/bancos)
    neighborhood_slug: '', // '' = sin barrio → city-deep (el scraper filtra falsy al armar la URL)
    city_slug: c.citySlug,
    dept_slug: c.deptSlug ?? '', // '' → URL city-only (/venta/inmuebles/{ciudad}); NOT NULL ok

    location_id: null,
    price_min: null, price_max: null, area_min: null, area_max: null,
    stratum_min: null, stratum_max: null, bedrooms_min: null,
    max_pages: Math.min(c.lastPage, PAGE_CAP),
    min_comparables: 8,
    is_active: true,
    notes: `demand-driven · ${[...c.src].join('+')} · demanda=${c.demand} · portal=${c.total}`,
  }));

  const { error: delErr } = await supabase.from('radar_zonas_monitoreadas').delete().eq('portal', 'fincaraiz');
  if (delErr) throw new Error(`No se pudieron limpiar zonas previas: ${delErr.message}`);
  log.info('Zonas FincaRaíz previas eliminadas (config regenerable).');

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('radar_zonas_monitoreadas').insert(rows.slice(i, i + 200));
    if (error) throw new Error(`Insert falló: ${error.message}`);
  }
  log.info(`✅ ${rows.length} zonas de demanda escritas en radar_zonas_monitoreadas.`);
}

main().then(() => process.exit(0)).catch((e) => { log.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
