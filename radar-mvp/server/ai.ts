/**
 * Análisis con IA (OpenAI) de una oportunidad — opinión preliminar de inversión.
 *
 * Toma los hechos de la propiedad + el contexto de mercado (comparables de zona
 * de FincaRaíz) + el texto del aviso (en remates) y pide a un modelo barato
 * (gpt-4o-mini por defecto) una opinión ESTRUCTURADA en JSON: veredicto, puntaje,
 * valor de mercado estimado, descuento, factores a favor/en contra y riesgos de
 * due diligence. La IA debe anclarse en los números provistos, no inventarlos.
 *
 * Costo: con gpt-4o-mini un análisis ronda fracciones de centavo de USD. Se
 * cachea en la fila (features.ai_analysis) para no repetir el gasto.
 */
import type { MarketContext } from '../engine/zone-comps.js';

export interface AiPropertyFacts {
  kind: 'banco' | 'remate';
  tipo: string | null;
  ciudad: string | null;
  zona: string | null;
  area_m2: number | null;
  estrato: number | null;
  // Bancos: precio de lista. Remates: avalúo (referencia) + postura (lo que se paga).
  precio_lista_cop?: number | null;
  avaluo_cop?: number | null;
  postura_cop?: number | null;
  postura_pct?: number | null;
  banco_demandante?: boolean;
}

export interface AiResult {
  veredicto: 'atractiva' | 'neutral' | 'riesgosa';
  puntaje: number; // 0-100
  estimado_mercado_cop: number | null;
  descuento_estimado_pct: number | null;
  resumen: string;
  a_favor: string[];
  en_contra: string[];
  riesgos_due_diligence: string[];
  recomendacion: string;
  _meta: { model: string; generated_at: string; comparables_n: number; confidence: string };
}

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const cop = (n: number | null | undefined) => (n == null ? 'n/d' : `$${Math.round(n).toLocaleString('es-CO')}`);

export class NoOpenAIKeyError extends Error {
  constructor() { super('OPENAI_API_KEY no configurada'); this.name = 'NoOpenAIKeyError'; }
}

function buildPrompt(facts: AiPropertyFacts, market: MarketContext, avisoText?: string): string {
  const tipoComp = market.matched_type ? `del mismo tipo (${market.type})` : `de todos los tipos (no hubo suficientes del tipo ${market.type ?? 'pedido'})`;
  const ambito = market.scope === 'ciudad' ? `en ${market.city} (toda la ciudad)` : `acotados a ${market.scope_label} (${market.scope === 'barrio' ? 'mismo sector' : 'mismo barrio'})`;
  const crit = market.criteria?.length ? `Criterios de similitud aplicados: ${market.criteria.join('; ')}.` : '';
  const mkt = [
    `Comparables FincaRaíz ${ambito} ${tipoComp}: ${market.n} avisos (confianza ${market.confidence}).`,
    crit,
    market.median_total != null ? `Precio TOTAL de oferta — mediana ${cop(market.median_total)}, cuartil bajo (P25) ${cop(market.p25_total)}.` : '',
    market.median_ppm2 != null ? `Precio por m² — mediana ${cop(market.median_ppm2)}/m², P25 ${cop(market.p25_ppm2)}/m² (n=${market.n_ppm2}).` : 'Sin suficientes áreas para precio por m².',
    market.sample.length ? `Muestra (más baratos): ${market.sample.map((s) => `${cop(s.price)}${s.area ? `/${s.area}m²` : ''}${s.zone ? ` (${s.zone})` : ''}`).join('; ')}.` : '',
  ].filter(Boolean).join('\n');

  const prop = facts.kind === 'remate'
    ? [
        `REMATE JUDICIAL. Tipo: ${facts.tipo ?? 'n/d'}. Ciudad: ${facts.ciudad ?? 'n/d'}${facts.zona ? `, ${facts.zona}` : ''}.`,
        `Avalúo (valuación oficial del juzgado): ${cop(facts.avaluo_cop)}.`,
        `Postura mínima (lo que se paga para adjudicarse): ${cop(facts.postura_cop)}${facts.postura_pct ? ` (${facts.postura_pct}% del avalúo)` : ''}.`,
        facts.area_m2 ? `Área: ${facts.area_m2} m².` : '',
        facts.banco_demandante ? 'El demandante es un BANCO (suele implicar título más limpio y proceso hipotecario estándar).' : '',
      ].filter(Boolean).join('\n')
    : [
        `INMUEBLE DE BANCO (dación/venta directa). Tipo: ${facts.tipo ?? 'n/d'}. Ciudad: ${facts.ciudad ?? 'n/d'}${facts.zona ? `, ${facts.zona}` : ''}.`,
        `Precio de lista: ${cop(facts.precio_lista_cop)}.`,
        facts.area_m2 ? `Área: ${facts.area_m2} m².` : '',
        facts.estrato ? `Estrato: ${facts.estrato}.` : '',
      ].filter(Boolean).join('\n');

  return [
    'Eres un analista inmobiliario colombiano experto en remates judiciales e inmuebles de banco.',
    'Evalúa la oportunidad de inversión de la siguiente propiedad usando los comparables de mercado provistos.',
    '',
    '## Propiedad',
    prop,
    '',
    '## Mercado (comparables de zona)',
    mkt,
    avisoText ? `\n## Texto del aviso (extracto)\n${avisoText.slice(0, 2500)}` : '',
    '',
    '## Instrucciones',
    '- Ánclate en los números provistos; NO inventes precios. El "estimado de mercado" debe derivarse de la mediana de comparables (ajústalo por área/tipo si aplica).',
    '- Para remates: recuerda que la postura suele estar ~30% bajo el avalúo por diseño; el valor real está en si el AVALÚO mismo está por debajo del mercado, y en los riesgos del proceso.',
    '- Si la confianza de los comparables es baja o no hubo del mismo tipo, dilo y modera el veredicto.',
    '- Refiérete al ámbito de los comparables: si están acotados al barrio/sector, di "en este sector"; si son de toda la ciudad, acláralo (es una referencia más gruesa).',
    '- Detecta riesgos en el texto del aviso: ocupado/arrendado, proindiviso o cuota/derechos (no el 100%), servidumbres, rural/lote de baja liquidez, fechas de audiencia muy próximas.',
    '- Sé conciso y accionable. Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:',
    '{',
    '  "veredicto": "atractiva|neutral|riesgosa",',
    '  "puntaje": 0-100,',
    '  "estimado_mercado_cop": number|null,',
    '  "descuento_estimado_pct": number|null,',
    '  "resumen": "1-2 frases",',
    '  "a_favor": ["..."],',
    '  "en_contra": ["..."],',
    '  "riesgos_due_diligence": ["..."],',
    '  "recomendacion": "1 frase"',
    '}',
  ].join('\n');
}

/** Llama a OpenAI y devuelve la opinión estructurada. Lanza NoOpenAIKeyError si falta la key. */
export async function analyzeWithAI(
  facts: AiPropertyFacts,
  market: MarketContext,
  avisoText?: string,
): Promise<AiResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new NoOpenAIKeyError();

  const prompt = buildPrompt(facts, market, avisoText);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Responde siempre en español y SOLO con JSON válido.' },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI: respuesta vacía');

  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw new Error('OpenAI: JSON inválido'); }

  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []);
  const veredicto = ['atractiva', 'neutral', 'riesgosa'].includes(parsed.veredicto) ? parsed.veredicto : 'neutral';
  return {
    veredicto,
    puntaje: Math.max(0, Math.min(100, Number(parsed.puntaje) || 0)),
    estimado_mercado_cop: parsed.estimado_mercado_cop != null ? Number(parsed.estimado_mercado_cop) : null,
    descuento_estimado_pct: parsed.descuento_estimado_pct != null ? Math.round(Number(parsed.descuento_estimado_pct) * 10) / 10 : null,
    resumen: String(parsed.resumen ?? '').slice(0, 600),
    a_favor: arr(parsed.a_favor),
    en_contra: arr(parsed.en_contra),
    riesgos_due_diligence: arr(parsed.riesgos_due_diligence),
    recomendacion: String(parsed.recomendacion ?? '').slice(0, 400),
    _meta: { model: MODEL, generated_at: new Date().toISOString(), comparables_n: market.n, confidence: market.confidence },
  };
}
