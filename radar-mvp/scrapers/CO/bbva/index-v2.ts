/**
 * Scraper BBVA V2 — Procesamiento local de PDFs página por página.
 *
 * BBVA publica 3 PDFs en su landing (Casas, Apartamentos, Oficinas-y-locales).
 * Cada PDF tiene:
 *   - Páginas iniciales (1-13 aprox): tablas resumen → skipear
 *   - Páginas 14+: 1 ficha individual por página con foto incrustada
 *
 * Marcador de ficha: "Precio sugerido:" (presente solo en páginas-ficha).
 * Datos exactos vía regex — sin LLM, sin créditos extra.
 */
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import {
  downloadPdf,
  getPdfPageCount,
  renderPage,
  extractPageText,
  readJpg,
} from '../../../lib/pdf-pages.js';
import { scrapeMarkdown } from '../../../lib/firecrawl.js';
import { uploadImage, BUCKET_PDF } from '../../../lib/storage.js';
import {
  upsertInmuebles,
  startScrapingLog,
  finishScrapingLog,
} from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';
import { normalizeCity, type Inmueble, type ScrapingRunResult } from '../../../lib/types.js';

const SOURCE = 'bbva';
const COUNTRY = 'CO';
const LANDING_URL = 'https://www.bbva.com.co/personas/promocion/remates.html';
const log = createLogger(SOURCE);
const WORK_DIR = '/tmp/radar-pdf-work/bbva';

const PDF_TYPE_MAP: Record<string, 'apartment' | 'house' | 'commercial'> = {
  apartamentos: 'apartment',
  casas: 'house',
  'oficinas-y-locales': 'commercial',
};

// ────────────────────────────────────────────────────────────
// Resolver URLs de los PDFs desde la landing
// ────────────────────────────────────────────────────────────
async function obtenerPdfsUrls(): Promise<Array<{ url: string; type: 'apartment' | 'house' | 'commercial' }>> {
  const { links, error } = await scrapeMarkdown({ url: LANDING_URL });
  if (error) throw new Error(`landing: ${error}`);
  const pdfs: Array<{ url: string; type: 'apartment' | 'house' | 'commercial' }> = [];
  for (const link of links) {
    if (!/Inventario.*\.pdf$/i.test(link)) continue;
    const lower = link.toLowerCase();
    let type: 'apartment' | 'house' | 'commercial' | null = null;
    if (lower.includes('apartamentos')) type = 'apartment';
    else if (lower.includes('casas')) type = 'house';
    else if (lower.includes('oficinas') || lower.includes('locales')) type = 'commercial';
    if (type && !pdfs.some((p) => p.url === link)) pdfs.push({ url: link, type });
  }
  return pdfs;
}

// ────────────────────────────────────────────────────────────
// Parseo de UNA página BBVA
// ────────────────────────────────────────────────────────────
interface BbvaFields {
  city: string;
  zone: string | null;
  type: 'apartment' | 'house' | 'commercial';
  price: number;
  price_raw: string;
  source_id: string;
  area_m2: number | null;
  area_raw: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  garages: number | null;
  stratum: number | null;
  antiguedad: string | null;
  address: string | null;
  description: string | null;
  fincaraiz_url: string | null;
}

function parseNumericPrice(raw: string): number {
  const clean = raw.replace(/[$\s.]/g, '').replace(/,\d*$/, '');
  const n = parseInt(clean, 10);
  return isNaN(n) ? 0 : n;
}

function parseNumericArea(raw: string): number | null {
  // BBVA usa "143,57" (coma decimal) o "153" (sin decimal)
  const clean = raw.replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseBbvaPage(text: string, type: 'apartment' | 'house' | 'commercial'): BbvaFields | null {
  // Marcador de ficha
  if (!/Precio sugerido:/i.test(text)) return null;

  // PRIMERA LÍNEA: "Bogotá – Santa Bárbara Central" → city – zone
  const headerMatch = text.match(/^\s*([^\n]+?)\s*\r?\n\s*Precio sugerido:/m);
  if (!headerMatch) return null;
  const header = headerMatch[1]!.trim();
  let city = header;
  let zone: string | null = null;
  // Separadores: " – " (en-dash), " - ", " — "
  const sep = header.match(/^(.+?)\s*[–\-—]\s*(.+)$/);
  if (sep) {
    city = sep[1]!.trim();
    zone = sep[2]!.trim();
  }

  // PRECIO + CÓDIGO: "Precio sugerido: $1.246.200.000.oo No 31393"
  const priceMatch = text.match(/Precio sugerido:\s*\$\s*([\d.,]+)(?:\.oo)?\s*No\s*(\d+)/i);
  if (!priceMatch) return null;
  const price_raw = `$${priceMatch[1]!.trim()}`;
  const price = parseNumericPrice(priceMatch[1]!);
  if (!price) return null;
  const source_id = priceMatch[2]!;

  // ÁREA: "Área: 143,57 m2" o "Área: 153 m2"
  const areaMatch = text.match(/Área:\s*([\d.,]+)\s*m[²2]/i);
  const area_raw = areaMatch ? `${areaMatch[1]!} m²` : null;
  const area_m2 = areaMatch ? parseNumericArea(areaMatch[1]!) : null;

  // PARQUEADEROS / HABITACIONES / BAÑOS / ESTRATO
  const garages = matchInt(text, /Parqueaderos:\s*(\d+)/i);
  const bedrooms = matchInt(text, /Habitaciones:\s*(\d+)/i);
  const bathrooms = matchInt(text, /Baños:\s*(\d+)/i);
  const stratum = matchInt(text, /Estrato:\s*(\d+)/i);

  // ANTIGÜEDAD: "Antigüedad: 0 años"
  const antMatch = text.match(/Antigüedad:\s*([^\n]+?)(?=\r?\n|$)/i);
  const antiguedad = antMatch ? antMatch[1]!.trim() : null;

  // DIRECCIÓN: "Dirección: Cr. 13 No. 119-71..."
  const dirMatch = text.match(/Dirección:\s*([^\n]+)/i);
  const address = dirMatch ? dirMatch[1]!.trim() : null;

  // FincaRaíz link (opcional, útil como source_url back-pointer)
  const fcMatch = text.match(/https?:\/\/www\.fincaraiz\.com\.co\/\S+/i);
  const fincaraiz_url = fcMatch ? fcMatch[0].replace(/[\s\n=]+$/, '') : null;

  // DESCRIPCIÓN: bloque después de "Ver:" o "Dirección:" hasta "Contáctenos"
  const descMatch = text.match(/(?:Inmueble|Apartamento|Casa|Lote|Local|Bodega)\s+con\s+([\s\S]*?)(?=\s*\r?\n\s*Contáctenos)/i);
  const description = descMatch
    ? descMatch[0].trim().replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').substring(0, 2000)
    : null;

  return {
    city, zone, type, price, price_raw, source_id,
    area_m2, area_raw,
    bedrooms, bathrooms, garages, stratum,
    antiguedad, address, description, fincaraiz_url,
  };
}

function matchInt(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return isNaN(n) ? null : n;
}

// ────────────────────────────────────────────────────────────
// Mapper → Inmueble
// ────────────────────────────────────────────────────────────
function toInmueble(fields: BbvaFields, imageUrl: string, sourcePdfUrl: string, pageNum: number): Inmueble {
  const features: Record<string, unknown> = {
    price_raw: fields.price_raw,
    pdf_page: pageNum,
    pdf_url: sourcePdfUrl,
  };
  if (fields.area_raw) features.area_raw = fields.area_raw;
  if (fields.bedrooms != null) features.bedrooms = fields.bedrooms;
  if (fields.bathrooms != null) features.bathrooms = fields.bathrooms;
  if (fields.garages != null) features.garages = fields.garages;
  if (fields.stratum != null) features.stratum = fields.stratum;
  if (fields.antiguedad) features.antiguedad = fields.antiguedad;
  if (fields.description) features.description = fields.description;
  if (fields.fincaraiz_url) features.fincaraiz_url = fields.fincaraiz_url;

  return {
    country_code: COUNTRY,
    city: normalizeCity(fields.city),
    zone: fields.zone,
    address: fields.address,
    type: fields.type,
    price: fields.price,
    currency: 'COP',
    area_m2: fields.area_m2 ?? null,
    features,
    source: SOURCE,
    source_id: fields.source_id,
    source_url: sourcePdfUrl,
    image_url: imageUrl,
  };
}

// ────────────────────────────────────────────────────────────
// Procesar UN PDF de BBVA
// ────────────────────────────────────────────────────────────
async function procesarPdf(pdfUrl: string, type: 'apartment' | 'house' | 'commercial', opts: { maxPages?: number }): Promise<{ inmuebles: Inmueble[]; errors: Array<{ message: string }> }> {
  const errors: Array<{ message: string }> = [];
  const inmuebles: Inmueble[] = [];

  const filename = pdfUrl.split('/').pop() ?? 'bbva.pdf';
  const pdfPath = join(WORK_DIR, filename);
  const dl = await downloadPdf(pdfUrl, pdfPath, LANDING_URL);
  if (!dl.ok) {
    errors.push({ message: `download ${filename}: ${dl.error}` });
    return { inmuebles, errors };
  }

  const totalPages = getPdfPageCount(pdfPath);
  const limit = Math.min(opts.maxPages ?? totalPages, totalPages);
  log.info(`  ${filename}: ${totalPages} páginas, procesando hasta ${limit}`);

  const sourceIdsSeen = new Set<string>();
  let parsed = 0;
  for (let p = 1; p <= limit; p++) {
    let text: string;
    try {
      text = extractPageText(pdfPath, p);
    } catch (err) {
      errors.push({ message: `text p${p}: ${(err as Error).message}` });
      continue;
    }

    const fields = parseBbvaPage(text, type);
    if (!fields) continue;
    if (sourceIdsSeen.has(fields.source_id)) continue;
    sourceIdsSeen.add(fields.source_id);

    let imageUrl = '';
    try {
      const jpgPath = renderPage(pdfPath, p, WORK_DIR, { dpi: 130, quality: 80, prefix: `bbva-${type}-page` });
      const buf = readJpg(jpgPath);
      const up = await uploadImage(BUCKET_PDF, `bbva/${fields.source_id}.jpg`, buf);
      if (up.error) errors.push({ message: `upload p${p}: ${up.error}` });
      else imageUrl = up.url;
    } catch (err) {
      errors.push({ message: `render p${p}: ${(err as Error).message}` });
    }

    inmuebles.push(toInmueble(fields, imageUrl, pdfUrl, p));
    parsed++;
    if (parsed % 25 === 0) log.info(`    …${parsed} fichas en ${filename}`);
  }
  log.info(`  ${filename}: ${parsed} fichas`);
  return { inmuebles, errors };
}

// ────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────
export async function run(opts: { maxPages?: number } = {}): Promise<ScrapingRunResult> {
  const logId = await startScrapingLog(SOURCE, COUNTRY);
  const result: ScrapingRunResult = {
    records_found: 0, records_inserted: 0, records_updated: 0, errors: [], meta: {},
  };

  try {
    if (existsSync(WORK_DIR)) rmSync(WORK_DIR, { recursive: true, force: true });
    mkdirSync(WORK_DIR, { recursive: true });

    log.info('Resolviendo URLs de PDFs…');
    const pdfs = await obtenerPdfsUrls();
    log.info(`PDFs detectados: ${pdfs.length}`);
    result.meta!['pdf_count'] = pdfs.length;

    const all: Inmueble[] = [];
    for (const pdf of pdfs) {
      log.info(`▶ Procesando ${pdf.url}`);
      const r = await procesarPdf(pdf.url, pdf.type, opts);
      all.push(...r.inmuebles);
      result.errors.push(...r.errors);
    }

    log.info(`Total fichas BBVA: ${all.length}`);
    result.records_found = all.length;

    if (all.length > 0) {
      const up = await upsertInmuebles(all);
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

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = process.argv.find((a) => a.startsWith('--max='));
  const maxPages = arg ? parseInt(arg.split('=')[1]!, 10) : undefined;
  run({ maxPages })
    .then((r) => { log.info('Done', r); process.exit(0); })
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}
