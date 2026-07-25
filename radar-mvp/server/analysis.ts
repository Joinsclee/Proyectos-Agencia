/**
 * Orquestación del análisis IA de UNA propiedad (banco o remate).
 *
 * 1. Carga la fila (inmuebles | remates).
 * 2. Arma el contexto de mercado con comparables FincaRaíz de su ciudad/tipo
 *    (engine/zone-comps).
 * 3. Pide la opinión a OpenAI (server/ai) — o devuelve la cacheada.
 * 4. Cachea el resultado en features.ai_analysis (evita repetir el gasto).
 */
import { supabase } from '../lib/supabase.js';
import {
  loadCityPool, summarizeMarket, evaluateBank, mapType,
  type MarketContext,
} from '../engine/zone-comps.js';
import { analyzeWithAI, NoOpenAIKeyError, type AiResult, type AiPropertyFacts } from './ai.js';
import { recommendInZone, type Rec } from './recommend.js';
import { sanitizeRemateForDisplay } from './data-quality.js';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export interface AnalyzeResult {
  ok: boolean;
  cached: boolean;
  error?: string;
  needs_key?: boolean;
  market?: MarketContext;
  ai?: AiResult;
  bank_verdict?: ReturnType<typeof evaluateBank> | null;
  recommendations?: Rec[];
}

export async function analyzeProperty(
  kind: 'banco' | 'remate',
  id: string,
  refresh = false,
): Promise<AnalyzeResult> {
  if (kind === 'banco') return analyzeBanco(id, refresh);
  if (kind === 'remate') return analyzeRemate(id, refresh);
  return { ok: false, cached: false, error: 'kind inválido' };
}

/**
 * Contexto de mercado SIN IA (gratis) para una ficha cualquiera — incluidas las
 * del portal, que el motor batch no persiste (releerlas 105K veces sería caro).
 * Es el "por qué" detrás del −X% de la tarjeta: contra qué comparables se midió.
 */
export async function marketOnly(
  kind: 'portal' | 'banco' | 'remate',
  id: string,
): Promise<{
  ok: boolean; error?: string;
  market?: MarketContext;
  verdict?: ReturnType<typeof evaluateBank>;
  recommendations?: Rec[];
}> {
  if (kind === 'remate') {
    const { data } = await supabase
      .from('remates')
      .select('id, property_type, city, appraisal_value, minimum_bid')
      .eq('id', id).single();
    if (!data) return { ok: false, error: 'remate no encontrado' };
    const pool = await loadCityPool(data.city ?? '');
    return { ok: true, market: summarizeMarket(pool, data.city ?? '', mapType(data.property_type)) };
  }

  const { data } = await supabase
    .from('inmuebles')
    .select('id, source, source_id, type, price, area_m2, city, zone, discount_pct, features')
    .eq('id', id).single();
  if (!data) return { ok: false, error: 'inmueble no encontrado' };
  const f = (data.features ?? {}) as any;
  const zone = data.zone ?? (f.neighborhood as string | null) ?? null;

  const pool = await loadCityPool(data.city ?? '');
  const propio = data.source === 'fincaraiz' ? data.source_id : null;
  const market = summarizeMarket(pool, data.city ?? '', data.type, {
    zone, lat: num(f.lat), lng: num(f.lng),
    bedrooms: num(f.bedrooms), garages: num(f.garages),
    excludeSourceId: propio,
  });

  // Veredicto del MISMO motor que produce el −X% de la tarjeta (precio por m²,
  // cascada de condicionales). Es lo que se le muestra al usuario: así el
  // porcentaje y los comparables que lo sustentan salen del mismo conjunto, en vez
  // de enfrentar un descuento por m² contra una mediana de precios totales.
  const verdict = evaluateBank(
    {
      id: data.id, source: data.source, source_id: data.source_id, type: data.type,
      price: num(data.price), area_m2: num(data.area_m2),
      lat: num(f.lat), lng: num(f.lng), stratum: num(f.stratum),
      city: data.city, zone,
      bedrooms: num(f.bedrooms), garages: num(f.garages),
    },
    propio ? pool.filter((r) => r.source_id !== propio) : pool, // no ser su propio comparable
  );

  const recommendations = await recommendInZone({
    excludeKind: kind, excludeId: id, city: data.city, type: data.type,
    zone, lat: num(f.lat), lng: num(f.lng),
    minDiscount: verdict.discount_pct ?? num(data.discount_pct) ?? 0,
  });
  return { ok: true, market, verdict, recommendations };
}

async function persistCache(table: 'inmuebles' | 'remates', id: string, features: any, ai: AiResult) {
  const next = { ...(features ?? {}), ai_analysis: ai };
  await supabase.from(table).update({ features: next }).eq('id', id);
}

async function analyzeBanco(id: string, refresh: boolean): Promise<AnalyzeResult> {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('id, type, price, area_m2, city, zone, features')
    .eq('id', id).single();
  if (error || !data) return { ok: false, cached: false, error: 'inmueble no encontrado' };
  const f = (data.features ?? {}) as any;

  const pool = await loadCityPool(data.city ?? '');
  const zone = data.zone ?? (f.neighborhood as string | null) ?? null;
  const market = summarizeMarket(pool, data.city ?? '', data.type, {
    zone, lat: num(f.lat), lng: num(f.lng),
    bedrooms: num(f.bedrooms), garages: num(f.garages), // condicionales de similitud
  });
  const verdict = evaluateBank(
    {
      id: data.id, source: 'banco', source_id: data.id, type: data.type,
      price: num(data.price), area_m2: num(data.area_m2),
      lat: num(f.lat), lng: num(f.lng), stratum: num(f.stratum),
      city: data.city, zone: data.zone ?? (f.neighborhood as string | null) ?? null,
      bedrooms: num(f.bedrooms), garages: num(f.garages),
    },
    pool,
  );
  const recommendations = await recommendInZone({
    excludeKind: 'banco', excludeId: id, city: data.city, type: data.type,
    zone, lat: num(f.lat), lng: num(f.lng),
    minDiscount: verdict.discount_pct ?? 0,
  });

  if (f.ai_analysis && !refresh) return { ok: true, cached: true, market, ai: f.ai_analysis as AiResult, bank_verdict: verdict, recommendations };

  const facts: AiPropertyFacts = {
    kind: 'banco', tipo: data.type, ciudad: data.city, zona: data.zone ?? (f.neighborhood as string | null) ?? null,
    area_m2: num(data.area_m2), estrato: num(f.stratum), precio_lista_cop: num(data.price),
  };
  try {
    const ai = await analyzeWithAI(facts, market);
    await persistCache('inmuebles', id, data.features, ai);
    return { ok: true, cached: false, market, ai, bank_verdict: verdict, recommendations };
  } catch (e) {
    if (e instanceof NoOpenAIKeyError) return { ok: false, cached: false, needs_key: true, market, bank_verdict: verdict, recommendations, error: e.message };
    return { ok: false, cached: false, market, bank_verdict: verdict, recommendations, error: e instanceof Error ? e.message : String(e) };
  }
}

async function analyzeRemate(id: string, refresh: boolean): Promise<AnalyzeResult> {
  const { data, error } = await supabase
    .from('remates')
    .select('id, property_type, city, department, appraisal_value, minimum_bid, minimum_bid_pct, features, description')
    .eq('id', id).single();
  if (error || !data) return { ok: false, cached: false, error: 'remate no encontrado' };
  const safeData = sanitizeRemateForDisplay(data);
  if (safeData._data_warnings?.length) {
    return {
      ok: false,
      cached: false,
      error: 'Los datos financieros de este remate están en revisión.',
    };
  }
  const f = (safeData.features ?? {}) as any;

  const frType = mapType(safeData.property_type);
  const pool = await loadCityPool(safeData.city ?? '');
  const market = summarizeMarket(pool, safeData.city ?? '', frType);
  const av = num(safeData.appraisal_value); const bid = num(safeData.minimum_bid);
  const auctionDisc = av && bid && av > 0 ? (1 - bid / av) * 100 : 0;
  const recommendations = await recommendInZone({
    excludeKind: 'remate', excludeId: id, city: safeData.city, type: safeData.property_type,
    minDiscount: auctionDisc,
  });

  if (f.ai_analysis && !refresh) return { ok: true, cached: true, market, ai: f.ai_analysis as AiResult, recommendations };

  const facts: AiPropertyFacts = {
    kind: 'remate', tipo: safeData.property_type, ciudad: safeData.city, zona: safeData.department,
    area_m2: num(f.area_m2) ?? num(f.area),
    estrato: num(f.stratum),
    avaluo_cop: num(safeData.appraisal_value), postura_cop: num(safeData.minimum_bid),
    postura_pct: num(safeData.minimum_bid_pct), banco_demandante: f.is_bank_plaintiff === true,
  };
  const avisoText = (f.copia_publicacion as string | null) ?? safeData.description ?? undefined;

  try {
    const ai = await analyzeWithAI(facts, market, avisoText);
    await persistCache('remates', id, safeData.features, ai);
    return { ok: true, cached: false, market, ai, recommendations };
  } catch (e) {
    if (e instanceof NoOpenAIKeyError) return { ok: false, cached: false, needs_key: true, market, recommendations, error: e.message };
    return { ok: false, cached: false, market, recommendations, error: e instanceof Error ? e.message : String(e) };
  }
}
