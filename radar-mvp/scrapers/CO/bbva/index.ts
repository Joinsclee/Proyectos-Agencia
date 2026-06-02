/**
 * Scraper BBVA — Remates
 *
 * Portal: https://www.bbva.com.co/personas/promocion/remates.html
 * Tipo: HTML estático o SPA (a confirmar tras primer run). Plan Fase 1.BB.
 * CRON: cada 6h.
 *
 * BBVA publica un listado de inmuebles en remate (dación de pago). Suele tener
 * pocas propiedades (< 50). Posible que use PDF descargable como Aval, o tabla HTML.
 *
 * NOTA: hasta validar el primer scrape, este scraper toma el listado completo
 * y deja que el LLM extraiga inmuebles del markdown rendered. Si BBVA usa PDF,
 * pivotear a pipeline tipo Aval.
 */

import { scrapeWithSchema } from '../../../lib/firecrawl.js';
import {
  upsertInmuebles,
  startScrapingLog,
  finishScrapingLog,
} from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';
import type { Inmueble, ScrapingRunResult } from '../../../lib/types.js';
import { createHash } from 'node:crypto';

const SOURCE = 'bbva';
const COUNTRY = 'CO';
const LISTADO_URL = 'https://www.bbva.com.co/personas/promocion/remates.html';
const log = createLogger(SOURCE);

/**
 * BBVA típicamente lista todos los inmuebles en UNA sola página (no hay paginación
 * profunda como en bancos comerciales). Estrategia: extraer la lista completa
 * con un solo scrape + schema array.
 */
const LISTADO_SCHEMA = {
  type: 'object',
  properties: {
    inmuebles: {
      type: 'array',
      description: 'Lista de inmuebles en remate publicados por BBVA',
      items: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Ciudad en Colombia, minúsculas sin tildes' },
          zone: { type: 'string', nullable: true },
          address: { type: 'string', description: 'Dirección exacta si aparece', nullable: true },
          type: { type: 'string', enum: ['apartment', 'house', 'commercial', 'lot'] },
          price: { type: 'number', description: 'Precio en COP, solo número' },
          area_m2: { type: 'number', nullable: true },
          bedrooms: { type: 'number', nullable: true },
          bathrooms: { type: 'number', nullable: true },
          stratum: { type: 'number', nullable: true },
          detail_url: { type: 'string', description: 'Enlace al detalle si aparece', nullable: true },
        },
        required: ['city', 'type', 'price'],
      },
    },
  },
  required: ['inmuebles'],
} as const;

const PROMPT = `
Esta página de BBVA Colombia publica inmuebles en remate (dación de pago).
Extrae cada inmueble del listado en un array "inmuebles".
Precio en pesos colombianos (COP), solo número sin $ ni separadores.
Para "type": apartamento→"apartment", casa→"house", local/oficina/bodega→"commercial", lote→"lot".
Para "city": en minúsculas sin tildes. Si no encuentras la ciudad clara, deduce del contexto.
Si la página solo tiene un PDF descargable o pocos datos, devuelve "inmuebles": [].
`.trim();

type FichaListado = {
  city: string;
  zone?: string | null;
  address?: string | null;
  type: 'apartment' | 'house' | 'commercial' | 'lot';
  price: number;
  area_m2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  stratum?: number | null;
  detail_url?: string | null;
};

function stableId(item: FichaListado): string {
  // BBVA no siempre da ID. Generamos hash estable a partir de address+precio+area.
  const key = `${item.address ?? ''}|${item.price}|${item.area_m2 ?? ''}|${item.city}`;
  return createHash('md5').update(key).digest('hex').slice(0, 16);
}

function toInmueble(item: FichaListado): Inmueble | null {
  if (!item.price || !item.city) return null;
  const features: Record<string, unknown> = {};
  if (item.bedrooms != null) features.bedrooms = item.bedrooms;
  if (item.bathrooms != null) features.bathrooms = item.bathrooms;
  if (item.stratum != null) features.stratum = item.stratum;

  return {
    country_code: COUNTRY,
    city: item.city.toLowerCase().trim(),
    zone: item.zone ?? null,
    address: item.address ?? null,
    type: item.type,
    price: item.price,
    currency: 'COP',
    area_m2: item.area_m2 ?? null,
    features,
    source: SOURCE,
    source_id: stableId(item),
    source_url: item.detail_url ?? LISTADO_URL,
    image_url: null,
  };
}

export async function run(_opts: { maxDetails?: number } = {}): Promise<ScrapingRunResult> {
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const result: ScrapingRunResult = {
    records_found: 0, records_inserted: 0, records_updated: 0, errors: [], meta: {},
  };

  try {
    log.info(`Scrapeando listado completo: ${LISTADO_URL}`);

    const { data, error } = await scrapeWithSchema<{ inmuebles: FichaListado[] }>({
      url: LISTADO_URL,
      schema: LISTADO_SCHEMA as Record<string, unknown>,
      prompt: PROMPT,
      waitFor: 2000,
    });

    if (error) {
      result.errors.push({ message: `scrape: ${error}` });
      await finishScrapingLog(logId, 'error', result);
      return result;
    }

    const items = data?.inmuebles ?? [];
    result.records_found = items.length;
    log.info(`LLM extrajo ${items.length} inmuebles del listado`);

    if (items.length === 0) {
      result.meta!.note = 'No se extrajeron inmuebles. Verifica si BBVA usa PDF descargable (pivotear a pipeline Aval).';
      await finishScrapingLog(logId, 'partial', result);
      return result;
    }

    const inmuebles = items.map(toInmueble).filter((x): x is Inmueble => x != null);
    log.info(`Inmuebles válidos: ${inmuebles.length}/${items.length}`);

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
  run()
    .then((r) => { log.info('Done', r); process.exit(0); })
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}
