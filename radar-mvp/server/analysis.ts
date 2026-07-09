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
  const market = summarizeMarket(pool, data.city ?? '', data.type, { zone, lat: num(f.lat), lng: num(f.lng) });
  const verdict = evaluateBank(
    {
      id: data.id, source: 'banco', source_id: data.id, type: data.type,
      price: num(data.price), area_m2: num(data.area_m2),
      lat: num(f.lat), lng: num(f.lng), stratum: num(f.stratum),
      city: data.city, zone: data.zone ?? (f.neighborhood as string | null) ?? null,
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
  const f = (data.features ?? {}) as any;

  const frType = mapType(data.property_type);
  const pool = await loadCityPool(data.city ?? '');
  const market = summarizeMarket(pool, data.city ?? '', frType);
  const av = num(data.appraisal_value); const bid = num(data.minimum_bid);
  const auctionDisc = av && bid && av > 0 ? (1 - bid / av) * 100 : 0;
  const recommendations = await recommendInZone({
    excludeKind: 'remate', excludeId: id, city: data.city, type: data.property_type,
    minDiscount: auctionDisc,
  });

  if (f.ai_analysis && !refresh) return { ok: true, cached: true, market, ai: f.ai_analysis as AiResult, recommendations };

  const facts: AiPropertyFacts = {
    kind: 'remate', tipo: data.property_type, ciudad: data.city, zona: data.department,
    area_m2: num(f.area_m2) ?? num(f.area),
    estrato: num(f.stratum),
    avaluo_cop: num(data.appraisal_value), postura_cop: num(data.minimum_bid),
    postura_pct: num(data.minimum_bid_pct), banco_demandante: f.is_bank_plaintiff === true,
  };
  const avisoText = (f.copia_publicacion as string | null) ?? data.description ?? undefined;

  try {
    const ai = await analyzeWithAI(facts, market, avisoText);
    await persistCache('remates', id, data.features, ai);
    return { ok: true, cached: false, market, ai, recommendations };
  } catch (e) {
    if (e instanceof NoOpenAIKeyError) return { ok: false, cached: false, needs_key: true, market, recommendations, error: e.message };
    return { ok: false, cached: false, market, recommendations, error: e instanceof Error ? e.message : String(e) };
  }
}
