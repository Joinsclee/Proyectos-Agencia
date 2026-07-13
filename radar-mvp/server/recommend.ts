/**
 * Recomendador de oportunidades en la MISMA ZONA.
 *
 * Tras analizar una propiedad, sugiere OTRAS propiedades de su ciudad con mejor
 * (o comparable) oportunidad de inversión, cruzando las tres fuentes:
 *   - Portal (FincaRaíz): listados que el motor marcó como oportunidad (bajo mercado).
 *   - Bancos: inmuebles de banco marcados oportunidad.
 *   - Remates: avisos con avalúo+postura y audiencia futura (descuento de subasta).
 *
 * Métrica común = "% por debajo de una referencia":
 *   - portal/banco → discount_pct del motor (% bajo el asking-mediano del mercado).
 *   - remate       → (1 − postura/avalúo)·100 (% bajo el avalúo oficial).
 * No son idénticas (se etiqueta cada una), pero ambas miden margen de entrada y
 * permiten un ranking honesto. Se prioriza el MISMO tipo y luego el mayor descuento.
 */
import { supabase } from '../lib/supabase.js';
import { BANK_SOURCES } from '../lib/types.js';
import { haversineKm } from '../engine/stats.js';
import { normCity } from '../engine/zone-comps.js';

export type RecKind = 'portal' | 'banco' | 'remate';

export interface Rec {
  kind: RecKind;
  id: string;
  type: string | null;
  city: string | null;
  zone: string | null;
  price: number | null;       // banco/portal: precio · remate: postura mínima
  reference: number | null;   // remate: avalúo (referencia de la métrica)
  discount_pct: number | null;
  metric_label: string;       // 'bajo mercado' | 'bajo avalúo'
  source: string | null;
  source_url: string | null;
  image: string | null;
  same_type: boolean;
  same_zone: boolean;         // mismo barrio (geo ≤ 2km o nombre de zona) que la analizada
  beats_current: boolean;     // ¿supera el descuento de la propiedad analizada?
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// Tope de sensatez: un asking-listing >60% bajo el mercado es casi siempre un
// error de datos del portal (área/precio mal cargado), no una oportunidad real.
// Filtrar evita recomendar "99% bajo mercado" y perder credibilidad.
const REC_MAX_DISCOUNT = 60;

/** Primera imagen utilizable de un inmueble (features.images[] o columna). */
function inmuebleImage(row: any): string | null {
  const imgs = row.features?.images;
  if (Array.isArray(imgs) && imgs.length) {
    const f = imgs[0];
    if (typeof f === 'string') return f;
    if (f && typeof f === 'object') return f.image ?? f.url ?? null;
  }
  return row.image_url ?? null;
}

const SAME_ZONE_KM = 2; // radio para considerar "mismo barrio" por geo

export async function recommendInZone(opts: {
  excludeKind: RecKind;
  excludeId: string;
  city: string | null;
  type: string | null;
  zone?: string | null;          // barrio/zona de la propiedad analizada
  lat?: number | null;           // geo de la analizada (para "mismo barrio" por radio)
  lng?: number | null;
  minDiscount?: number;          // descuento de la propiedad analizada (para marcar "mejores")
  limit?: number;
}): Promise<Rec[]> {
  const { excludeId, type } = opts;
  const city = opts.city;
  if (!city) return [];
  const limit = opts.limit ?? 6;
  const minDisc = opts.minDiscount ?? 0;
  const aZone = opts.zone ? normCity(opts.zone) : null;
  const aLat = opts.lat ?? null;
  const aLng = opts.lng ?? null;
  // Pool amplio por fuente para que los del MISMO BARRIO afloren aunque no sean
  // los de mayor descuento de la ciudad; el ranking por proximidad los sube.
  const POOL_INM = 40;
  const POOL_REM = 24;

  const inmCols = 'id, type, city, zone, price, discount_pct, source, source_url, image_url, features';

  const [bancos, portal, remates] = await Promise.all([
    supabase.from('inmuebles').select(inmCols)
      .eq('is_active', true).in('source', BANK_SOURCES as unknown as string[]).eq('city', city)
      .eq('is_opportunity', true).lte('discount_pct', REC_MAX_DISCOUNT)
      .order('discount_pct', { ascending: false, nullsFirst: false }).limit(POOL_INM),
    supabase.from('inmuebles').select(inmCols)
      .eq('is_active', true).eq('source', 'fincaraiz').eq('city', city)
      .or('features->>is_project.is.null,features->>is_project.eq.false')
      .eq('is_opportunity', true).lte('discount_pct', REC_MAX_DISCOUNT)
      .order('discount_pct', { ascending: false, nullsFirst: false }).limit(POOL_INM),
    supabase.from('remates')
      .select('id, property_type, city, department, minimum_bid, appraisal_value, minimum_bid_pct, source, source_url, image_url, features')
      .eq('is_active', true).eq('city', city).gte('auction_date', todayISO())
      .not('appraisal_value', 'is', null).not('minimum_bid', 'is', null)
      .order('minimum_bid_pct', { ascending: true, nullsFirst: false }).limit(POOL_REM),
  ]);

  // ¿La candidata está en el mismo barrio que la analizada? Geo (≤2km) o nombre de zona.
  const sameZone = (candZone: string | null, candLat: number | null, candLng: number | null): boolean => {
    if (aLat != null && aLng != null && candLat != null && candLng != null) {
      if (haversineKm(aLat, aLng, candLat, candLng) <= SAME_ZONE_KM) return true;
    }
    if (aZone && candZone && normCity(candZone) === aZone) return true;
    return false;
  };

  const recs: Rec[] = [];

  const pushInmueble = (kind: 'portal' | 'banco', rows: any[]) => {
    for (const r of rows ?? []) {
      if (r.id === excludeId) continue;
      const d = num(r.discount_pct);
      if (d == null || d <= 0 || d > REC_MAX_DISCOUNT) continue;
      const zone = r.zone ?? (r.features?.neighborhood ?? null);
      recs.push({
        kind, id: r.id, type: r.type, city: r.city, zone,
        price: num(r.price), reference: num(r.features?.market?.market_ppm2),
        discount_pct: Math.round(d * 10) / 10, metric_label: 'bajo mercado',
        source: r.source, source_url: r.source_url, image: inmuebleImage(r),
        same_type: !!type && r.type === type,
        same_zone: sameZone(zone, num(r.features?.lat), num(r.features?.lng)),
        beats_current: d >= minDisc,
      });
    }
  };
  pushInmueble('banco', bancos.data ?? []);
  pushInmueble('portal', portal.data ?? []);

  for (const r of remates.data ?? []) {
    if (r.id === excludeId) continue;
    const av = num(r.appraisal_value); const bid = num(r.minimum_bid);
    if (!av || !bid || av <= 0) continue;
    const d = (1 - bid / av) * 100;
    if (d <= 0) continue;
    // Remates no traen barrio ni geo → solo nivel ciudad (same_zone=false).
    recs.push({
      kind: 'remate', id: r.id, type: r.property_type, city: r.city, zone: r.department ?? null,
      price: bid, reference: av, discount_pct: Math.round(d * 10) / 10, metric_label: 'bajo avalúo',
      source: r.source, source_url: r.source_url, image: r.image_url ?? null,
      same_type: !!type && r.property_type === type, same_zone: false, beats_current: d >= minDisc,
    });
  }

  // Orden: MISMO BARRIO primero (lo más puntual), luego mismo tipo, luego descuento.
  recs.sort((a, b) =>
    Number(b.same_zone) - Number(a.same_zone) ||
    Number(b.same_type) - Number(a.same_type) ||
    (b.discount_pct ?? 0) - (a.discount_pct ?? 0),
  );
  return recs.slice(0, limit);
}
