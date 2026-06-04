/**
 * Scraper Grupo Aval — Portal Inmobiliario
 *
 * Portal: https://www.avalvc.com.co/portal-inmobiliario
 * Estrategia: la landing linkea a un PDF que se actualiza periódicamente.
 * URL típica: https://www.avalvc.com.co/repositorio/Avalvc/portal-inmobiliario/{DD-MM-YY}/Inmuebles.pdf
 *
 * Pipeline:
 *  1) Scrape landing → extraer URL del PDF (la fecha cambia, hay que detectarla)
 *  2) Scrape PDF con Firecrawl PDF parser + schema
 *  3) Upsert
 */

import { scrapeMarkdown, scrapeWithSchema } from '../../../lib/firecrawl.js';
import {
  upsertInmuebles,
  startScrapingLog,
  finishScrapingLog,
} from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';
import { normalizeCity, type Inmueble, type ScrapingRunResult } from '../../../lib/types.js';
import { createHash } from 'node:crypto';

const SOURCE = 'aval';
const COUNTRY = 'CO';
const LANDING_URL = 'https://www.avalvc.com.co/portal-inmobiliario';
const log = createLogger(SOURCE);

// PDF de Aval: /repositorio/Avalvc/portal-inmobiliario/DD-MM-YY/Inmuebles.pdf
const PDF_URL_PATTERN = /https?:\/\/www\.avalvc\.com\.co\/repositorio\/[^"'\s]+\.pdf/gi;

const PDF_SCHEMA = {
  type: 'object',
  properties: {
    inmuebles: {
      type: 'array',
      description: 'Inmuebles publicados por Grupo Aval (CISA / bancos del grupo)',
      items: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Ciudad en Colombia, minúsculas sin tildes' },
          zone: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['apartment', 'house', 'commercial', 'lot'] },
          price: { type: 'number', description: 'Precio en COP, solo número' },
          area_m2: { type: 'number', nullable: true },
          bedrooms: { type: 'number', description: 'Habitaciones / alcobas', nullable: true },
          bathrooms: { type: 'number', description: 'Baños', nullable: true },
          garages: { type: 'number', description: 'Garajes/Parqueaderos. Suele aparecer abreviado como "Gj", "Garajes", "Parq", "Park", "Pq", "Parqueadero", "Parking".', nullable: true },
          stratum: { type: 'number', description: 'Estrato (1-6)', nullable: true },
          reference: { type: 'string', description: 'Código o referencia del inmueble', nullable: true },
        },
        required: ['city', 'type', 'price'],
      },
    },
  },
  required: ['inmuebles'],
} as const;

const PROMPT = `
Este PDF es el inventario de inmuebles publicados por Grupo Aval Colombia
(puede incluir CISA, Banco de Bogotá, Banco Occidente, Banco Popular, Banco AV Villas).
Extrae cada inmueble como elemento del array "inmuebles".
Precio en COP, solo número (sin $ ni separadores).
Para "type": apartamento→"apartment", casa→"house", local/oficina/bodega→"commercial", lote→"lot".
Para "city": minúsculas sin tildes.
Para "garages": busca columnas/abreviaturas tipo "Gj", "Garajes", "Parq", "Park", "Pq", "Parqueadero", "Parking". Si la tabla tiene una columna con número de parqueaderos, úsala. Si no aparece, devuelve null.
Si un campo no aparece claro en la fila, devuelve null.
`.trim();

type Ficha = {
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
  reference?: string | null;
};

function stableId(item: Ficha): string {
  if (item.reference) return item.reference;
  const key = `${item.address ?? ''}|${item.price}|${item.area_m2 ?? ''}|${item.city}`;
  return createHash('md5').update(key).digest('hex').slice(0, 16);
}

function toInmueble(item: Ficha, pdfUrl: string): Inmueble | null {
  if (!item.price || !item.city) return null;
  const features: Record<string, unknown> = {};
  if (item.bedrooms != null) features.bedrooms = item.bedrooms;
  if (item.bathrooms != null) features.bathrooms = item.bathrooms;
  if (item.garages != null) features.garages = item.garages;
  if (item.stratum != null) features.stratum = item.stratum;

  return {
    country_code: COUNTRY,
    city: normalizeCity(item.city),
    zone: item.zone ?? null,
    address: item.address ?? null,
    type: item.type,
    price: item.price,
    currency: 'COP',
    area_m2: item.area_m2 ?? null,
    features,
    source: SOURCE,
    source_id: stableId(item),
    source_url: pdfUrl,
    image_url: null,
  };
}

async function obtenerPDFDelLanding(): Promise<string | null> {
  log.info(`Landing: ${LANDING_URL}`);
  const { html, links, error } = await scrapeMarkdown({
    url: LANDING_URL,
    waitFor: 3000,
    onlyMainContent: false,
  });
  if (error) {
    log.error(`Landing falló`, error);
    return null;
  }

  const fromHtml = [...(html ?? '').matchAll(PDF_URL_PATTERN)].map((m) => m[0]);
  const fromLinks = links.filter((l) => /\.pdf$/i.test(l) && /avalvc\.com\.co\/repositorio/.test(l));
  const candidates = [...new Set([...fromHtml, ...fromLinks])];

  if (candidates.length === 0) {
    log.warn('No se detectó PDF de inmuebles en landing');
    return null;
  }
  // Si hay varios, tomamos el primero (debería ser único: Inmuebles.pdf más reciente)
  const pdfUrl = candidates[0]!;
  log.info(`PDF detectado: ${pdfUrl}`);
  return pdfUrl;
}

export async function run(_opts: { maxDetails?: number } = {}): Promise<ScrapingRunResult> {
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const result: ScrapingRunResult = {
    records_found: 0, records_inserted: 0, records_updated: 0, errors: [], meta: {},
  };

  try {
    const pdfUrl = await obtenerPDFDelLanding();
    if (!pdfUrl) {
      result.errors.push({ message: 'No PDF detectado en landing Aval' });
      await finishScrapingLog(logId, 'partial', result);
      return result;
    }
    result.meta!.pdf_url = pdfUrl;

    log.info(`Scrapeando PDF: ${pdfUrl}`);
    const { data, error } = await scrapeWithSchema<{ inmuebles: Ficha[] }>({
      url: pdfUrl,
      schema: PDF_SCHEMA as Record<string, unknown>,
      prompt: PROMPT,
    });

    if (error) {
      result.errors.push({ message: `pdf: ${error}` });
      await finishScrapingLog(logId, 'error', result);
      return result;
    }

    const items = data?.inmuebles ?? [];
    result.records_found = items.length;
    log.info(`Aval: ${items.length} inmuebles extraídos`);

    const inmuebles = items.map((i) => toInmueble(i, pdfUrl)).filter((x): x is Inmueble => x != null);
    log.info(`Inmuebles válidos: ${inmuebles.length}/${items.length}`);

    if (inmuebles.length > 0) {
      const up = await upsertInmuebles(inmuebles);
      result.records_inserted = up.inserted;
    }

    const status = result.errors.length === 0 && inmuebles.length > 0 ? 'success' : 'partial';
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
  run().then((r) => { log.info('Done', r); process.exit(0); }).catch((e) => { log.error('Failed', e); process.exit(1); });
}
