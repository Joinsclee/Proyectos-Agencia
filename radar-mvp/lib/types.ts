import { z } from 'zod';

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
