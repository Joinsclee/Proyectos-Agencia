/**
 * Parser FincaRaíz: mapea una propiedad cruda de `__NEXT_DATA__`
 * (props.pageProps.fetchResult.searchFast.data[i] — 127 campos) al modelo
 * unificado `Inmueble`.
 *
 * NO redondea ningún valor: precio, área y estrato salen exactos del portal.
 */
import { normalizeCity, type Inmueble, type RentalListing } from '../../../lib/types.js';
import type { RadarZona } from './zonas.js';

const BASE = 'https://www.fincaraiz.com.co';

/** Cruda: solo declaramos los campos que usamos (de los 127 disponibles). */
export interface FincaRaizRaw {
  id?: number | string;
  code?: string;
  title?: string;
  price?: { amount?: number | null; admin_included?: number | null; currency?: { name?: string } } | null;
  price_amount_usd?: number | null;
  commonExpenses?: { amount?: number | null } | null; // administración mensual (COP)
  m2?: number | null;
  m2Built?: number | null;
  m2apto?: number | null; // área privada
  m2Terrain?: number | null; // área del terreno (casas/lotes)
  stratum?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  rooms?: number | null;
  garage?: number | null;
  floor?: number | string | null; // piso/nivel del inmueble
  floorsCount?: number | null; // nº de pisos del edificio
  latitude?: number | string | null;
  longitude?: number | string | null;
  property_type?: { id?: number; name?: string } | null;
  operation_type?: { id?: number; name?: string } | null;
  antiquity?: number | string | null; // CÓDIGO de rango (1-5), no años
  construction_year?: number | null; // siempre null en SSR — no usar
  description?: string | null;
  facilities?: Array<{ name?: string; group?: string }> | null; // amenidades
  isProject?: boolean; // unidad de proyecto (preventa) — excluir de comparables
  isProjectUnit?: boolean;
  address?: string | null;
  link?: string | null;
  active?: boolean;
  sold?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  price_variation?: Record<string, unknown> | null;
  discount?: number | null;
  locations?: {
    location_point?: string;
    location_main?: { id?: string; name?: string };
    city?: Array<{ name?: string }>;
  } | null;
  images?: Array<{ image?: string }> | null;
}

/** Decodifica el código de antigüedad de FincaRaíz a texto legible. */
const ANTIQUITY_LABEL: Record<number, string> = {
  1: 'Menos de 1 año',
  2: '1 a 8 años',
  3: '9 a 15 años',
  4: '16 a 30 años',
  5: 'Más de 30 años',
};

/** Normaliza el nombre del tipo del portal a nuestra taxonomía interna. */
const TYPE_MAP: Record<string, string> = {
  apartamento: 'apartment',
  apartaestudio: 'apartment',
  casa: 'house',
  'casa campestre': 'house',
  local: 'commercial',
  'local comercial': 'commercial',
  oficina: 'office',
  consultorio: 'office',
  lote: 'lot',
  terreno: 'lot',
  finca: 'farm',
  bodega: 'warehouse',
  parqueadero: 'parking',
  edificio: 'building',
};

function mapType(name: string | undefined): string | null {
  if (!name) return null;
  const key = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
  return TYPE_MAP[key] ?? 'other';
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Mapea una propiedad cruda a Inmueble. Devuelve null si faltan datos mínimos
 * (id, precio) o si la propiedad está vendida/inactiva.
 */
export function mapFincaRaiz(raw: FincaRaizRaw, zona: RadarZona): Inmueble | null {
  if (raw.sold === true || raw.active === false) return null;

  const id = raw.id != null ? String(raw.id) : null;
  const price = toNum(raw.price?.amount ?? null);
  if (!id || !price || price <= 0) return null;

  const area = toNum(raw.m2 ?? raw.m2Built ?? null);
  const lat = toNum(raw.latitude);
  const lng = toNum(raw.longitude);
  const zone = raw.locations?.location_main?.name ?? null;
  const link = raw.link ?? '';
  const sourceUrl = link.startsWith('http') ? link : `${BASE}${link}`;

  // TODAS las fotos full-res (FincaRaíz trae ~17 por aviso, campo .image ya es 1920x1080).
  const images = (raw.images ?? [])
    .map((i) => i.image)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  const image = images[0] ?? null; // portada / image_url principal

  // Solo descuentos/variaciones reales (no objeto vacío {})
  const priceVar =
    raw.price_variation && Object.keys(raw.price_variation).length > 0
      ? raw.price_variation
      : null;

  // Administración (gasto común mensual): commonExpenses.amount, o derivable de
  // price.admin_included - price.amount (verificado exacto).
  const admin = toNum(raw.commonExpenses?.amount) ??
    (raw.price?.admin_included != null && raw.price.amount != null
      ? toNum(raw.price.admin_included) != null
        ? (toNum(raw.price.admin_included) as number) - price
        : null
      : null);
  const administracion = admin && admin > 0 ? admin : null;

  // Antigüedad: código de rango → texto legible.
  const antiqCode = toNum(raw.antiquity);
  const antiguedad = antiqCode ? ANTIQUITY_LABEL[antiqCode] ?? null : null;

  // Amenidades: facilities[].name (Balcón, Ascensor, Depósito, Vigilancia…).
  const amenities = (raw.facilities ?? [])
    .map((f) => f.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  const isProject = raw.isProject === true || raw.isProjectUnit === true;

  // Estrato válido en Colombia = 1-6. FincaRaíz a veces publica basura del
  // anunciante (ej. estrato 110); fuera de rango → null para no contaminar los
  // percentiles del motor de comparables. Verificado en vivo: el 110 viene así
  // del portal, no es error de parseo.
  const stratumRaw = toNum(raw.stratum);
  const stratum = stratumRaw != null && stratumRaw >= 1 && stratumRaw <= 6 ? stratumRaw : null;

  // Claves de features alineadas con los nombres que el dashboard ya lee
  // (administracion, antiguedad, amenities, description, bedrooms, bathrooms,
  // garages, stratum) para que se muestren sin cambios extra.
  const features: Record<string, unknown> = {
    code: raw.code ?? null,
    title: raw.title ?? null,
    stratum,
    bedrooms: toNum(raw.bedrooms),
    bathrooms: toNum(raw.bathrooms),
    garages: toNum(raw.garage),
    floor: toNum(raw.floor),
    floors_building: toNum(raw.floorsCount),
    m2_built: toNum(raw.m2Built),
    m2_private: toNum(raw.m2apto),
    m2_terrain: toNum(raw.m2Terrain),
    lat,
    lng,
    neighborhood: zone,
    neighborhood_id: raw.locations?.location_main?.id ?? null,
    operation: raw.operation_type?.name ?? null,
    antiguedad,
    administracion,
    amenities,
    description: raw.description ?? null,
    images,
    image_count: images.length,
    is_project: isProject,
    price_usd: toNum(raw.price_amount_usd),
    price_variation: priceVar,
    portal_discount: toNum(raw.discount),
    portal_created_at: raw.created_at ?? null,
    portal_updated_at: raw.updated_at ?? null,
  };

  return {
    country_code: zona.country_code,
    city: normalizeCity(zona.city),
    zone,
    address: raw.address ?? null, // FincaRaíz sí expone dirección en el listado
    type: mapType(raw.property_type?.name),
    price,
    currency: 'COP',
    area_m2: area ?? null,
    features,
    source: 'fincaraiz',
    source_id: id,
    source_url: sourceUrl,
    image_url: image,
  };
}

/**
 * Traduce el mismo aviso normalizado al modelo mensual de arriendo. Reutilizar
 * `mapFincaRaiz` mantiene idénticas la taxonomía, ubicación, fotos y
 * características, pero cambia el significado monetario de forma explícita.
 */
export function mapFincaRaizRental(raw: FincaRaizRaw, zona: RadarZona): RentalListing | null {
  const normalized = mapFincaRaiz(raw, zona);
  if (!normalized?.price) return null;
  return {
    country_code: normalized.country_code,
    city: normalized.city,
    zone: normalized.zone,
    address: normalized.address,
    type: normalized.type,
    monthly_rent: normalized.price,
    currency: normalized.currency,
    area_m2: normalized.area_m2,
    features: normalized.features,
    source: normalized.source,
    source_id: normalized.source_id,
    source_url: normalized.source_url,
    image_url: normalized.image_url,
  };
}

/**
 * Filtro de elegibilidad: ¿este inmueble cae en el segmento objetivo de la zona?
 * Se usa para acotar el set de comparables a lo realmente comparable (no mezclar
 * un penthouse de $1.000M estrato 6 con VIS estrato 2).
 */
export function isEligible(it: Inmueble, zona: RadarZona): boolean {
  const price = it.price ?? 0;
  if (zona.price_min != null && price < zona.price_min) return false;
  if (zona.price_max != null && price > zona.price_max) return false;

  const area = it.area_m2 ?? null;
  if (area != null) {
    if (zona.area_min != null && area < zona.area_min) return false;
    if (zona.area_max != null && area > zona.area_max) return false;
  }

  const stratum = (it.features?.stratum as number | null) ?? null;
  if (stratum != null) {
    if (zona.stratum_min != null && stratum < zona.stratum_min) return false;
    if (zona.stratum_max != null && stratum > zona.stratum_max) return false;
  }

  const beds = (it.features?.bedrooms as number | null) ?? null;
  if (beds != null && zona.bedrooms_min != null && beds < zona.bedrooms_min) return false;

  return true;
}
