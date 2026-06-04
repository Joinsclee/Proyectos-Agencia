/**
 * Scraper BBVA — Remates
 *
 * Portal: https://www.bbva.com.co/personas/promocion/remates.html
 * Estrategia: la landing tiene 3 links a PDFs (Casas, Apartamentos, Oficinas/Locales).
 *  1) Scrape landing → extraer URLs de los 3 PDFs (cambian periódicamente)
 *  2) Scrape cada PDF con Firecrawl PDF parser → schema extraction
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

const SOURCE = 'bbva';
const COUNTRY = 'CO';
const LANDING_URL = 'https://www.bbva.com.co/personas/promocion/remates.html';
const log = createLogger(SOURCE);

// Patrón de URL de los PDFs del inventario de remates BBVA.
// Ejemplos confirmados:
//   /content/dam/.../Casas-Inventario-de-Bienes-0403.pdf
//   /content/dam/.../Apartamentos-Inventario-Bienes-0403.pdf
//   /content/dam/.../Oficinas-y-locales-Inventario-0403.pdf
const PDF_URL_PATTERN = /https?:\/\/www\.bbva\.com\.co\/[^"'\s]+(?:Inventario|inventario)[^"'\s]*\.pdf/gi;

const PDF_SCHEMA = {
  type: 'object',
  properties: {
    inmuebles: {
      type: 'array',
      description: 'Inmuebles en remate del banco BBVA Colombia',
      items: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Ciudad en Colombia, minúsculas sin tildes' },
          zone: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['apartment', 'house', 'commercial', 'lot'] },
          price: { type: 'number', description: 'Precio en COP, solo número' },
          area_m2: { type: 'number', nullable: true },
          bedrooms: { type: 'number', description: 'Habitaciones / alcobas / dormitorios', nullable: true },
          bathrooms: { type: 'number', description: 'Baños', nullable: true },
          garages: { type: 'number', description: 'Garajes/Parqueaderos. Suele aparecer abreviado en la tabla como "Gj", "Garajes", "Parq", "Park", "Pq", "Parqueadero".', nullable: true },
          stratum: { type: 'number', description: 'Estrato socioeconómico (1-6)', nullable: true },
          reference: { type: 'string', description: 'Referencia/ID del inmueble si aparece en la tabla (suele ser un código tipo BA12345, número de oficio, etc.)', nullable: true },
        },
        required: ['city', 'type', 'price'],
      },
    },
  },
  required: ['inmuebles'],
} as const;

const PROMPT = `
Este PDF es el inventario de bienes en remate del Banco BBVA Colombia.
Extrae cada inmueble como elemento del array "inmuebles".
Precio en COP, solo número (sin $ ni separadores).
Para "type": apartamento→"apartment", casa→"house", local/oficina/bodega→"commercial", lote→"lot".
Para "city": minúsculas sin tildes (bogota, medellin, cali, etc.).
Para "garages": busca columnas/abreviaturas tipo "Gj", "Garajes", "Parq", "Park", "Pq", "Parqueadero". Si la tabla tiene una columna con número de parqueaderos, úsala. Si no aparece, devuelve null.
Si un campo no aparece claro en la fila, devuelve null en vez de inventar.
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

function stableId(item: Ficha, pdfUrl: string): string {
  if (item.reference) return item.reference;
  const key = `${item.address ?? ''}|${item.price}|${item.area_m2 ?? ''}|${item.city}|${pdfUrl}`;
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
    source_id: stableId(item, pdfUrl),
    source_url: pdfUrl,
    image_url: null,
  };
}

async function obtenerPDFsDelLanding(): Promise<string[]> {
  log.info(`Landing: ${LANDING_URL}`);
  const { html, links, error } = await scrapeMarkdown({
    url: LANDING_URL,
    waitFor: 2000,
    onlyMainContent: false,
  });
  if (error) {
    log.error(`Landing falló`, error);
    return [];
  }

  const pdfs = new Set<string>();
  // Buscar en html y en la lista de links
  const fromHtml = [...(html ?? '').matchAll(PDF_URL_PATTERN)].map((m) => m[0]);
  const fromLinks = links.filter((l) => /\.pdf$/i.test(l) && /(?:Inventario|inventario)/.test(l));
  [...fromHtml, ...fromLinks].forEach((u) => pdfs.add(u));

  const arr = [...pdfs];
  log.info(`PDFs detectados: ${arr.length}`);
  arr.forEach((u) => log.debug(`  · ${u}`));
  return arr;
}

export async function run(_opts: { maxDetails?: number } = {}): Promise<ScrapingRunResult> {
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const result: ScrapingRunResult = {
    records_found: 0, records_inserted: 0, records_updated: 0, errors: [], meta: {},
  };

  try {
    const pdfs = await obtenerPDFsDelLanding();
    if (pdfs.length === 0) {
      result.errors.push({ message: 'No se detectaron PDFs en la landing de BBVA' });
      await finishScrapingLog(logId, 'partial', result);
      return result;
    }
    result.meta!.pdfs = pdfs;

    const inmuebles: Inmueble[] = [];
    for (const pdfUrl of pdfs) {
      log.info(`Scrapeando PDF: ${pdfUrl}`);
      const { data, error } = await scrapeWithSchema<{ inmuebles: Ficha[] }>({
        url: pdfUrl,
        schema: PDF_SCHEMA as Record<string, unknown>,
        prompt: PROMPT,
      });
      if (error) {
        result.errors.push({ message: `pdf ${pdfUrl}: ${error}` });
        continue;
      }
      const items = data?.inmuebles ?? [];
      log.info(`  ${items.length} inmuebles extraídos del PDF`);
      result.records_found += items.length;
      for (const it of items) {
        const inm = toInmueble(it, pdfUrl);
        if (inm) inmuebles.push(inm);
      }
    }

    log.info(`Inmuebles válidos totales: ${inmuebles.length}`);
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
