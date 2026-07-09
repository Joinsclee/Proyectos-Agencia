/**
 * Tipos del scraper de rematandobienes.com
 *
 * Modelo basado en el recon de `_session/remates-recon.json` y mapeado
 * a la tabla SQL `public.remates` (migración 20260609000001_remates.sql).
 */
import { z } from 'zod';

// Tipos de bien en remate judicial. Incluye categorías no-residenciales que el
// portal lista (vehículos, parqueaderos) — el cliente quiere TODO el contenido.
export const PROPERTY_TYPES = [
  'house', 'apartment', 'lot', 'commercial', 'farm', 'office',
  'vehicle', 'parking', 'rights',
] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];

export const AUCTION_MODES = ['virtual', 'presencial', 'mixto'] as const;
export type AuctionMode = typeof AUCTION_MODES[number];

/**
 * Forma unificada de UN remate, lista para upsert en Supabase.
 * Espejo del schema SQL public.remates.
 */
export const RemateSchema = z.object({
  // identidad
  country_code: z.string().length(2).default('CO'),
  source: z.string().min(1).default('rematandobienes'),
  source_id: z.string().min(1),
  source_url: z.string().url(),

  // ubicación
  department: z.string().nullable().optional(),
  city: z.string().min(1),
  address: z.string().nullable().optional(),

  // tipo
  property_type: z.enum(PROPERTY_TYPES).nullable().optional(),
  property_type_raw: z.string().nullable().optional(),

  // identificación del bien
  matricula_inmobiliaria: z.string().nullable().optional(),
  description: z.string().nullable().optional(),

  // proceso judicial
  court: z.string().nullable().optional(),
  court_email: z.string().nullable().optional(),
  court_address: z.string().nullable().optional(),
  case_number: z.string().nullable().optional(),
  plaintiff: z.string().nullable().optional(),
  defendant: z.string().nullable().optional(),
  trustee: z.string().nullable().optional(),

  // diligencia
  auction_date: z.string().nullable().optional(), // ISO yyyy-mm-dd
  auction_date_raw: z.string().nullable().optional(),
  auction_time: z.string().nullable().optional(),
  auction_mode: z.enum(AUCTION_MODES).nullable().optional(),

  // valores
  appraisal_value: z.number().positive().nullable().optional(),
  appraisal_value_raw: z.string().nullable().optional(),
  minimum_bid: z.number().positive().nullable().optional(),
  minimum_bid_raw: z.string().nullable().optional(),
  minimum_bid_pct: z.number().nullable().optional(),
  deposit_pct: z.number().nullable().optional(),
  currency: z.string().length(3).default('COP'),

  // imagen
  image_url: z.string().url().nullable().optional(),

  // extra
  features: z.record(z.unknown()).default({}),
});

export type Remate = z.infer<typeof RemateSchema>;

/**
 * Campo crudo extraído del HTML del aviso. Lo usa el parser intermedio.
 */
export interface RemateAvisoRaw {
  url: string;
  slug: string;
  department_slug: string;
  city_slug: string;
  city_label: string;
  // Texto completo de los jet_fields en orden de aparición:
  jet_field_texts: string[];
  // Texto completo del body (fallback para regex):
  full_text: string;
  // Categorías WordPress (para inferir tipo): lote, casa, apartamento, finca, local, oficina
  categories: string[];
  // Título del aviso
  title: string;
}
