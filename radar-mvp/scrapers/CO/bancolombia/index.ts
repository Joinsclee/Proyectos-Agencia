/**
 * Scraper Bancolombia — Portal Inmobiliario TU360
 *
 * Portal: https://inmobiliariotu360.bancolombia.com
 * Tipo: SPA React (JS pesado). Plan Fase 1.BC.
 * CRON: cada 6h.
 *
 * Estrategia Firecrawl:
 * - `waitFor: 3000` + `onlyMainContent: true` para esperar hidratación React
 * - Si el listado lo necesita, agregar `actions: [{type:'wait', milliseconds:2000}, {type:'scroll'}]`
 * - Schema extraction directo sobre cada ficha (LLM se adapta al markdown renderizado)
 *
 * NOTA: en el primer run validamos el patrón de URL real (puede ser distinto del documentado).
 * Para el POC scrapeamos el listado, vemos qué URLs aparecen, y ajustamos el patrón.
 */

import { scrapeMarkdown, batchScrapeWithSchema } from '../../../lib/firecrawl.js';
import {
  upsertInmuebles,
  startScrapingLog,
  finishScrapingLog,
} from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';
import type { Inmueble, ScrapingRunResult } from '../../../lib/types.js';

const SOURCE = 'bancolombia';
const COUNTRY = 'CO';
const BASE_URL = 'https://inmobiliariotu360.bancolombia.com';
const LISTADO_URL = `${BASE_URL}/`;
const log = createLogger(SOURCE);

// Patrón TENTATIVO de URL de ficha. Ajustar tras primer run.
// Bancolombia suele usar /inmueble/{id} o /propiedad/{slug}-{id}
const DETAIL_URL_PATTERN = /\/(?:inmueble|propiedad|inmuebles)\/([\w\-]+)/gi;

const FICHA_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string', description: 'Ciudad en Colombia, en minúsculas sin tildes' },
    zone: { type: 'string', description: 'Barrio o zona', nullable: true },
    address: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['apartment', 'house', 'commercial', 'lot'] },
    price: { type: 'number', description: 'Precio COP, solo número' },
    area_m2: { type: 'number', nullable: true },
    bedrooms: { type: 'number', nullable: true },
    bathrooms: { type: 'number', nullable: true },
    garages: { type: 'number', nullable: true },
    stratum: { type: 'number', nullable: true },
  },
  required: ['city', 'type', 'price'],
} as const;

const PROMPT = `
Extrae los datos de este inmueble publicado por Bancolombia (Portal TU360) en Colombia.
Precio en pesos colombianos (COP). Si un dato no aparece, devuelve null.
Para "type": apartamento→"apartment", casa→"house", local/oficina/bodega→"commercial", lote→"lot".
Para "city": en minúsculas sin tildes.
`.trim();

async function obtenerURLsDetalle(): Promise<Array<{ url: string; source_id: string }>> {
  log.info(`Listado: ${LISTADO_URL}`);

  // SPA React: necesita esperar JS. Scroll para forzar lazy load.
  const { html, markdown, error } = await scrapeMarkdown({
    url: LISTADO_URL,
    waitFor: 3000,
    actions: [
      { type: 'wait', milliseconds: 2000 },
      { type: 'scroll', direction: 'down' },
      { type: 'wait', milliseconds: 1500 },
      { type: 'scroll', direction: 'down' },
      { type: 'wait', milliseconds: 1500 },
    ],
  });

  if (error) {
    log.error(`Listado falló`, error);
    return [];
  }

  const content = html ?? markdown ?? '';
  const matches = [...content.matchAll(DETAIL_URL_PATTERN)];
  log.debug(`${matches.length} candidatas con patrón inicial`);

  const detalles = new Map<string, { url: string; source_id: string }>();
  for (const m of matches) {
    const [fullPath, sourceId] = m;
    if (!sourceId || !fullPath || detalles.has(sourceId)) continue;
    detalles.set(sourceId, {
      url: `${BASE_URL}${fullPath}`,
      source_id: sourceId,
    });
  }
  log.info(`Total URLs únicas: ${detalles.size}`);
  return [...detalles.values()];
}

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

function toInmueble(
  cand: { url: string; source_id: string },
  ficha: FichaExtraida,
): Inmueble | null {
  if (!ficha.price || !ficha.city) return null;
  const features: Record<string, unknown> = {};
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
    source_id: cand.source_id,
    source_url: cand.url,
    image_url: null,
  };
}

export async function run(opts: { maxDetails?: number } = {}): Promise<ScrapingRunResult> {
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const result: ScrapingRunResult = {
    records_found: 0, records_inserted: 0, records_updated: 0, errors: [], meta: {},
  };

  try {
    const candidates = await obtenerURLsDetalle();
    result.records_found = candidates.length;

    if (candidates.length === 0) {
      result.errors.push({
        message: 'No se encontraron URLs de detalle. Revisa DETAIL_URL_PATTERN tras inspeccionar el HTML del listado.',
      });
      await finishScrapingLog(logId, 'partial', result);
      return result;
    }

    const targets = candidates.slice(0, opts.maxDetails ?? candidates.length);
    log.info(`Batch scrape de ${targets.length}/${candidates.length}`);

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

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = process.argv.find((a) => a.startsWith('--max='));
  const maxDetails = arg ? parseInt(arg.split('=')[1]!, 10) : undefined;
  run({ maxDetails })
    .then((r) => { log.info('Done', r); process.exit(0); })
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}
