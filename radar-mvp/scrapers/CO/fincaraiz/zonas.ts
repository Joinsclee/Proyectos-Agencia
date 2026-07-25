/**
 * Carga las zonas monitoreadas (radar_zonas_monitoreadas). Si la tabla aún no
 * existe (migración sin aplicar) o está vacía, cae a una zona piloto hardcodeada
 * para que el scraper sea ejecutable de inmediato.
 */
import { supabase } from '../../../lib/supabase.js';
import { createLogger } from '../../../lib/logger.js';

const log = createLogger('fincaraiz-zonas');

export interface RadarZona {
  id?: string;
  country_code: string;
  city: string;
  portal: string;
  operation: string;
  property_type: string; // slug del portal: 'apartamentos'
  neighborhood_slug: string | null; // 'robledo' (opcional: acota a barrio)
  city_slug: string;
  dept_slug: string;
  location_id: string | null;
  price_min: number | null;
  price_max: number | null;
  area_min: number | null;
  area_max: number | null;
  stratum_min: number | null;
  stratum_max: number | null;
  bedrooms_min: number | null;
  max_pages: number;
  min_comparables: number;
}

/** Etiqueta legible de la zona para logs (barrio si existe, si no ciudad). */
export function zonaLabel(z: RadarZona): string {
  return z.neighborhood_slug ? `${z.city}/${z.neighborhood_slug}` : z.city;
}

/**
 * Barrios piloto de Medellín (igual al seed de la migración). Fallback si la
 * tabla aún no existe. Segmento objetivo 80-380M, mid-stratum.
 */
const base = {
  country_code: 'CO',
  city: 'Medellín',
  portal: 'fincaraiz',
  operation: 'venta',
  property_type: 'apartamentos',
  city_slug: 'medellin',
  dept_slug: 'antioquia',
  location_id: null,
  price_min: 80_000_000,
  price_max: 380_000_000,
  area_min: 30,
  area_max: 120,
  stratum_min: 2,
  stratum_max: 5,
  bedrooms_min: 1,
  max_pages: 40,
  min_comparables: 8,
} as const;

// Barrios de Medellín (segmento low-mid ticket, scrape por barrio).
const BARRIOS_MED: RadarZona[] = [
  'robledo',
  'castilla',
  'manrique',
  'aranjuez',
  'buenos-aires',
  'prado',
].map((n) => ({ ...base, neighborhood_slug: n }));

// Ciudades a nivel city-deep (cobertura total: paginación auto hasta lastPage,
// sin filtro de segmento — el motor/dashboard filtran después).
const CIUDADES: RadarZona[] = [
  { city: 'Bucaramanga', city_slug: 'bucaramanga', dept_slug: 'santander' },
  { city: 'Pereira', city_slug: 'pereira', dept_slug: 'risaralda' },
  { city: 'Manizales', city_slug: 'manizales', dept_slug: 'caldas' },
].map((c) => ({
  ...base,
  ...c,
  neighborhood_slug: null,
  max_pages: 0, // 0 = auto: paginar hasta lastPage (city-deep)
  price_min: null,
  price_max: null,
  area_min: null,
  area_max: null,
  stratum_min: null,
  stratum_max: null,
}));

const PILOTO: RadarZona[] = [...BARRIOS_MED, ...CIUDADES];

export async function loadActiveZonas(
  filterSlug?: string,
  operation: 'venta' | 'arriendo' = 'venta',
): Promise<RadarZona[]> {
  const match = (z: RadarZona) =>
    !filterSlug || z.neighborhood_slug === filterSlug || z.city_slug === filterSlug;
  const fallback = operation === 'venta'
    ? PILOTO
    : PILOTO.map((z) => ({
      ...z,
      operation: 'arriendo',
      price_min: null,
      price_max: null,
    }));

  const { data, error } = await supabase
    .from('radar_zonas_monitoreadas')
    .select('*')
    .eq('is_active', true)
    .eq('portal', 'fincaraiz')
    .eq('operation', operation);

  if (error) {
    log.warn(`No se pudo leer radar_zonas_monitoreadas (${error.message}). Uso barrios piloto.`);
    return fallback.filter(match);
  }
  if (!data || data.length === 0) {
    log.warn(`radar_zonas_monitoreadas sin zonas de ${operation}. Uso piloto hardcodeado.`);
    return fallback.filter(match);
  }

  return (data as RadarZona[]).filter(match);
}
