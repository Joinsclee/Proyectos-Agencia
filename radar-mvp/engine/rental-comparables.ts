/**
 * Comparables de arriendo para estimar el canon mensual de una propiedad.
 *
 * El cálculo usa ofertas activas, no contratos cerrados. Por eso comunica
 * mediana, rango intercuartílico, muestra y confianza en vez de prometer un
 * valor exacto. La mediana resiste anuncios amoblados o mal digitados.
 */
import { supabase } from '../lib/supabase.js';
import { normalizeCity } from '../lib/types.js';
import { haversineKm, quantile, robustMedian, robustSpread, trimOutliers } from './stats.js';

export type RentalConfidence = 'high' | 'medium' | 'low' | 'insufficient';
export type RentalScope = 'radio' | 'zona' | 'ciudad';
export type RentalReason = 'ok' | 'insufficient' | 'source_unavailable' | 'missing_location';

export interface RentalPoolRow {
  type: string | null;
  monthly_rent: number;
  area_m2: number | null;
  rent_per_m2: number | null;
  zone: string | null;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  garages: number | null;
  source_id: string;
}

export interface RentalAnchor {
  area_m2?: number | null;
  zone?: string | null;
  lat?: number | null;
  lng?: number | null;
  bedrooms?: number | null;
  garages?: number | null;
}

export interface RentalMarketContext {
  available: boolean;
  reason: RentalReason;
  city: string;
  type: string | null;
  scope: RentalScope;
  scope_label: string;
  radius_km: number | null;
  criteria: string[];
  n: number;
  n_rent_per_m2: number;
  median_monthly_rent: number | null;
  p25_monthly_rent: number | null;
  p75_monthly_rent: number | null;
  median_rent_per_m2: number | null;
  spread: number | null;
  confidence: RentalConfidence;
  sample: Array<{
    monthly_rent: number;
    area_m2: number | null;
    rent_per_m2: number | null;
    zone: string | null;
  }>;
}

const MIN_COMPARABLES = 4;
const POOL_TTL_MS = 30 * 60_000;
const poolCache = new Map<string, { at: number; rows: RentalPoolRow[] }>();
const poolInFlight = new Map<string, Promise<RentalPoolRow[]>>();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

const compact = (value: string | null | undefined) => normalizeCity(value);

const confidenceFor = (n: number, spread: number | null): RentalConfidence => {
  if (n < MIN_COMPARABLES) return 'insufficient';
  if (n >= 12 && spread != null && spread <= 0.35) return 'high';
  if (n >= 8 && spread != null && spread <= 0.6) return 'medium';
  return 'low';
};

export function unavailableRentalMarket(
  city: string,
  type: string | null,
  reason: RentalReason,
): RentalMarketContext {
  return {
    available: false,
    reason,
    city: compact(city),
    type,
    scope: 'ciudad',
    scope_label: `${compact(city)} (toda la ciudad)`,
    radius_km: null,
    criteria: [],
    n: 0,
    n_rent_per_m2: 0,
    median_monthly_rent: null,
    p25_monthly_rent: null,
    p75_monthly_rent: null,
    median_rent_per_m2: null,
    spread: null,
    confidence: 'insufficient',
    sample: [],
  };
}

/**
 * Selecciona comparables de renta sin relajar nunca el tipo de inmueble.
 * Dentro del mismo tipo prioriza ubicación, luego área y atributos.
 */
export function summarizeRentalMarket(
  pool: RentalPoolRow[],
  city: string,
  type: string | null,
  anchor: RentalAnchor = {},
): RentalMarketContext {
  const normalizedCity = compact(city);
  if (!normalizedCity) return unavailableRentalMarket(city, type, 'missing_location');

  let rows = type ? pool.filter((row) => row.type === type) : [...pool];
  const criteria: string[] = [];
  if (type) criteria.push('mismo tipo de inmueble');

  let scope: RentalScope = 'ciudad';
  let radiusKm: number | null = null;
  let scopeLabel = `${normalizedCity} (toda la ciudad)`;

  const hasGeo = anchor.lat != null && anchor.lng != null;
  if (hasGeo) {
    for (const radius of [1.5, 3]) {
      const nearby = rows.filter((row) =>
        row.lat != null && row.lng != null
        && haversineKm(anchor.lat!, anchor.lng!, row.lat, row.lng) <= radius);
      if (nearby.length >= MIN_COMPARABLES) {
        rows = nearby;
        scope = 'radio';
        radiusKm = radius;
        scopeLabel = `${radius} km a la redonda`;
        break;
      }
    }
  }

  if (scope === 'ciudad' && anchor.zone) {
    const wantedZone = compact(anchor.zone);
    const sameZone = rows.filter((row) => compact(row.zone) === wantedZone);
    if (sameZone.length >= MIN_COMPARABLES) {
      rows = sameZone;
      scope = 'zona';
      scopeLabel = `barrio ${anchor.zone}`;
    }
  }
  criteria.push(
    scope === 'radio'
      ? `mismo sector (${radiusKm} km a la redonda)`
      : scope === 'zona'
        ? `mismo barrio (${anchor.zone})`
        : hasGeo || anchor.zone
          ? 'misma ciudad (muestra insuficiente en el barrio)'
          : 'misma ciudad (sin barrio exacto)',
  );

  if (anchor.area_m2 != null && anchor.area_m2 > 0) {
    const minArea = anchor.area_m2 * 0.75;
    const maxArea = anchor.area_m2 * 1.25;
    const similarArea = rows.filter((row) =>
      row.area_m2 != null && row.area_m2 >= minArea && row.area_m2 <= maxArea);
    if (similarArea.length >= MIN_COMPARABLES) {
      rows = similarArea;
      criteria.push(`área similar (±25% de ${Math.round(anchor.area_m2)} m²)`);
    }
  }

  const housing = type === 'apartment' || type === 'house';
  if (housing && anchor.bedrooms != null && anchor.bedrooms > 0) {
    const sameBedrooms = rows.filter((row) =>
      row.bedrooms != null && Math.abs(row.bedrooms - anchor.bedrooms!) <= 1);
    if (sameBedrooms.length >= MIN_COMPARABLES) {
      rows = sameBedrooms;
      criteria.push(`${anchor.bedrooms} habitaciones (±1)`);
    }
  }
  if (housing && anchor.garages != null) {
    const wantsGarage = anchor.garages > 0;
    const sameGarage = rows.filter((row) =>
      row.garages != null && (row.garages > 0) === wantsGarage);
    if (sameGarage.length >= MIN_COMPARABLES) {
      rows = sameGarage;
      criteria.push(wantsGarage ? 'con parqueadero' : 'sin parqueadero');
    }
  }

  const rents = rows.map((row) => row.monthly_rent).filter((value) => value > 0);
  const cleanRents = trimOutliers(rents);
  const rentPerM2 = rows
    .map((row) => row.rent_per_m2)
    .filter((value): value is number => value != null && value > 0);
  const spread = rents.length >= MIN_COMPARABLES ? robustSpread(rents) : null;
  const enough = rents.length >= MIN_COMPARABLES;
  const sample = [...rows]
    .sort((a, b) => a.monthly_rent - b.monthly_rent)
    .slice(0, 6)
    .map((row) => ({
      monthly_rent: row.monthly_rent,
      area_m2: row.area_m2,
      rent_per_m2: row.rent_per_m2 == null ? null : Math.round(row.rent_per_m2),
      zone: row.zone,
    }));

  return {
    available: enough,
    reason: enough ? 'ok' : 'insufficient',
    city: normalizedCity,
    type,
    scope,
    scope_label: scopeLabel,
    radius_km: radiusKm,
    criteria,
    n: rents.length,
    n_rent_per_m2: rentPerM2.length,
    median_monthly_rent: enough ? Math.round(robustMedian(rents)) : null,
    p25_monthly_rent: enough ? Math.round(quantile(cleanRents, 0.25)) : null,
    p75_monthly_rent: enough ? Math.round(quantile(cleanRents, 0.75)) : null,
    median_rent_per_m2: rentPerM2.length >= MIN_COMPARABLES
      ? Math.round(robustMedian(rentPerM2))
      : null,
    spread: spread == null || !Number.isFinite(spread) ? null : Math.round(spread * 100) / 100,
    confidence: confidenceFor(rents.length, spread),
    sample,
  };
}

const COLS = 'source_id, type, monthly_rent, area_m2, monthly_rent_per_m2, zone,'
  + ' lat:features->lat, lng:features->lng, bedrooms:features->bedrooms,'
  + ' garages:features->garages, neighborhood:features->neighborhood,'
  + ' is_project:features->is_project';

async function pageWithRetry(
  city: string,
  type: string | null,
  cursor: string,
  attempts = 3,
): Promise<any[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    let query = supabase
      .from('rental_listings')
      .select(COLS)
      .eq('source', 'fincaraiz')
      .eq('is_active', true)
      .eq('city', city)
      .gt('source_id', cursor)
      .order('source_id')
      .limit(1000);
    if (type) query = query.eq('type', type);
    const { data, error } = await query;
    if (!error) return data ?? [];
    lastError = error.message;
  }
  throw new Error(`loadRentalCityPool(${city}): ${String(lastError)}`);
}

async function fetchRentalCityPool(city: string, type: string | null): Promise<RentalPoolRow[]> {
  const rows: RentalPoolRow[] = [];
  let cursor = '';
  let pages = 0;
  for (;;) {
    if (pages++ > 0) await sleep(250);
    const batch = await pageWithRetry(city, type, cursor);
    for (const raw of batch) {
      if (raw.is_project === true) continue;
      const monthlyRent = num(raw.monthly_rent);
      if (!monthlyRent) continue;
      const area = num(raw.area_m2);
      rows.push({
        type: raw.type ?? null,
        monthly_rent: monthlyRent,
        area_m2: area,
        rent_per_m2: num(raw.monthly_rent_per_m2) ?? (area ? monthlyRent / area : null),
        zone: raw.zone ?? raw.neighborhood ?? null,
        lat: num(raw.lat),
        lng: num(raw.lng),
        bedrooms: num(raw.bedrooms),
        garages: num(raw.garages),
        source_id: String(raw.source_id),
      });
    }
    if (batch.length < 1000) break;
    cursor = String(batch[batch.length - 1].source_id);
  }
  return rows;
}

function refreshPool(key: string, city: string, type: string | null): Promise<RentalPoolRow[]> {
  const pending = fetchRentalCityPool(city, type)
    .then((rows) => {
      poolCache.set(key, { at: Date.now(), rows });
      return rows;
    })
    .finally(() => poolInFlight.delete(key));
  poolInFlight.set(key, pending);
  return pending;
}

export async function loadRentalCityPool(
  city: string,
  type: string | null = null,
): Promise<RentalPoolRow[]> {
  const normalizedCity = compact(city);
  if (!normalizedCity) return [];
  const key = `${normalizedCity}|${type ?? '*'}`;
  const cached = poolCache.get(key);
  const pending = poolInFlight.get(key);
  if (cached) {
    if (Date.now() - cached.at >= POOL_TTL_MS && !pending) {
      void refreshPool(key, normalizedCity, type).catch(() => {});
    }
    return cached.rows;
  }
  return pending ?? refreshPool(key, normalizedCity, type);
}

export async function rentalMarketForProperty(
  city: string,
  type: string | null,
  anchor: RentalAnchor,
): Promise<RentalMarketContext> {
  try {
    const pool = await loadRentalCityPool(city, type);
    return summarizeRentalMarket(pool, city, type, anchor);
  } catch {
    return unavailableRentalMarket(city, type, 'source_unavailable');
  }
}
