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
import { normalizeCity, type Inmueble, type ScrapingRunResult } from '../../../lib/types.js';
import { isEntrypoint } from '../../../lib/is-main.js';

const SOURCE = 'bancolombia';
const COUNTRY = 'CO';
const BASE_URL = 'https://inmobiliariotu360.bancolombia.com';
const LISTADO_URL = `${BASE_URL}/`;
const log = createLogger(SOURCE);

// Patrón confirmado tras exploración:
// Bancolombia TU360 usa URLs tipo: /{slug-largo-con-codigo}/p
// Ejemplos:
//   /apartamento-en-venta-en-itagui-itagui-tu360inmobiliario-dmc219-3/p
//   /proyecto-de-vivienda-alzati/p
// El slug entero es source_id (es único en el portal).
const DETAIL_URL_PATTERN = /https?:\/\/inmobiliariotu360\.bancolombia\.com\/([a-z0-9\-]+)\/p(?:[?#]|$)/gi;

const FICHA_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string', description: 'Ciudad en Colombia, en minúsculas sin tildes' },
    zone: { type: 'string', description: 'Barrio o zona', nullable: true },
    address: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['apartment', 'house', 'commercial', 'lot'] },
    price: { type: 'number', description: 'Precio EXACTO COP, número completo SIN REDONDEAR. $285.450.000 → 285450000.' },
    price_raw: { type: 'string', description: 'Precio LITERAL como aparece en el portal. Ej: "$285.450.000"', nullable: true },
    area_m2: { type: 'number', description: 'Área EXACTA en m² con decimales conservados (87.5 → 87.5, no 88).', nullable: true },
    area_raw: { type: 'string', description: 'Área LITERAL como aparece. Ej: "87.50 m²"', nullable: true },
    bedrooms: { type: 'number', nullable: true },
    bathrooms: { type: 'number', nullable: true },
    garages: { type: 'number', nullable: true },
    stratum: { type: 'number', nullable: true },
    image_url: { type: 'string', description: 'URL de la imagen principal (og:image o primera foto del carrusel)', nullable: true },
    image_urls: {
      type: 'array',
      description: 'TODAS las URLs de fotos del inmueble (galería completa del carrusel). Solo URLs absolutas (https://...).',
      items: { type: 'string' },
      nullable: true,
    },
    description: { type: 'string', description: 'Descripción larga del vendedor', nullable: true },
    amenities: {
      type: 'array',
      description: 'Amenidades del inmueble/edificio (piscina, gym, ascensor, BBQ, etc.)',
      items: { type: 'string' },
      nullable: true,
    },
    year_built: { type: 'number', description: 'Año de construcción', nullable: true },
    antiguedad: { type: 'string', description: 'Antigüedad como texto', nullable: true },
    administracion: { type: 'number', description: 'Administración mensual COP', nullable: true },
  },
  required: ['city', 'type', 'price'],
} as const;

const PROMPT = `
Extrae los datos de este inmueble publicado por Bancolombia (Portal TU360) en Colombia.
Precio en pesos colombianos (COP). Si un dato no aparece, devuelve null.

CRÍTICO — VALORES EXACTOS SIN REDONDEAR:
- "price": número EXACTO como aparece. Si dice $285.450.000 → 285450000. NUNCA redondees a millones.
- "price_raw": copia el texto LITERAL del precio (con $, puntos). Ej: "$285.450.000".
- "area_m2": área CON decimales conservados (87.5 → 87.5, no 88).
- "area_raw": área LITERAL como aparece en el portal. Ej: "87.50 m²".

Para "image_urls" extrae TODAS las fotos del carrusel.
Para "type": apartamento→"apartment", casa→"house", local/oficina/bodega→"commercial", lote→"lot".
Para "city": en minúsculas sin tildes.
`.trim();

async function obtenerURLsDetalle(): Promise<Array<{ url: string; source_id: string }>> {
  log.info(`Listado: ${LISTADO_URL}`);

  // SPA React: necesita esperar JS. Scroll para forzar lazy load.
  const { links, error } = await scrapeMarkdown({
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

  log.debug(`Links totales en página: ${links.length}`);

  // Filtrar links que matcheen el patrón de ficha (/{slug}/p)
  const detalles = new Map<string, { url: string; source_id: string }>();
  for (const link of links) {
    const m = link.match(/^https?:\/\/inmobiliariotu360\.bancolombia\.com\/([a-z0-9\-]+)\/p\/?(?:[?#]|$)/i);
    if (!m) continue;
    const slug = m[1]!;
    if (detalles.has(slug)) continue;
    // Filtrar slugs muy cortos (probable falso positivo)
    if (slug.length < 8) continue;
    const cleanUrl = link.split('?')[0]!.split('#')[0]!;
    detalles.set(slug, { url: cleanUrl, source_id: slug });
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
  price_raw?: string | null;
  area_m2?: number | null;
  area_raw?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garages?: number | null;
  stratum?: number | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  description?: string | null;
  amenities?: string[] | null;
  year_built?: number | null;
  antiguedad?: string | null;
  administracion?: number | null;
};

function toInmueble(
  cand: { url: string; source_id: string },
  ficha: FichaExtraida,
): Inmueble | null {
  if (!ficha.price || !ficha.city) return null;
  const features: Record<string, unknown> = {};
  if (ficha.price_raw) features.price_raw = ficha.price_raw;
  if (ficha.area_raw) features.area_raw = ficha.area_raw;
  if (ficha.bedrooms != null) features.bedrooms = ficha.bedrooms;
  if (ficha.bathrooms != null) features.bathrooms = ficha.bathrooms;
  if (ficha.garages != null) features.garages = ficha.garages;
  if (ficha.stratum != null) features.stratum = ficha.stratum;
  if (ficha.description) features.description = ficha.description.substring(0, 2000);
  if (ficha.amenities?.length) features.amenities = ficha.amenities.filter((a) => typeof a === 'string' && a.length > 0).slice(0, 20);
  if (ficha.year_built) features.year_built = ficha.year_built;
  if (ficha.antiguedad) features.antiguedad = ficha.antiguedad;
  if (ficha.administracion) features.administracion = ficha.administracion;

  const isAbsUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);
  const imageUrl = isAbsUrl(ficha.image_url) ? ficha.image_url : null;

  if (Array.isArray(ficha.image_urls)) {
    const gallery = [...new Set(ficha.image_urls.filter(isAbsUrl))];
    if (gallery.length > 0) features.images = gallery.slice(0, 20);
  }

  return {
    country_code: COUNTRY,
    city: normalizeCity(ficha.city),
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
    image_url: imageUrl,
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

const isMain = isEntrypoint(import.meta.url);
if (isMain) {
  const arg = process.argv.find((a) => a.startsWith('--max='));
  const maxDetails = arg ? parseInt(arg.split('=')[1]!, 10) : undefined;
  run({ maxDetails })
    .then((r) => { log.info('Done', r); process.exit(0); })
    .catch((e) => { log.error('Failed', e); process.exit(1); });
}
