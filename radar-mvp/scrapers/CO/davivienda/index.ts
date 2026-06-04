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
import { normalizeCity, type Inmueble, type ScrapingRunResult } from '../../../lib/types.js';

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
    price: { type: 'number', description: 'Precio EXACTO en COP (solo el número, SIN REDONDEAR, sin separadores). Ej: si dice $285.450.000 → 285450000 EXACTO.' },
    price_raw: { type: 'string', description: 'Precio EXACTAMENTE como aparece (texto literal con $, puntos). Ej: "$285.450.000"', nullable: true },
    area_m2: { type: 'number', description: 'Área EXACTA en m² SIN REDONDEAR. Si dice 87.5 m² → 87.5, si dice 143,57 m² → 143.57. Conserva decimales.', nullable: true },
    area_raw: { type: 'string', description: 'Área literal como aparece. Ej: "87.50 m²" o "143,57 m²"', nullable: true },
    bedrooms: { type: 'number', description: 'Habitaciones', nullable: true },
    bathrooms: { type: 'number', description: 'Baños', nullable: true },
    garages: { type: 'number', description: 'Garajes/parqueaderos', nullable: true },
    stratum: { type: 'number', description: 'Estrato socioeconómico (1-6)', nullable: true },
    image_url: { type: 'string', description: 'URL de la imagen principal (suele estar en meta og:image)', nullable: true },
    image_urls: {
      type: 'array',
      description: 'TODAS las URLs de fotos del inmueble (galería completa, suele haber 5-15 en el carrusel). Incluye la principal también. Solo URLs absolutas (https://...).',
      items: { type: 'string' },
      nullable: true,
    },
    description: { type: 'string', description: 'Descripción larga del inmueble del vendedor (texto completo). Si no hay, null.', nullable: true },
    amenities: {
      type: 'array',
      description: 'Lista de amenidades / características adicionales del inmueble o del edificio (piscina, gimnasio, terraza, balcón, ascensor, BBQ, salón social, portería 24h, etc.). Array de strings cortos.',
      items: { type: 'string' },
      nullable: true,
    },
    year_built: { type: 'number', description: 'Año de construcción si aparece', nullable: true },
    antiguedad: { type: 'string', description: 'Antigüedad como texto (ej: "5 años", "Nuevo", "Más de 20 años")', nullable: true },
    administracion: { type: 'number', description: 'Cuota de administración mensual en COP', nullable: true },
  },
  required: ['city', 'type', 'price'],
} as const;

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

const PROMPT = `
Extrae los datos de este inmueble publicado en venta por Davivienda en Colombia.
El precio es en pesos colombianos (COP).

CRÍTICO — VALORES EXACTOS SIN REDONDEAR:
- "price": número EXACTO. Si el portal dice $285.450.000 → 285450000. NUNCA redondees a millones ni acortes.
- "price_raw": copia el texto LITERAL como aparece (con $, puntos, decimales). Ej: "$285.450.000".
- "area_m2": número exacto CON DECIMALES. 87.50 m² → 87.50 (no 88). 143,57 → 143.57.
- "area_raw": copia literal del área como aparece. Ej: "87.50 m²" o "143,57 m²".

IMPORTANTE:
- Para "image_urls" extrae TODAS las fotos del carrusel/galería (no solo la principal). Davivienda muestra varias fotos por propiedad — incluye todas con URL absoluta.
- Para "description" copia el texto completo de descripción del vendedor si aparece.
- Para "amenities" extrae lista de servicios/características del edificio (piscina, gym, ascensor, etc.).
- Si un dato no aparece claramente, devuelve null en vez de inventarlo.
- Para "type": apartamento → "apartment", casa → "house", local/oficina/bodega → "commercial", lote → "lot".
- Para "city": minúsculas sin tildes (bogota, medellin, etc.).
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

  // Validar URLs absolutas (LLM a veces devuelve paths relativos)
  const isAbsUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

  const imageUrl = isAbsUrl(ficha.image_url) ? ficha.image_url : null;

  // Galería: validar cada URL, dedupar, conservar primera como principal
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
    source_id: candidate.source_id,
    source_url: candidate.url,
    image_url: imageUrl,
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
