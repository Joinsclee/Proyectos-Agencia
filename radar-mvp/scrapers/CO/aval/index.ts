/**
 * Scraper Grupo Aval — Portal Inmobiliario
 *
 * Portal: https://www.avalvc.com.co/portal-inmobiliario
 * Tipo: PDF descargable (a confirmar). Plan Fase 1.AV.
 * CRON: cada 24h (PDF se actualiza con menor frecuencia).
 *
 * Estrategia Firecrawl:
 * - Firecrawl tiene parser PDF nativo (`parsers: [{type: 'pdf'}]`).
 * - Si la página tiene un link a PDF, Firecrawl lo detecta y parsea.
 * - Si la página es HTML con el listado embebido, lo extrae igual.
 *
 * Para el POC: scrape de la página principal del portal, schema array con
 * todos los inmuebles. El LLM se encarga de la heterogeneidad del PDF.
 *
 * Si en el primer run vemos que el PDF necesita descarga manual + parser propio,
 * pivotamos a pipeline custom (pdf-parse + Claude Vision como dice el plan v1.1).
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

const SOURCE = 'aval';
const COUNTRY = 'CO';
const PORTAL_URL = 'https://www.avalvc.com.co/portal-inmobiliario';
const log = createLogger(SOURCE);

const LISTADO_SCHEMA = {
  type: 'object',
  properties: {
    inmuebles: {
      type: 'array',
      description: 'Lista de inmuebles publicados por Grupo Aval (CISA / bancos del grupo)',
      items: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Ciudad en Colombia, minúsculas sin tildes' },
          zone: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['apartment', 'house', 'commercial', 'lot'] },
          price: { type: 'number', description: 'Precio COP, solo número' },
          area_m2: { type: 'number', nullable: true },
          bedrooms: { type: 'number', nullable: true },
          bathrooms: { type: 'number', nullable: true },
          stratum: { type: 'number', nullable: true },
          source_id_external: { type: 'string', description: 'ID o referencia del inmueble si aparece', nullable: true },
        },
        required: ['city', 'type', 'price'],
      },
    },
  },
  required: ['inmuebles'],
} as const;

const PROMPT = `
Esta es la página del portal inmobiliario de Grupo Aval en Colombia (puede incluir CISA, Banco de Bogotá, Banco Occidente, etc.).
Si la página o el PDF que muestra contiene un listado de inmuebles, extráelos en el array "inmuebles".
Precio en COP, solo número (sin $ ni separadores).
Para "type": apartamento→"apartment", casa→"house", local/oficina/bodega→"commercial", lote→"lot".
Para "city": minúsculas sin tildes.
Si la página solo enlaza a un PDF que no se renderizó, devuelve "inmuebles": [].
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
  source_id_external?: string | null;
};

function stableId(item: FichaListado): string {
  if (item.source_id_external) return item.source_id_external;
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
    source_url: PORTAL_URL,
    image_url: null,
  };
}

export async function run(_opts: { maxDetails?: number } = {}): Promise<ScrapingRunResult> {
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const result: ScrapingRunResult = {
    records_found: 0, records_inserted: 0, records_updated: 0, errors: [], meta: {},
  };

  try {
    log.info(`Scrapeando portal Aval: ${PORTAL_URL}`);

    const { data, error } = await scrapeWithSchema<{ inmuebles: FichaListado[] }>({
      url: PORTAL_URL,
      schema: LISTADO_SCHEMA as Record<string, unknown>,
      prompt: PROMPT,
      waitFor: 3000,
    });

    if (error) {
      result.errors.push({ message: `scrape: ${error}` });
      await finishScrapingLog(logId, 'error', result);
      return result;
    }

    const items = data?.inmuebles ?? [];
    result.records_found = items.length;
    log.info(`Aval: ${items.length} inmuebles extraídos`);

    if (items.length === 0) {
      result.meta!.note = 'Sin inmuebles. Probable: PDF descargable no renderiza. Pivotear a pipeline pdf-parse + Claude Vision.';
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
