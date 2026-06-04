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

/**
 * Heurística de outlier: descarta inmuebles con datos absurdos del scraping.
 * Razones típicas: parser malinterpretó una celda del PDF (2.55m² en vez de 255m²),
 * o registro de prueba con precio simbólico.
 */
export function isReasonableInmueble(item: { price?: number | null; area_m2?: number | null }): boolean {
  if (!item.price || item.price < 30_000_000) return false;             // < 30M COP es ruido
  if (item.area_m2 != null && item.area_m2 < 5) return false;            // < 5m² es ruido
  if (item.area_m2 != null && item.area_m2 > 100_000) return false;      // > 100k m² es ruido (lote gigante mal parseado)
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
