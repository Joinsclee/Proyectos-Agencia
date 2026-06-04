/**
 * Scraper Aval V2 — Procesamiento local de PDF página por página.
 *
 * Reemplaza al v1 (Firecrawl extract sobre PDF) que solo extraía ~7 inmuebles.
 * Este v2:
 *   - Descarga el PDF directo (curl-like) — Aval permite descarga sin WAF
 *   - Detecta páginas-ficha (1 inmueble por página) por marcador "Precio de venta"
 *   - Extrae datos EXACTOS con regex (sin LLM, sin redondeos)
 *   - Renderiza cada página como JPG y la sube a Supabase Storage
 *   - Upsert con URL pública de la imagen como `image_url`
 *
 * Resultado esperado: ~300 inmuebles del PDF de 310 páginas con foto fiel.
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
import { uploadImage, BUCKET_PDF } from '../../../lib/storage.js';
import {
  upsertInmuebles,
  startScrapingLog,
  finishScrapingLog,
} from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';
import { normalizeCity, type Inmueble, type ScrapingRunResult } from '../../../lib/types.js';

const SOURCE = 'aval';
const COUNTRY = 'CO';
const LANDING_URL = 'https://www.avalvc.com.co/portal-inmobiliario';
const log = createLogger(SOURCE);

const WORK_DIR = '/tmp/radar-pdf-work/aval';

// ────────────────────────────────────────────────────────────
// PASO 1: Resolver URL del PDF (puede cambiar con la fecha)
// ────────────────────────────────────────────────────────────
async function resolverPdfUrl(): Promise<string | null> {
  const res = await fetch(LANDING_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // Patrón: /repositorio/Avalvc/portal-inmobiliario/DD-MM-YY/Inmuebles.pdf
  const m = html.match(/\/repositorio\/[^"'\s]*Inmuebles\.pdf/i);
  if (!m) return null;
  const path = m[0].startsWith('http') ? m[0] : `https://www.avalvc.com.co${m[0]}`;
  return path;
}

// ────────────────────────────────────────────────────────────
// PASO 2: Extracción regex de UNA página de Aval
// ────────────────────────────────────────────────────────────
interface AvalFields {
  type_raw: string;           // 'Apartamento', 'Casa'…
  type: 'apartment' | 'house' | 'commercial' | 'lot';
  price: number;
  price_raw: string;          // '$154.000.000' textual
  area_m2: number | null;
  area_raw: string | null;    // '52.30 m²' textual
  source_id: string;
  city: string;
  zone: string | null;
  address: string | null;
  description: string | null;
  observaciones: string | null;
}

const TIPO_MAP: Record<string, AvalFields['type']> = {
  apartamento: 'apartment',
  casa: 'house',
  local: 'commercial',
  oficina: 'commercial',
  bodega: 'commercial',
  lote: 'lot',
};

function parseNumericPrice(raw: string): number {
  // "$154.000.000" → 154000000
  // En Colombia el separador de miles es "." (no decimal). Aval no tiene decimales en precio.
  const clean = raw.replace(/[$\s.]/g, '').replace(/,\d*$/, '');
  const n = parseInt(clean, 10);
  return isNaN(n) ? 0 : n;
}

function parseNumericArea(raw: string): number | null {
  // "52.30" o "143,57" → 52.30 / 143.57
  const clean = raw.replace(/\./g, '.').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

/**
 * Parsea texto plano de una página de Aval. Retorna null si no es una ficha.
 */
function parseAvalPage(text: string): AvalFields | null {
  // Validar marcador de ficha
  if (!/Precio de venta/i.test(text)) return null;

  // PRECIO — busca "$XXX.XXX.XXX" anterior a "Precio de venta"
  const priceMatch = text.match(/\$\s*([\d.,]+)\s*\r?\n\s*Precio de venta/i);
  if (!priceMatch) return null;
  const price_raw = `$${priceMatch[1]!.replace(/\s/g, '')}`;
  const price = parseNumericPrice(priceMatch[1]!);
  if (!price) return null;

  // TIPO + ÁREA + CÓDIGO — línea con formato:
  // "Apartamento                    52.30 m²                   BA19607"
  // Tolerar variaciones de espaciado y "m2" / "m²" / "M²"
  const tipoLine = text.match(/^\s*(Apartamento|Casa|Local|Oficina|Bodega|Lote)\s+([\d.,]+)\s*m[²2]?\s+([A-Z0-9\-]+)/im);
  if (!tipoLine) return null;
  const type_raw = tipoLine[1]!;
  const area_raw = `${tipoLine[2]} m²`;
  const area_m2 = parseNumericArea(tipoLine[2]!);
  const source_id = tipoLine[3]!;
  const type = TIPO_MAP[type_raw.toLowerCase()] ?? 'apartment';

  // DIRECCIÓN — línea anterior a "Dirección" (encabezado)
  const dirMatch = text.match(/^\s*(.+?)\s*\r?\n\s*Dirección\s*$/im);
  const address = dirMatch ? dirMatch[1]!.trim() : null;

  // CIUDAD — línea anterior a "Ciudad"
  const cityMatch = text.match(/^\s*(.+?)\s*\r?\n\s*Ciudad\s*$/im);
  let cityRaw = cityMatch ? cityMatch[1]!.trim() : '';
  let zone: string | null = null;
  // Aval suele poner "Ciudad - Departamento" / "Ciudad – Departamento" / "Ciudad, Departamento"
  // Tomamos solo la ciudad (todo lo anterior al primer separador de departamento)
  const splitMatch = cityRaw.match(/^([^,\-–—]+?)\s*[,\-–—]\s*(.+)$/);
  if (splitMatch) {
    cityRaw = splitMatch[1]!.trim();
  }

  // DESCRIPCIÓN — bloque entre "Descripción" y "Observaciones"
  const descMatch = text.match(/Descripción\s*\n([\s\S]*?)(?=\n\s*Observaciones|\n\s*El valor de venta|\Z)/i);
  const description = descMatch ? descMatch[1]!.trim().replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').substring(0, 2000) : null;

  // OBSERVACIONES — bloque entre "Observaciones" y "El valor de venta"
  const obsMatch = text.match(/Observaciones\s*\n([\s\S]*?)(?=\n\s*El valor de venta|\Z)/i);
  const observaciones = obsMatch ? obsMatch[1]!.trim().replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').substring(0, 500) : null;

  return {
    type_raw, type, price, price_raw,
    area_m2, area_raw,
    source_id, city: cityRaw, zone, address,
    description, observaciones,
  };
}

// ────────────────────────────────────────────────────────────
// PASO 3: Convertir fields + URL imagen → Inmueble normalizado
// ────────────────────────────────────────────────────────────
function toInmueble(fields: AvalFields, imageUrl: string, sourcePdfUrl: string, pageNum: number): Inmueble {
  const features: Record<string, unknown> = {
    price_raw: fields.price_raw,
    pdf_page: pageNum,
    pdf_url: sourcePdfUrl,
  };
  if (fields.area_raw) features.area_raw = fields.area_raw;
  if (fields.type_raw) features.type_raw = fields.type_raw;
  if (fields.description) features.description = fields.description;
  if (fields.observaciones) features.observaciones = fields.observaciones;
  if (fields.address) features.address_raw = fields.address;

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
    source_url: sourcePdfUrl, // Fuente = el PDF mismo
    image_url: imageUrl,
  };
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
    // 1. Resolver URL dinámica
    log.info('Resolviendo URL del PDF…');
    const pdfUrl = await resolverPdfUrl();
    if (!pdfUrl) throw new Error('No se encontró link del PDF en landing');
    log.info(`PDF URL: ${pdfUrl}`);

    // 2. Limpieza working dir + descarga
    if (existsSync(WORK_DIR)) rmSync(WORK_DIR, { recursive: true, force: true });
    mkdirSync(WORK_DIR, { recursive: true });
    const pdfPath = join(WORK_DIR, 'aval.pdf');

    const dl = await downloadPdf(pdfUrl, pdfPath, LANDING_URL);
    if (!dl.ok) throw new Error(`Descarga PDF: ${dl.error}`);
    result.meta!['pdf_size_mb'] = ((dl.size ?? 0) / 1024 / 1024).toFixed(1);
    result.meta!['download_via'] = dl.via;

    // 3. Iterar páginas
    const totalPages = getPdfPageCount(pdfPath);
    const limit = opts.maxPages ?? totalPages;
    log.info(`PDF tiene ${totalPages} páginas. Procesando hasta ${limit}.`);
    result.meta!['total_pages'] = totalPages;

    const inmuebles: Inmueble[] = [];
    const sourceIdsSeen = new Set<string>();
    let parsedOk = 0;
    let skipped = 0;

    for (let p = 1; p <= limit; p++) {
      let text: string;
      try {
        text = extractPageText(pdfPath, p);
      } catch (err) {
        result.errors.push({ message: `extractText p${p}: ${(err as Error).message}` });
        continue;
      }

      const fields = parseAvalPage(text);
      if (!fields) {
        skipped++;
        continue;
      }

      // Dedup por source_id dentro de un mismo PDF
      if (sourceIdsSeen.has(fields.source_id)) {
        skipped++;
        continue;
      }
      sourceIdsSeen.add(fields.source_id);

      // Render página + upload
      let imageUrl = '';
      try {
        const jpgPath = renderPage(pdfPath, p, WORK_DIR, { dpi: 130, quality: 80, prefix: 'page' });
        const buf = readJpg(jpgPath);
        const uploadPath = `aval/${fields.source_id}.jpg`;
        const up = await uploadImage(BUCKET_PDF, uploadPath, buf);
        if (up.error) {
          result.errors.push({ message: `upload p${p}: ${up.error}` });
        } else {
          imageUrl = up.url;
        }
      } catch (err) {
        result.errors.push({ message: `render/upload p${p}: ${(err as Error).message}` });
      }

      inmuebles.push(toInmueble(fields, imageUrl, pdfUrl, p));
      parsedOk++;

      if (p % 25 === 0) log.info(`  …página ${p}/${limit} · parsed=${parsedOk} · skipped=${skipped}`);
    }

    log.info(`Páginas procesadas: ${limit} · fichas válidas: ${parsedOk} · skipped: ${skipped}`);
    result.records_found = inmuebles.length;
    result.meta!['pages_parsed'] = parsedOk;
    result.meta!['pages_skipped'] = skipped;

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

// CLI
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = process.argv.find((a) => a.startsWith('--max='));
  const maxPages = arg ? parseInt(arg.split('=')[1]!, 10) : undefined;
  run({ maxPages })
    .then((r) => { log.info('Done', r); process.exit(0); })
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}
