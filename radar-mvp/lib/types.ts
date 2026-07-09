import { z } from 'zod';

/**
 * Normaliza el nombre de ciudad: lowercase + sin tildes + espacios colapsados.
 * Ej: "Cúcuta" → "cucuta", "  Bogotá D.C. " → "bogota d.c."
 *
 * Aplicar en cada scraper antes de devolver el Inmueble. Garantiza que los
 * filtros del frontend (city='cucuta') matcheen sin depender del LLM.
 */
export function normalizeCity(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// ── Topes del sistema (ajustables) ──
// Errores de datos (imposibles → se descartan SIEMPRE, incluso al ingerir):
export const MAX_PPM2 = 50_000_000;            // $/m² por encima = error (el máx real en CO ≈ $25M/m²)
export const ERROR_PRICE = 15_000_000_000;     // > $15.000M total = casi seguro un error de carga
// Valor "super-elevado" (fuera del segmento objetivo → NO se muestra ni entra a
// la mediana de comparables; pedido del cliente). Ajustable sin re-scrapear.
export const MAX_DISPLAY_PRICE = 3_000_000_000; // > $3.000M no se muestra
// Descuento máximo creíble: un aviso "99% bajo el mercado" es error de datos
// (área o precio mal cargado), NO una oportunidad. Se descarta como oportunidad
// y no se muestra. Una ganga real rara vez pasa del 55-60%.
export const MAX_OPP_DISCOUNT = 70; // %

/**
 * Heurística de outlier: descarta inmuebles con datos absurdos del scraping.
 * Razones típicas: parser malinterpretó una celda del PDF (2.55m² en vez de 255m²),
 * registro de prueba con precio simbólico, o un valor astronómico mal cargado.
 */
export function isReasonableInmueble(item: { price?: number | null; area_m2?: number | null }): boolean {
  if (!item.price || item.price < 30_000_000) return false;             // < 30M COP es ruido
  if (item.price > ERROR_PRICE) return false;                           // precio astronómico = error
  if (item.area_m2 != null && item.area_m2 < 5) return false;           // < 5m² es ruido
  if (item.area_m2 != null && item.area_m2 > 100_000) return false;     // > 100k m² es ruido (lote gigante mal parseado)
  if (item.price && item.area_m2 && item.price / item.area_m2 > MAX_PPM2) return false; // $/m² imposible = error
  return true;
}

/**
 * Modelo unificado de inmueble. Todos los scrapers normalizan a esta forma
 * antes de hacer upsert a Supabase.
 *
 * Espejo del schema SQL `public.inmuebles` (migrations/20260531000001).
 */
export const InmuebleSchema = z.object({
  country_code: z.string().length(2),               // 'CO', 'MX', ...
  city: z.string().min(1),
  zone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  type: z.string().nullable().optional(),           // 'apartment' | 'house' | 'commercial' | 'lot'
  price: z.number().positive().nullable().optional(),
  currency: z.string().length(3).default('COP'),
  area_m2: z.number().positive().nullable().optional(),
  features: z.record(z.unknown()).default({}),      // bedrooms, bathrooms, garages, stratum...

  source: z.string().min(1),                        // 'davivienda', etc.
  source_id: z.string().min(1),                     // código único en el portal
  source_url: z.string().url(),
  image_url: z.string().url().nullable().optional(),
});

export type Inmueble = z.infer<typeof InmuebleSchema>;

/**
 * Status de un run de scraper. Se persiste en `scraping_logs`.
 */
export type ScrapingRunStatus = 'running' | 'success' | 'partial' | 'error';

export interface ScrapingRunResult {
  records_found: number;
  records_inserted: number;
  records_updated: number;
  errors: Array<{ message: string; context?: unknown }>;
  meta?: Record<string, unknown>;
}
