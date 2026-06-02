/**
 * Scraper Davivienda — Bienes al Alcance de Todos
 *
 * Portal: https://bienesalalcancedetodos.davivienda.com
 * Tipo: HTML estático (sin Cloudflare, sin auth)
 * CRON: cada 6h (Plan Fase 1.DV)
 *
 * Implementación: Firecrawl scrape + schema extraction.
 * Patrón: 1) scrape listado en markdown → 2) extraer URLs de detalle →
 *         3) batch scrape detalles con schema → 4) upsert Supabase.
 */

import { scrapeMarkdown, batchScrapeWithSchema } from '../../../lib/firecrawl.js';
import {
  upsertInmuebles,
  startScrapingLog,
  finishScrapingLog,
} from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';
import type { Inmueble, ScrapingRunResult } from '../../../lib/types.js';

const SOURCE = 'davivienda';
const COUNTRY = 'CO';
const BASE_URL = 'https://bienesalalcancedetodos.davivienda.com';
const log = createLogger(SOURCE);

const CATEGORIES = [
  { path: '/inmuebles-de-vivienda', es_proyecto_nuevo: false },
  { path: '/inmuebles-comerciales', es_proyecto_nuevo: false },
  { path: '/preventa/inmuebles-de-vivienda', es_proyecto_nuevo: true },
];

/** URL detalle: /inmuebles-de-vivienda/apartamentos-000000XXXXXX */
const DETAIL_URL_PATTERN = /\/(?:inmuebles-de-vivienda|inmuebles-comerciales|preventa\/inmuebles-de-vivienda)\/(apartamentos|casas|locales|oficinas|lotes|bodegas)-(\d+)/gi;

/** Schema que el LLM de Firecrawl usa para extraer datos estructurados. */
const FICHA_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string', description: 'Ciudad del inmueble en Colombia (ej: bogota, medellin, cali)' },
    zone: { type: 'string', description: 'Barrio, sector o zona dentro de la ciudad', nullable: true },
    address: { type: 'string', description: 'Dirección exacta del inmueble si aparece', nullable: true },
    type: { type: 'string', enum: ['apartment', 'house', 'commercial', 'lot'], description: 'Tipo de inmueble' },
    price: { type: 'number', description: 'Precio en COP (solo el número, sin $ ni separadores)' },
    area_m2: { type: 'number', description: 'Área construida en metros cuadrados', nullable: true },
    bedrooms: { type: 'number', description: 'Habitaciones', nullable: true },
    bathrooms: { type: 'number', description: 'Baños', nullable: true },
    garages: { type: 'number', description: 'Garajes/parqueaderos', nullable: true },
    stratum: { type: 'number', description: 'Estrato socioeconómico (1-6)', nullable: true },
  },
  required: ['city', 'type', 'price'],
} as const;

type FichaExtraida = {
  city: string;
  zone?: string | null;
  address?: string | null;
  type: 'apartment' | 'house' | 'commercial' | 'lot';
  price: number;
  area_m2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garages?: number | null;
  stratum?: number | null;
};

const PROMPT = `
Extrae los datos de este inmueble publicado en venta por Davivienda en Colombia.
El precio es en pesos colombianos (COP).
Si un dato no aparece claramente, devuelve null en vez de inventarlo.
Para "type": si dice apartamento usa "apartment", si dice casa usa "house", si dice local/oficina/bodega usa "commercial", si dice lote usa "lot".
Para "city": en minúsculas y sin tildes (ej: bogota, medellin).
`.trim();

// ────────────────────────────────────────────────────────────
// PASO 1: Listado → URLs candidatas
// ────────────────────────────────────────────────────────────
async function obtenerURLsDetalle(): Promise<Array<{ url: string; source_id: string; es_proyecto_nuevo: boolean }>> {
  const detalles = new Map<string, { url: string; source_id: string; es_proyecto_nuevo: boolean }>();

  for (const cat of CATEGORIES) {
    const url = `${BASE_URL}${cat.path}`;
    log.info(`Listado: ${url}`);

    const { html, markdown, error } = await scrapeMarkdown({
      url,
      onlyMainContent: false,
    });

    if (error) {
      log.warn(`Listado falló: ${cat.path}`, error);
      continue;
    }

    const content = html ?? markdown ?? '';
    const matches = [...content.matchAll(DETAIL_URL_PATTERN)];
    log.debug(`${cat.path}: ${matches.length} URLs candidatas`);

    for (const m of matches) {
      const [fullPath, , sourceId] = m;
      if (!sourceId || !fullPath) continue;
      if (detalles.has(sourceId)) continue;
      detalles.set(sourceId, {
        url: `${BASE_URL}${fullPath}`,
        source_id: sourceId,
        es_proyecto_nuevo: cat.es_proyecto_nuevo,
      });
    }
  }

  log.info(`Total URLs únicas: ${detalles.size}`);
  return [...detalles.values()];
}

// ────────────────────────────────────────────────────────────
// PASO 2: Mapper de ficha extraída → Inmueble normalizado
// ────────────────────────────────────────────────────────────
function toInmueble(
  candidate: { url: string; source_id: string; es_proyecto_nuevo: boolean },
  ficha: FichaExtraida,
): Inmueble | null {
  if (!ficha.price || !ficha.city) return null;

  const features: Record<string, unknown> = { es_proyecto_nuevo: candidate.es_proyecto_nuevo };
  if (ficha.bedrooms != null) features.bedrooms = ficha.bedrooms;
  if (ficha.bathrooms != null) features.bathrooms = ficha.bathrooms;
  if (ficha.garages != null) features.garages = ficha.garages;
  if (ficha.stratum != null) features.stratum = ficha.stratum;

  return {
    country_code: COUNTRY,
    city: ficha.city.toLowerCase().trim(),
    zone: ficha.zone ?? null,
    address: ficha.address ?? null,
    type: ficha.type,
    price: ficha.price,
    currency: 'COP',
    area_m2: ficha.area_m2 ?? null,
    features,
    source: SOURCE,
    source_id: candidate.source_id,
    source_url: candidate.url,
    image_url: null, // TODO Fase 1.IMG: extraer og:image y subir a Supabase Storage
  };
}

// ────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────
export async function run(opts: { maxDetails?: number } = {}): Promise<ScrapingRunResult> {
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const result: ScrapingRunResult = {
    records_found: 0,
    records_inserted: 0,
    records_updated: 0,
    errors: [],
    meta: { max_details: opts.maxDetails ?? null },
  };

  try {
    const candidates = await obtenerURLsDetalle();
    result.records_found = candidates.length;

    const limit = opts.maxDetails ?? candidates.length;
    const targets = candidates.slice(0, limit);
    log.info(`Batch scrape de ${targets.length}/${candidates.length} fichas`);

    if (targets.length === 0) {
      await finishScrapingLog(logId, 'partial', result);
      return result;
    }

    // Batch scrape: Firecrawl maneja la paralelización + rate limits internamente
    const fichas = await batchScrapeWithSchema<FichaExtraida>({
      urls: targets.map((t) => t.url),
      schema: FICHA_SCHEMA as Record<string, unknown>,
      prompt: PROMPT,
    });

    const inmuebles: Inmueble[] = [];
    for (const ficha of fichas) {
      const cand = targets.find((t) => t.url === ficha.url);
      if (!cand) continue;
      if (ficha.error || !ficha.data) {
        result.errors.push({ message: `extract ${ficha.url}: ${ficha.error ?? 'no data'}` });
        continue;
      }
      const inm = toInmueble(cand, ficha.data);
      if (inm) inmuebles.push(inm);
    }

    log.info(`Inmuebles válidos: ${inmuebles.length}/${targets.length}`);

    if (inmuebles.length > 0) {
      const up = await upsertInmuebles(inmuebles);
      result.records_inserted = up.inserted;
      if (up.errors.length > 0) {
        result.errors.push(...up.errors.map((e) => ({ message: `upsert: ${e.message}` })));
      }
    }

    const status = result.errors.length === 0 ? 'success' : 'partial';
    await finishScrapingLog(logId, status, result);
    return result;
  } catch (err) {
    result.errors.push({ message: `fatal: ${(err as Error).message}` });
    await finishScrapingLog(logId, 'error', result);
    throw err;
  }
}

// CLI: tsx scrapers/CO/davivienda/index.ts [--max=5]
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = process.argv.find((a) => a.startsWith('--max='));
  const maxDetails = arg ? parseInt(arg.split('=')[1]!, 10) : undefined;
  run({ maxDetails })
    .then((r) => {
      log.info('Done', r);
      process.exit(0);
    })
    .catch((e) => {
      log.error('Failed', e);
      process.exit(1);
    });
}
