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
import {
  rentalMarketForProperty,
  type RentalMarketContext,
} from '../engine/rental-comparables.js';
import { analyzeWithAI, AnalisisIncoherenteError, NoOpenAIKeyError, type AiResult, type AiPropertyFacts } from './ai.js';
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
  /**
   * El análisis existía pero no pasó la comprobación de consistencia contra el
   * motor, así que se retiró a propósito. No es un fallo técnico y no debe
   * contarse ni presentarse como tal: `error` ya trae la explicación completa
   * para el usuario.
   */
  sin_verificar?: boolean;
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

  const propio = data.source === 'fincaraiz' ? data.source_id : null;
  const pool = await loadCityPool(data.city ?? '');
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

/**
 * Mercado de arriendo aislado del mercado de venta. Mantener ambos endpoints
 * separados evita que la carga inicial de comparables de arriendo retrase el
 * análisis de venta de la ficha.
 */
export async function rentalOnly(
  kind: 'portal' | 'banco',
  id: string,
): Promise<{ ok: boolean; error?: string; rental_market?: RentalMarketContext }> {
  const { data } = await supabase
    .from('inmuebles')
    .select('id, source, type, area_m2, city, zone, features')
    .eq('id', id)
    .single();
  if (!data) return { ok: false, error: 'inmueble no encontrado' };

  if (
    (kind === 'portal' && data.source !== 'fincaraiz')
    || (kind === 'banco' && data.source === 'fincaraiz')
  ) {
    return { ok: false, error: 'tipo de inmueble inválido' };
  }

  const f = (data.features ?? {}) as any;
  const rentalMarket = await rentalMarketForProperty(data.city ?? '', data.type, {
    area_m2: num(data.area_m2),
    zone: data.zone ?? (f.neighborhood as string | null) ?? null,
    lat: num(f.lat),
    lng: num(f.lng),
    bedrooms: num(f.bedrooms),
    garages: num(f.garages),
  });
  return { ok: true, rental_market: rentalMarket };
}

/**
 * Versión del análisis con IA.
 *
 * SÚBELA cuando cambie algo que altere lo que el modelo responde: el prompt, los
 * hechos que se le pasan o las comprobaciones que se aplican a su respuesta. Un
 * análisis guardado con una versión anterior se descarta y se vuelve a pedir.
 *
 * Sin esto, arreglar el prompt no arreglaba nada de lo ya visible. El caché vive
 * en la fila y no caducaba nunca: el día que se corrigió que las fichas de portal
 * se analizaran como si fueran de banco, las decenas de miles ya analizadas
 * siguieron diciendo «propiedad de banco, posibilidad de negociación» sobre el
 * aviso de un particular. Lo mismo con el «verificar antes de pujar» en fichas que
 * no se subastan y con los estimados que ahora se comprueban antes de enseñarlos.
 *
 * 2 = 1 de agosto de 2026: procedencia real en el prompt, prohibido hablar de
 * pujas fuera de remates, y validación de las cifras que devuelve el modelo.
 * 3 = 1 de agosto de 2026: el análisis se contrasta contra el veredicto del motor
 * y no se publica si lo contradice. Los guardados como 2 nunca pasaron por esa
 * comprobación, así que se descartan: si no, las fichas que la auditoría citó
 * seguirían enseñando el análisis contradictorio que ya tienen en la fila.
 * 4 = 2 de agosto de 2026: esa comprobación se hacía contra la mediana y no
 * contra el porcentaje que la ficha PINTA, así que dejaba pasar la contradicción
 * visible. Comprobado en producción sobre un lote en Espinal: sello «Interesante
 * · 16,7% por debajo» arriba y «Riesgosa, el precio de lista es
 * significativamente más alto» abajo, en la misma pantalla y con el arreglo ya
 * desplegado — porque el análisis guardado seguía siendo de la versión 3.
 *
 * ── Cómo se olvida esto ──
 *
 * Las tres veces que este caché ha mordido, el arreglo del código era correcto y
 * lo que faltó fue subir el número de aquí. Pasa porque el defecto se corrige en
 * `ai.ts` y la versión vive en este archivo, así que la regla práctica es: si
 * tocas `contradiceAlMotor`, `buildPrompt` o cualquier validación de `ai.ts`,
 * este número sube en el MISMO commit. Sin eso, el arreglo solo alcanza a las
 * fichas que nadie ha visitado todavía.
 */
const VERSION_ANALISIS = 4;

/** ¿Este análisis guardado se generó con las reglas de ahora? */
function analisisVigente(ai: unknown): ai is AiResult {
  return !!ai && typeof ai === 'object' && (ai as any)?._meta?.version === VERSION_ANALISIS;
}

async function persistCache(table: 'inmuebles' | 'remates', id: string, features: any, ai: AiResult) {
  // La versión viaja DENTRO del análisis guardado: así una fila vieja se reconoce
  // sola, sin necesidad de una migración ni de saber cuándo se escribió.
  const sellado = { ...ai, _meta: { ...(ai._meta ?? {}), version: VERSION_ANALISIS } };
  const next = { ...(features ?? {}), ai_analysis: sellado, ai_descartado: null };
  await supabase.from(table).update({ features: next }).eq('id', id);
}

/**
 * Un análisis descartado por contradecir al motor se anota en la fila.
 *
 * Sin esto, cada visita a esa ficha vuelve a pagarle a OpenAI por un análisis que
 * se va a tirar otra vez: el modelo es determinista a temperatura 0.2 y los
 * comparables no cambian entre dos visitas seguidas. La anotación lleva versión,
 * así que al subir `VERSION_ANALISIS` se reintenta sola —que es justo lo que hay
 * que hacer cuando se toca el prompt—.
 */
async function persistDescarte(table: 'inmuebles' | 'remates', id: string, features: any, motivo: string) {
  const next = {
    ...(features ?? {}),
    ai_analysis: null,
    ai_descartado: { motivo, version: VERSION_ANALISIS, at: new Date().toISOString() },
  };
  await supabase.from(table).update({ features: next }).eq('id', id);
}

function descarteVigente(marca: unknown): marca is { motivo: string } {
  return !!marca && typeof marca === 'object' && (marca as any)?.version === VERSION_ANALISIS;
}

/**
 * Lo que ve el usuario cuando el análisis se descartó. No se le enseña el motivo
 * técnico —«el motor lo sitúa 19% por debajo y la IA lo declara riesgosa» delata
 * un desacuerdo interno y no le sirve de nada—, sino qué tiene delante y qué mirar
 * en su lugar, que es el análisis de mercado y sí está completo en la misma ficha.
 */
const AVISO_SIN_ANALISIS = 'No pudimos verificar el análisis con IA de este inmueble, así que preferimos '
  + 'no mostrarlo. El análisis de mercado de esta misma ficha —comparables, mediana y posición frente '
  + 'a la zona— sí está calculado y es el que sostiene la valoración.';

async function analyzeBanco(id: string, refresh: boolean): Promise<AnalyzeResult> {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('id, source, type, price, area_m2, city, zone, features')
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

  if (analisisVigente(f.ai_analysis) && !refresh) return { ok: true, cached: true, market, ai: f.ai_analysis, bank_verdict: verdict, recommendations };
  if (descarteVigente(f.ai_descartado) && !refresh) {
    return { ok: false, cached: true, market, bank_verdict: verdict, recommendations, sin_verificar: true, error: AVISO_SIN_ANALISIS };
  }

  const facts: AiPropertyFacts = {
    // De la fuente real de la fila, no de la ruta: `analyzeBanco` atiende también
    // a las fichas de portal, y decirle al modelo que todas son de banco es
    // exactamente lo que le hacía escribir «propiedad de banco» sobre el aviso de
    // un particular.
    kind: data.source === 'fincaraiz' ? 'portal' : 'banco',
    tipo: data.type, ciudad: data.city, zona: data.zone ?? (f.neighborhood as string | null) ?? null,
    area_m2: num(data.area_m2), estrato: num(f.stratum), precio_lista_cop: num(data.price),
  };
  try {
    const ai = await analyzeWithAI(facts, market, undefined, verdict?.discount_pct ?? null);
    await persistCache('inmuebles', id, data.features, ai);
    return { ok: true, cached: false, market, ai, bank_verdict: verdict, recommendations };
  } catch (e) {
    if (e instanceof NoOpenAIKeyError) return { ok: false, cached: false, needs_key: true, market, bank_verdict: verdict, recommendations, error: e.message };
    if (e instanceof AnalisisIncoherenteError) {
      console.warn(`[analysis] inmueble ${id}: ${e.message}`);
      await persistDescarte('inmuebles', id, data.features, e.message);
      return { ok: false, cached: false, market, bank_verdict: verdict, recommendations, sin_verificar: true, error: AVISO_SIN_ANALISIS };
    }
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

  if (analisisVigente(f.ai_analysis) && !refresh) return { ok: true, cached: true, market, ai: f.ai_analysis, recommendations };
  if (descarteVigente(f.ai_descartado) && !refresh) {
    return { ok: false, cached: true, market, recommendations, sin_verificar: true, error: AVISO_SIN_ANALISIS };
  }

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
    if (e instanceof AnalisisIncoherenteError) {
      console.warn(`[analysis] remate ${id}: ${e.message}`);
      await persistDescarte('remates', id, safeData.features, e.message);
      return { ok: false, cached: false, market, recommendations, sin_verificar: true, error: AVISO_SIN_ANALISIS };
    }
    return { ok: false, cached: false, market, recommendations, error: e instanceof Error ? e.message : String(e) };
  }
}
