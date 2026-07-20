/**
 * Rango de precio por ciudad — leído de la tabla de configuración, nunca del código.
 *
 * Regla dura de la HU "Rango de Precio y Vigencia": ningún script de scraping ni de
 * normalización puede llevar un precio máximo escrito en el código. El negocio
 * ajusta los topes con un UPDATE a `radar_zonas_monitoreadas` y el motor los toma
 * en la siguiente corrida, sin desplegar nada.
 *
 * A quién aplica el filtro:
 *  - FincaRaíz  → SÍ. Un inmueble fuera del rango de SU ciudad se descarta antes
 *                 de entrar al motor de comparables.
 *  - Bancos y AVAL → NO. La HU de bancos lo prohíbe expresamente: el inventario
 *                 bancario es escaso y filtrarlo por precio o estrato dejaría el
 *                 módulo vacío en varias ciudades. Ahí se jerarquiza con el Índice
 *                 CRECE en vez de excluir.
 *  - Remates    → NO, por la misma razón: son subastas, y su acceso lo decide la
 *                 matriz de origen del demandante, no el precio.
 */
import { supabase } from './supabase.js';
import { normalizeCity } from './types.js';

export interface RangoCiudad {
  city: string;
  nivel: number;
  priceMin: number;
  priceMax: number;
  stratumMin: number | null;
  stratumMax: number | null;
}

/** Respaldo si la ciudad no está configurada: Nivel 2, el más conservador. */
export const RANGO_POR_DEFECTO: Omit<RangoCiudad, 'city'> = {
  nivel: 2,
  priceMin: 20_000_000,
  priceMax: 400_000_000,
  stratumMin: 2,
  stratumMax: 5,
};

const TTL_MS = 15 * 60_000;
let cache: { at: number; porCiudad: Map<string, RangoCiudad> } | null = null;
let cargando: Promise<Map<string, RangoCiudad>> | null = null;

async function cargar(): Promise<Map<string, RangoCiudad>> {
  const { data, error } = await supabase
    .from('radar_zonas_monitoreadas')
    .select('city, nivel, price_min, price_max, stratum_min, stratum_max');
  if (error) throw new Error(`ciudades: ${error.message}`);
  const m = new Map<string, RangoCiudad>();
  for (const r of (data ?? []) as any[]) {
    const c = normalizeCity(r.city);
    if (!c || m.has(c)) continue; // 1 fila por ciudad; si hubiera duplicados, gana la primera
    m.set(c, {
      city: c,
      nivel: r.nivel ?? RANGO_POR_DEFECTO.nivel,
      priceMin: Number(r.price_min ?? RANGO_POR_DEFECTO.priceMin),
      priceMax: Number(r.price_max ?? RANGO_POR_DEFECTO.priceMax),
      stratumMin: r.stratum_min ?? RANGO_POR_DEFECTO.stratumMin,
      stratumMax: r.stratum_max ?? RANGO_POR_DEFECTO.stratumMax,
    });
  }
  cache = { at: Date.now(), porCiudad: m };
  return m;
}

/** Mapa ciudad → rango, cacheado. */
export async function rangosPorCiudad(): Promise<Map<string, RangoCiudad>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.porCiudad;
  if (cargando) return cargando;
  cargando = cargar().finally(() => { cargando = null; });
  return cargando;
}

/** Rango de una ciudad. Si no está configurada, devuelve el de Nivel 2. */
export async function rangoDe(ciudad: string | null | undefined): Promise<RangoCiudad> {
  const c = normalizeCity(ciudad ?? '');
  const m = await rangosPorCiudad();
  return m.get(c) ?? { city: c, ...RANGO_POR_DEFECTO };
}

/**
 * ¿Este inmueble de FincaRaíz entra al universo de análisis?
 *
 * Solo mira el precio contra el rango de SU ciudad — el estrato no excluye: la
 * HU de bancos ya estableció que un dato ausente no debe borrar inventario, y
 * aplicar aquí un criterio distinto haría que el mismo inmueble entrara o no
 * según la fuente que lo trajo.
 */
export function enRango(precio: number | null | undefined, rango: RangoCiudad): boolean {
  if (!precio) return false;
  return precio >= rango.priceMin && precio <= rango.priceMax;
}
